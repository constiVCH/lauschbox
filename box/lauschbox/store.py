"""Dauerhafte Daten der Box in SQLite: Token, Hörstand, Einstellungen, Kindermodus."""
from __future__ import annotations

import json
import sqlite3
import time
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path


@dataclass
class Medium:
    uri: str
    title: str
    kind: str = "album"  # album, playlist, show, episode, track, artist, audiobook
    cover_url: str | None = None


@dataclass
class Progress:
    track_uri: str | None = None
    track_number: int | None = None
    track_name: str | None = None
    position_ms: int = 0
    finished: bool = False


@dataclass
class Token:
    uid: str
    name: str
    color: str
    medium: Medium
    progress: Progress = field(default_factory=Progress)


@dataclass
class Settings:
    start_volume: int = 40
    max_volume: int = 80
    volume_step: int = 5
    on_replace: str = "resume"  # resume | restart
    on_remove: str = "pause"  # pause | keep
    led_brightness: float = 0.25
    night_brightness: float = 0.08


@dataclass
class KidMode:
    enabled: bool = True
    pin: str = "1234"
    max_volume: int = 60
    no_autoplay: bool = True
    bedtime_enabled: bool = True
    bedtime_from: str = "19:30"
    bedtime_to: str = "07:00"
    bedtime_max_volume: int = 30
    known_tokens_only: bool = False


def _load_dataclass(cls, data: dict):
    names = {f.name for f in fields(cls)}
    return cls(**{k: v for k, v in data.items() if k in names})


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA journal_mode=WAL")  # schont die SD-Karte, übersteht Stromausfall besser
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS tokens (
                uid TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL,
                uri TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, cover_url TEXT,
                created REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS progress (
                uid TEXT PRIMARY KEY, track_uri TEXT, track_number INTEGER, track_name TEXT,
                position_ms INTEGER NOT NULL DEFAULT 0, finished INTEGER NOT NULL DEFAULT 0, updated REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            """
        )
        self.db.commit()

    # ---------- Token ----------

    def tokens(self) -> list[Token]:
        rows = self.db.execute(
            """SELECT t.uid, t.name, t.color, t.uri, t.title, t.kind, t.cover_url,
                      p.track_uri, p.track_number, p.track_name, p.position_ms, p.finished
               FROM tokens t LEFT JOIN progress p ON p.uid = t.uid ORDER BY t.created"""
        ).fetchall()
        return [self._token(r) for r in rows]

    def token(self, uid: str) -> Token | None:
        r = self.db.execute(
            """SELECT t.uid, t.name, t.color, t.uri, t.title, t.kind, t.cover_url,
                      p.track_uri, p.track_number, p.track_name, p.position_ms, p.finished
               FROM tokens t LEFT JOIN progress p ON p.uid = t.uid WHERE t.uid = ?""",
            (uid,),
        ).fetchone()
        return self._token(r) if r else None

    @staticmethod
    def _token(r) -> Token:
        return Token(
            uid=r[0],
            name=r[1],
            color=r[2],
            medium=Medium(uri=r[3], title=r[4], kind=r[5], cover_url=r[6]),
            progress=Progress(track_uri=r[7], track_number=r[8], track_name=r[9], position_ms=r[10] or 0, finished=bool(r[11])),
        )

    def save_token(self, uid: str, name: str, color: str, medium: Medium) -> Token:
        old = self.token(uid)
        self.db.execute(
            """INSERT INTO tokens (uid, name, color, uri, title, kind, cover_url, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(uid) DO UPDATE SET name=excluded.name, color=excluded.color, uri=excluded.uri,
                   title=excluded.title, kind=excluded.kind, cover_url=excluded.cover_url""",
            (uid, name, color, medium.uri, medium.title, medium.kind, medium.cover_url, time.time()),
        )
        if old and old.medium.uri != medium.uri:
            # Neuer Inhalt: alter Hörstand passt nicht mehr
            self.db.execute("DELETE FROM progress WHERE uid = ?", (uid,))
        self.db.commit()
        token = self.token(uid)
        assert token
        return token

    def delete_token(self, uid: str) -> None:
        self.db.execute("DELETE FROM tokens WHERE uid = ?", (uid,))
        self.db.execute("DELETE FROM progress WHERE uid = ?", (uid,))
        self.db.commit()

    def save_progress(self, uid: str, p: Progress) -> None:
        self.db.execute(
            """INSERT INTO progress (uid, track_uri, track_number, track_name, position_ms, finished, updated) VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(uid) DO UPDATE SET track_uri=excluded.track_uri, track_number=excluded.track_number,
                   track_name=excluded.track_name, position_ms=excluded.position_ms, finished=excluded.finished, updated=excluded.updated""",
            (uid, p.track_uri, p.track_number, p.track_name, int(p.position_ms), int(p.finished), time.time()),
        )
        self.db.commit()

    # ---------- Einstellungen ----------

    def _get(self, key: str) -> dict:
        r = self.db.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
        return json.loads(r[0]) if r else {}

    def _put(self, key: str, value: dict) -> None:
        self.db.execute(
            "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, json.dumps(value))
        )
        self.db.commit()

    def settings(self) -> Settings:
        return _load_dataclass(Settings, self._get("settings"))

    def save_settings(self, s: Settings) -> None:
        self._put("settings", asdict(s))

    def kid(self) -> KidMode:
        return _load_dataclass(KidMode, self._get("kid"))

    def save_kid(self, k: KidMode) -> None:
        self._put("kid", asdict(k))

    def close(self) -> None:
        self.db.close()
