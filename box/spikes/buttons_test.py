"""Taster an GPIO 5/6/13 gegen GND: kurz und lang drücken."""
from signal import pause

from gpiozero import Button

PINS = {"play_pause": 5, "lauter": 6, "leiser": 13}

buttons = {}
for name, pin in PINS.items():
    b = Button(pin, pull_up=True, bounce_time=0.05, hold_time=1.0)
    b.when_released = lambda n=name, btn=b: None if getattr(btn, "_held", False) else print(f"{n}: kurz")
    b.when_held = lambda n=name, btn=b: (setattr(btn, "_held", True), print(f"{n}: lang"))
    b.when_pressed = lambda btn=b: setattr(btn, "_held", False)
    buttons[name] = b

print("Taster drücken (Strg+C zum Beenden) …")
pause()
