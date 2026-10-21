"""WS2812-Ring (12 LEDs) an SPI0 MOSI (GPIO10): Farbdurchlauf + Lautstärke-/Akkuanzeige."""
import time

import board
import neopixel_spi

NUM = 12
pixels = neopixel_spi.NeoPixel_SPI(board.SPI(), NUM, brightness=0.2, auto_write=False)

for color in [(255, 0, 0), (0, 255, 0), (0, 0, 255)]:
    pixels.fill(color)
    pixels.show()
    time.sleep(0.5)

# Füllanzeige, z. B. für Lautstärke oder Ladestand
for level in range(NUM + 1):
    for i in range(NUM):
        pixels[i] = (0, 180, 40) if i < level else (0, 0, 0)
    pixels.show()
    time.sleep(0.15)

pixels.fill((0, 0, 0))
pixels.show()
