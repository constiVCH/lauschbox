"""Regeln der Engine mit FakePlayer und fester Uhrzeit (am PC: cd box && python -m pytest)."""
import asyncio
from datetime import datetime

import pytest

from lauschbox.engine import Engine
from lauschbox.player import FakePlayer
from lauschbox.store import Medium, Store

ALBUM = Medium(uri="spotify:album:" + "a" * 22, title="Drache Funkel", kind="album")
PLAYLIST = Medium(uri="spotify:playlist:" + "b" * 22, title="Schlaflieder", kind="playlist")


class Clock:
    def __init__(self, hour=15, minute=0):
        self.now = datetime(2026, 11, 1, hour, minute)

    def __call__(self):
        return self.now


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def box(tmp_path):
    async def make(clock=None):
        store = Store(tmp_path / "test.db")
        player = FakePlayer()
        engine = Engine(store, player, clock=clock or Clock())
        await engine.start()
        engine.save_token("tok1", "Funkel", "#FF8A3D", ALBUM)
        engine.save_token("tok2", "Schlaflieder", "#7B61FF", PLAYLIST)
        return engine, player

    return make


def test_auflegen_spielt_und_abnehmen_pausiert_mit_hoerstand(box):
    async def go():
        engine, player = await box()
        assert await engine.token_placed("tok1") == "started"
        assert player.status.playing and player.status.context_uri == ALBUM.uri
        await player.next()
        await player.seek(42_000)
        await engine.token_removed()
        assert not player.status.playing
        p = engine.store.token("tok1").progress
        assert p.track_number == 2 and 42_000 <= p.position_ms < 43_000
        # Wieder auflegen: gleicher Inhalt liegt noch im Player → einfach weiter
        assert await engine.token_placed("tok1") == "resumed"
        assert player.status.track_number == 2 and player.status.playing
        await engine.close()

    run(go())


def test_fortsetzen_nach_anderem_token(box):
    async def go():
        engine, player = await box()
        await engine.token_placed("tok1")
        await player.next()
        await player.next()
        await player.seek(10_000)
        await engine.token_placed("tok2")  # wechselt direkt, ohne Abnehmen
        assert player.status.context_uri == PLAYLIST.uri
        await engine.token_placed("tok1")
        assert player.status.track_number == 3
        assert player.position() >= 10_000
        await engine.close()

    run(go())


def test_lautstaerke_deckel_und_tasten(box):
    async def go():
        engine, player = await box()
        await engine.set_volume(95)
        assert engine.volume == 60 and player.status.volume == 60  # Kindermodus
        await engine.button("lauter", "kurz")
        assert engine.volume == 60
        await engine.button("leiser", "kurz")
        assert engine.volume == 55
        assert engine.led_state()["mode"] == "volume"
        await engine.button("lock", "lang")
        await engine.button("leiser", "kurz")
        assert engine.volume == 55 and engine.locked
        await engine.button("lock", "lang")
        assert not engine.locked
        await engine.close()

    run(go())


def test_schlafenszeit(box):
    async def go():
        clock = Clock(20, 15)
        engine, player = await box(clock)
        assert engine.bedtime_active()
        assert engine.volume_cap() == 30
        assert await engine.token_placed("tok1") == "denied"
        assert not player.status.playing
        clock.now = datetime(2026, 11, 2, 7, 5)
        assert not engine.bedtime_active()
        await engine.token_removed()
        assert await engine.token_placed("tok1") == "started"
        await engine.close()

    run(go())


def test_schlafenszeit_pausiert_am_titelende(box):
    async def go():
        clock = Clock(19, 0)
        engine, player = await box(clock)
        await engine.token_placed("tok1")
        clock.now = datetime(2026, 11, 1, 19, 45)
        await player.next()  # Titelwechsel während der Schlafenszeit
        await asyncio.sleep(0.05)
        assert not player.status.playing
        assert "Schlafenszeit" in engine.notice["text"]
        await engine.close()

    run(go())


