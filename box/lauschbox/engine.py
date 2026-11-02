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
from typing import Awaitable, Callable

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
# So lange nach „spielt nicht“ am Titelende warten, ob doch noch ein nächster Titel kommt (Titelliste unbekannt)
END_CONFIRM_S = 4.0
# Verstärker erst einschalten, wenn der Player „spielt“ meldet, und dann noch so lange warten: Das Knacken beim
# Öffnen der Audioausgabe passiert dann stumm. Kommt die Meldung nicht, nach AMP_FALLBACK_S trotzdem einschalten.
AMP_ON_DELAY_S = 0.35
AMP_FALLBACK_S = 8.0
# Titellisten (für den Gesamtfortschritt) so lange wiederverwenden; Playlists können sich ändern
TRACKS_MAX_AGE_S = 24 * 3600


def _hhmm(value: str) -> int:
    h, m = value.split(":")
    if not (0 <= int(h) < 24 and 0 <= int(m) < 60):
        raise ValueError(f"Uhrzeit {value} gibt es nicht")
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
        self._tracks: dict[str, list[dict]] = {}  # Titellisten je Inhalt (URI)
        self._pending_removal: asyncio.Task | None = None  # Nachfrist nach dem Abnehmen
        self._fade_task: asyncio.Task | None = None  # laufendes Einblenden
        self.amp = None  # Stummschaltung des Verstärkers (hardware.Amp), falls angeschlossen
        self._amp_task: asyncio.Task | None = None
        # Woher Titellisten kommen; die API setzt hier zusätzlich die Spotify Web API als Rückfall ein
        self.track_source: Callable[[str], Awaitable[list[dict] | None]] = player.context_tracks
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
            if self._cancel_pending_removal():
                log.info("Token %s innerhalb der Nachfrist zurück: spielt weiter", uid)
                self._changed()
                return "kept"
            return "ignored"
        self._clear_flash()
        if self.placed:
            # Anderer Token: sofort wechseln, auch wenn der alte gerade in der Nachfrist ist
            self._cancel_pending_removal()
            await self._remove_now()
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
            self._amp_mute()
            self._amp_expect_start()
            await self._before_fade()
            if same:
                # Derselbe Token liegt wieder auf und der Player hat seinen Inhalt noch: einfach weiter
                await self.player.resume()
                result = "resumed"
            elif restart or token.shuffle:
                # Zufall: jedes Mal neu gemischt, ab einem zufälligen Titel (kein Weiterhören)
                await self.player.set_shuffle(token.shuffle)
                await self.player.play(token.medium.uri)
                result = "started"
            else:
                await self.player.set_shuffle(False)  # Zufall bleibt sonst vom vorigen Token an
                await self.player.play(token.medium.uri, skip_to_uri=p.track_uri, position_ms=p.position_ms)
                result = "resumed" if p.position_ms or p.track_uri else "started"
        except (PlayerError, OSError, asyncio.TimeoutError) as e:
            log.warning("Abspielen fehlgeschlagen: %s", e)
            self._amp_mute()  # bricht auch den Rückfall-Timer ab: sonst rauscht die Box nach 8 s im Leerlauf
            self._loaded = prev_loaded
            self._flash_led("error", 2.0)
            self._notify("Spotify ist gerade nicht erreichbar. Läuft go-librespot und ist die Box online?", "warning")
            return "error"
        self._start_fade()
        if p.finished:
            self.store.save_progress(token.uid, Progress())
        asyncio.ensure_future(self._load_tracks(token.medium.uri))
        self._changed()
        return result

    def _cancel_pending_removal(self) -> bool:
        task, self._pending_removal = self._pending_removal, None
        if task and not task.done():
            task.cancel()
            return True
        return False

    @property
    def removal_pending(self) -> bool:
        return bool(self._pending_removal and not self._pending_removal.done())

    async def token_removed(self) -> None:
        """Token weg. Spielt er gerade, erst nach der Nachfrist pausieren: kommt er rechtzeitig zurück, läuft es weiter."""
        if not self.placed:
            return
        grace = max(0.0, float(self.settings.remove_grace_s))
        if grace > 0 and self._loaded == self.placed and self.playing:
            self._cancel_pending_removal()
            self._pending_removal = asyncio.ensure_future(self._remove_after(self.placed, grace))
            self._changed()
            return
        await self._remove_now()

    async def _remove_after(self, uid: str, grace: float) -> None:
        await asyncio.sleep(grace)
        if self.placed == uid:
            self._pending_removal = None
            await self._remove_now()

    async def _remove_now(self) -> None:
        if not self.placed:
            return
        self._save_progress()
        was_loaded = self._loaded == self.placed
        self.placed = None
        if self.sleep["kind"] == "episode":
            self.sleep = {"kind": "off"}
        if was_loaded and self.settings.on_remove == "pause" and self.playing:
            self._amp_mute()  # erst stumm, dann pausieren: das Knacken beim Stoppen bleibt ungehört
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
            self._amp_mute()
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
            self._amp_mute()
            self._amp_expect_start()
            await self._before_fade()
            try:
                await self.player.resume()
            except Exception:
                self._amp_mute()
                raise
            self._start_fade()

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

    # ---------- Verstärker stumm schalten ----------

    def _amp_cancel(self) -> None:
        if self._amp_task and not self._amp_task.done():
            self._amp_task.cancel()
        self._amp_task = None

    def _amp_mute(self) -> None:
        self._amp_cancel()
        if self.amp:
            try:
                self.amp.mute()
            except Exception as e:  # noqa: BLE001 – lieber Knacken als gar kein Ton
                log.warning("Verstärker stumm schalten: %s", e)

    def _amp_expect_start(self) -> None:
        """Vor dem Abspielen: einschalten erst nach „playing“ (siehe _on_player), sonst nach der Rückfallzeit."""
        if not self.amp:
            return
        self._amp_cancel()
        self._amp_task = asyncio.ensure_future(self._amp_on_later(AMP_FALLBACK_S))

    def _amp_on_after(self, delay: float) -> None:
        self._amp_cancel()
        self._amp_task = asyncio.ensure_future(self._amp_on_later(delay))

    async def _amp_on_later(self, delay: float) -> None:
        await asyncio.sleep(delay)
        try:
            self.amp.unmute()
        except Exception as e:  # noqa: BLE001
            log.warning("Verstärker einschalten: %s", e)
        self._start_fade()

    # ---------- Einblenden ----------

    def _cancel_fade(self) -> None:
        if self._fade_task and not self._fade_task.done():
            self._fade_task.cancel()
        self._fade_task = None

    async def _before_fade(self) -> None:
        """Vor dem Abspielen leise stellen, damit der Start nicht schlagartig laut ist."""
        self._cancel_fade()
        if self.settings.fade_in_s > 0 and self.volume > 0:
            await self.player.set_volume(0)

    def _start_fade(self) -> None:
        if self.amp and self.amp.muted:
            return  # erst einblenden, wenn der Verstärker angeht (_amp_on_later), sonst ist es vorbei, bevor man etwas hört
        if self.settings.fade_in_s > 0 and self.volume > 0:
            self._fade_task = asyncio.ensure_future(self._fade_in(self.volume, self.settings.fade_in_s))

    async def _fade_in(self, target: int, seconds: float) -> None:
        steps = max(4, int(seconds * 12))
        try:
            for i in range(1, steps + 1):
                await asyncio.sleep(seconds / steps)
                await self.player.set_volume(round(target * i / steps))
        except (PlayerError, OSError, asyncio.TimeoutError) as e:
            log.info("Einblenden abgebrochen: %s", e)
            await self.player.set_volume(target)

    async def set_volume(self, volume: int, from_box: bool = False) -> None:
        self._cancel_fade()  # wer selbst dreht, hat Vorrang vor dem Einblenden
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

    def save_token(self, uid: str, name: str, color: str, medium: Medium, mode: str | None = None) -> Token:
        is_new = self.store.token(uid) is None
        token = self.store.save_token(uid, name.strip()[:40], color, medium, mode)
        asyncio.ensure_future(self._load_tracks(medium.uri))
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
        self.settings.remove_grace_s = max(0.0, min(5.0, self.settings.remove_grace_s))
        self.settings.fade_in_s = max(0.0, min(3.0, self.settings.fade_in_s))
        self.store.save_settings(self.settings)
        self._changed()
        return self.settings

    def update_kid(self, patch: dict) -> KidMode:
        patch = {k: v for k, v in patch.items() if k != "pin" or (isinstance(v, str) and v.isdigit() and len(v) == 4)}
        kid = _patch(self.kid, patch)
        kid.max_volume = max(10, min(100, kid.max_volume))
        kid.bedtime_max_volume = max(5, min(kid.bedtime_max_volume, kid.max_volume))
        for key in ("bedtime_from", "bedtime_to"):
            _hhmm(getattr(kid, key))  # wirft bei ungültiger Uhrzeit, bevor etwas übernommen ist
        self.kid = kid
        self.store.save_kid(kid)
        if self.volume > self.volume_cap():
            # Neue Grenze gilt sofort, nicht erst beim nächsten Token
            asyncio.ensure_future(self.set_volume(self.volume_cap()))
        self._changed()
        return kid

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
                # Am Ende jedes Titels meldet der Player kurz „spielt nicht“. Zu Ende ist erst der letzte Titel.
                ctx = None if token.shuffle else self._context_progress(token.medium.uri, status.track_uri, 0)
                if ctx:
                    if ctx[0] == ctx[1] - 1:
                        self._finish(token)
                else:
                    asyncio.ensure_future(self._confirm_end(token.uid, status.track_uri))
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
        if self.amp:
            if reason == "playing" and status.playing and self.amp.muted:
                # Der Ton läuft jetzt wirklich (auch wenn die Wiedergabe von woanders kam, z. B. aus der Spotify-App)
                self._amp_on_after(AMP_ON_DELAY_S)
            elif reason in ("paused", "stopped") and not status.playing:
                self._amp_mute()
        if status.volume and status.volume != self.volume and reason == "volume" and status.volume > self.volume_cap():
            # Lautstärke von außen (z. B. Spotify-App) über die Grenze gedreht: zurücksetzen
            asyncio.ensure_future(self.set_volume(self.volume_cap()))
        self._changed()

    def _finish(self, token: Token) -> None:
        self._amp_mute()
        self._save_progress(finished=True)
        self._notify(
            f"„{token.medium.title}“ ist zu Ende."
            + (" Kein Autoplay, die Box bleibt still." if self.kid.enabled and self.kid.no_autoplay else "")
        )

    async def _confirm_end(self, uid: str, track_uri: str | None) -> None:
        """Titelliste unbekannt: kurz warten. Kommt kein nächster Titel, war es wirklich das Ende."""
        await asyncio.sleep(END_CONFIRM_S)
        s = self.player.status
        token = self.store.token(uid)
        if token and self._loaded == uid and not s.playing and s.track_uri == track_uri and self._finished != uid:
            self._finish(token)

    # ---------- Titellisten (Gesamtfortschritt) ----------

    def tracks_of(self, uri: str) -> list[dict] | None:
        if uri not in self._tracks:
            cached = self.store.tracks(uri)
            if not cached:
                return None
            self._tracks[uri] = cached[0]
        return self._tracks[uri]

    async def _load_tracks(self, uri: str) -> None:
        cached = self.store.tracks(uri)
        if cached and time.time() - cached[1] < TRACKS_MAX_AGE_S:
            self._tracks[uri] = cached[0]
            return
        try:
            tracks = await self.track_source(uri)
        except Exception as e:  # noqa: BLE001 – ohne Liste geht es auch, nur ohne Gesamtfortschritt
            log.info("Titelliste für %s nicht verfügbar: %s", uri, e)
            return
        if tracks:
            self.store.save_tracks(uri, tracks)
            self._tracks[uri] = tracks
            log.info("Titelliste für %s: %d Titel", uri, len(tracks))
            self._changed()

    def _context_progress(self, uri: str, track_uri: str | None, position_ms: int) -> tuple[int, int, int, int] | None:
        """(Index, Anzahl, gehört_ms, gesamt_ms) im ganzen Inhalt, falls die Titelliste bekannt ist."""
        tracks = self.tracks_of(uri)
        if not tracks or not track_uri:
            return None
        for i, t in enumerate(tracks):
            if t["uri"] == track_uri:
                durations = [int(x.get("duration_ms") or 0) for x in tracks]
                return i, len(tracks), sum(durations[:i]) + position_ms, sum(durations)
        return None

    def _near_end(self) -> bool:
        pos, dur = self._last_pos
        return dur > 0 and pos >= dur - 5000

    async def _pause_with(self, text: str) -> None:
        self._amp_mute()
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
                ctx = self._context_progress(token.medium.uri, s.track_uri, self.player.position()) if token.whole else None
                if ctx and ctx[3]:
                    fill = ctx[2] / ctx[3]  # Hörspiel als Ganzes
                else:
                    fill = self.player.position() / s.duration_ms if s.duration_ms else 0.0
                led = {"mode": "playing" if s.playing else "paused", "color": token.color, "fill": round(fill, 3)}
            else:
                led = {"mode": "idle", "color": "#FFFFFF", "fill": 0.0}
        led["brightness"] = self.settings.night_brightness if self.bedtime_active() else self.settings.led_brightness
        return led

    def token_fraction(self, t: Token) -> float | None:
        """Wie viel vom ganzen Inhalt gehört ist (0..1), falls die Titelliste bekannt ist."""
        if not t.whole:
            return None
        if t.progress.finished:
            return 1.0
        if not t.progress.track_uri:
            return 0.0 if self.tracks_of(t.medium.uri) else None
        ctx = self._context_progress(t.medium.uri, t.progress.track_uri, t.progress.position_ms)
        return round(ctx[2] / ctx[3], 4) if ctx and ctx[3] else None

    def snapshot(self) -> dict:
        s = self.player.status
        token = self.token()
        sleep = {"kind": self.sleep["kind"]}
        if self.sleep["kind"] == "minutes":
            sleep["remaining_s"] = max(0, int(self.sleep["ends_at"] - time.monotonic()))
            sleep["total_s"] = self.sleep["total_s"]
        loaded = self.store.token(self._loaded) if self._loaded else None
        ctx = None
        if loaded and loaded.medium.uri == s.context_uri and not loaded.shuffle:
            ctx = self._context_progress(loaded.medium.uri, s.track_uri, self.player.position())
        whole = ctx if loaded and loaded.whole else None
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
                "track_index": ctx[0] if ctx else None,
                "track_count": ctx[1] if ctx else None,
                "context_position_ms": whole[2] if whole else None,
                "context_duration_ms": whole[3] if whole else None,
            },
            "placed": self.placed,
            "placed_known": token is not None,
            "removal_pending": self.removal_pending,
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
            "tokens": [token_dict(t, self.token_fraction(t)) for t in self.store.tokens()],
            "settings": asdict(self.settings),
            "kid": {k: v for k, v in asdict(self.kid).items() if k != "pin"},
        }


def token_dict(t: Token, fraction: float | None = None) -> dict:
    progress = asdict(t.progress)
    progress["fraction"] = fraction
    return {
        "uid": t.uid,
        "name": t.name,
        "color": t.color,
        "medium": asdict(t.medium),
        "progress": progress,
        "mode": t.mode,
        "shuffle": t.shuffle,
    }


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
