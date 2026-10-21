# Teileliste & Pinbelegung

## Teile

| Teil | Empfehlung | Hinweis |
|---|---|---|
| Rechner | Raspberry Pi **Zero W** (Variante „WH“ = mit Header) | WLAN (2,4 GHz) + BLE an Bord. Nur 32-bit-OS (ARMv6). Ein Zero 2 W passt ohne Umbau (gleiche Pins); dann reicht es, die SD-Karte mit 64-bit neu aufzusetzen |
| Akku/Laden | **PiSugar 3 Plus** (5000 mAh) | USB-C, Durchreichen (Netzbetrieb), Ladestand per I2C, Ein/Aus-Taster, RTC. Die kleine Version (1200 mAh) hält nur ca. 2 h |
| Verstärker | Adafruit MAX98357A (I2S, 3 W) | Alternative: HifiBerry MiniAmp (Stereo) |
| Lautsprecher | 3 W, 4 Ω, Ø 40–57 mm | Mit Resonanzraum im Gehäuse klingt es deutlich besser |
| NFC-Reader | PN532-Modul (I2C) | Robuster als RC522, liest NTAG zuverlässig |
| Tags | NTAG213/215 Sticker oder Disc, Ø 25 mm | Es wird nur die UID genutzt |
| LEDs | WS2812B-Ring, 12 LEDs | Stromverbrauch per Helligkeit begrenzen |
| Taster | 3× 12 mm Drucktaster | Play/Pause, Lauter, Leiser |
| SD-Karte | 16–32 GB A1 | Eine schnelle Karte lohnt sich beim Zero W besonders (Bootzeit, Installation) |
| Kleinkram | Dupont-Kabel, Schrumpfschlauch, M2.5-Abstandshalter | |

## Pinbelegung (BCM)

| Funktion | GPIO | Pin | Bemerkung |
|---|---|---|---|
| I2S BCLK (MAX98357A) | 18 | 12 | `dtoverlay=max98357a` |
| I2S LRCLK | 19 | 35 | |
| I2S DIN | 21 | 40 | |
| Verstärker SD (Mute) | 16 | 36 | Abschalten gegen Rauschen im Leerlauf |
| I2C SDA (PN532, PiSugar) | 2 | 3 | PN532 0x24, PiSugar 0x57/0x68/0x75: keine Konflikte |
| I2C SCL | 3 | 5 | |
| WS2812 Data | 10 (SPI0 MOSI) | 19 | Per SPI angesteuert, weil GPIO18 (PWM) schon durch I2S belegt ist |
| Taster Play/Pause | 5 | 29 | Gegen GND, interner Pull-up |
| Taster Lauter | 6 | 31 | |
| Taster Leiser | 13 | 33 | |
| 5 V / GND | – | 2,4 / 6,9,… | LEDs + Verstärker an 5 V |

PN532: DIP-Schalter auf **I2C** stellen (SEL0=1, SEL1=0).
