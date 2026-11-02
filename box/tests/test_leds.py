from lauschbox.hardware import NUM_LEDS, led_frame

OFF = (0, 0, 0)


def test_fortschritt_laesst_den_rest_aus():
    frame = led_frame({"mode": "playing", "color": "#FF8A3D", "fill": 0.25, "brightness": 0.25}, t=0)
    lit = [c for c in frame if c != OFF]
    assert len(lit) == 3  # 25 % von 12 LEDs
    assert frame[3:] == [OFF] * (NUM_LEDS - 3)


def test_pause_und_lautstaerke_ebenso():
    for mode in ("paused", "volume"):
        frame = led_frame({"mode": mode, "color": "#FFFFFF", "fill": 0.5, "brightness": 0.25}, t=0.5)
        assert frame[6:] == [OFF] * 6, mode


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
