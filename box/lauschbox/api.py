"""REST + WebSocket für die App (Entwurf in docs/konzept.md, „API“).

Jede Änderung schickt die Box als kompletten Zustand über /api/events ({"type": "state", "data": …}).
Die App muss also nur einen Zustand spiegeln und ruft für Aktionen die REST-Endpunkte auf.
"""
from __future__ import annotations

import asyncio
import json
import logging
import socket

import aiohttp
from aiohttp import WSMsgType, web

from . import __version__, spotify_links, spotify_web
from .engine import Engine, token_dict
from .store import Medium

log = logging.getLogger(__name__)

ENGINE = web.AppKey("engine", Engine)
SIM = web.AppKey("sim", bool)
HTTP = web.AppKey("http", aiohttp.ClientSession)
HW = web.AppKey("hw", dict)
CLIENTS = web.AppKey("clients", set)


def build_app(engine: Engine, simulate: bool = False, hardware: dict | None = None) -> web.Application:
    app = web.Application(middlewares=[cors, errors])
    app[ENGINE] = engine
    app[SIM] = simulate
    app[HW] = hardware or {}
    app[CLIENTS] = set()
    r = web.RouteTableDef()

    def state(request: web.Request) -> dict:
        return full_state(request.app)

    @r.get("/api/status")
    async def status(request: web.Request) -> web.Response:
        return web.json_response(state(request))

    @r.get("/api/events")
    async def events(request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse(heartbeat=15)
        await ws.prepare(request)
        request.app[CLIENTS].add(ws)
        await ws.send_str(json.dumps({"type": "state", "data": state(request)}))
        try:
            async for msg in ws:
                if msg.type == WSMsgType.ERROR:
                    break
        finally:
            request.app[CLIENTS].discard(ws)
        return ws

    # ---------- Token ----------

    @r.get("/api/tokens")
    async def tokens(request: web.Request) -> web.Response:
        return web.json_response([token_dict(t, engine.token_fraction(t)) for t in engine.store.tokens()])

    @r.put("/api/tokens/{uid}")
    async def put_token(request: web.Request) -> web.Response:
        uid = request.match_info["uid"]
        body = await request.json()
        name = str(body.get("name", "")).strip()
        color = str(body.get("color", ""))
        m = body.get("medium") or {}
        if not name:
            raise web.HTTPBadRequest(text="Name fehlt")
        if not (color.startswith("#") and len(color) == 7):
            raise web.HTTPBadRequest(text="Farbe als #rrggbb")
        if not spotify_links.parse(str(m.get("uri", ""))):
            raise web.HTTPBadRequest(text="Inhalt fehlt (Spotify-URI)")
        medium = Medium(uri=m["uri"], title=str(m.get("title") or "Spotify"), kind=str(m.get("kind") or "album"), cover_url=m.get("cover_url"))
        token = engine.save_token(uid, name, color, medium, shuffle=bool(body.get("shuffle", False)))
        return web.json_response(token_dict(token, engine.token_fraction(token)))

    @r.delete("/api/tokens/{uid}")
    async def delete_token(request: web.Request) -> web.Response:
        engine.delete_token(request.match_info["uid"])
        return web.json_response({"ok": True})

    @r.post("/api/learn")
    async def learn(request: web.Request) -> web.Response:
        body = await request.json()
        engine.start_learn() if body.get("active", True) else engine.cancel_learn()
        return web.json_response({"ok": True})

    @r.post("/api/spotify/resolve")
    async def resolve(request: web.Request) -> web.Response:
        body = await request.json()
        try:
            medium = await spotify_links.resolve(str(body.get("link", "")), request.app[HTTP])
        except spotify_links.LinkError as e:
            raise web.HTTPBadRequest(text=str(e)) from e
        return web.json_response({"uri": medium.uri, "title": medium.title, "kind": medium.kind, "cover_url": medium.cover_url})

    # Zugang über die eigene Spotify-App (falls eingerichtet) und Cache für Anzeigenamen
    creds = engine.store.spotify_app()
    spot: dict = {
        "app": spotify_web.AppToken(creds["client_id"], creds["client_secret"]) if creds.get("client_id") else None,
        "names": {},
    }

    async def box_token() -> str:
        token = await engine.player.web_token()
        if not token:
            raise web.HTTPServiceUnavailable(text="Spotify ist auf der Box nicht angemeldet (go-librespot). Ein Link geht immer.")
        return token

    @r.get("/api/spotify/search")
    async def search(request: web.Request) -> web.Response:
        q = request.query.get("q", "").strip()
        if len(q) < 2:
            return web.json_response([])
        if request.app[SIM]:
            return web.json_response(spotify_web.fake_search(q))
        http = request.app[HTTP]
        try:
            if spot["app"]:
                return web.json_response(await spotify_web.search(http, await spot["app"].get(http), q, market=spotify_web.APP_MARKET))
            return web.json_response(await spotify_web.search(http, await box_token(), q))
        except spotify_web.SpotifyWebError as e:
            if not spot["app"] and e.status in (401, 403, 429):
                raise web.HTTPBadGateway(
                    text="Spotify lässt die Suche über die Anmeldung der Box nicht zu. Richte die Suche einmal ein: "
                    "Tab „Box“ → Spotify → „Suche einrichten“. Bis dahin geht „Meine“ oder ein Link."
                ) from e
            raise web.HTTPBadGateway(text=str(e)) from e

    @r.get("/api/spotify/library")
    async def library(request: web.Request) -> web.Response:
        """Eigene Playlists und gespeicherte Alben aus dem Spotify-Konto der Box."""
        if request.app[SIM]:
            return web.json_response(spotify_web.fake_library())
        playlists = await engine.player.library("playlists")
        if playlists is not None:
            albums = await engine.player.library("albums") or {"items": []}
            return web.json_response(spotify_web.library_from_librespot(playlists, albums))
        # Ältere go-librespot-Version: über die Web API versuchen
        try:
            return web.json_response(await spotify_web.library_web(request.app[HTTP], await box_token()))
        except spotify_web.SpotifyWebError as e:
            raise web.HTTPBadGateway(
                text=f"{e} Deine go-librespot-Version kann die Bibliothek nicht selbst lesen; ein Update hilft (siehe docs/pi-setup.md)."
            ) from e

    @r.get("/api/spotify/account")
    async def account(request: web.Request) -> web.Response:
        """Wer ist auf der Box bei Spotify angemeldet, und ist die Suche eingerichtet?"""
        status = engine.player.status
        username = status.username
        name = spot["names"].get(username) if username else None
        if username and name is None and spot["app"] and not request.app[SIM]:
            try:
                name = await spotify_web.display_name(request.app[HTTP], await spot["app"].get(request.app[HTTP]), username)
            except spotify_web.SpotifyWebError:
                name = None
            spot["names"][username] = name or ""
        pair = None if username else await engine.player.auth_code()
        return web.json_response({
            "available": status.available,
            "username": "Simulation" if request.app[SIM] else username,
            "display_name": name or None,
            "pair": pair,
            "search": "simulated" if request.app[SIM] else ("app" if spot["app"] else "box"),
            "client_id": spot["app"].client_id if spot["app"] else None,
        })

    @r.put("/api/spotify/app")
    async def set_app(request: web.Request) -> web.Response:
        """Eigene Spotify-App für die Suche hinterlegen; wird vor dem Speichern bei Spotify geprüft."""
        body = await request.json()
        client_id, secret = str(body.get("client_id", "")).strip(), str(body.get("client_secret", "")).strip()
        if len(client_id) != 32 or len(secret) != 32:
            raise web.HTTPBadRequest(text="Client-ID und Client-Secret sind je 32 Zeichen lang. Bitte vollständig kopieren.")
        candidate = spotify_web.AppToken(client_id, secret)
        try:
            await candidate.get(request.app[HTTP])
        except spotify_web.SpotifyWebError as e:
            raise web.HTTPBadRequest(text=str(e)) from e
        engine.store.save_spotify_app({"client_id": client_id, "client_secret": secret})
        spot["app"], spot["names"] = candidate, {}
        return web.json_response({"ok": True})

    @r.delete("/api/spotify/app")
    async def delete_app(request: web.Request) -> web.Response:
        engine.store.save_spotify_app({})
        spot["app"], spot["names"] = None, {}
        return web.json_response({"ok": True})

    @r.get("/api/spotify/auth-code")
    async def auth_code(request: web.Request) -> web.Response:
        """Code für spotify.com/pair, solange go-librespot auf die Anmeldung wartet."""
        return web.json_response(await engine.player.auth_code())

    # ---------- Player ----------

    @r.post("/api/player/{action}")
    async def player(request: web.Request) -> web.Response:
        action = request.match_info["action"]
        body = await request.json() if request.can_read_body else {}
        if action == "toggle":
            await engine.toggle_play()
        elif action == "next":
            await engine.skip(1)
        elif action == "prev":
            await engine.skip(-1)
        elif action == "restart":
            await engine.restart()
        elif action == "seek":
            await engine.seek(int(body.get("position_ms", 0)))
        elif action == "volume":
            await engine.set_volume(int(body.get("volume", engine.volume)))
        else:
            raise web.HTTPNotFound(text=f"unbekannte Aktion {action}")
        return web.json_response({"ok": True})

    @r.post("/api/button")
    async def button(request: web.Request) -> web.Response:
        """Taster der Box fernbedienen (gleiches Verhalten wie am Gerät)."""
        body = await request.json()
        await engine.button(str(body.get("name")), str(body.get("press", "kurz")))
        return web.json_response({"ok": True})

    @r.post("/api/lock")
    async def lock(request: web.Request) -> web.Response:
        await engine.set_lock(bool((await request.json()).get("locked")))
        return web.json_response({"ok": True})

    @r.post("/api/sleep")
    async def sleep(request: web.Request) -> web.Response:
        body = await request.json()
        engine.set_sleep(str(body.get("kind", "off")), int(body.get("minutes", 0)))
        return web.json_response({"ok": True})

    @r.post("/api/notice/{id}/dismiss")
    async def dismiss(request: web.Request) -> web.Response:
        engine.dismiss_notice(int(request.match_info["id"]))
        return web.json_response({"ok": True})

    # ---------- Einstellungen / Kindermodus ----------

    @r.put("/api/settings")
    async def settings(request: web.Request) -> web.Response:
        try:
            engine.update_settings(await request.json())
        except ValueError as e:
            raise web.HTTPBadRequest(text=str(e)) from e
        return web.json_response({"ok": True})

    @r.post("/api/kidmode/verify")
    async def verify(request: web.Request) -> web.Response:
        ok = engine.check_pin(str((await request.json()).get("pin", "")))
        if not ok:
            await asyncio.sleep(0.8)  # Durchprobieren bremsen
        return web.json_response({"ok": ok})

    @r.put("/api/kidmode")
    async def kidmode(request: web.Request) -> web.Response:
        if not engine.check_pin(request.headers.get("X-Parent-Pin", "")):
            await asyncio.sleep(0.8)
            raise web.HTTPForbidden(text="Eltern-PIN falsch")
        try:
            engine.update_kid(await request.json())
        except ValueError as e:
            raise web.HTTPBadRequest(text=str(e)) from e
        return web.json_response({"ok": True})

    # ---------- Simulation (nur mit --fake) ----------

    @r.post("/api/sim/token")
    async def sim_token(request: web.Request) -> web.Response:
        if not request.app[SIM]:
            raise web.HTTPNotFound()
        uid = (await request.json()).get("uid")
        result = await engine.token_placed(uid) if uid else (await engine.token_removed(), "removed")[1]
        return web.json_response({"result": result})

    app.add_routes(r)

    async def on_startup(app: web.Application) -> None:
        app[HTTP] = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8), headers={"User-Agent": "Lauschbox"})

        async def track_source(uri: str) -> list[dict] | None:
            # Erst go-librespot (braucht metadata.enabled), sonst die Web API über die eigene Spotify-App
            tracks = await engine.player.context_tracks(uri)
            if tracks or app[SIM]:
                return tracks
            http = app[HTTP]
            token, market = (await spot["app"].get(http), spotify_web.APP_MARKET) if spot["app"] else (await engine.player.web_token(), "from_token")
            if not token:
                return None
            try:
                return await spotify_web.tracks_web(http, token, uri, market)
            except spotify_web.SpotifyWebError as e:
                log.info("Titelliste über die Web API nicht verfügbar: %s", e)
                return None

        engine.track_source = track_source
        pending = {"task": None}

        def changed() -> None:
            # Viele Änderungen kurz hintereinander zu einer Nachricht bündeln
            if pending["task"] is None:
                pending["task"] = asyncio.get_running_loop().call_later(0.08, push)

        def push() -> None:
            pending["task"] = None
            if not app[CLIENTS]:
                return
            text = json.dumps({"type": "state", "data": full_state(app)})
            for ws in list(app[CLIENTS]):
                asyncio.ensure_future(_send(app, ws, text))

        engine.subscribe(changed)

    async def on_cleanup(app: web.Application) -> None:
        await app[HTTP].close()
        for ws in list(app[CLIENTS]):
            await ws.close()

    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app


