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
| SD | 36 (GPIO16) | Stummschaltung gegen das Knacken beim Starten/Stoppen und gegen Rauschen im Leerlauf. Ohne dieses Kabel ist der Verstärker immer an (geht auch, knackt aber) |
| GAIN | frei lassen | 9 dB, reicht für den Anfang |

Lautsprecher an die Schraubklemme **+ / −** des Verstärkers. Keine der beiden Lautsprecherleitungen an GND legen: Der Ausgang
ist gebrückt, das würde den Verstärker beschädigen.

> **Stummschaltung über GPIO16:** Die Box-Software zieht SD zum Stummschalten auf **LOW** und gibt den Pin zum Einschalten
> frei (Eingang, hochohmig); dann sorgt der Widerstand auf dem Board für Mono-Mix. SD nie auf HIGH treiben: Bei 3,3 V
> schaltet der Chip auf „nur linker Kanal“. Beim Abspielen schaltet die Box den Verstärker erst kurz nach dem Start ein
> und beim Pausieren vor dem Stopp aus: Das Knacken des Verstärkers passiert so stumm.

### 2. NFC-Leser PN532 (über UART)

DIP-Schalter auf dem Modul: **beide OFF**. Das ist der UART-Modus (beim PN532 „HSU“). Im Testaufbau hat das Modul über I2C
nicht geantwortet, über UART sofort; UART ist auf dem Pi ohnehin robuster.

| PN532 (4-poliger Anschluss) | Pi-Pin | |
|---|---|---|
| VCC | 1 (**3,3 V**) | Nicht 5 V: Dann kämen die Signale mit 5 V am Pi an |
| GND | 14 (GND) | |
| TXD (Stift heißt oft auch SDA) | 10 (GPIO15, RXD) | **über Kreuz:** TX an RX |
| RXD (Stift heißt oft auch SCL) | 8 (GPIO14, TXD) | |
| IRQ, RSTO | frei | werden nicht gebraucht |

Auf dem Pi die serielle Schnittstelle einschalten (siehe „Pi einrichten“). Der Modus wird nur beim Einschalten gelesen:
nach dem Umstellen der Schalter einmal den Stecker ziehen.

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
2. Serielle Schnittstelle für den NFC-Leser: `sudo raspi-config nonint do_serial_hw 0` und `sudo raspi-config nonint do_serial_cons 1`.
3. `/boot/firmware/config.txt` wie in pi-setup.md, Schritt 2. Zusätzlich die vorhandene Zeile `dtoverlay=vc4-kms-v3d` zu
   `dtoverlay=vc4-kms-v3d,noaudio` ändern. Sonst gibt es neben dem Verstärker noch ein HDMI-Audiogerät, und `default` zeigt
   womöglich dorthin.
4. go-librespot: Das Archiv `armv6_rpi` läuft auch auf dem 3B+ (32-bit-System). So bleibt alles gleich, wenn die Karte auf den Zero umzieht.

**Kann die SD-Karte später in den Zero?** Ja, das 32-bit-System läuft auf beiden. Nur die Python-Umgebung (`box/.venv`)
musst du auf dem Zero neu anlegen: pip lädt auf dem 3B+ Pakete für ARMv7, die auf dem Zero (ARMv6) abstürzen.

## Testen

Auf dem Pi, im Repo-Ordner:

```
sudo apt install -y python3-venv python3-dev i2c-tools git python3-gpiozero python3-lgpio
cd box
# gpiozero und lgpio kommen als Systempakete; die Umgebung darf sie mitbenutzen (--system-site-packages).
# Per pip müsste lgpio auf dem Pi erst gebaut werden (braucht swig) und scheitert sonst.
python3 -m venv --system-site-packages .venv && . .venv/bin/activate
pip install -r requirements.txt
```

| Schritt | Befehl | Erwartung |
|---|---|---|
| Lautsprecher | `speaker-test -c2 -t wav -l 1` | „Front left“, „Front right“ aus dem Lautsprecher (beides, weil Mono-Mix) |
| NFC | `python spikes/nfc_test.py` | Firmware-Version, dann UID beim Auflegen, „entfernt“ beim Abnehmen (über I2C: `--i2c`) |
| LEDs | `python spikes/leds_test.py` | Rot, Grün, Blau, dann füllt sich der Ring grün |
| Taster | `python spikes/buttons_test.py` | `play_pause: kurz`, `lauter: lang` usw. |
| Alles mit App | `python spikes/hwtest_server.py` | Server auf Port 8080; in der Test-App „Testaufbau“ die IP des Pi eintragen |

Die IP des Pi zeigt `hostname -I`. Die Test-App ([testapp/](../testapp/)) verbindet sich per IP, weil Android
`lauschbox.local` oft nicht auflöst.

## Fehlersuche

| Problem | Ursache / Lösung |
|---|---|
| NFC: „Failed to detect the PN532“ | Schalter nicht beide OFF, nach dem Umstellen kein echter Stromausfall, TX/RX nicht über Kreuz (Pin 8/10 tauschen), serielle Schnittstelle aus (`ls -l /dev/serial0`) |
| NFC über I2C: `i2cdetect` zeigt nichts | Schalter 1 ON/2 OFF, SDA/SCL tauschen, Takt senken (`dtparam=i2c_arm_baudrate=10000`). Bei manchen Modulen geht I2C trotzdem nicht: dann UART |
| Lautsprecher stumm | `aplay -l` zeigt keine „MAX98357A“-Karte → Overlay fehlt; sonst BCLK/LRC vertauscht |
| Lautsprecher brummt/rauscht oder knackt beim Start | SD an GPIO16 anschließen (siehe oben); in der App unter Einstellungen → Hardware muss „Verstärker stumm schalten“ OK zeigen |
| LED-Ring dunkel | DIN/DOUT verwechselt, SPI nicht an (`dtparam=spi=on`), `ls /dev/spidev0.0` prüfen |
| LED-Ring flackert | Pegel (siehe oben), Elko an den Ring, `core_freq_min=400` gesetzt? |
| Taster lösen dauernd aus | Bein-Paar erwischt, das intern verbunden ist → diagonale Beine nehmen |
| Blitz-Symbol / „Undervoltage“ im Log | Netzteil zu schwach (`vcgencmd get_throttled` ≠ `0x0`) |
