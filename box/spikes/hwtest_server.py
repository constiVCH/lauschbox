"""Hardware-Testserver für die Test-App (testapp/, Bereich „Testaufbau“).

Startet NFC, Taster, LED-Ring und Lautsprecher einzeln. Fehlt ein Bauteil oder ist es falsch verdrahtet,
meldet /api/hw/status den Fehler, der Rest läuft weiter.

    sudo apt install python3-gpiozero python3-lgpio swig liblgpio-dev
    python3 -m venv --system-site-packages .venv && . .venv/bin/activate
    pip install -r requirements.txt
    python spikes/hwtest_server.py            # Port 8080

API:
    GET  /api/hw/status    Pi-Modell, Temperatur, I2C-Adressen, Zustand je Bauteil, aufgelegter Token
    WS   /api/hw/events    {"type": "token", "uid": "04a1..."|null}, {"type": "button", "name": ..., "press": "kurz"|"lang"}
    POST /api/hw/leds      {"mode": "fill"|"level"|"off"|"test", "color": "#ff6a3d", "brightness": 0.2, "level": 0..12}
    POST /api/hw/tone      {"channel": "both"|"left"|"right", "volume": 0..100, "freq": 440, "seconds": 1.0}
"""
import argparse
import asyncio
import json
import math
import re
import socket
import struct
import subprocess
import tempfile
import threading
import time
import wave
from pathlib import Path

from aiohttp import WSMsgType, web

NUM_LEDS = 12
GAMMA = 2.6  # wie im box-daemon: sonst wirken Mischfarben am Ring weißlich
UART_PORT = "/dev/serial0"  # GPIO14/15, Pins 8/10
BUTTON_PINS = {"play_pause": 5, "lauter": 6, "leiser": 13}
KNOWN_I2C = {"0x24": "PN532", "0x36": "MAX17048", "0x57": "PiSugar", "0x68": "RTC/PiSugar", "0x75": "PiSugar"}


def open_pn532(mode: str = "auto"):
    """PN532 öffnen. UART (DIP-Schalter beide OFF, Pins 8/10) zuerst, dann I2C (Schalter 1 ON, Pins 3/5).

    Gibt (pn532, Beschreibung) zurück oder wirft RuntimeError mit den Gründen für beide Wege.
    """
    errors = []
    if mode in ("auto", "uart"):
        try:
            import serial
            from adafruit_pn532.uart import PN532_UART

            port = serial.Serial(UART_PORT, 115200, timeout=0.1)
            try:
                pn = PN532_UART(port, debug=False)
                _, ver, rev, _ = pn.firmware_version
                return pn, f"PN532 Firmware {ver}.{rev} über UART ({UART_PORT})"
            except Exception:
                port.close()
                raise
        except Exception as e:  # noqa: BLE001
            errors.append(f"UART: {type(e).__name__}: {e}")
    if mode in ("auto", "i2c"):
        try:
            import board
            import busio
            from adafruit_pn532.i2c import PN532_I2C

            pn = PN532_I2C(busio.I2C(board.SCL, board.SDA), debug=False)
            _, ver, rev, _ = pn.firmware_version
            return pn, f"PN532 Firmware {ver}.{rev} über I2C"
        except Exception as e:  # noqa: BLE001
            errors.append(f"I2C: {type(e).__name__}: {e}")
    raise RuntimeError("; ".join(errors))


