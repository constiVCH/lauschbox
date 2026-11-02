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
