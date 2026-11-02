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
from .engine import Engine
from .player import FakePlayer, SpotifyPlayer
from .store import Store

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
    data_dir = args.data_dir or (Path("data") if args.fake else Path.home() / ".local/share/lauschbox")
    web.run_app(run(args, data_dir), host="0.0.0.0", port=args.port, print=lambda *_: None)


async def run(args, data_dir: Path) -> web.Application:
    store = Store(data_dir / "lauschbox.db")
    player = FakePlayer(speed=args.speed) if args.fake else SpotifyPlayer(args.librespot)
    engine = Engine(store, player)
    hardware: dict = {}

    if not args.fake:
        from .hardware import Buttons, LedRing, Nfc

        loop = asyncio.get_running_loop()

        async def on_token(uid: str | None) -> None:
            if uid:
                await engine.token_placed(uid)
            else:
                await engine.token_removed()

        nfc = Nfc(loop, on_token, mode=args.nfc)
        buttons = Buttons(loop, engine.button)
        ring = LedRing()
        for part in (nfc, buttons, ring):
            part.start()
            log.info("%-8s %s  %s", part.name, "OK    " if part.ok else "FEHLER", part.detail)
        hardware = {"nfc": nfc, "buttons": buttons, "leds": ring}

    app = build_app(engine, simulate=args.fake, hardware=hardware)
    extras: dict = {}

    async def startup(app: web.Application) -> None:
        await engine.start()
        if "leds" in hardware:
            from .hardware import run_leds

            extras["led_task"] = asyncio.create_task(run_leds(hardware["leds"], engine.led_state))
        if not args.no_mdns:
            extras["mdns"] = await _announce(args.port)
        log.info("Lauschbox bereit auf Port %s (%s)", args.port, "Simulation" if args.fake else "Hardware")

    async def cleanup(app: web.Application) -> None:
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


def _local_ip() -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.connect(("10.255.255.255", 1))  # sendet nichts, wählt nur die passende Schnittstelle
        return s.getsockname()[0]


if __name__ == "__main__":
    main()
