"""Spotify-Suche, eigene Bibliothek und Kontoname.

Zwei Zugänge zur Web API:
- **eigene Spotify-App** (Client-ID + Secret, „Client Credentials“): offiziell für Katalogsuche gedacht, eigene Grenzen.
  So empfohlen; einrichten in der App unter „Box → Spotify“.
- **Schlüssel von go-librespot** (POST /token): ohne Einrichtung, aber Spotify drosselt diesen Weg stark (429).

Die eigene Bibliothek (Playlists, gespeicherte Alben) kommt bevorzugt direkt von go-librespot, das dafür Spotifys
interne Dienste nutzt und nicht die gedrosselte Web API.
"""
from __future__ import annotations

import base64
import logging
import time

import aiohttp

from .spotify_links import KIND_LABEL

log = logging.getLogger(__name__)

API = "https://api.spotify.com/v1"
TOKEN_URL = "https://accounts.spotify.com/api/token"
# Was auf einen Token passt: ganze Sammlungen, keine Einzeltitel
SEARCH_TYPES = "album,playlist,audiobook,show"
# Ohne Benutzer-Anmeldung braucht die Suche ein festes Land
APP_MARKET = "DE"


class SpotifyWebError(Exception):
    def __init__(self, message: str, status: int = 0):
        super().__init__(message)
        self.status = status


class AppToken:
    """Zugang über die eigene Spotify-App (Client Credentials), wird bis kurz vor Ablauf wiederverwendet."""

    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id.strip()
        self.client_secret = client_secret.strip()
        self._token: str | None = None
        self._until = 0.0

    async def get(self, session: aiohttp.ClientSession) -> str:
        if self._token and time.monotonic() < self._until:
            return self._token
        auth = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        async with session.post(TOKEN_URL, data={"grant_type": "client_credentials"}, headers={"Authorization": f"Basic {auth}"}) as resp:
            if resp.status in (400, 401):
                raise SpotifyWebError("Client-ID oder Client-Secret stimmen nicht.", resp.status)
            if resp.status >= 400:
                raise SpotifyWebError(f"Spotify-Anmeldung fehlgeschlagen ({resp.status}).", resp.status)
            data = await resp.json()
        self._token = data["access_token"]
        self._until = time.monotonic() + max(60, int(data.get("expires_in", 3600)) - 120)
        return self._token


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
            raise SpotifyWebError("Spotify hat den Zugang abgelehnt.", 401)
        if resp.status == 429:
            wait = resp.headers.get("Retry-After")
            log.warning("Spotify 429 auf %s, Retry-After=%s", path, wait)
            raise SpotifyWebError("Spotify bremst gerade (zu viele Anfragen).", 429)
        if resp.status >= 400:
            text = (await resp.text())[:200]
            raise SpotifyWebError(f"Spotify-Fehler {resp.status}: {text}", resp.status)
        return await resp.json()


async def search(session: aiohttp.ClientSession, token: str, query: str, market: str = "from_token", limit: int = 8) -> list[dict]:
    data = await _get(session, token, "/search", {"q": query, "type": SEARCH_TYPES, "limit": limit, "market": market})
    results: list[dict] = []
    for key, kind in (("albums", "album"), ("playlists", "playlist"), ("audiobooks", "audiobook"), ("shows", "show")):
        for obj in (data.get(key) or {}).get("items") or []:
            item = _item(obj, kind)
            if item:
                results.append(item)
    return results


async def library_web(session: aiohttp.ClientSession, token: str) -> list[dict]:
    """Eigene Playlists und gespeicherte Alben über die Web API (Rückfall, wenn go-librespot das nicht kann)."""
    results: list[dict] = []
    playlists = await _get(session, token, "/me/playlists", {"limit": 50})
    results += [i for i in (_item(o, "playlist") for o in playlists.get("items") or []) if i]
    try:
        albums = await _get(session, token, "/me/albums", {"limit": 50})
        results += [i for i in (_item((o or {}).get("album"), "album") for o in albums.get("items") or []) if i]
    except SpotifyWebError as e:
        log.info("Gespeicherte Alben nicht lesbar: %s", e)
    return results


