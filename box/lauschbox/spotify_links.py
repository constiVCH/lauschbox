"""Spotify-Links aus der „Teilen“-Funktion in URIs umwandeln und Titel/Cover per oEmbed holen (ohne Login)."""
from __future__ import annotations

import re

import aiohttp

from .store import Medium

KINDS = ("album", "playlist", "show", "episode", "track", "artist", "audiobook")

_URI = re.compile(r"^spotify:(%s):([A-Za-z0-9]{22})$" % "|".join(KINDS))
# https://open.spotify.com/intl-de/album/<id>?si=…  oder  https://open.spotify.com/album/<id>
_URL = re.compile(r"^https?://open\.spotify\.com/(?:intl-[a-z]{2}(?:-[A-Za-z]{2})?/)?(%s)/([A-Za-z0-9]{22})" % "|".join(KINDS))
_SHORT = re.compile(r"^https?://(?:spotify\.link|spoti\.fi)/\S+$")

KIND_LABEL = {
    "album": "Album",
    "playlist": "Playlist",
    "show": "Podcast",
    "episode": "Folge",
    "track": "Titel",
    "artist": "Künstler",
    "audiobook": "Hörbuch",
}


class LinkError(ValueError):
    pass


def parse(text: str) -> tuple[str, str] | None:
    """Gibt (kind, id) zurück oder None. Akzeptiert auch Text, in dem der Link irgendwo steht."""
    text = text.strip()
    if m := _URI.match(text):
        return m.group(1), m.group(2)
    found = re.search(r"https?://\S+", text)
    if found and (m := _URL.match(found.group(0))):
        return m.group(1), m.group(2)
    return None


async def resolve(text: str, session: aiohttp.ClientSession) -> Medium:
    parsed = parse(text)
    if parsed is None:
        found = re.search(r"https?://\S+", text.strip())
        if found and _SHORT.match(found.group(0)):
            # Kurzlinks aus der App: Weiterleitung folgen, dann normal auswerten
            try:
                async with session.get(found.group(0), allow_redirects=True) as resp:
                    parsed = parse(str(resp.url))
            except (aiohttp.ClientError, TimeoutError) as e:
                raise LinkError(f"Kurzlink nicht erreichbar: {e}") from e
    if parsed is None:
        raise LinkError("Das ist kein Spotify-Link. In Spotify: Teilen → Link kopieren.")
    kind, sid = parsed
    uri = f"spotify:{kind}:{sid}"
    title, cover = await _oembed(f"https://open.spotify.com/{kind}/{sid}", session)
    return Medium(uri=uri, title=title or f"Spotify-{KIND_LABEL[kind]}", kind=kind, cover_url=cover)


async def _oembed(url: str, session: aiohttp.ClientSession) -> tuple[str | None, str | None]:
    try:
        async with session.get("https://open.spotify.com/oembed", params={"url": url}) as resp:
            if resp.status != 200:
                return None, None
            data = await resp.json(content_type=None)
            return data.get("title"), data.get("thumbnail_url")
    except (aiohttp.ClientError, TimeoutError, ValueError):
        # Ohne Internet: Token geht trotzdem, nur ohne Titel/Cover
        return None, None
