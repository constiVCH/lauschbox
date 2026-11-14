"""WLAN-Einrichtung per Bluetooth LE nach dem offenen Protokoll „Improv Wi-Fi“ (improv-wifi.com).

Startet nur von Hand: alle drei Taster 3 s halten (die Box läuft auch ganz ohne WLAN, Bluetooth bleibt sonst aus).
Dann meldet sie sich 10 Minuten lang per Bluetooth als „Lauschbox“, der LED-Ring pulsiert blau. Wer die Tasten drückt,
steht vor der Box: Damit ist die Einrichtung freigegeben. Die App schickt Netzname und Passwort, die Box verbindet sich
über NetworkManager (nmcli) und antwortet mit ihrer Adresse. NetworkManager merkt sich jedes WLAN: An jedem Ort einmal
einrichten, danach verbindet sich die Box dort von selbst.
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

AUTH_REQUIRED, AUTHORIZED, PROVISIONING, PROVISIONED = 1, 2, 3, 4  # AUTH_REQUIRED kommt nicht vor: die Taster sind die Freigabe
NO_ERROR, INVALID_RPC, UNKNOWN_RPC, UNABLE_TO_CONNECT, NOT_AUTHORIZED = 0, 1, 2, 3, 4
WIFI_SETTINGS = 1

SETUP_FOR_S = 600  # so lange bleibt Bluetooth nach dem Tastendruck an


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
        self.state = AUTHORIZED
        self.error = NO_ERROR
        self.result = b""
        self.notify: Callable[[str], None] = lambda uuid: None  # von der Bluetooth-Seite gesetzt
        self._toggled = asyncio.Event()

    def _set(self, state: int | None = None, error: int | None = None) -> None:
        if state is not None and state != self.state:
            self.state = state
            self.notify(STATE)
            self.on_change()
        if error is not None and error != self.error:
            self.error = error
            self.notify(ERROR)

    def toggle(self) -> None:
        """Alle drei Taster gehalten: Einrichtung starten bzw. vorzeitig beenden."""
        self._toggled.set()

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
    """Auf den Tastendruck warten, dann Bluetooth anbieten, bis eingerichtet, abgelaufen oder erneut gedrückt."""
    while True:
        await setup._toggled.wait()
        setup._toggled.clear()
        try:
            server = await _start_ble(setup, asyncio.get_running_loop())
        except Exception as e:  # noqa: BLE001 – ohne Bluetooth läuft die Box trotzdem
            log.warning("Bluetooth-Einrichtung nicht möglich: %s", e)
            continue
        setup.active, setup.state, setup.error, setup.result = True, AUTHORIZED, NO_ERROR, b""
        setup.on_change()
        log.info("WLAN-Einrichtung per Bluetooth aktiv („Lauschbox“, %d min)", SETUP_FOR_S // 60)
        deadline = asyncio.get_running_loop().time() + SETUP_FOR_S
        while not setup._toggled.is_set() and asyncio.get_running_loop().time() < deadline:
            if setup.state == PROVISIONED:
                await asyncio.sleep(10)  # der App Zeit lassen, das Ergebnis zu lesen
                break
            await asyncio.sleep(1)
        setup._toggled.clear()
        await server.stop()
        setup.active = False
        setup.on_change()
        log.info("WLAN-Einrichtung per Bluetooth beendet")


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
