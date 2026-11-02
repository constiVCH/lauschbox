"""Spotify-Suche und eigene Bibliothek über die Web API.

Der Schlüssel kommt von go-librespot (POST /token), das ohnehin bei Spotify angemeldet ist.
Eine eigene Spotify-Developer-App oder ein Login in der App ist dafür nicht nötig.
"""
from __future__ import annotations

import logging

import aiohttp

from .spotify_links import KIND_LABEL

log = logging.getLogger(__name__)

API = "https://api.spotify.com/v1"
# Was auf einen Token passt: ganze Sammlungen, keine Einzeltitel
SEARCH_TYPES = "album,playlist,audiobook,show"


class SpotifyWebError(Exception):
    pass


def _cover(images: list | None) -> str | None:
    if not images:
        return None
    # Mittlere Größe reicht für die Liste in der App (Spotify liefert absteigend sortiert)
    return (images[1] if len(images) > 1 else images[0]).get("url")


def _item(obj: dict | None, kind: str) -> dict | None:
    if not obj or not obj.get("uri"):
        return None  # Spotify liefert in Playlists-Treffern manchmal null-Einträge
    if kind == "album":
        subtitle = ", ".join(a.get("name", "") for a in obj.get("artists") or [])
        count = obj.get("total_tracks")
    elif kind == "playlist":
        subtitle = f"von {(obj.get('owner') or {}).get('display_name') or 'Spotify'}"
        count = (obj.get("tracks") or obj.get("items") or {}).get("total")
    elif kind == "audiobook":
        subtitle = ", ".join(a.get("name", "") for a in obj.get("authors") or [])
        count = obj.get("total_chapters")
    else:  # show
        subtitle = obj.get("publisher") or ""
        count = obj.get("total_episodes")
    return {
        "uri": obj["uri"],
        "title": obj.get("name") or "Ohne Titel",
        "kind": kind,
        "kind_label": KIND_LABEL.get(kind, kind),
        "subtitle": subtitle,
        "cover_url": _cover(obj.get("images")),
        "track_count": count,
    }


async def _get(session: aiohttp.ClientSession, token: str, path: str, params: dict) -> dict:
    async with session.get(API + path, params=params, headers={"Authorization": f"Bearer {token}"}) as resp:
        if resp.status == 401:
            raise SpotifyWebError("Spotify hat den Zugang abgelehnt. Ist go-librespot angemeldet?")
        if resp.status == 429:
            raise SpotifyWebError("Spotify bremst gerade (zu viele Anfragen). Gleich nochmal versuchen.")
        if resp.status >= 400:
            text = (await resp.text())[:200]
            raise SpotifyWebError(f"Spotify-Fehler {resp.status}: {text}")
        return await resp.json()


async def search(session: aiohttp.ClientSession, token: str, query: str, limit: int = 8) -> list[dict]:
    data = await _get(session, token, "/search", {"q": query, "type": SEARCH_TYPES, "limit": limit, "market": "from_token"})
    results: list[dict] = []
    for key, kind in (("albums", "album"), ("playlists", "playlist"), ("audiobooks", "audiobook"), ("shows", "show")):
        for obj in (data.get(key) or {}).get("items") or []:
            item = _item(obj, kind)
            if item:
                results.append(item)
    return results


async def library(session: aiohttp.ClientSession, token: str) -> list[dict]:
    """Eigene Playlists und gespeicherte Alben."""
    results: list[dict] = []
    playlists = await _get(session, token, "/me/playlists", {"limit": 50})
    results += [i for i in (_item(o, "playlist") for o in playlists.get("items") or []) if i]
    try:
        albums = await _get(session, token, "/me/albums", {"limit": 50})
        results += [i for i in (_item((o or {}).get("album"), "album") for o in albums.get("items") or []) if i]
    except SpotifyWebError as e:
        log.info("Gespeicherte Alben nicht lesbar: %s", e)
    return results


# ---------- Simulation (--fake) ----------

_FAKE = [
    {"uri": "spotify:album:" + "1" * 22, "title": "Drache Funkel – Folge 1", "kind": "album", "subtitle": "Drache Funkel", "track_count": 7},
    {"uri": "spotify:album:" + "2" * 22, "title": "Drache Funkel – Folge 2", "kind": "album", "subtitle": "Drache Funkel", "track_count": 6},
    {"uri": "spotify:playlist:" + "3" * 22, "title": "Sanfte Schlaflieder", "kind": "playlist", "subtitle": "von Lauschbox", "track_count": 24},
    {"uri": "spotify:playlist:" + "4" * 22, "title": "Kinderzimmer-Tanzparty", "kind": "playlist", "subtitle": "von dir", "track_count": 31},
    {"uri": "spotify:audiobook:" + "5" * 22, "title": "Geschichten aus dem Sternenwald", "kind": "audiobook", "subtitle": "Lina Morgentau", "track_count": 8},
]


def fake_search(query: str) -> list[dict]:
    q = query.lower()
    return [dict(i, kind_label=KIND_LABEL[i["kind"]], cover_url=None) for i in _FAKE if q in i["title"].lower() or q in i["subtitle"].lower()]


def fake_library() -> list[dict]:
    return [dict(i, kind_label=KIND_LABEL[i["kind"]], cover_url=None) for i in _FAKE if i["kind"] == "playlist"]
