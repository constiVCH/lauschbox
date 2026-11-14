"""WLAN-Einrichtung per Bluetooth LE nach dem offenen Protokoll „Improv Wi-Fi“ (improv-wifi.com).

Hat die Box kein WLAN, meldet sie sich per Bluetooth als „Lauschbox“. Die App verbindet sich, die Box verlangt eine
Freigabe (Play an der Box drücken, der LED-Ring leuchtet dabei blau), dann schickt die App Netzname und Passwort.
Die Box verbindet sich über NetworkManager (nmcli) und antwortet mit ihrer Adresse für die App.
"""
from __future__ import annotations

import asyncio
import logging
import socket
from typing import Awaitable, Callable

log = logging.getLogger(__name__)

SERVICE = "00467768-6228-2272-4663-277478268000"
STATE = "00467768-6228-2272-4663-277478268001"
ERROR = "00467768-6228-2272-4663-277478268002"
RPC_COMMAND = "00467768-6228-2272-4663-277478268003"
RPC_RESULT = "00467768-6228-2272-4663-277478268004"
CAPABILITIES = "00467768-6228-2272-4663-277478268005"

AUTH_REQUIRED, AUTHORIZED, PROVISIONING, PROVISIONED = 1, 2, 3, 4
NO_ERROR, INVALID_RPC, UNKNOWN_RPC, UNABLE_TO_CONNECT, NOT_AUTHORIZED = 0, 1, 2, 3, 4
WIFI_SETTINGS = 1

OFFLINE_BEFORE_SETUP_S = 30  # so lange ohne WLAN, dann Bluetooth-Einrichtung anbieten
AUTHORIZED_FOR_S = 300  # nach dem Druck auf Play so lange Zeit für die Eingabe in der App


def parse_rpc(data: bytes) -> tuple[int, list[str]]:
    """[Befehl, Länge, (Länge, Text)…, Prüfsumme] → (Befehl, Texte). Wirft ValueError bei kaputtem Paket."""
    if len(data) < 3 or data[1] != len(data) - 3 or sum(data[:-1]) & 0xFF != data[-1]:
        raise ValueError("ungültiges Paket")
    body, texts, i = data[2:-1], [], 0
    while i < len(body):
        n = body[i]
        if i + 1 + n > len(body):
            raise ValueError("ungültiges Paket")
        texts.append(body[i + 1 : i + 1 + n].decode("utf-8"))
        i += 1 + n
    return data[0], texts


def rpc_packet(command: int, texts: list[str]) -> bytes:
    body = b"".join(bytes([len(t.encode())]) + t.encode() for t in texts)
    packet = bytes([command, len(body)]) + body
    return packet + bytes([sum(packet) & 0xFF])


