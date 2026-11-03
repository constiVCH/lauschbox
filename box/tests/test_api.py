"""Eltern-PIN schützt Kindermodus und Systemaktionen (am PC: cd box && python -m pytest)."""
import asyncio

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
