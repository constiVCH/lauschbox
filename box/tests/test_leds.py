from lauschbox.hardware import NUM_LEDS, led_frame

OFF = (0, 0, 0)


def test_fortschritt_laesst_den_rest_aus():
    frame = led_frame({"mode": "playing", "color": "#FF8A3D", "fill": 0.25, "brightness": 0.25}, t=0)
    lit = [c for c in frame if c != OFF]
    quarter = NUM_LEDS // 4
    assert len(lit) == quarter
    assert frame[quarter:] == [OFF] * (NUM_LEDS - quarter)


def test_pause_und_lautstaerke_ebenso():
    for mode in ("paused", "volume"):
        frame = led_frame({"mode": mode, "color": "#FFFFFF", "fill": 0.5, "brightness": 0.25}, t=0.5)
        assert frame[NUM_LEDS // 2 :] == [OFF] * (NUM_LEDS // 2), mode


def test_warten_kopf_mit_schweif():
    from lauschbox.hardware import IDLE_SPEED, IDLE_TAIL

    frame = led_frame({"mode": "idle", "color": "#FFFFFF", "fill": 0, "brightness": 0.25}, t=1 / IDLE_SPEED)
    tail = [frame[(1 - k) % NUM_LEDS][0] for k in range(len(IDLE_TAIL))]  # Kopf auf LED 1, Schweif über das Ende zurück
    assert tail[0] <= 30 and tail == sorted(tail, reverse=True) and tail[-1] > 0  # dezent, nach hinten schwächer
    assert sum(c != OFF for c in frame) == len(IDLE_TAIL)


def test_orange_bleibt_orange():
    # Ohne Gammakorrektur wäre Grün fast halb so hell wie Rot und das Orange wirkte weißlich
    frame = led_frame({"mode": "playing", "color": "#FF8A3D", "fill": 1, "brightness": 1}, t=0)
    r, g, b = frame[0]
    assert r == 255 and g < 0.25 * r and b < 0.03 * r


def test_bauteil_wird_nach_dem_start_erneut_versucht():
    import asyncio

    from lauschbox.hardware import Part, retry_parts

    class Spaet(Part):
        def __init__(self):
            super().__init__("leds")
            self.versuche = 0

        def start(self):
            self.versuche += 1
            if self.versuche >= 3:
                self.ok, self.detail = True, "läuft"
            else:
                raise RuntimeError("SPI noch nicht bereit")

    part = Spaet()
    ok_gemeldet = []
    asyncio.run(retry_parts({"leds": part}, ok_gemeldet.append, lambda: None, attempts=5, every_s=0.01))
    assert part.ok and part.versuche == 3 and ok_gemeldet == [part]


def _fake_gpiod(monkeypatch, calls):
    """gpiod nachbauen: zeichnet angeforderte und umgestellte Leitungen auf."""
    import sys
    import time
    import types

    from lauschbox import hardware

    class Req:
        def __init__(self, config):
            calls.append(("request", config))

        def reconfigure_lines(self, config):
            calls.append(("reconfigure", config))

        def release(self):
            calls.append(("release",))

        def wait_edge_events(self, timeout):
            time.sleep(0.02)
            return False

    line = types.SimpleNamespace(
        Direction=types.SimpleNamespace(INPUT="in", OUTPUT="out"),
        Value=types.SimpleNamespace(INACTIVE=0, ACTIVE=1),
        Bias=types.SimpleNamespace(DISABLED="frei", PULL_UP="pull-up"),
        Edge=types.SimpleNamespace(BOTH="beide"),
    )
    gpiod = types.SimpleNamespace(LineSettings=lambda **kw: kw, request_lines=lambda path, consumer, config: Req(config), line=line)
    monkeypatch.setitem(sys.modules, "gpiod", gpiod)
    monkeypatch.setitem(sys.modules, "gpiod.line", line)
    monkeypatch.setattr(hardware, "_chip_path", lambda label: "/dev/gpiochip0")


def test_verstaerker_pin_nie_high(monkeypatch):
    from lauschbox.hardware import Amp

    calls = []
    _fake_gpiod(monkeypatch, calls)
    amp = Amp()
    amp.start()
    assert amp.ok and amp.muted
    amp.unmute()
    amp.mute()
    settings = [list(c[1].values())[0] for c in calls]
    assert [s["direction"] for s in settings] == ["out", "in", "out"]
    assert settings[1]["bias"] == "frei"  # an: Pin loslassen, der Widerstand auf dem Board zieht hoch
    assert all(s.get("output_value", 0) == 0 for s in settings)  # nie HIGH


def test_taster_kurz_und_lang(monkeypatch):
    import asyncio

    from lauschbox import hardware

    calls = []
    _fake_gpiod(monkeypatch, calls)
    monkeypatch.setattr(hardware, "HOLD_S", 0.05)

    async def go():
        presses = []

        async def on_press(name, press):
            presses.append((name, press))

        buttons = hardware.Buttons(asyncio.get_running_loop(), on_press)
        buttons.start()
        assert buttons.ok
        buttons._pressed("play_pause")
        buttons._released("play_pause")
        buttons._pressed("play_pause")
        await asyncio.sleep(0.15)  # länger als HOLD_S gehalten
        buttons._released("play_pause")
        await asyncio.sleep(0.05)
        return presses

    assert asyncio.run(go()) == [("play_pause", "kurz"), ("play_pause", "lang")]


def test_alle_drei_taster_starten_wlan_einrichtung(monkeypatch):
    import asyncio

    from lauschbox import hardware

    _fake_gpiod(monkeypatch, [])
    monkeypatch.setattr(hardware, "HOLD_S", 0.05)
    monkeypatch.setattr(hardware, "COMBO_HOLD_S", 0.15)

    async def go():
        presses = []

        async def on_press(name, press):
            presses.append((name, press))

        buttons = hardware.Buttons(asyncio.get_running_loop(), on_press)
        buttons.start()
        for name in ("lauter", "leiser", "play_pause"):
            buttons._pressed(name)
        await asyncio.sleep(0.25)
        for name in ("lauter", "leiser", "play_pause"):
            buttons._released(name)
        await asyncio.sleep(0.05)
        return presses

    # Keine Tastensperre, kein Titelsprung, kein „kurz“ beim Loslassen, nur die WLAN-Einrichtung
    assert asyncio.run(go()) == [("wifi", "lang")]
