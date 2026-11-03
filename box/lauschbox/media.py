"""Eigene Audiodateien auf der SD-Karte: ein Ordner je Album (media/<id>/), Titel in title.txt, Reihenfolge nach Dateiname.

Ein Token zeigt darauf mit der URI local:<id>, ein Titel heißt local:<id>/<dateiname>.
"""
from __future__ import annotations

import re
import secrets
import shutil
from pathlib import Path
from urllib.parse import unquote

AUDIO = {".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".flac", ".wav"}
PREFIX = "local:"
_ID = re.compile(r"^[0-9a-f]{8}$")
# Platz, der beim Hochladen mindestens frei bleibt (Datenbank, Log, Updates)
RESERVE_BYTES = 300 * 1024 * 1024


class MediaError(ValueError):
    pass


def album_dir(root: Path, album_id: str) -> Path:
    if not _ID.match(album_id):
        raise MediaError("unbekanntes Album")
    return root / album_id


def album_of(uri: str) -> str | None:
    """local:<id> oder local:<id>/<datei> → <id>"""
    if not uri.startswith(PREFIX):
        return None
    album_id = uri[len(PREFIX):].split("/", 1)[0]
    return album_id if _ID.match(album_id) else None


def tracks(root: Path, album_id: str) -> list[Path]:
    d = album_dir(root, album_id)
    if not d.is_dir():
        return []
    return sorted((p for p in d.iterdir() if p.suffix.lower() in AUDIO and p.is_file()), key=lambda p: p.name.lower())


def title(root: Path, album_id: str) -> str:
    try:
        return (album_dir(root, album_id) / "title.txt").read_text(encoding="utf-8").strip() or album_id
    except OSError:
        return album_id


def albums(root: Path) -> list[dict]:
    if not root.is_dir():
        return []
    out = []
    for d in sorted(root.iterdir(), key=lambda p: p.stat().st_mtime):
        if d.is_dir() and _ID.match(d.name):
            out.append({
                "uri": PREFIX + d.name,
                "title": title(root, d.name),
                "kind": "album",
                "cover_url": None,
                "subtitle": "Auf der Box",
                "track_count": len(tracks(root, d.name)),
            })
    return out


def create(root: Path, name: str) -> str:
    name = name.strip()[:80]
    if not name:
        raise MediaError("Name fehlt")
    album_id = secrets.token_hex(4)
    d = root / album_id
    d.mkdir(parents=True)
    (d / "title.txt").write_text(name, encoding="utf-8")
    return album_id


def delete(root: Path, album_id: str) -> None:
    shutil.rmtree(album_dir(root, album_id), ignore_errors=True)


def safe_name(name: str) -> str:
    """Dateiname aus dem Handy: nur der letzte Teil, keine Pfade, nur Audio."""
    name = Path(unquote(name).replace("\\", "/")).name.strip()  # manche Absender kodieren den Namen (%2F, %C3%BC)
    if not name or name.startswith(".") or Path(name).suffix.lower() not in AUDIO:
        raise MediaError(f"„{name or '?'}“ ist keine Audiodatei (mp3, m4a, ogg, opus, flac, wav)")
    return name


def free_bytes(root: Path) -> int:
    root.mkdir(parents=True, exist_ok=True)
    return max(0, shutil.disk_usage(root).free - RESERVE_BYTES)
