# Aufbau: Verdrahtung und erster Test

Für den **Raspberry Pi Zero 2 W**. Andere Pis mit 40-poliger Stiftleiste (3B+, 4) sind gleich belegt; mit ihnen lässt sich
alles genauso aufbauen und testen. Teile und Pin-Tabelle: [teileliste.md](teileliste.md).

Strom vorerst über das Netzteil (5 V, mindestens 2,5 A). Der Akku (PiSugar 3 Air) kommt später dazu.

## Was du brauchst

- Pi Zero 2 W mit Stiftleiste, **Netzteil 5,1 V / 2,5 A** (Micro-USB). Ein schwaches Handy-Ladegerät führt zu
  Unterspannung und Aussetzern beim NFC-Leser.
- microSD-Karte (16–32 GB)
- Dupont-Kabel, ggf. Steckbrett
- Für den LED-Ring: 330-Ω-Widerstand (Datenleitung), 470–1000 µF Elko (5 V/GND am Ring)
- Lötkolben: Die Breakout-Boards haben meist lose Stiftleisten bzw. Lötpads

## Stiftleiste: wer wohin

Draufsicht, Pin 1 ist das eckige Lötpad. Links stehen die ungeraden, rechts die geraden Pins.

```
PN532 VCC ──────── 3,3 V  [ 1] [ 2] 5 V     ──── Verstärker VIN
                   GPIO2  [ 3] [ 4] 5 V     ──── LED-Ring 5V
                   GPIO3  [ 5] [ 6] GND     ──── Verstärker GND
                   GPIO4  [ 7] [ 8] GPIO14  ──── PN532 RXD (SCL-Stift)
LED-Ring GND ───── GND    [ 9] [10] GPIO15  ──── PN532 TXD (SDA-Stift)
                   GPIO17 [11] [12] GPIO18  ──── Verstärker BCLK
                   GPIO27 [13] [14] GND     ──── PN532 GND
                   GPIO22 [15] [16] GPIO23
                   3,3 V  [17] [18] GPIO24
LED-Ring DIN ───── GPIO10 [19] [20] GND
                   GPIO9  [21] [22] GPIO25
                   GPIO11 [23] [24] GPIO8
                   GND    [25] [26] GPIO7
                   GPIO0  [27] [28] GPIO1
Taster Play ────── GPIO5  [29] [30] GND     ──── Taster Play (2. Bein)
Taster + ───────── GPIO6  [31] [32] GPIO12
Taster − ───────── GPIO13 [33] [34] GND     ──── Taster + (2. Bein)
Verstärker LRC ─── GPIO19 [35] [36] GPIO16  ──── Verstärker SD (stumm schalten)
                   GPIO26 [37] [38] GPIO20
Taster − (2. Bein) ─ GND  [39] [40] GPIO21  ──── Verstärker DIN
```

Pins 3 und 5 (I2C) bleiben für den PiSugar frei.

## Verdrahtung Schritt für Schritt

Immer **ohne Strom** stecken. Nach jedem Bauteil einmal testen (Abschnitt „Testen“), dann das nächste anschließen.

### 1. Verstärker MAX98357A + Lautsprecher

| MAX98357A | Pi-Pin | |
|---|---|---|
| VIN | 2 (5 V) | |
| GND | 6 (GND) | |
| BCLK | 12 (GPIO18) | |
| LRC | 35 (GPIO19) | |
| DIN | 40 (GPIO21) | |
| SD | 36 (GPIO16) | Stummschaltung gegen Knacken beim Starten/Stoppen und Rauschen im Leerlauf. Ohne dieses Kabel ist der Verstärker immer an (geht auch, knackt aber) |
| GAIN | frei lassen | 9 dB |

Lautsprecher an die Schraubklemme **+ / −**. Keine der beiden Leitungen an GND legen: Der Ausgang ist gebrückt.

> **Stummschaltung über GPIO16:** Die Box-Software zieht SD zum Stummschalten auf **LOW** und gibt den Pin zum Einschalten
> frei; dann sorgt der Widerstand auf dem Board für Mono-Mix. SD nie auf HIGH treiben: Bei 3,3 V schaltet der Chip auf
> „nur linker Kanal“.

### 2. NFC-Leser PN532 (über UART)

DIP-Schalter auf dem Modul: **beide OFF** (UART, beim PN532 „HSU“).

| PN532 | Pi-Pin | |
|---|---|---|
| VCC | 1 (**3,3 V**) | Nicht 5 V: Dann kämen die Signale mit 5 V am Pi an |
| GND | 14 (GND) | |
| TXD (Stift heißt oft SDA) | 10 (GPIO15, RXD) | **über Kreuz:** TX an RX |
| RXD (Stift heißt oft SCL) | 8 (GPIO14, TXD) | |

