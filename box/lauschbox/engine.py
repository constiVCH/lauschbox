"""Regeln der Box: Token → Wiedergabe, Taster, Kindermodus, Sleep-Timer, Lernmodus, LED-Zustand.

Entspricht der simulierten Box der Test-App (testapp/src/demo/demoBox.ts), nur mit echtem Player und echter Uhrzeit.
Die Engine kennt keine Hardware: NFC, Taster und API rufen ihre Methoden auf, LEDs lesen led_state().
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import asdict, fields, replace
from datetime import datetime
from typing import Callable

from .player import Player, PlayerError, PlayerStatus
from .store import KidMode, Medium, Progress, Settings, Store, Token

log = logging.getLogger(__name__)

LED_COLORS = {
    "learn": "#5B9BFF",
    "unknown": "#FF9F40",
    "denied": "#B07CFF",
    "locked": "#FF5A4E",
    "unlocked": "#5BCB6E",
    "volume": "#FFFFFF",
    "error": "#FF5A4E",
}

NOTICE_SECONDS = 6
SAVE_EVERY_S = 10


def _hhmm(value: str) -> int:
    h, m = value.split(":")
    return int(h) * 60 + int(m)


class Engine:
    def __init__(self, store: Store, player: Player, clock: Callable[[], datetime] = datetime.now):
        self.store = store
        self.player = player
        self.clock = clock
        self.settings: Settings = store.settings()
        self.kid: KidMode = store.kid()
        self.placed: str | None = None
        self.learning = False
        self.learned_uid: str | None = None
        self.locked = False
        self.volume = min(self.settings.start_volume, self.volume_cap())
        self.sleep: dict = {"kind": "off"}
        self.notice: dict | None = None
        self._notice_id = 0
        self._notice_until = 0.0
        self._flash: dict | None = None
        self._flash_until = 0.0
        self._loaded: str | None = None  # UID, dessen Inhalt gerade im Player liegt
        self._finished: str | None = None  # UID, dessen Inhalt zu Ende gehört wurde (Hörstand nicht mehr überschreiben)
        self._last_track: str | None = None
        self._last_pos = (0, 0)  # (position_ms, duration_ms) der letzten Meldung, für „Ende erreicht“
        self._last_save = 0.0
        self._listeners: list[Callable[[], None]] = []
        self._task: asyncio.Task | None = None
        player.on_change = self._on_player

    # ---------- Lebenszyklus ----------

    async def start(self) -> None:
        await self.player.start()
        try:
            await self.player.set_volume(self.volume)
        except (PlayerError, OSError) as e:
            log.info("Startlautstärke noch nicht gesetzt: %s", e)
        self._task = asyncio.create_task(self._tick_loop())

    async def close(self) -> None:
        if self._task:
            self._task.cancel()
        self._save_progress()
        await self.player.close()

    def subscribe(self, fn: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(fn)
        return lambda: self._listeners.remove(fn)

    def _changed(self) -> None:
        for fn in list(self._listeners):
            fn()

    # ---------- Regeln ----------

    def bedtime_active(self) -> bool:
        k = self.kid
        if not (k.enabled and k.bedtime_enabled):
            return False
        now = self.clock()
        minutes = now.hour * 60 + now.minute
        start, end = _hhmm(k.bedtime_from), _hhmm(k.bedtime_to)
        return start <= minutes < end if start < end else minutes >= start or minutes < end

    def volume_cap(self) -> int:
        cap = self.settings.max_volume
        if self.kid.enabled:
            cap = min(cap, self.kid.max_volume)
            if self.bedtime_active():
                cap = min(cap, self.kid.bedtime_max_volume)
        return cap

    def token(self) -> Token | None:
        return self.store.token(self.placed) if self.placed else None

    @property
    def playing(self) -> bool:
        return self.player.status.playing

    def _flash_led(self, mode: str, seconds: float = 1.6, color: str | None = None, fill: float = 1.0) -> None:
        self._flash = {"mode": mode, "color": color or LED_COLORS.get(mode, "#FFFFFF"), "fill": fill}
        self._flash_until = time.monotonic() + seconds
        self._changed()

    def _clear_flash(self) -> None:
        self._flash_until = 0.0

    def _notify(self, text: str, tone: str = "info") -> None:
        self._notice_id += 1
        self.notice = {"id": self._notice_id, "text": text, "tone": tone}
        self._notice_until = time.monotonic() + NOTICE_SECONDS
        log.info("Hinweis: %s", text)
        self._changed()

    # ---------- Token ----------

    async def token_placed(self, uid: str) -> str:
        """Ergebnis: started, resumed, learned, known, unknown, ignored, denied, error."""
        if uid == self.placed:
            return "ignored"
        self._clear_flash()
        if self.placed:
            await self.token_removed()
        self.placed = uid
        token = self.store.token(uid)

        if self.learning:
            if token:
                self._notify(f"„{token.name}“ ist schon angelernt. Leg einen leeren Token auf.", "warning")
                return "known"
            self.learned_uid = uid
            self._changed()
            return "learned"

        if not token:
            if self.kid.enabled and self.kid.known_tokens_only:
                self._changed()
                return "ignored"
            self._flash_led("unknown", 2.0)
            self._notify("Unbekannter Token. In der App unter „Token“ anlernen.", "warning")
            return "unknown"

        if self.bedtime_active():
            self._flash_led("denied", 2.0)
            self._notify("Schlafenszeit: Neue Geschichten starten erst morgen früh.")
            return "denied"

        return await self._start(token)

    async def _start(self, token: Token, from_start: bool = False) -> str:
        p = token.progress
        restart = from_start or self.settings.on_replace == "restart" or p.finished
        status = self.player.status
        same = not restart and self._loaded == token.uid and status.context_uri == token.medium.uri and bool(status.track_uri)
        prev_loaded = self._loaded
        # Vor dem Abspielen setzen: Der Player meldet sich womöglich schon während play()
        self._loaded = token.uid
        if self._finished == token.uid and not same:
            self._finished = None
        if restart:
            self.store.save_progress(token.uid, Progress())
        if not same:
            self._last_track = None  # erst die erste Meldung des neuen Inhalts zählt
        try:
            if self.volume > self.volume_cap():
                await self.set_volume(self.volume_cap())
            if same:
                # Derselbe Token liegt wieder auf und der Player hat seinen Inhalt noch: einfach weiter
                await self.player.resume()
                result = "resumed"
            elif restart:
                await self.player.play(token.medium.uri)
                result = "started"
            else:
                await self.player.play(token.medium.uri, skip_to_uri=p.track_uri, position_ms=p.position_ms)
                result = "resumed" if p.position_ms or p.track_uri else "started"
        except (PlayerError, OSError, asyncio.TimeoutError) as e:
            log.warning("Abspielen fehlgeschlagen: %s", e)
            self._loaded = prev_loaded
            self._flash_led("error", 2.0)
            self._notify("Spotify ist gerade nicht erreichbar. Läuft go-librespot und ist die Box online?", "warning")
            return "error"
        if p.finished:
            self.store.save_progress(token.uid, Progress())
        self._changed()
        return result

    async def token_removed(self) -> None:
        if not self.placed:
            return
        self._save_progress()
        was_loaded = self._loaded == self.placed
        self.placed = None
        if self.sleep["kind"] == "episode":
            self.sleep = {"kind": "off"}
        if was_loaded and self.settings.on_remove == "pause" and self.playing:
            try:
                await self.player.pause()
            except (PlayerError, OSError, asyncio.TimeoutError) as e:
                log.warning("Pause fehlgeschlagen: %s", e)
        self._changed()

    def _save_progress(self, finished: bool = False) -> None:
        uid = self._loaded
        s = self.player.status
        if not uid or not self.store.token(uid) or not s.track_uri:
            return
        if self._finished == uid and not finished:
            return
        if finished:
            self._finished = uid
        self.store.save_progress(
            uid,
            Progress(
                track_uri=s.track_uri,
                track_number=s.track_number,
                track_name=s.track_name,
                position_ms=0 if finished else self.player.position(),
                finished=finished,
            ),
        )
        self._last_save = time.monotonic()

    # ---------- Player / Taster ----------

    async def toggle_play(self) -> None:
        if self.playing:
            self._save_progress()
            await self.player.pause()
            return
        if self.bedtime_active():
            self._flash_led("denied", 1.6)
            self._notify("Schlafenszeit: Weiterhören geht morgen früh wieder.")
            return
        token = self.token()
        if not token:
            # Ohne aufgelegten Token startet nichts, auch nicht der zuletzt gehörte Inhalt
            return
        if self._loaded != token.uid:
            await self._start(token)
        elif self.player.status.track_uri:
            await self.player.resume()

    async def restart(self) -> None:
        """Aufgelegten Token von vorn starten (Play lang drücken oder „Von vorn“ in der App)."""
        token = self.token()
        if not token:
            return
        if self.bedtime_active():
            self._flash_led("denied", 1.6)
            self._notify("Schlafenszeit: Neue Geschichten starten erst morgen früh.")
            return
        if await self._start(token, from_start=True) != "error":
            # Ganzer Ring kurz in Token-Farbe: „geht von vorn los“
            self._flash_led("playing", 0.9, color=token.color, fill=1.0)
            self._notify(f"„{token.name}“ startet von vorn.")

    async def skip(self, direction: int) -> None:
        if not self.player.status.track_uri:
            return
        self._save_progress()
        await (self.player.next() if direction > 0 else self.player.prev())

    async def seek(self, position_ms: int) -> None:
        await self.player.seek(position_ms)

    async def set_volume(self, volume: int, from_box: bool = False) -> None:
        volume = max(0, min(int(volume), self.volume_cap()))
        self.volume = volume
        await self.player.set_volume(volume)
        if from_box:
            self._flash_led("volume", 1.2, fill=volume / 100)
        else:
            self._changed()

    async def button(self, name: str, press: str) -> None:
        """Hardware-Taster. name: play_pause | lauter | leiser | lock; press: kurz | lang."""
        if name == "lock":
            await self.set_lock(not self.locked)
            return
        if self.locked:
            self._flash_led("locked", 0.9)
            return
        try:
            if name == "play_pause" and press == "kurz":
                await self.toggle_play()
            elif name == "play_pause" and press == "lang":
                await self.restart()
            elif name in ("lauter", "leiser") and press == "kurz":
                step = self.settings.volume_step * (1 if name == "lauter" else -1)
                await self.set_volume(self.volume + step, from_box=True)
            elif name in ("lauter", "leiser") and press == "lang":
                await self.skip(1 if name == "lauter" else -1)
        except (PlayerError, OSError, asyncio.TimeoutError) as e:
            log.warning("Taste %s: %s", name, e)
            self._flash_led("error", 1.2)

    async def set_lock(self, locked: bool) -> None:
        self.locked = locked
        self._flash_led("locked" if locked else "unlocked", 1.0)
        self._notify("Tasten gesperrt. Zum Entsperren + und − lange drücken." if locked else "Tasten wieder frei.")

    def set_sleep(self, kind: str, minutes: int = 0) -> None:
        if kind == "minutes" and minutes > 0:
            self.sleep = {"kind": "minutes", "ends_at": time.monotonic() + minutes * 60, "total_s": minutes * 60}
        elif kind == "episode":
            self.sleep = {"kind": "episode"}
        else:
            self.sleep = {"kind": "off"}
        self._changed()

    # ---------- Anlernen / Verwalten ----------

    def start_learn(self) -> None:
        self._clear_flash()
        self.learning = True
        self.learned_uid = None
        # Liegt schon ein leerer Token auf, ist er sofort der neue
        if self.placed and not self.store.token(self.placed):
            self.learned_uid = self.placed
        self._changed()

    def cancel_learn(self) -> None:
        self._clear_flash()
        self.learning = False
        self.learned_uid = None
        self._changed()

    def save_token(self, uid: str, name: str, color: str, medium: Medium) -> Token:
        is_new = self.store.token(uid) is None
        token = self.store.save_token(uid, name.strip()[:40], color, medium)
        if self._loaded == uid and token.medium.uri != self.player.status.context_uri:
            self._loaded = None
        self.learning = False
        self.learned_uid = None
        if is_new:
            self._notify(f"„{token.name}“ ist angelernt.", "success")
            if self.placed == uid:
                # Der neue Token liegt noch auf: gleich abspielen, als Bestätigung (Regeln gelten wie beim Auflegen)
                self.placed = None
                asyncio.ensure_future(self.token_placed(uid))
        else:
            self._changed()
        return token

    def delete_token(self, uid: str) -> None:
        self.store.delete_token(uid)
        if self._loaded == uid:
            self._loaded = None
        self._changed()

    def update_settings(self, patch: dict) -> Settings:
        self.settings = _patch(self.settings, patch)
        self.settings.max_volume = max(10, min(100, self.settings.max_volume))
        self.store.save_settings(self.settings)
        self._changed()
        return self.settings

    def update_kid(self, patch: dict) -> KidMode:
        patch = {k: v for k, v in patch.items() if k != "pin" or (isinstance(v, str) and v.isdigit() and len(v) == 4)}
        self.kid = _patch(self.kid, patch)
        self.kid.max_volume = max(10, min(100, self.kid.max_volume))
        self.kid.bedtime_max_volume = max(5, min(self.kid.bedtime_max_volume, self.kid.max_volume))
        for key in ("bedtime_from", "bedtime_to"):
            _hhmm(getattr(self.kid, key))  # wirft bei ungültiger Uhrzeit
        self.store.save_kid(self.kid)
        self._changed()
        return self.kid

    def check_pin(self, pin: str) -> bool:
        return pin == self.kid.pin

    def dismiss_notice(self, notice_id: int) -> None:
        if self.notice and self.notice["id"] == notice_id:
            self.notice = None
            self._changed()

    # ---------- Ereignisse vom Player ----------

    def _on_player(self, status: PlayerStatus, reason: str) -> None:
        token = self.store.token(self._loaded) if self._loaded else None
        if token and status.context_uri and token.medium.uri == status.context_uri:
            track_changed = self._last_track is not None and status.track_uri != self._last_track
            if track_changed:
                self._save_progress()
                if self.sleep["kind"] == "episode" and status.playing:
                    self.sleep = {"kind": "off"}
                    asyncio.ensure_future(self._pause_with("Titel zu Ende, der Sleep-Timer hat gestoppt."))
                elif self.bedtime_active() and status.playing:
                    asyncio.ensure_future(self._pause_with("Schlafenszeit: Der Titel ist zu Ende, die Box macht Pause."))
            if reason in ("not_playing", "stopped") and self._near_end():
                self._save_progress(finished=True)
                self._notify(
                    f"„{token.medium.title}“ ist zu Ende."
                    + (" Kein Autoplay, die Box bleibt still." if self.kid.enabled and self.kid.no_autoplay else "")
                )
            if status.track_uri:
                self._last_track = status.track_uri
                self._last_pos = (status.position_ms, status.duration_ms)
        elif (
            token
            and self._last_track is not None  # unser Inhalt lief schon; sonst ist das nur eine alte Meldung vom vorigen
            and status.playing
            and status.context_uri
            and self.kid.enabled
            and self.kid.no_autoplay
            and self.placed == self._loaded
        ):
            # Spotify spielt nach dem Ende etwas anderes (Autoplay): stoppen
            self._save_progress(finished=True)
            asyncio.ensure_future(self._pause_with(f"„{token.medium.title}“ ist zu Ende. Kein Autoplay, die Box bleibt still."))
        if status.volume and status.volume != self.volume and reason == "volume" and status.volume > self.volume_cap():
            # Lautstärke von außen (z. B. Spotify-App) über die Grenze gedreht: zurücksetzen
            asyncio.ensure_future(self.set_volume(self.volume_cap()))
        self._changed()

    def _near_end(self) -> bool:
        pos, dur = self._last_pos
        return dur > 0 and pos >= dur - 5000

    async def _pause_with(self, text: str) -> None:
        try:
            await self.player.pause()
        except (PlayerError, OSError, asyncio.TimeoutError) as e:
            log.warning("Pause fehlgeschlagen: %s", e)
        self._notify(text)

    # ---------- Zeit ----------

    async def _tick_loop(self) -> None:
        was_bedtime = self.bedtime_active()
        while True:
            await asyncio.sleep(1)
            try:
                await self.tick(was_bedtime)
                was_bedtime = self.bedtime_active()
            except Exception:  # noqa: BLE001 – die Schleife darf nie sterben
                log.exception("Fehler im Takt")

    async def tick(self, was_bedtime: bool = False) -> None:
        now = time.monotonic()
        changed = False
        if self.sleep["kind"] == "minutes" and now >= self.sleep["ends_at"]:
            self.sleep = {"kind": "off"}
            if self.playing:
                self._save_progress()
                await self._pause_with("Sleep-Timer abgelaufen. Gute Nacht!")
            changed = True
        if self.playing:
            st = self.player.status
            if st.track_uri:
                # Jede Sekunde merken: Meldet der Player „gestoppt“, ist so klar, ob der Titel am Ende war
                self._last_pos = (self.player.position(), st.duration_ms)
            if now - self._last_save >= SAVE_EVERY_S:
                self._save_progress()
        if self.bedtime_active() and not was_bedtime and self.volume > self.volume_cap():
            await self.set_volume(self.volume_cap())
        if self._flash and now >= self._flash_until:
            self._flash = None
            changed = True
        if self.notice and now >= self._notice_until:
            self.notice = None
            changed = True
        if self.sleep["kind"] == "minutes" or self.playing:
            changed = True  # Restzeit und Position laufen
        if changed:
            self._changed()

    # ---------- Zustand nach außen ----------

    def led_state(self) -> dict:
        if self._flash and time.monotonic() < self._flash_until:
            led = dict(self._flash)
        elif self.learning:
            led = {"mode": "learn", "color": LED_COLORS["learn"], "fill": 1.0}
        else:
            token = self.token()
            s = self.player.status
            if token and self._loaded == token.uid and s.track_uri:
                fill = self.player.position() / s.duration_ms if s.duration_ms else 0.0
                led = {"mode": "playing" if s.playing else "paused", "color": token.color, "fill": round(fill, 3)}
            else:
                led = {"mode": "idle", "color": "#FFFFFF", "fill": 0.0}
        led["brightness"] = self.settings.night_brightness if self.bedtime_active() else self.settings.led_brightness
        return led

    def snapshot(self) -> dict:
        s = self.player.status
        token = self.token()
        sleep = {"kind": self.sleep["kind"]}
        if self.sleep["kind"] == "minutes":
            sleep["remaining_s"] = max(0, int(self.sleep["ends_at"] - time.monotonic()))
            sleep["total_s"] = self.sleep["total_s"]
        loaded = self.store.token(self._loaded) if self._loaded else None
        return {
            "player": {
                "available": s.available,
                "playing": s.playing,
                "context_uri": s.context_uri,
                "track_uri": s.track_uri,
                "track_name": s.track_name,
                "track_number": s.track_number,
                "album_name": s.album_name,
                "cover_url": s.cover_url,
                "position_ms": self.player.position(),
                "duration_ms": s.duration_ms,
                "error": s.error,
                "username": s.username,
            },
            "placed": self.placed,
            "placed_known": token is not None,
            "loaded": loaded.uid if loaded and loaded.medium.uri == s.context_uri else None,
            "volume": self.volume,
            "volume_cap": self.volume_cap(),
            "locked": self.locked,
            "bedtime_active": self.bedtime_active(),
            "sleep": sleep,
            "learning": self.learning,
            "learned_uid": self.learned_uid,
            "led": self.led_state(),
            "notice": self.notice,
            "tokens": [token_dict(t) for t in self.store.tokens()],
            "settings": asdict(self.settings),
            "kid": {k: v for k, v in asdict(self.kid).items() if k != "pin"},
        }


def token_dict(t: Token) -> dict:
    return {"uid": t.uid, "name": t.name, "color": t.color, "medium": asdict(t.medium), "progress": asdict(t.progress)}


def _patch(obj, patch: dict):
    """Übernimmt nur bekannte Felder mit passendem Typ."""
    allowed = {f.name: f for f in fields(obj)}
    clean = {}
    for k, v in patch.items():
        if k not in allowed:
            continue
        current = getattr(obj, k)
        if isinstance(current, bool):
            if not isinstance(v, bool):
                raise ValueError(f"{k}: true/false erwartet")
        elif isinstance(current, (int, float)):
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                raise ValueError(f"{k}: Zahl erwartet")
            v = type(current)(v)
        elif isinstance(current, str) and not isinstance(v, str):
            raise ValueError(f"{k}: Text erwartet")
        clean[k] = v
    return replace(obj, **clean)
