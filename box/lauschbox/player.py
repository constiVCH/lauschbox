"""Wiedergabe. SpotifyPlayer spricht mit go-librespot (localhost:3678), FakePlayer simuliert für Tests am PC."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field, replace
from typing import Callable

import aiohttp

log = logging.getLogger(__name__)


@dataclass
class PlayerStatus:
    available: bool = False
    playing: bool = False
    context_uri: str | None = None
    track_uri: str | None = None
    track_name: str | None = None
    track_number: int | None = None
    album_name: str | None = None
    cover_url: str | None = None
    duration_ms: int = 0
    # Position zum Zeitpunkt `at` (time.monotonic); die aktuelle Position rechnet position_now() hoch
    position_ms: int = 0
    at: float = field(default_factory=time.monotonic)
    volume: int = 0
    error: str | None = None

    def position_now(self) -> int:
        if not self.playing:
            return self.position_ms
        pos = self.position_ms + int((time.monotonic() - self.at) * 1000)
        return min(pos, self.duration_ms) if self.duration_ms else pos


Listener = Callable[[PlayerStatus, str], None]


class Player:
    """Gemeinsame Schnittstelle. `on_change(status, reason)` meldet jede Änderung."""

    status: PlayerStatus
    on_change: Listener | None = None

    async def start(self) -> None: ...
    async def close(self) -> None: ...
    async def play(self, uri: str, skip_to_uri: str | None = None, position_ms: int = 0) -> None: ...
    async def pause(self) -> None: ...
    async def resume(self) -> None: ...
    async def next(self) -> None: ...
    async def prev(self) -> None: ...
    async def seek(self, position_ms: int) -> None: ...
    async def set_volume(self, volume: int) -> None: ...
    async def auth_code(self) -> dict | None:
        return None

    def position(self) -> int:
        """Aktuelle Position im Titel in ms (zwischen zwei Statusmeldungen hochgerechnet)."""
        return self.status.position_now()

    def _emit(self, reason: str) -> None:
        if self.on_change:
            self.on_change(self.status, reason)


class SpotifyPlayer(Player):
    """go-librespot über dessen lokale API (siehe docs/pi-setup.md, Schritt 3)."""

    def __init__(self, base_url: str = "http://localhost:3678"):
        self.base = base_url.rstrip("/")
        self.status = PlayerStatus()
        self._session: aiohttp.ClientSession | None = None
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8))
        self._task = asyncio.create_task(self._events_loop())

    async def close(self) -> None:
        if self._task:
            self._task.cancel()
        if self._session:
            await self._session.close()

    async def _post(self, path: str, body: dict | None = None) -> None:
        assert self._session
        async with self._session.post(self.base + path, json=body) as resp:
            if resp.status >= 400:
                text = await resp.text()
                raise PlayerError(f"go-librespot {path}: {resp.status} {text.strip()}")

    async def _refresh(self, reason: str) -> None:
        assert self._session
        try:
            async with self._session.get(self.base + "/status") as resp:
                if resp.status == 204:
                    self.status = replace(self.status, available=True, playing=False, error=None)
                    self._emit(reason)
                    return
                data = await resp.json()
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            self.status = replace(self.status, available=False, playing=False, error=str(e) or type(e).__name__)
            self._emit("unavailable")
            return
        track = data.get("track") or {}
        self.status = PlayerStatus(
            available=True,
            playing=not (data.get("stopped") or data.get("paused")) and bool(track),
            context_uri=data.get("context_uri"),
            track_uri=track.get("uri"),
            track_name=track.get("name"),
            track_number=track.get("track_number") or None,
            album_name=track.get("album_name"),
            cover_url=track.get("album_cover_url"),
            duration_ms=int(track.get("duration") or 0),
            position_ms=int(track.get("position") or 0),
            volume=int(data.get("volume") or 0),
        )
        self._emit(reason)

    async def _events_loop(self) -> None:
        """Hält den WebSocket zu go-librespot offen; nach jedem Ereignis wird /status neu gelesen."""
        assert self._session
        delay = 1.0
        while True:
            try:
                await self._refresh("connect")
                async with self._session.ws_connect(self.base + "/events", heartbeat=20, timeout=aiohttp.ClientWSTimeout(ws_close=5)) as ws:
                    delay = 1.0
                    async for msg in ws:
                        if msg.type != aiohttp.WSMsgType.TEXT:
                            continue
                        try:
                            event = json.loads(msg.data)
                        except json.JSONDecodeError:
                            continue
                        etype = event.get("type", "")
                        if etype == "playback_error":
                            self.status = replace(self.status, error=(event.get("data") or {}).get("message"))
                        await self._refresh(etype)
            except asyncio.CancelledError:
                raise
            except Exception as e:  # noqa: BLE001 – Verbindung später neu versuchen
                if self.status.available:
                    log.warning("go-librespot nicht erreichbar: %s", e)
                self.status = replace(self.status, available=False, playing=False, error=str(e) or type(e).__name__)
                self._emit("unavailable")
            await asyncio.sleep(delay)
            delay = min(delay * 2, 15)

    async def play(self, uri: str, skip_to_uri: str | None = None, position_ms: int = 0) -> None:
        body: dict = {"uri": uri}
        if skip_to_uri:
            body["skip_to_uri"] = skip_to_uri
        if position_ms > 0:
            body["position"] = int(position_ms)
        await self._post("/player/play", body)

    async def pause(self) -> None:
        await self._post("/player/pause")

    async def resume(self) -> None:
        await self._post("/player/resume")

    async def next(self) -> None:
        await self._post("/player/next")

    async def prev(self) -> None:
        await self._post("/player/prev")

    async def seek(self, position_ms: int) -> None:
        await self._post("/player/seek", {"position": max(0, int(position_ms))})

    async def set_volume(self, volume: int) -> None:
        await self._post("/player/volume", {"volume": max(0, min(100, int(volume)))})

    async def auth_code(self) -> dict | None:
        assert self._session
        try:
            async with self._session.get(self.base + "/auth/code") as resp:
                return await resp.json() if resp.status == 200 else None
        except (aiohttp.ClientError, asyncio.TimeoutError):
            return None


class PlayerError(Exception):
    pass


class FakePlayer(Player):
    """Simuliert go-librespot: jede URI hat 6 Titel à 3 Minuten. `speed` lässt die Zeit schneller laufen."""

    TRACKS = 6
    TRACK_MS = 180_000

    def __init__(self, speed: float = 1.0):
        self.speed = speed
        self.status = PlayerStatus(available=True, volume=40)
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())
        self._emit("connect")

    async def close(self) -> None:
        if self._task:
            self._task.cancel()

    def position(self) -> int:
        return min(self._pos(), self.TRACK_MS)

    def _pos(self) -> int:
        s = self.status
        if not s.playing:
            return s.position_ms
        return s.position_ms + int((time.monotonic() - s.at) * 1000 * self.speed)

    def _set_track(self, uri: str, index: int, position_ms: int, playing: bool, reason: str) -> None:
        self.status = replace(
            self.status,
            playing=playing,
            context_uri=uri,
            track_uri=f"{uri}#track{index + 1}",
            track_name=f"Kapitel {index + 1}",
            track_number=index + 1,
            album_name=uri,
            duration_ms=self.TRACK_MS,
            position_ms=position_ms,
            at=time.monotonic(),
        )
        self._emit(reason)

    def _index(self) -> int:
        return (self.status.track_number or 1) - 1

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(0.25)
            s = self.status
            if not s.playing or not s.context_uri:
                continue
            if self._pos() >= self.TRACK_MS:
                if self._index() + 1 < self.TRACKS:
                    self._set_track(s.context_uri, self._index() + 1, 0, True, "metadata")
                else:
                    self.status = replace(s, playing=False, position_ms=self.TRACK_MS, at=time.monotonic())
                    self._emit("not_playing")

    async def play(self, uri: str, skip_to_uri: str | None = None, position_ms: int = 0) -> None:
        index = 0
        if skip_to_uri and "#track" in skip_to_uri:
            index = max(0, min(self.TRACKS - 1, int(skip_to_uri.rsplit("#track", 1)[1]) - 1))
        self._set_track(uri, index, max(0, position_ms), True, "playing")

    async def pause(self) -> None:
        self.status = replace(self.status, playing=False, position_ms=self._pos(), at=time.monotonic())
        self._emit("paused")

    async def resume(self) -> None:
        if self.status.context_uri:
            self.status = replace(self.status, playing=True, at=time.monotonic())
            self._emit("playing")

    async def next(self) -> None:
        if self.status.context_uri:
            self._set_track(self.status.context_uri, min(self._index() + 1, self.TRACKS - 1), 0, self.status.playing, "metadata")

    async def prev(self) -> None:
        if not self.status.context_uri:
            return
        index = self._index() - 1 if self._pos() < 3000 else self._index()
        self._set_track(self.status.context_uri, max(0, index), 0, self.status.playing, "metadata")

    async def seek(self, position_ms: int) -> None:
        self.status = replace(self.status, position_ms=max(0, min(position_ms, self.TRACK_MS - 1)), at=time.monotonic())
        self._emit("seek")

    async def set_volume(self, volume: int) -> None:
        self.status = replace(self.status, volume=volume)
        self._emit("volume")

    async def auth_code(self) -> dict | None:
        return None