Der Modus wird nur beim Einschalten gelesen: nach dem Umstellen der Schalter einmal den Strom trennen.
Die Antenne liegt später direkt unter der Stelle, an der der Token eingesteckt wird (max. ca. 2–3 cm Abstand).

### 3. LED-Ring WS2812 (24 LEDs)

| Ring | Pi-Pin | |
|---|---|---|
| 5V / VCC | 4 (5 V) | |
| GND | 9 (GND) | |
| DIN / DI / IN | 19 (GPIO10, SPI MOSI) | **DIN**, nicht DOUT! Am besten über 330 Ω |

- Der Ring wird über SPI angesteuert, weil GPIO18 schon vom Verstärker belegt ist.
- Strom: 24 LEDs in Vollweiß ziehen bis zu ca. 1,4 A; bei der voreingestellten Helligkeit (25 %) sind es höchstens
  ca. 0,35 A. Den Elko an 5 V/GND des Rings setzen.
- **Pegel:** Der Pi liefert 3,3 V auf der Datenleitung, der Ring erwartet eigentlich mindestens 3,5 V. Mit kurzen Kabeln
  geht es fast immer. Flackert der Ring oder zeigt falsche Farben: Pegelwandler (74AHCT125) dazwischen setzen oder den Ring
  über eine Diode (1N4001) aus 5 V speisen.
- Andere LED-Zahl: `NUM_LEDS` in [box/lauschbox/hardware.py](../box/lauschbox/hardware.py) und `N` in
  [testapp/src/components/LedRing.tsx](../testapp/src/components/LedRing.tsx).

### 4. Drei Taster

| Taster | Pi-Pin | 2. Bein an |
|---|---|---|
| Play/Pause | 29 (GPIO5) | 30 (GND) |
| Lauter | 31 (GPIO6) | 34 (GND) |
| Leiser | 33 (GPIO13) | 39 (GND) |

Kein Widerstand nötig, die Software schaltet den internen Pull-up ein. Bei 4-beinigen Tastern **zwei diagonal
gegenüberliegende Beine** nehmen.

## Testen

Erst den Pi einrichten: [docs/pi-setup.md](../docs/pi-setup.md). Dann:

| Was | Wie | Erwartung |
|---|---|---|
| Verstärker | `aplay -l` | eine Karte `MAX98357A` |
| | `sudo systemctl stop lauschbox`, dann `speaker-test -c2 -t wav -l 1`, danach `sudo systemctl start lauschbox` | „Front left“, „Front right“ aus dem Lautsprecher (beides, weil Mono-Mix). Bleibt es still: Die gestoppte Box-Software hat den Verstärker evtl. stumm gelassen; SD-Kabel für den Test kurz abziehen |
| NFC, Taster, LED-Ring, Stummschaltung | App → Einstellungen → Hardware | je Bauteil „OK“ mit Details, sonst die Fehlermeldung |
| NFC | Token einstecken | Ring blinkt orange („unbekannt“), in der App lässt er sich anlernen |
| Taster | Lauter/Leiser drücken | Ring zeigt die Lautstärke |

## Fehlersuche

| Problem | Ursache / Lösung |
|---|---|
| NFC: „Failed to detect the PN532“ | Schalter nicht beide OFF, nach dem Umstellen kein Stromausfall, TX/RX nicht über Kreuz (Pin 8/10 tauschen), serielle Schnittstelle aus (`ls -l /dev/serial0`) |
| Lautsprecher stumm | `aplay -l` zeigt keine `MAX98357A`-Karte → `dtoverlay=max98357a` fehlt in `/boot/firmware/config.txt`; sonst BCLK/LRC vertauscht |
| Lautsprecher brummt, rauscht oder knackt beim Start | SD an GPIO16 anschließen; in der App unter Einstellungen → Hardware muss der Verstärker OK zeigen |
| LED-Ring dunkel | DIN/DOUT verwechselt, SPI nicht an (`ls /dev/spidev0.0`) |
| LED-Ring flackert | Pegel (siehe oben), Elko an den Ring, `core_freq_min=400` in der config.txt |
| Nur ein Teil des Rings leuchtet | Lötstelle oder LED hinter der letzten leuchtenden LED defekt; oder `NUM_LEDS` passt nicht |
| Taster lösen dauernd aus | Bein-Paar erwischt, das intern verbunden ist → diagonale Beine nehmen |
| Blitz-Symbol / „Undervoltage“ im Log | Netzteil zu schwach (`vcgencmd get_throttled` ≠ `0x0`) |
