# Teileliste & Pinbelegung

## Teile

| Teil | Empfehlung | Hinweis |
|---|---|---|
| Rechner | Raspberry Pi **Zero 2 W** (mit Stiftleiste) | WLAN (nur 2,4 GHz) und Bluetooth an Bord. Raspberry Pi OS Lite 64-bit |
| Strom | Netzteil 5,1 V / 2,5 A (Micro-USB) | Vorerst; später Akku |
| Akku/Laden (später) | **PiSugar 3 Air** + LiPo 3,7 V 5000 mAh (PH2.0) | USB-C, Ladestand per I2C, Ein/Aus-Taster mit sauberem Herunterfahren, RTC. Polung des Akkusteckers vor dem Einstecken prüfen |
| Verstärker | Adafruit MAX98357A (I2S, 3 W) | |
| Lautsprecher | 3 W, 4 Ω, Ø 40–57 mm | Mit Resonanzraum im Gehäuse klingt es deutlich besser |
| NFC-Reader | PN532-Modul, angeschlossen über UART | Robuster als RC522, liest NTAG zuverlässig. I2C ging im Testaufbau nicht, UART sofort |
| Tags | NTAG213/215 als Sticker oder Karte | Es wird nur die UID genutzt |
| LEDs | WS2812B-Ring, 24 LEDs | Stromverbrauch per Helligkeit begrenzen. Anzahl: `NUM_LEDS` in box/lauschbox/hardware.py |
| Taster | 3× 12 mm Drucktaster | Play/Pause, Lauter, Leiser |
| SD-Karte | 16–32 GB A1 | Eine schnelle Karte lohnt sich (Bootzeit, Installation) |
| Kleinkram | Dupont-Kabel, Schrumpfschlauch, M2.5-Abstandshalter, 330-Ω-Widerstand, 470–1000-µF-Elko | |

## Pinbelegung (BCM)

| Funktion | GPIO | Pin | Bemerkung |
|---|---|---|---|
| I2S BCLK (MAX98357A) | 18 | 12 | `dtoverlay=max98357a` |
| I2S LRCLK | 19 | 35 | |
| I2S DIN | 21 | 40 | |
| Verstärker SD (stumm) | 16 | 36 | Stumm = LOW, an = Pin frei (nie HIGH). Gegen Knacken beim Start/Stopp und Rauschen im Leerlauf |
| PN532 RXD ← Pi TXD | 14 (UART TX) | 8 | Über Kreuz: TX an RX. `/dev/serial0`, 115200 Baud |
| PN532 TXD → Pi RXD | 15 (UART RX) | 10 | |
| I2C SDA (PiSugar) | 2 | 3 | PiSugar 0x57 (Akku) / 0x68 (Uhr) |
| I2C SCL | 3 | 5 | |
| WS2812 Data | 10 (SPI0 MOSI) | 19 | Per SPI angesteuert, weil GPIO18 (PWM) schon durch I2S belegt ist |
| Taster Play/Pause | 5 | 29 | Gegen GND, interner Pull-up |
| Taster Lauter | 6 | 31 | |
| Taster Leiser | 13 | 33 | |
| 5 V / GND | – | 2,4 / 6,9,… | LEDs + Verstärker an 5 V |

PN532: DIP-Schalter **beide OFF** (UART, beim PN532 „HSU“). Am 4-poligen Anschluss heißen die Stifte meist SDA/TXD und SCL/RXD.
`box/install.sh` schaltet die serielle Schnittstelle an und die Konsole darauf aus. Bluetooth bleibt an (gebraucht für die
WLAN-Einrichtung); die Schnittstelle ist dann der Mini-UART, dessen Takt `core_freq_min=400` stabil hält.
Alternative I2C (Schalter 1 ON, SDA an Pin 3, SCL an Pin 5): Die Software probiert UART zuerst und dann I2C.

Schritt-für-Schritt-Verdrahtung mit Stiftleisten-Plan und Tests: [aufbau.md](aufbau.md).
