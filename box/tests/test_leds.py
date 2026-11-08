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


def test_warte_punkt_ist_dunkel():
    frame = led_frame({"mode": "idle", "color": "#FFFFFF", "fill": 0, "brightness": 0.25}, t=0)
    lit = [c for c in frame if c != OFF]
    assert len(lit) == 1 and max(lit[0]) <= 12


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


def test_verstaerker_pin_nie_high(monkeypatch):
    import sys
    import types

    from lauschbox.hardware import Amp

    calls = []
    fake = types.SimpleNamespace(
        SET_PULL_NONE=0,
        gpiochip_open=lambda chip: 7,
        gpio_claim_output=lambda h, pin, level: calls.append(("output", pin, level)),
        gpio_claim_input=lambda h, pin, flags: calls.append(("input", pin)),
        gpio_free=lambda h, pin: calls.append(("free", pin)),
    )
    monkeypatch.setitem(sys.modules, "lgpio", fake)
    amp = Amp()
    amp.start()
    assert amp.ok and amp.muted and calls == [("output", 16, 0)]
    amp.unmute()
    amp.mute()
    assert calls[1:] == [("free", 16), ("input", 16), ("free", 16), ("output", 16, 0)]
    assert all(c[2] == 0 for c in calls if c[0] == "output")  # nie HIGH
