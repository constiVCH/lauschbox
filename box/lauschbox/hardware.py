"""Hardware am Pi: NFC (PN532 über I2C), 3 Taster (GPIO), LED-Ring (WS2812 über SPI).

Jedes Teil startet für sich. Fehlt eins, läuft der Rest weiter und status() meldet den Fehler.
Die Pinbelegung steht in hardware/teileliste.md.
"""
from __future__ import annotations

import asyncio
import logging
import math
import threading
import time
from typing import Awaitable, Callable

log = logging.getLogger(__name__)

NUM_LEDS = 12
BUTTON_PINS = {"play_pause": 5, "lauter": 6, "leiser": 13}
HOLD_S = 1.0
# So viele Fehllesungen hintereinander, bis ein Token als abgenommen gilt (ca. 0,6 s).
# Der PN532 verpasst einen aufliegenden Token gelegentlich; sonst würde die Box ständig kurz pausieren.
MISSES_FOR_REMOVAL = 3


class Part:
    def __init__(self, name: str):
        self.name = name
        self.ok = False
        self.detail = "nicht gestartet"

    def status(self) -> dict:
        return {"ok": self.ok, "detail": self.detail}


class Nfc(Part):
    def __init__(self, loop: asyncio.AbstractEventLoop, on_token: Callable[[str | None], Awaitable[None]]):
        super().__init__("nfc")
        self.loop = loop
        self.on_token = on_token

    def start(self) -> None:
        try:
            import board
            import busio
            from adafruit_pn532.i2c import PN532_I2C

            self.pn532 = PN532_I2C(busio.I2C(board.SCL, board.SDA), debug=False)
            _, ver, rev, _ = self.pn532.firmware_version
            self.pn532.SAM_configuration()
            self.ok, self.detail = True, f"PN532 Firmware {ver}.{rev}"
        except Exception as e:  # noqa: BLE001
            self.detail = f"{type(e).__name__}: {e}"
            log.warning("NFC: %s", self.detail)
            return
        threading.Thread(target=self._poll, name="nfc", daemon=True).start()

    def _emit(self, uid: str | None) -> None:
        asyncio.run_coroutine_threadsafe(self.on_token(uid), self.loop)

    def _poll(self) -> None:
        current: str | None = None
        misses = 0
        errors = 0
        while True:
            try:
                raw = self.pn532.read_passive_target(timeout=0.15)
                errors = 0
                if not self.ok:
                    self.ok, self.detail = True, "wieder verbunden"
            except Exception as e:  # noqa: BLE001
                errors += 1
                if errors == 5:
                    self.ok, self.detail = False, f"Lesefehler: {e}"
                    log.warning("NFC: %s", self.detail)
                time.sleep(0.5)
                continue
            uid = raw.hex() if raw else None
            if uid:
                misses = 0
                if uid != current:
                    current = uid
                    self._emit(uid)
            elif current:
                misses += 1
                if misses >= MISSES_FOR_REMOVAL:
                    current = None
                    misses = 0
                    self._emit(None)
            time.sleep(0.05)


class Buttons(Part):
    """Kurz/lang je Taster; + und − gleichzeitig lang = Tastensperre umschalten."""

    def __init__(self, loop: asyncio.AbstractEventLoop, on_press: Callable[[str, str], Awaitable[None]]):
        super().__init__("buttons")
        self.loop = loop
        self.on_press = on_press
        self.down: dict[str, float] = {}
        self.consumed: set[str] = set()

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
                b = Button(pin, pull_up=True, bounce_time=0.04, hold_time=HOLD_S)
            except Exception as e:  # noqa: BLE001
                failed.append(f"{name} (GPIO{pin}): {e}")
                continue
            b.when_pressed = lambda n=name: self._pressed(n)
            b.when_held = lambda n=name: self._held(n)
            b.when_released = lambda n=name: self._released(n)
            self.buttons[name] = b
        self.ok = not failed
        self.detail = "; ".join(failed) if failed else "GPIO " + ", ".join(str(p) for p in BUTTON_PINS.values())

    def _emit(self, name: str, press: str) -> None:
        asyncio.run_coroutine_threadsafe(self.on_press(name, press), self.loop)

    def _pressed(self, name: str) -> None:
        self.down[name] = time.monotonic()
        self.consumed.discard(name)

    def _held(self, name: str) -> None:
        if {"lauter", "leiser"} <= self.down.keys():
            if not {"lauter", "leiser"} & self.consumed:
                self.consumed |= {"lauter", "leiser"}
                self._emit("lock", "lang")
            return
        if name in ("lauter", "leiser"):
            # Kurz warten, ob der andere Taster noch dazukommt (Sperre), sonst Titel springen
            def later() -> None:
                time.sleep(0.25)
                if name in self.down and name not in self.consumed and not {"lauter", "leiser"} <= self.down.keys():
                    self.consumed.add(name)
                    self._emit(name, "lang")

            threading.Thread(target=later, daemon=True).start()
        else:
            self.consumed.add(name)
            self._emit(name, "lang")

    def _released(self, name: str) -> None:
        self.down.pop(name, None)
        if name not in self.consumed:
            self._emit(name, "kurz")
        self.consumed.discard(name)


