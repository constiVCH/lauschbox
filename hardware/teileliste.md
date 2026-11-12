# Teileliste & Pinbelegung

## Teile

| Teil | Empfehlung | Hinweis |
|---|---|---|
| Rechner | **Banana Pi BPI-M2 Zero** (Allwinner H3) | Ersatz für den Raspberry Pi Zero (nicht lieferbar). Gleiche Bauform und Stiftleiste, aber Armbian statt Raspberry Pi OS: [docs/bananapi-m2-zero.md](../docs/bananapi-m2-zero.md). Ein Raspberry Pi Zero (2) W geht weiterhin |
| Akku/Laden | **PiSugar 3 Air** + LiPo 3,7 V 5000 mAh (PH2.0) | USB-C, Ladestand per I2C, Ein/Aus-Taster mit sauberem Herunterfahren, RTC. Polung des Akkusteckers vor dem Einstecken prüfen. Für den Raspberry Pi Zero gebaut: ob er am Banana Pi passt, ist noch offen |
| Verstärker | Adafruit MAX98357A (I2S, 3 W) | Alternative: HifiBerry MiniAmp (Stereo) |
| Lautsprecher | 3 W, 4 Ω, Ø 40–57 mm | Mit Resonanzraum im Gehäuse klingt es deutlich besser |
| NFC-Reader | PN532-Modul, angeschlossen über UART | Robuster als RC522, liest NTAG zuverlässig. I2C ging im Testaufbau nicht (Modul antwortete nicht), UART sofort |
| Tags | NTAG213/215 Sticker oder Disc, Ø 25 mm | Es wird nur die UID genutzt |
| LEDs | WS2812B-Ring, 24 LEDs | Stromverbrauch per Helligkeit begrenzen. Anzahl: `NUM_LEDS` in box/lauschbox/hardware.py |
| Taster | 3× 12 mm Drucktaster | Play/Pause, Lauter, Leiser |
| SD-Karte | 16–32 GB A1 | Eine schnelle Karte lohnt sich beim Zero W besonders (Bootzeit, Installation) |
| Kleinkram | Dupont-Kabel, Schrumpfschlauch, M2.5-Abstandshalter | |

## Pinbelegung

Raspberry Pi (BCM-Nummern) und Banana Pi M2 Zero (H3-Namen). **Nur BCLK und LRC liegen auf anderen Pins**, alles andere ist gleich.

| Funktion | Raspberry Pi | Pin (Pi) | Banana Pi M2 Zero | Pin (BPI) | Bemerkung |
|---|---|---|---|---|---|
| I2S BCLK (MAX98357A) | GPIO18 | 12 | PA19 | **27** | Pi: `dtoverlay=max98357a`, BPI: box/overlays/lauschbox-max98357a.dts |
| I2S LRCLK | GPIO19 | 35 | PA18 | **28** | |
| I2S DIN | GPIO21 | 40 | PA20 | 40 | |
| Verstärker SD (stumm) | GPIO16 | 36 | PL4 | 36 | Stumm = LOW, an = Pin frei (nie HIGH). Gegen Knacken beim Start/Stopp und Rauschen im Leerlauf |
| PN532 RXD ← TXD | GPIO14 (UART TX) | 8 | PA13 (UART3 TX) | 8 | Über Kreuz: TX an RX. Pi `/dev/serial0`, BPI `/dev/ttyS3`, 115200 Baud |
| PN532 TXD → RXD | GPIO15 (UART RX) | 10 | PA14 (UART3 RX) | 10 | |
| I2C SDA (PiSugar) | GPIO2 | 3 | PA12 (TWI0) | 3 | PiSugar 0x57/0x68 |
| I2C SCL | GPIO3 | 5 | PA11 (TWI0) | 5 | |
| WS2812 Data | GPIO10 (SPI0 MOSI) | 19 | PC0 (SPI0 MOSI) | 19 | Per SPI angesteuert, weil der PWM-Pin schon durch I2S belegt ist |
| Taster Play/Pause | GPIO5 | 29 | PA7 | 29 | Gegen GND, interner Pull-up |
| Taster Lauter | GPIO6 | 31 | PA8 | 31 | |
| Taster Leiser | GPIO13 | 33 | PA9 | 33 | |
| 5 V / GND | – | 2,4 / 6,9,… | – | 2,4 / 6,9,… | LEDs + Verstärker an 5 V |

PN532: DIP-Schalter **beide OFF** (UART, beim PN532 „HSU“). Am 4-poligen Anschluss heißen die Stifte meist SDA/TXD und SCL/RXD.
Auf dem Pi die serielle Schnittstelle an- und die Konsole darauf ausschalten: `sudo raspi-config nonint do_serial_hw 0` und
`sudo raspi-config nonint do_serial_cons 1`. Bluetooth bleibt dabei an (gebraucht für die WLAN-Einrichtung); die Schnittstelle
ist dann der Mini-UART, dessen Takt `core_freq_min=400` stabil hält.
Alternative I2C (Schalter 1 ON, SDA an Pin 3, SCL an Pin 5): Die Software probiert UART zuerst und dann I2C.

Schritt-für-Schritt-Verdrahtung mit Stiftleisten-Plan und Tests: [testaufbau-pi3b.md](testaufbau-pi3b.md) (gilt 1:1 auch für den Zero).