class Hub:
    """Verteilt Ereignisse aus den Hardware-Threads an alle WebSocket-Clients."""

    def __init__(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop
        self.clients: set[web.WebSocketResponse] = set()

    def emit(self, event: dict) -> None:
        # Wird aus fremden Threads aufgerufen (NFC-Polling, gpiozero-Callbacks)
        asyncio.run_coroutine_threadsafe(self._send(event), self.loop)

    async def _send(self, event: dict) -> None:
        text = json.dumps(event)
        for ws in list(self.clients):
            try:
                await ws.send_str(text)
            except ConnectionError:
                self.clients.discard(ws)


class Component:
    def __init__(self, name: str):
        self.name = name
        self.ok = False
        self.detail = "nicht gestartet"

    def status(self) -> dict:
        return {"ok": self.ok, "detail": self.detail}


class Nfc(Component):
    def __init__(self, hub: Hub):
        super().__init__("nfc")
        self.hub = hub
        self.uid: str | None = None

    def start(self) -> None:
        try:
            self.pn532, self.detail = open_pn532()
            self.pn532.SAM_configuration()
            self.ok = True
        except Exception as e:  # noqa: BLE001 – jeder Fehler soll im Status landen
            self.detail = f"{type(e).__name__}: {e}"
            return
        threading.Thread(target=self._poll, daemon=True).start()

    def _poll(self) -> None:
        errors = 0
        while True:
            try:
                uid = self.pn532.read_passive_target(timeout=0.2)
                errors = 0
            except Exception as e:  # noqa: BLE001
                errors += 1
                if errors == 5:
                    self.ok, self.detail = False, f"Lesefehler: {e}"
                time.sleep(0.5)
                continue
            if not self.ok:
                self.ok, self.detail = True, "wieder verbunden"
            uid_hex = uid.hex() if uid else None
            if uid_hex != self.uid:
                self.uid = uid_hex
                self.hub.emit({"type": "token", "uid": uid_hex})
            time.sleep(0.05)


class Buttons(Component):
    def __init__(self, hub: Hub):
        super().__init__("buttons")
        self.hub = hub
        # Ob ein Taster gerade lang gehalten wurde. Eigenes Feld, weil gpiozero keine fremden Attribute am Button erlaubt.
        self.held: dict[str, bool] = {}

    def start(self) -> None:
        try:
            from gpiozero import Button
        except Exception as e:  # noqa: BLE001
            self.detail = f"{type(e).__name__}: {e}"
            return
        self.buttons = {}
        failed = []
        for name, pin in BUTTON_PINS.items():
            try:
                b = Button(pin, pull_up=True, bounce_time=0.05, hold_time=1.0)
            except Exception as e:  # noqa: BLE001
                failed.append(f"{name} (GPIO{pin}): {e}")
                continue
            self.held[name] = False
            b.when_pressed = lambda n=name: self._pressed(n)
            b.when_held = lambda n=name: self._held(n)
            b.when_released = lambda n=name: self._released(n)
            self.buttons[name] = b
        self.ok = not failed
        self.detail = "; ".join(failed) if failed else "GPIO " + ", ".join(str(p) for p in BUTTON_PINS.values())

    def _pressed(self, name: str) -> None:
        self.held[name] = False
        self.hub.emit({"type": "button", "name": name, "press": "down"})

    def _held(self, name: str) -> None:
        self.held[name] = True
        self.hub.emit({"type": "button", "name": name, "press": "lang"})

    def _released(self, name: str) -> None:
        self.hub.emit({"type": "button", "name": name, "press": "up" if self.held.get(name) else "kurz"})


class Leds(Component):
    def __init__(self):
        super().__init__("leds")
        self.task: asyncio.Task | None = None

    def start(self) -> None:
        try:
            import board
            import neopixel_spi

            self.pixels = neopixel_spi.NeoPixel_SPI(board.SPI(), NUM_LEDS, brightness=0.2, auto_write=False)
            self.pixels.fill((0, 0, 0))
            self.pixels.show()
            self.ok, self.detail = True, f"{NUM_LEDS} LEDs an SPI0 (GPIO10)"
        except Exception as e:  # noqa: BLE001
            self.detail = f"{type(e).__name__}: {e}"

    def apply(self, cmd: dict) -> None:
        if not self.ok:
            raise web.HTTPServiceUnavailable(text=self.detail)
        if self.task:
            self.task.cancel()
            self.task = None
        self.pixels.brightness = max(0.0, min(float(cmd.get("brightness", 0.2)), 0.6))
        color = _gamma(_hex_to_rgb(cmd.get("color", "#ffffff")))
        mode = cmd.get("mode", "fill")
        if mode == "off":
            self.pixels.fill((0, 0, 0))
        elif mode == "fill":
            self.pixels.fill(color)
        elif mode == "level":
            level = max(0, min(int(cmd.get("level", NUM_LEDS)), NUM_LEDS))
            for i in range(NUM_LEDS):
                self.pixels[i] = color if i < level else (0, 0, 0)
        elif mode == "test":
            self.task = asyncio.create_task(self._test_run())
            return
        else:
            raise web.HTTPBadRequest(text=f"unbekannter Modus {mode}")
        self.pixels.show()

    async def _test_run(self) -> None:
        # Jede LED einzeln in Rot, Grün, Blau: zeigt tote LEDs und vertauschte Farbreihenfolge
        for color in [(255, 0, 0), (0, 255, 0), (0, 0, 255)]:
            for i in range(NUM_LEDS):
                self.pixels.fill((0, 0, 0))
                self.pixels[i] = color
                self.pixels.show()
                await asyncio.sleep(0.06)
        self.pixels.fill((0, 0, 0))
        self.pixels.show()


class Audio(Component):
    def __init__(self):
        super().__init__("audio")
        self.lock = asyncio.Lock()

    def start(self) -> None:
        try:
            out = subprocess.run(["aplay", "-l"], capture_output=True, text=True, timeout=5).stdout
        except Exception as e:  # noqa: BLE001
            self.detail = f"aplay fehlt: {e}"
            return
        cards = re.findall(r"^card \d+: .*?\[(.*?)\]", out, re.M)
        self.ok = any("MAX98357" in c.upper() or "MAX98357A" in c.upper() for c in cards)
        self.detail = ", ".join(cards) if cards else "keine Soundkarte gefunden"
        if not self.ok and cards:
            self.detail = f"MAX98357A fehlt (gefunden: {self.detail}) – Overlay in config.txt prüfen"

    async def tone(self, cmd: dict) -> None:
        channel = cmd.get("channel", "both")
        volume = max(0, min(int(cmd.get("volume", 30)), 100)) / 100
        freq = max(100, min(float(cmd.get("freq", 440)), 4000))
        seconds = max(0.2, min(float(cmd.get("seconds", 1.0)), 5.0))
        path = Path(tempfile.gettempdir()) / "lauschbox_tone.wav"
        _write_tone(path, channel, volume, freq, seconds)
        async with self.lock:
            proc = await asyncio.create_subprocess_exec("aplay", "-q", str(path))
            await proc.wait()
        if proc.returncode != 0:
            raise web.HTTPInternalServerError(text=f"aplay beendet mit {proc.returncode}")


def _write_tone(path: Path, channel: str, volume: float, freq: float, seconds: float) -> None:
    rate = 44100
    n = int(rate * seconds)
    fade = int(rate * 0.02)  # 20 ms ein-/ausblenden, sonst knackt es
    frames = bytearray()
    for i in range(n):
        env = min(1.0, i / fade, (n - i) / fade)
        v = int(32767 * volume * env * math.sin(2 * math.pi * freq * i / rate))
        left = v if channel in ("both", "left") else 0
        right = v if channel in ("both", "right") else 0
        frames += struct.pack("<hh", left, right)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(frames))