def test_unbekannter_token_und_nur_bekannte(box):
    async def go():
        engine, player = await box()
        assert await engine.token_placed("leer1") == "unknown"
        assert engine.led_state()["mode"] == "unknown"
        assert engine.notice["tone"] == "warning"
        await engine.token_removed()
        engine.update_kid({"known_tokens_only": True})
        assert await engine.token_placed("leer1") == "ignored"
        assert not player.status.playing
        await engine.close()

    run(go())


def test_anlernen(box):
    async def go():
        engine, player = await box()
        engine.start_learn()
        assert engine.led_state()["mode"] == "learn"
        assert await engine.token_placed("tok1") == "known"
        assert await engine.token_placed("neu1") == "learned"
        assert engine.learned_uid == "neu1"
        engine.save_token("neu1", "Robo", "#FF5A4E", ALBUM)
        assert not engine.learning and engine.store.token("neu1").name == "Robo"
        await asyncio.sleep(0.05)
        # Der neue Token liegt noch auf: spielt sofort als Bestätigung
        assert player.status.playing and player.status.context_uri == ALBUM.uri
        await engine.close()

    run(go())


def test_lernmodus_mit_schon_aufliegendem_leeren_token(box):
    async def go():
        engine, _ = await box()
        await engine.token_placed("leer2")
        engine.start_learn()
        assert engine.learned_uid == "leer2"
        await engine.close()

    run(go())


def test_ende_ohne_autoplay_und_neustart(box):
    async def go():
        engine, player = await box()
        await engine.token_placed("tok1")
        for _ in range(FakePlayer.TRACKS - 1):
            await player.next()
        await player.seek(FakePlayer.TRACK_MS - 300)
        await engine.tick()  # merkt sich die Position kurz vor Schluss
        await asyncio.sleep(0.6)  # FakePlayer erreicht das Ende
        assert not player.status.playing
        assert engine.store.token("tok1").progress.finished
        assert "zu Ende" in engine.notice["text"]
        await engine.token_removed()
        assert await engine.token_placed("tok1") == "started"
        assert player.status.track_number == 1
        await engine.close()

    run(go())


def test_sleep_timer_nach_titel(box):
    async def go():
        engine, player = await box()
        await engine.token_placed("tok1")
        engine.set_sleep("episode")
        await player.next()
        await asyncio.sleep(0.05)
        assert not player.status.playing and engine.sleep["kind"] == "off"
        await engine.close()

    run(go())


def test_kindermodus_grenzen_und_pin(box):
    async def go():
        engine, _ = await box()
        engine.update_kid({"max_volume": 25})
        assert engine.kid.bedtime_max_volume == 25
        engine.update_kid({"pin": "12a4"})  # ungültig → ignoriert
        assert engine.check_pin("1234")
        engine.update_kid({"pin": "4321"})
        assert engine.check_pin("4321")
        with pytest.raises(ValueError):
            engine.update_kid({"max_volume": "laut"})
        with pytest.raises(ValueError):
            engine.update_kid({"bedtime_from": "25:99x"})
        await engine.close()

    run(go())


def test_neuer_inhalt_loescht_hoerstand(box):
    async def go():
        engine, player = await box()
        await engine.token_placed("tok1")
        await player.next()
        await engine.token_removed()
        assert engine.store.token("tok1").progress.track_number == 2
        engine.save_token("tok1", "Funkel", "#FF8A3D", PLAYLIST)
        assert engine.store.token("tok1").progress.track_number is None
        await engine.close()

    run(go())


def test_kindermodus_100_prozent_erlaubt_volle_lautstaerke(box):
    async def go():
        engine, player = await box()
        engine.update_kid({"max_volume": 100})
        await engine.set_volume(100)
        assert engine.volume_cap() == 100 and player.status.volume == 100
        await engine.close()

    run(go())


def test_play_ohne_token_spielt_nichts(box):
    async def go():
        engine, player = await box()
        await engine.token_placed("tok1")
        await engine.token_removed()
        assert not player.status.playing
        await engine.toggle_play()
        assert not player.status.playing  # zuletzt gehörter Inhalt startet nicht ohne Token
        await engine.close()

    run(go())