def local_ip() -> str | None:
    """Eigene Adresse im WLAN, None ohne Netz (sendet nichts, fragt nur die Route ab)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            ip = s.getsockname()[0]
            return None if ip.startswith("127.") else ip
    except OSError:
        return None


async def nmcli_connect(ssid: str, password: str) -> bool:
    cmd = ["sudo", "-n", "/usr/bin/nmcli", "--wait", "45", "device", "wifi", "connect", ssid]
    if password:
        cmd += ["password", password]
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    out, _ = await proc.communicate()
    if proc.returncode != 0:
        log.warning("WLAN „%s“: %s", ssid, out.decode(errors="replace").strip())
    return proc.returncode == 0


class WifiSetup:
    """Zustand nach Improv. Die Bluetooth-Seite (bless) ruft handle_rpc auf und liest state/error/result."""

    def __init__(
        self,
        port: int,
        on_change: Callable[[], None] = lambda: None,
        connect: Callable[[str, str], Awaitable[bool]] = nmcli_connect,
        ip: Callable[[], str | None] = local_ip,
    ):
        self.port = port
        self.on_change = on_change  # LED-Ring und App-Zustand neu zeichnen
        self.connect = connect
        self.ip = ip
        self.active = False  # Bluetooth-Einrichtung läuft
        self.state = AUTH_REQUIRED
        self.error = NO_ERROR
        self.result = b""
        self.notify: Callable[[str], None] = lambda uuid: None  # von der Bluetooth-Seite gesetzt
        self._auth_task: asyncio.Task | None = None

    def _set(self, state: int | None = None, error: int | None = None) -> None:
        if state is not None and state != self.state:
            self.state = state
            self.notify(STATE)
            self.on_change()
        if error is not None and error != self.error:
            self.error = error
            self.notify(ERROR)

    def authorize(self) -> None:
        """Play an der Box gedrückt, während die Einrichtung läuft."""
        if self.state != AUTH_REQUIRED:
            return
        log.info("WLAN-Einrichtung freigegeben (%d s)", AUTHORIZED_FOR_S)
        self._set(AUTHORIZED, NO_ERROR)
        if self._auth_task:
            self._auth_task.cancel()
        self._auth_task = asyncio.ensure_future(self._expire())

    async def _expire(self) -> None:
        await asyncio.sleep(AUTHORIZED_FOR_S)
        if self.state == AUTHORIZED:
            self._set(AUTH_REQUIRED)

    async def handle_rpc(self, data: bytes) -> None:
        try:
            command, texts = parse_rpc(data)
        except (ValueError, UnicodeDecodeError):
            self._set(error=INVALID_RPC)
            return
        if command != WIFI_SETTINGS or len(texts) != 2:
            self._set(error=UNKNOWN_RPC)
            return
        if self.state != AUTHORIZED:
            self._set(error=NOT_AUTHORIZED)
            return
        ssid, password = texts
        log.info("WLAN-Einrichtung: verbinde mit „%s“", ssid)
        self._set(PROVISIONING, NO_ERROR)
        ok = await self.connect(ssid, password)
        ip = self.ip() if ok else None
        if not ip:
            self._set(AUTHORIZED, UNABLE_TO_CONNECT)
            return
        self.result = rpc_packet(WIFI_SETTINGS, [f"http://{ip}:{self.port}"])
        self.notify(RPC_RESULT)
        self._set(PROVISIONED)
        log.info("WLAN-Einrichtung fertig: %s", ip)


async def run(setup: WifiSetup) -> None:
    """Bluetooth-Einrichtung anbieten, solange die Box kein WLAN hat."""
    offline_since: float | None = None
    server = None
    loop = asyncio.get_running_loop()
    while True:
        online = setup.ip() is not None
        now = loop.time()
        if online:
            offline_since = None
        elif offline_since is None:
            offline_since = now
        want = not online and now - offline_since >= OFFLINE_BEFORE_SETUP_S
        if want and server is None:
            try:
                server = await _start_ble(setup, loop)
                setup.active, setup.state, setup.error = True, AUTH_REQUIRED, NO_ERROR
                setup.on_change()
                log.info("Kein WLAN: Einrichtung per Bluetooth aktiv („Lauschbox“)")
            except Exception as e:  # noqa: BLE001 – ohne Bluetooth läuft die Box trotzdem
                log.warning("Bluetooth-Einrichtung nicht möglich: %s", e)
                await asyncio.sleep(300)
        elif server is not None and online and setup.state != PROVISIONING:
            await asyncio.sleep(10)  # der App Zeit lassen, das Ergebnis zu lesen
            await server.stop()
            server, setup.active = None, False
            setup.on_change()
            log.info("WLAN da: Bluetooth-Einrichtung beendet")
        await asyncio.sleep(5)


async def _start_ble(setup: WifiSetup, loop: asyncio.AbstractEventLoop):
    from bless import BlessServer, GATTAttributePermissions, GATTCharacteristicProperties as P

    values = {
        STATE: lambda: bytes([setup.state]),
        ERROR: lambda: bytes([setup.error]),
        RPC_RESULT: lambda: setup.result,
        CAPABILITIES: lambda: bytes([0]),  # „identify“ gibt es nicht
    }
    server = BlessServer(name="Lauschbox", loop=loop)
    server.read_request_func = lambda char, **kw: bytearray(values[str(char.uuid)]()) if str(char.uuid) in values else char.value

    def write(char, value, **kw):
        if str(char.uuid) == RPC_COMMAND:
            asyncio.ensure_future(setup.handle_rpc(bytes(value)))

    server.write_request_func = write
    await server.add_new_service(SERVICE)
    readable = GATTAttributePermissions.readable
    for uuid in (STATE, ERROR, RPC_RESULT):
        await server.add_new_characteristic(SERVICE, uuid, P.read | P.notify, None, readable)
    await server.add_new_characteristic(SERVICE, CAPABILITIES, P.read, None, readable)
    await server.add_new_characteristic(SERVICE, RPC_COMMAND, P.write, None, GATTAttributePermissions.writeable)

    def notify(uuid: str) -> None:
        char = server.get_characteristic(uuid)
        if char is not None:
            char.value = bytearray(values[uuid]())
            server.update_value(SERVICE, uuid)

    setup.notify = notify
    await server.start()
    return server