def _gamma(c: tuple[int, int, int]) -> tuple[int, int, int]:
    return tuple(round(255 * (v / 255) ** GAMMA) for v in c)  # type: ignore[return-value]


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    if not re.fullmatch(r"[0-9a-fA-F]{6}", value):
        raise web.HTTPBadRequest(text="Farbe als #rrggbb")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _read(path: str) -> str | None:
    try:
        return Path(path).read_text().strip("\x00\n ")
    except OSError:
        return None


def _i2c_scan() -> list[dict]:
    try:
        out = subprocess.run(["i2cdetect", "-y", "1"], capture_output=True, text=True, timeout=5).stdout
    except Exception:  # noqa: BLE001
        return []
    found = []
    for line in out.splitlines()[1:]:
        row, _, cells = line.partition(":")
        for col, cell in enumerate(cells.split()):
            if cell not in ("--", "UU") and re.fullmatch(r"[0-9a-f]{2}", cell):
                addr = f"0x{int(row, 16) + col:02x}"
                found.append({"address": addr, "name": KNOWN_I2C.get(addr)})
    return found


def build_app() -> web.Application:
    app = web.Application(middlewares=[cors])
    routes = web.RouteTableDef()

    @routes.get("/api/hw/status")
    async def status(request: web.Request) -> web.Response:
        c = request.app["components"]
        temp = _read("/sys/class/thermal/thermal_zone0/temp")
        uptime = _read("/proc/uptime")
        throttled = None
        try:
            throttled = subprocess.run(["vcgencmd", "get_throttled"], capture_output=True, text=True, timeout=2).stdout.strip()
        except Exception:  # noqa: BLE001
            pass
        i2c = await asyncio.to_thread(_i2c_scan)
        return web.json_response({
            "host": socket.gethostname(),
            "model": _read("/proc/device-tree/model") or "unbekannt",
            "cpu_temp_c": round(int(temp) / 1000, 1) if temp else None,
            "uptime_s": int(float(uptime.split()[0])) if uptime else None,
            "throttled": throttled,
            "i2c": i2c,
            "components": {name: comp.status() for name, comp in c.items()},
            "token": c["nfc"].uid,
        })

    @routes.get("/api/hw/events")
    async def events(request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse(heartbeat=10)
        await ws.prepare(request)
        hub: Hub = request.app["hub"]
        hub.clients.add(ws)
        await ws.send_str(json.dumps({"type": "token", "uid": request.app["components"]["nfc"].uid}))
        try:
            async for msg in ws:
                if msg.type == WSMsgType.ERROR:
                    break
        finally:
            hub.clients.discard(ws)
        return ws

    @routes.post("/api/hw/leds")
    async def leds(request: web.Request) -> web.Response:
        request.app["components"]["leds"].apply(await request.json())
        return web.json_response({"ok": True})

    @routes.post("/api/hw/tone")
    async def tone(request: web.Request) -> web.Response:
        audio: Audio = request.app["components"]["audio"]
        if not audio.ok:
            raise web.HTTPServiceUnavailable(text=audio.detail)
        await audio.tone(await request.json())
        return web.json_response({"ok": True})

    app.add_routes(routes)

    async def on_startup(app: web.Application) -> None:
        hub = Hub(asyncio.get_running_loop())
        comps = {"nfc": Nfc(hub), "buttons": Buttons(hub), "leds": Leds(), "audio": Audio()}
        for comp in comps.values():
            try:
                comp.start()
            except Exception as e:  # noqa: BLE001 – ein kaputtes Bauteil darf den Server nicht stoppen
                comp.ok, comp.detail = False, f"{type(e).__name__}: {e}"
            print(f"{comp.name:8} {'OK ' if comp.ok else 'FEHLER'}  {comp.detail}")
        app["hub"], app["components"] = hub, comps

    app.on_startup.append(on_startup)
    return app


@web.middleware
async def cors(request: web.Request, handler):
    # Für die Test-App im Browser (Expo Web); die Handy-App braucht das nicht
    if request.method == "OPTIONS":
        resp = web.Response()
    else:
        try:
            resp = await handler(request)
        except web.HTTPException as e:
            resp = e
    if isinstance(resp, web.WebSocketResponse):
        return resp  # Header sind beim WebSocket schon gesendet
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    web.run_app(build_app(), host="0.0.0.0", port=args.port)