def test_play_lang_startet_von_vorn(box):
    async def go():
        engine, player = await box()
        await engine.token_placed("tok1")
        await player.next()
        await player.seek(30_000)
        await engine.button("play_pause", "lang")
        assert player.status.track_number == 1 and player.position() < 1000
        assert engine.store.token("tok1").progress.track_number in (None, 1)
        await engine.close()

    run(go())


def test_kapitelwechsel_ist_kein_ende(box):
    """Am Ende von Kapitel 1 meldet der Player kurz „spielt nicht“. Das darf nicht als „fertig gehört“ zählen."""

    async def go():
        engine, player = await box()
        await engine.token_placed("tok1")
        await player.seek(FakePlayer.TRACK_MS - 300)
        await engine.tick()
        await asyncio.sleep(1.0)  # Kapitel 1 endet, Kapitel 2 startet
        assert player.status.playing and player.status.track_number == 2
        assert not engine.store.token("tok1").progress.finished
        assert engine.notice is None or "zu Ende" not in engine.notice["text"]
        await player.seek(20_000)
        await engine.token_removed()
        await engine.token_placed("tok1")
        assert player.status.track_number == 2 and player.position() >= 20_000
        await engine.close()

    run(go())


def test_zufall_mischt_und_normaler_token_schaltet_zufall_ab(box):
    async def go():
        engine, player = await box()
        engine.save_token("mix", "Party", "#FF5FA2", PLAYLIST, shuffle=True)
        await engine.token_placed("mix")
        assert player.shuffle is True
        await engine.token_placed("tok1")  # Hörspiel danach: wieder der Reihe nach
        assert player.shuffle is False and player.status.track_number == 1
        await engine.close()

    run(go())


def test_gesamtfortschritt_am_ring_und_in_der_liste(box):
    async def go():
        engine, player = await box()
        await engine.token_placed("tok1")
        await asyncio.sleep(0.05)  # Titelliste lädt im Hintergrund
        await player.next()
        await player.next()  # Kapitel 3 von 6, Anfang
        led = engine.led_state()
        assert abs(led["fill"] - 2 / 6) < 0.01
        snap = engine.snapshot()["player"]
        assert snap["track_index"] == 2 and snap["track_count"] == 6
        await engine.token_removed()
        t = next(t for t in engine.snapshot()["tokens"] if t["uid"] == "tok1")
        assert abs(t["progress"]["fraction"] - 2 / 6) < 0.01
        await engine.close()

    run(go())


def test_ende_ohne_titelliste_erst_nach_kurzer_wartezeit(box, monkeypatch):
    import lauschbox.engine as eng

    monkeypatch.setattr(eng, "END_CONFIRM_S", 0.5)

    async def go():
        engine, player = await box()

        async def no_tracks(uri):
            return None

        engine.track_source = no_tracks
        engine.save_token("neu", "Ohne Liste", "#2EC4B6", Medium(uri="spotify:album:" + "c" * 22, title="Ohne Liste"))
        await asyncio.sleep(0.05)
        assert engine.tracks_of("spotify:album:" + "c" * 22) is None
        await engine.token_placed("neu")
        await player.seek(FakePlayer.TRACK_MS - 300)
        await engine.tick()
        await asyncio.sleep(1.2)  # Kapitelwechsel nach 0,3 s: kein Ende
        assert player.status.track_number == 2
        assert not engine.store.token("neu").progress.finished
        for _ in range(FakePlayer.TRACKS - 2):
            await player.next()
        await player.seek(FakePlayer.TRACK_MS - 300)
        await engine.tick()
        await asyncio.sleep(0.2)
        assert not engine.store.token("neu").progress.finished  # noch in der Wartezeit
        await asyncio.sleep(1.3)  # letzter Titel endet, es kommt nichts mehr
        assert engine.store.token("neu").progress.finished
        await engine.close()

    run(go())