def library_from_librespot(playlists: dict, albums: dict) -> list[dict]:
    """Antworten von go-librespot (/library/playlists, /library/albums) in die Form der Suchtreffer bringen."""
    results: list[dict] = []
    for p in playlists.get("items") or []:
        owner = p.get("owner_username") or ""
        results.append({
            "uri": p["uri"],
            "title": p.get("name") or "Ohne Titel",
            "kind": "playlist",
            "kind_label": KIND_LABEL["playlist"],
            "subtitle": "von Spotify" if owner == "spotify" else ("eigene" if p.get("can_edit") else f"von {owner}"),
            "cover_url": p.get("image_url"),
            "track_count": p.get("length"),
        })
    for a in albums.get("items") or []:
        results.append({
            "uri": a["uri"],
            "title": a.get("name") or "Album",
            "kind": "album",
            "kind_label": KIND_LABEL["album"],
            "subtitle": ", ".join(a.get("artist_names") or []),
            "cover_url": a.get("image_url"),
            "track_count": None,
        })
    return results


async def tracks_web(session: aiohttp.ClientSession, token: str, uri: str, market: str = "from_token") -> list[dict] | None:
    """Titelliste (für den Gesamtfortschritt) über die Web API. Podcasts nicht: deren Folgen kommen neueste zuerst."""
    sid = uri.split(":")[-1]
    kind = uri.split(":")[1]
    if kind == "album":
        path, params, key = f"/albums/{sid}/tracks", {"limit": 50}, None
    elif kind == "playlist":
        path, params, key = f"/playlists/{sid}/tracks", {"limit": 100, "fields": "items(track(uri,name,duration_ms)),next"}, "track"
    elif kind == "audiobook":
        path, params, key = f"/audiobooks/{sid}/chapters", {"limit": 50, "market": market}, None
    else:
        return None
    tracks: list[dict] = []
    url: str | None = path
    while url and len(tracks) < 1000:
        data = await _get(session, token, url, params) if url == path else await _get_url(session, token, url)
        for item in data.get("items") or []:
            t = item.get(key) if key else item
            if t and t.get("uri"):
                tracks.append({"uri": t["uri"], "name": t.get("name"), "duration_ms": int(t.get("duration_ms") or 0)})
        url = data.get("next")
    return tracks or None


async def _get_url(session: aiohttp.ClientSession, token: str, url: str) -> dict:
    """Folgeseite (Spotify liefert die volle URL in `next`)."""
    return await _get(session, token, url.replace(API, ""), {})


async def display_name(session: aiohttp.ClientSession, token: str, username: str) -> str | None:
    try:
        data = await _get(session, token, f"/users/{username}", {})
        return data.get("display_name") or None
    except SpotifyWebError:
        return None


# ---------- Simulation (--fake) ----------

_FAKE = [
    {"uri": "spotify:album:" + "1" * 22, "title": "Drache Funkel – Folge 1", "kind": "album", "subtitle": "Drache Funkel", "track_count": 7},
    {"uri": "spotify:album:" + "2" * 22, "title": "Drache Funkel – Folge 2", "kind": "album", "subtitle": "Drache Funkel", "track_count": 6},
    {"uri": "spotify:playlist:" + "3" * 22, "title": "Sanfte Schlaflieder", "kind": "playlist", "subtitle": "von Lauschbox", "track_count": 24},
    {"uri": "spotify:playlist:" + "4" * 22, "title": "Kinderzimmer-Tanzparty", "kind": "playlist", "subtitle": "eigene", "track_count": 31},
    {"uri": "spotify:audiobook:" + "5" * 22, "title": "Geschichten aus dem Sternenwald", "kind": "audiobook", "subtitle": "Lina Morgentau", "track_count": 8},
]


def fake_search(query: str) -> list[dict]:
    q = query.lower()
    return [dict(i, kind_label=KIND_LABEL[i["kind"]], cover_url=None) for i in _FAKE if q in i["title"].lower() or q in i["subtitle"].lower()]


def fake_library() -> list[dict]:
    return [dict(i, kind_label=KIND_LABEL[i["kind"]], cover_url=None) for i in _FAKE if i["kind"] == "playlist"]
