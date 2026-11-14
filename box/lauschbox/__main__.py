"""Startet den box-daemon.

Auf dem Pi:   python -m lauschbox
Am PC:        python -m lauschbox --fake          (ohne Hardware und Spotify, Token per App simulieren)
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import socket
from pathlib import Path

from aiohttp import web

from .api import build_app
from .system import MemoryLog
from .engine import Engine
from .player import FakePlayer, LocalPlayer, MixPlayer, SpotifyPlayer
from .store import Store
from .wifi_setup import WifiSetup
from .wifi_setup import run as run_wifi_setup

log = logging.getLogger("lauschbox")


def main() -> None:
    parser = argparse.ArgumentParser(prog="lauschbox")
    parser.add_argument("--fake", action="store_true", help="ohne Hardware und go-librespot (Simulation)")
    parser.add_argument("--speed", type=float, default=1.0, help="Zeitraffer für --fake, z. B. 30")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--data-dir", type=Path, default=None, help="Ablage für lauschbox.db")
    parser.add_argument("--librespot", default="http://localhost:3678", help="URL der go-librespot-API")
    parser.add_argument("--nfc", choices=["auto", "uart", "i2c"], default="auto", help="Anschluss des PN532")
    parser.add_argument("--no-mdns", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    memory_log = MemoryLog()
    logging.getLogger().addHandler(memory_log)
    args.memory_log = memory_log
    data_dir = args.data_dir or (Path("data") if args.fake else Path.home() / ".local/share/lauschbox")
    web.run_app(run(args, data_dir), host="0.0.0.0", port=args.port, print=lambda *_: None)


async def run(args, data_dir: Path) -> web.Application:
    store = Store(data_dir / "lauschbox.db")
    media_dir = data_dir / "media"
    if args.fake:
        player = FakePlayer(speed=args.speed)
    else:
        player = MixPlayer(SpotifyPlayer(args.librespot), LocalPlayer(media_dir, _librespot_audio_device()))
    engine = Engine(store, player)
    wifi = WifiSetup(args.port, on_change=engine._changed)
    engine.wifi_setup = wifi
    hardware: dict = {}

    if not args.fake:
        from .hardware import Amp, Buttons, LedRing, Nfc

        loop = asyncio.get_running_loop()

        async def on_token(uid: str | None) -> None:
            if uid:
                log.info("Token %s → %s", uid, await engine.token_placed(uid))
            else:
                await engine.token_removed()

        nfc = Nfc(loop, on_token, mode=args.nfc)
        async def on_button(name: str, press: str) -> None:
            if name == "wifi":
                engine._wake()
                wifi.toggle()  # alle drei Taster: WLAN-Einrichtung per Bluetooth an/aus
            else:
                await engine.button(name, press)

        buttons = Buttons(loop, on_button)
        ring = LedRing()
        amp = Amp()
        for part in (nfc, buttons, ring, amp):
            part.start()
            log.info("%-8s %s  %s", part.name, "OK    " if part.ok else "FEHLER", part.detail)
        hardware = {"nfc": nfc, "buttons": buttons, "leds": ring, "amp": amp}
        engine.amp = amp

    app = build_app(engine, simulate=args.fake, hardware=hardware, memory_log=args.memory_log, media_dir=media_dir)
    extras: dict = {}

    async def startup(app: web.Application) -> None:
        await engine.start()
        if "leds" in hardware and hardware["leds"].ok:
            from .hardware import run_leds

            extras["led_task"] = asyncio.create_task(run_leds(hardware["leds"], engine.led_state))
        if any(not part.ok for part in hardware.values()):
            extras["retry_task"] = asyncio.create_task(retry_hardware())
        if not args.fake:
            extras["wifi_task"] = asyncio.create_task(run_wifi_setup(wifi))
        if not args.no_mdns:
            extras["mdns"] = await _announce(args.port)
        log.info("Lauschbox bereit auf Port %s (%s)", args.port, "Simulation" if args.fake else "Hardware")

    async def retry_hardware() -> None:
        from .hardware import retry_parts, run_leds

        def on_ok(part) -> None:
            if part is hardware.get("leds") and "led_task" not in extras:
                extras["led_task"] = asyncio.create_task(run_leds(part, engine.led_state))

        # engine._changed schickt den neuen Hardware-Zustand an die App
        await retry_parts(hardware, on_ok, engine._changed)

    async def cleanup(app: web.Application) -> None:
        for name in ("retry_task", "wifi_task"):
            if name in extras:
                extras[name].cancel()
        if "led_task" in extras:
            extras["led_task"].cancel()
        if extras.get("mdns"):
            await extras["mdns"].async_close()
        await engine.close()
        store.close()

    app.on_startup.append(startup)
    app.on_cleanup.append(cleanup)
    return app


async def _announce(port: int):
    """Box im WLAN bekanntmachen (_lauschbox._tcp). Optional: ohne zeroconf geht es per IP."""
    try:
        from zeroconf import IPVersion, ServiceInfo
        from zeroconf.asyncio import AsyncZeroconf
    except ImportError:
        log.info("zeroconf nicht installiert, keine mDNS-Ankündigung")
        return None
    host = socket.gethostname()
    try:
        ip = _local_ip()
        info = ServiceInfo(
            "_lauschbox._tcp.local.",
            f"{host}._lauschbox._tcp.local.",
            addresses=[socket.inet_aton(ip)],
            port=port,
            properties={"path": "/api"},
            server=f"{host}.local.",
        )
        zc = AsyncZeroconf(ip_version=IPVersion.V4Only)
        await zc.async_register_service(info)
        log.info("mDNS: %s auf %s:%s", info.name, ip, port)
        return zc
    except Exception as e:  # noqa: BLE001
        log.warning("mDNS fehlgeschlagen: %s", e)
        return None


def _librespot_audio_device() -> str:
    """Eigene Dateien über denselben Ausgang wie Spotify (audio_device in der go-librespot-Konfiguration)."""
    try:
        for line in (Path.home() / ".config/go-librespot/config.yml").read_text().splitlines():
            if line.startswith("audio_device:"):
                return line.split(":", 1)[1].strip().strip("'\"") or "auto"
    except OSError:
        pass
    return "auto"


def _local_ip() -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.connect(("10.255.255.255", 1))  # sendet nichts, wählt nur die passende Schnittstelle
        return s.getsockname()[0]


if __name__ == "__main__":
    main()