class LedRing(Part):
    def __init__(self):
        super().__init__("leds")
        self.pixels = None

    def start(self) -> None:
        try:
            import board
            import neopixel_spi

            self.pixels = neopixel_spi.NeoPixel_SPI(board.SPI(), NUM_LEDS, brightness=1.0, auto_write=False)
            self.show([(0, 0, 0)] * NUM_LEDS)
            self.ok, self.detail = True, f"{NUM_LEDS} LEDs an SPI0 (GPIO10)"
        except Exception as e:  # noqa: BLE001
            self.detail = f"{type(e).__name__}: {e}"
            log.warning("LEDs: %s", self.detail)

    def show(self, frame: list[tuple[int, int, int]]) -> None:
        if self.pixels is None:
            return
        for i, c in enumerate(frame):
            self.pixels[i] = c
        self.pixels.show()


def _rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def led_frame(led: dict, t: float) -> list[tuple[int, int, int]]:
    """Farbe jeder LED zum Zeitpunkt t (Sekunden). Gleiche Muster wie testapp/src/components/LedRing.tsx."""
    mode, color, fill = led["mode"], _rgb(led.get("color", "#FFFFFF")), float(led.get("fill", 0))
    bright = float(led.get("brightness", 0.25))
    pulse = 0.55 + 0.45 * math.sin(t * math.pi)
    blink = int(t * 4) % 2 == 0
    lit = math.ceil(max(0.0, min(1.0, fill)) * NUM_LEDS)

    def dim(c: tuple[int, int, int], a: float) -> tuple[int, int, int]:
        a = max(0.0, min(1.0, a * bright))
        return (int(c[0] * a), int(c[1] * a), int(c[2] * a))

    if mode == "idle":
        head = int(t * 4) % NUM_LEDS
        return [dim((255, 255, 255), 0.5) if i == head else (0, 0, 0) for i in range(NUM_LEDS)]
    if mode == "playing":
        return [dim(color, 1 if i < lit else 0.08) for i in range(NUM_LEDS)]
    if mode == "paused":
        return [dim(color, pulse if i < lit else 0.06) for i in range(NUM_LEDS)]
    if mode == "volume":
        return [dim((255, 255, 255), 1 if i < lit else 0.05) for i in range(NUM_LEDS)]
    if mode in ("learn", "denied"):
        return [dim(color, pulse)] * NUM_LEDS
    if mode in ("unknown", "locked", "unlocked", "error"):
        return [dim(color, 1 if blink else 0)] * NUM_LEDS
    return [(0, 0, 0)] * NUM_LEDS


async def run_leds(ring: LedRing, get_state: Callable[[], dict], fps: int = 25) -> None:
    """Zeichnet den Ring fortlaufend aus dem Zustand der Engine."""
    if not ring.ok:
        return
    start = time.monotonic()
    last: list | None = None
    while True:
        frame = led_frame(get_state(), time.monotonic() - start)
        if frame != last:
            try:
                ring.show(frame)
            except Exception as e:  # noqa: BLE001
                log.warning("LED-Ausgabe: %s", e)
            last = frame
        await asyncio.sleep(1 / fps)
