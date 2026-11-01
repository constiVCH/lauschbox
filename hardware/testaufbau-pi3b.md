# Testaufbau mit dem Raspberry Pi 3B+

Bis der Zero W da ist, läuft der Testaufbau auf einem **Pi 3B+**. Die 40-polige Stiftleiste ist bei beiden gleich belegt.
Deshalb gilt dieselbe Pinbelegung wie in der [Teileliste](teileliste.md), und später zieht jedes Kabel 1:1 auf den Zero um.

Getestet werden: Lautsprecher (MAX98357A), NFC (PN532), LED-Ring (WS2812), 3 Taster.
**Der PiSugar bleibt vorerst weg**: Er ist für die Bauform des Zero gemacht (Federkontakte von unten) und passt nicht an den 3B+.
Den Akku testen wir, sobald der Zero da ist. Bis dahin versorgt das Netzteil den Pi.

## Was du brauchst

- Pi 3B+ mit **Netzteil 5,1 V / 2,5 A** (Micro-USB). Ein Handy-Ladegerät reicht oft nicht, dann gibt es Unterspannungs-Blitze und
  Aussetzer beim NFC-Leser.
- microSD-Karte (16–32 GB)
- Steckbrett (Breadboard) und Dupont-Kabel (Buchse–Stecker für die Stiftleiste, Stecker–Stecker auf dem Brett)
- Optional für den LED-Ring: 330-Ω-Widerstand (Datenleitung), 470–1000 µF Elko (5 V/GND am Ring)
- Lötkolben: Die Breakout-Boards (MAX98357A, PN532, Ring) haben meist lose Stiftleisten bzw. Lötpads

## Stiftleiste: wer wohin

Draufsicht auf den Pi, USB-/LAN-Buchsen zeigen nach **unten**. Die Stiftleiste liegt dann am rechten Rand,
Pin 1 ist oben in der inneren Reihe (eckiges Lötpad). Links stehen die ungeraden, rechts die geraden Pins.

```
PN532 VCC ──────── 3,3 V  [ 1] [ 2] 5 V     ──── Verstärker VIN
PN532 SDA ──────── GPIO2  [ 3] [ 4] 5 V     ──── LED-Ring 5V
PN532 SCL ──────── GPIO3  [ 5] [ 6] GND     ──── Verstärker GND
                   GPIO4  [ 7] [ 8] GPIO14
LED-Ring GND ───── GND    [ 9] [10] GPIO15
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
Verstärker LRC ─── GPIO19 [35] [36] GPIO16       (später: Verstärker SD/Mute)
                   GPIO26 [37] [38] GPIO20
Taster − (2. Bein) ─ GND  [39] [40] GPIO21  ──── Verstärker DIN
```

## Verdrahtung Schritt für Schritt

Immer **bei ausgestecktem Netzteil** stecken. Nach jedem Bauteil einmal testen (Abschnitt „Testen“), dann das nächste anschließen.
So weißt du bei einem Fehler sofort, woran es liegt.

### 1. Verstärker MAX98357A + Lautsprecher

| MAX98357A | Pi-Pin | |
|---|---|---|
| VIN | 2 (5 V) | |
| GND | 6 (GND) | |
| BCLK | 12 (GPIO18) | |
| LRC | 35 (GPIO19) | |
| DIN | 40 (GPIO21) | |
| SD | **frei lassen** | Dann ist der Verstärker immer an und mischt links + rechts (Mono) |
| GAIN | frei lassen | 9 dB, reicht für den Anfang |

Lautsprecher an die Schraubklemme **+ / −** des Verstärkers. Keine der beiden Lautsprecherleitungen an GND legen: Der Ausgang
ist gebrückt, das würde den Verstärker beschädigen.

> **Später (Mute über GPIO16):** SD nie direkt mit einem GPIO auf HIGH treiben. Bei 3,3 V schaltet der Chip auf „nur linker Kanal“.
> Richtig ist: GPIO16 an SD, zum Stummschalten als Ausgang **LOW**, zum Einschalten auf **Eingang** (hochohmig) zurückschalten.
> Dann sorgt der Widerstand auf dem Board wieder für Mono-Mix.

### 2. NFC-Leser PN532

Zuerst die DIP-Schalter auf dem Modul auf **I2C** stellen: **SEL0 = ON (1), SEL1 = OFF (0)**. Das gilt für das verbreitete rote
Elechouse-V3-Modul. Bei anderen Modulen steht die Tabelle meist auf der Platine.

| PN532 | Pi-Pin | |
|---|---|---|
| VCC | 1 (**3,3 V**) | Nicht 5 V: Die Pull-ups auf dem Modul hängen an VCC und würden 5 V auf die I2C-Leitungen legen |
| GND | 14 (GND) | |
| SDA | 3 (GPIO2) | |
| SCL | 5 (GPIO3) | |
| IRQ, RSTO | frei | werden nicht gebraucht |

Die Antenne ist die Leiterschleife auf dem Modul. Später liegt sie direkt unter der Mulde im Deckel, max. ca. 2–3 cm Abstand zum Token.

### 3. LED-Ring WS2812 (12 LEDs)

| Ring | Pi-Pin | |
|---|---|---|
| 5V / VCC | 4 (5 V) | |
| GND | 9 (GND) | |
| DIN / DI / IN | 19 (GPIO10, SPI MOSI) | **DIN**, nicht DOUT! Am besten über 330 Ω |

