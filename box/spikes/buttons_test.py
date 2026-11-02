"""Taster an GPIO 5/6/13 gegen GND: kurz und lang drücken."""
from signal import pause

from gpiozero import Button

PINS = {"play_pause": 5, "lauter": 6, "leiser": 13}

# gpiozero erlaubt keine eigenen Attribute am Button, deshalb hier merken, ob lang gehalten wurde
held = {name: False for name in PINS}
buttons = {}
for name, pin in PINS.items():
    b = Button(pin, pull_up=True, bounce_time=0.05, hold_time=1.0)
    b.when_pressed = lambda n=name: held.__setitem__(n, False)
    b.when_held = lambda n=name: (held.__setitem__(n, True), print(f"{n}: lang"))
    b.when_released = lambda n=name: None if held[n] else print(f"{n}: kurz")
    buttons[name] = b

print("Taster drücken (Strg+C zum Beenden) …")
pause()