def full_state(app: web.Application) -> dict:
    snap = app[ENGINE].snapshot()
    snap["box"] = {
        "name": socket.gethostname(),
        "version": __version__,
        "simulated": app[SIM],
        "hardware": {name: part.status() for name, part in app[HW].items()},
    }
    return snap


async def _send(app: web.Application, ws: web.WebSocketResponse, text: str) -> None:
    try:
        await ws.send_str(text)
    except (ConnectionError, RuntimeError):
        app[CLIENTS].discard(ws)


@web.middleware
async def errors(request: web.Request, handler):
    try:
        return await handler(request)
    except web.HTTPException:
        raise
    except json.JSONDecodeError:
        raise web.HTTPBadRequest(text="JSON erwartet") from None
    except Exception as e:  # noqa: BLE001
        log.exception("Fehler bei %s %s", request.method, request.path)
        raise web.HTTPInternalServerError(text=f"{type(e).__name__}: {e}") from None


@web.middleware
async def cors(request: web.Request, handler):
    # Für die App im Browser (Expo Web); die Handy-App braucht das nicht
    if request.method == "OPTIONS":
        resp = web.Response()
    else:
        try:
            resp = await handler(request)
        except web.HTTPException as e:
            resp = e
    if isinstance(resp, web.WebSocketResponse):
        return resp
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Parent-Pin"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return resp