- Der Ring wird über SPI angesteuert, weil GPIO18 schon vom Verstärker belegt ist.
- Strom: 12 LEDs in Vollweiß ziehen bis zu ca. 0,7 A. Die Testskripte begrenzen die Helligkeit auf 20 %, das sind unter 150 mA.
  Das schafft der 5-V-Pin locker.
- **Pegel:** Der Pi liefert 3,3 V auf der Datenleitung, der Ring erwartet bei 5 V eigentlich mindestens 3,5 V. Mit kurzen Kabeln
  geht es fast immer. Flackert der Ring oder zeigt falsche Farben: einen Pegelwandler (74AHCT125) dazwischen setzen oder den Ring
  über eine Diode (1N4001) aus 5 V speisen. Die ca. 4,3 V danach reichen dann für das 3,3-V-Signal.

### 4. Drei Taster

| Taster | Pi-Pin | 2. Bein an |
|---|---|---|
| Play/Pause | 29 (GPIO5) | 30 (GND) |
| Lauter | 31 (GPIO6) | 34 (GND) |
| Leiser | 33 (GPIO13) | 39 (GND) |

Kein Widerstand nötig: Der Pi schaltet seinen internen Pull-up ein. 12-mm-Taster haben oft 4 Beine, von denen je zwei intern
verbunden sind. Nimm **zwei diagonal gegenüberliegende Beine**, dann passt es sicher.

## Pi einrichten

Wie in [docs/pi-setup.md](../docs/pi-setup.md), mit diesen Abweichungen:

1. **Imager:** Gerät „Raspberry Pi 3“ → **Raspberry Pi OS Lite (32-bit)**. Hostname `lauschbox`, SSH an, WLAN + Benutzer eintragen.
   Nimm ein **2,4-GHz-WLAN**: Der 3B+ kann auch 5 GHz, der Zero W später nicht.
2. `/boot/firmware/config.txt` wie in pi-setup.md, Schritt 2. Zusätzlich die vorhandene Zeile `dtoverlay=vc4-kms-v3d` zu
   `dtoverlay=vc4-kms-v3d,noaudio` ändern. Sonst gibt es neben dem Verstärker noch ein HDMI-Audiogerät, und `default` zeigt
   womöglich dorthin.
3. go-librespot: Das Archiv `armv6_rpi` läuft auch auf dem 3B+ (32-bit-System). So bleibt alles gleich, wenn die Karte auf den Zero umzieht.

**Kann die SD-Karte später in den Zero?** Ja, das 32-bit-System läuft auf beiden. Nur die Python-Umgebung (`box/.venv`)
musst du auf dem Zero neu anlegen: pip lädt auf dem 3B+ Pakete für ARMv7, die auf dem Zero (ARMv6) abstürzen.

## Testen

Auf dem Pi, im Repo-Ordner:

```
sudo apt install -y python3-venv python3-dev i2c-tools git
cd box
python3 -m venv .venv && . .venv/bin/activate
pip install adafruit-circuitpython-pn532 adafruit-circuitpython-neopixel-spi gpiozero lgpio aiohttp
```

| Schritt | Befehl | Erwartung |
|---|---|---|
| Lautsprecher | `speaker-test -c2 -t wav -l 1` | „Front left“, „Front right“ aus dem Lautsprecher (beides, weil Mono-Mix) |
| I2C | `i2cdetect -y 1` | `24` erscheint in der Tabelle (PN532) |
| NFC | `python spikes/nfc_test.py` | Firmware-Version, dann UID beim Auflegen, „entfernt“ beim Abnehmen |
| LEDs | `python spikes/leds_test.py` | Rot, Grün, Blau, dann füllt sich der Ring grün |
| Taster | `python spikes/buttons_test.py` | `play_pause: kurz`, `lauter: lang` usw. |
| Alles mit App | `python spikes/hwtest_server.py` | Server auf Port 8080; in der Test-App „Testaufbau“ die IP des Pi eintragen |

Die IP des Pi zeigt `hostname -I`. Die Test-App ([testapp/](../testapp/)) verbindet sich per IP, weil Android
`lauschbox.local` oft nicht auflöst.

## Fehlersuche

| Problem | Ursache / Lösung |
|---|---|
| `i2cdetect` zeigt nichts | DIP-Schalter falsch, SDA/SCL vertauscht, I2C nicht aktiviert (`dtparam=i2c_arm=on`) |
| PN532 meldet sich nur manchmal | I2C-Takt senken: `dtparam=i2c_arm_baudrate=50000` in config.txt; Netzteil prüfen |
| Lautsprecher stumm | `aplay -l` zeigt keine „MAX98357A“-Karte → Overlay fehlt; sonst BCLK/LRC vertauscht |
| Lautsprecher brummt/rauscht im Leerlauf | normal ohne Mute; später über GPIO16 lösen (siehe oben) |
| LED-Ring dunkel | DIN/DOUT verwechselt, SPI nicht an (`dtparam=spi=on`), `ls /dev/spidev0.0` prüfen |
| LED-Ring flackert | Pegel (siehe oben), Elko an den Ring, `core_freq_min=400` gesetzt? |
| Taster lösen dauernd aus | Bein-Paar erwischt, das intern verbunden ist → diagonale Beine nehmen |
| Blitz-Symbol / „Undervoltage“ im Log | Netzteil zu schwach (`vcgencmd get_throttled` ≠ `0x0`) |
