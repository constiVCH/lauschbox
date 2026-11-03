"""Eltern-PIN schützt Kindermodus und Systemaktionen (am PC: cd box && python -m pytest)."""
import asyncio

import aiohttp

from aiohttp.test_utils import TestClient, TestServer

from lauschbox.api import build_app
from lauschbox.engine import Engine
from lauschbox.player import FakePlayer
from lauschbox.store import Store


def test_falsche_pin_wird_abgelehnt(tmp_path):
    async def go():
        engine = Engine(Store(tmp_path / "test.db"), FakePlayer())
        async with TestClient(TestServer(build_app(engine))) as client:
            for method, path in (("POST", "/api/system/reboot"), ("POST", "/api/system/update"), ("GET", "/api/system/log")):
                assert (await client.request(method, path)).status == 403, path
                assert (await client.request(method, path, headers={"X-Parent-Pin": "0000"})).status == 403, path
            resp = await client.put("/api/kidmode", json={"max_volume": 100}, headers={"X-Parent-Pin": "0000"})
            assert resp.status == 403 and engine.kid.max_volume == 60
            resp = await client.put("/api/kidmode", json={"max_volume": 80}, headers={"X-Parent-Pin": "1234"})
            assert resp.status == 200 and engine.kid.max_volume == 80

    asyncio.run(go())


def test_events_antwortet_auf_ping(tmp_path):
    async def go():
        engine = Engine(Store(tmp_path / "test.db"), FakePlayer())
        async with TestClient(TestServer(build_app(engine))) as client:
            ws = await client.ws_connect("/api/events")
            assert (await ws.receive_json())["type"] == "state"
            await ws.send_str("ping")
            assert (await ws.receive_json()) == {"type": "pong"}
            await ws.close()

    asyncio.run(go())


def test_eigene_dateien_hochladen_und_zuweisen(tmp_path):
    async def go():
        engine = Engine(Store(tmp_path / "test.db"), FakePlayer())
        root = tmp_path / "media"
        async with TestClient(TestServer(build_app(engine, media_dir=root))) as client:
            uri = (await (await client.post("/api/media", json={"title": "Urlaub"})).json())["uri"]
            album_id = uri.split(":", 1)[1]
            token = {"name": "Urlaub", "color": "#FF8A3D", "medium": {"uri": uri, "title": "Urlaub"}}
            assert (await client.put("/api/tokens/t1", json=token)).status == 400  # noch leer

            def form(name: str) -> aiohttp.FormData:
                data = aiohttp.FormData()
                data.add_field("file", b"ID3 fake", filename=name)
                return data

            assert (await client.post(f"/api/media/{album_id}/files", data=form("01 Anfang.mp3"))).status == 200
            # Pfade aus dem Dateinamen fallen weg, Nicht-Audio wird abgelehnt
            assert (await client.post(f"/api/media/{album_id}/files", data=form("../../evil.mp3"))).status == 200
            assert (await client.post(f"/api/media/{album_id}/files", data=form("notiz.txt"))).status == 400
            assert (await client.post("/api/media/..%2F..%2Fetc/files", data=form("x.mp3"))).status in (400, 404)
            assert sorted(p.name for p in (root / album_id).iterdir()) == ["01 Anfang.mp3", "evil.mp3", "title.txt"]
            assert not (tmp_path / "evil.mp3").exists()

            listing = await (await client.get("/api/media")).json()
            assert listing["albums"][0]["title"] == "Urlaub" and listing["albums"][0]["track_count"] == 2
            assert (await client.put("/api/tokens/t1", json=token)).status == 200
            detail = await (await client.get(f"/api/media/{album_id}")).json()
            assert [f["name"] for f in detail["files"]] == ["01 Anfang.mp3", "evil.mp3"]
            assert detail["files"][0]["duration_ms"] == 0  # keine echte mp3: Länge unbekannt, kein Fehler
            assert (await client.delete(f"/api/media/{album_id}/files/evil.mp3")).status == 200
            assert not (root / album_id / "evil.mp3").exists()
            assert (await client.delete(f"/api/media/{album_id}/files/title.txt")).status == 400
            assert (await client.delete(f"/api/media/{album_id}")).status == 200
            assert not (root / album_id).exists()

    asyncio.run(go())


def test_laenge_eigener_dateien(tmp_path):
    import wave

    from lauschbox import media

    album_id = media.create(tmp_path, "Test")
    with wave.open(str(tmp_path / album_id / "eins.wav"), "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(8000)
        w.writeframes(b"\0\0" * 12000)  # 1,5 s
    assert media.files(tmp_path, album_id)[0]["duration_ms"] == 1500
    assert media.albums(tmp_path)[0]["duration_ms"] == 1500
