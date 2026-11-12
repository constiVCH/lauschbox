# Lauschbox auf dem Banana Pi M2 Zero

Der **Banana Pi BPI-M2 Zero** (Allwinner H3, 4 Kerne, 32 bit, 512 MB RAM, WLAN) ersetzt den Raspberry Pi Zero.
Er hat dieselbe Bauform und eine Stiftleiste in derselben Belegung, braucht aber ein anderes Betriebssystem (**Armbian**).
Die Box-Software erkennt das Board selbst (`box/lauschbox/hardware.py`, `PINS`).

> Stand: Software und Einrichtung sind vorbereitet, aber noch nicht auf einem echten M2 Zero getestet.
> Am unsichersten ist der Verstärker (I2S-Overlay). Deshalb in der Reihenfolge unten vorgehen und nach jedem Schritt testen.

## Pinbelegung

Gegenüber dem Raspberry Pi wandern **nur zwei Kabel**: BCLK und LRC des Verstärkers. Beim H3 liegt I2S auf PA18/PA19
(Pins 27/28) statt auf den Pins 12/35 des Pi. Alles andere bleibt, wo es ist.

| Bauteil | Anschluss | Pin | Banana Pi (H3) | Raspberry Pi | |
|---|---|---|---|---|---|
| Verstärker MAX98357A | VIN | 2 | 5 V | 5 V | |
| | GND | 6 | GND | GND | |
| | **BCLK** | **27** | PA19 (I2S0-CLK) | Pin 12 | **anders als beim Pi** |
| | **LRC** | **28** | PA18 (I2S0-LRCK) | Pin 35 | **anders als beim Pi** |
| | DIN | 40 | PA20 (I2S0-DOUT) | Pin 40 | |
| | SD (stumm) | 36 | PL4 | Pin 36 (GPIO16) | Stumm = LOW, an = Pin frei, nie HIGH |
| NFC PN532 (UART) | VCC | 1 | 3,3 V | 3,3 V | Nicht 5 V |
| | GND | 14 | GND | GND | |
| | RXD (Stift heißt oft SCL) | 8 | PA13 (UART3-TX) | Pin 8 | über Kreuz: TX an RX |
| | TXD (Stift heißt oft SDA) | 10 | PA14 (UART3-RX) | Pin 10 | `/dev/ttyS3` |
| LED-Ring WS2812 | 5V | 4 | 5 V | 5 V | |
| | GND | 9 | GND | GND | |
| | DIN | 19 | PC0 (SPI0-MOSI) | Pin 19 | `/dev/spidev0.0` |
| Taster Play/Pause | | 29 (+ GND 30) | PA7 | Pin 29 | gegen GND, interner Pull-up |
| Taster Lauter | | 31 (+ GND 34) | PA8 | Pin 31 | |
| Taster Leiser | | 33 (+ GND 39) | PA9 | Pin 33 | |
| (später) PiSugar | SDA / SCL | 3 / 5 | PA12 / PA11 (TWI0) | Pin 3 / 5 | Ob der PiSugar am M2 Zero passt, ist offen |

Quelle der Belegung: [Banana Pi Wiki, BPI-M2 ZERO](https://wiki.banana-pi.org/Banana_Pi_BPI-M2_ZERO) (40-Pin-Tabelle CON2).

**Pin 27/28 sind beim M2 Zero eigentlich I2C1 (TWI1).** Das Overlay schaltet sie auf I2S um, deshalb darf `i2c1` nicht in
den Overlays stehen. SPI1 und UART3 teilen sich die Pins 8/10: Der LED-Ring hängt deshalb an **SPI0** (Pin 19), nicht an SPI1.

## 1. Armbian auf die SD-Karte

1. Auf [armbian.com](https://www.armbian.com/) das Board **Banana Pi M2 Zero** suchen (`bananapim2zero`) und das
   **Debian (Bookworm) Minimal/CLI**-Image laden (`.img.xz`).
2. Mit dem Raspberry Pi Imager („Eigenes Image verwenden“) oder balenaEtcher auf die Karte schreiben.
   Die Einstellungen des Imagers (WLAN, Benutzer) wirken bei Armbian nicht.
3. Erster Start: Der M2 Zero hat **kein LAN**. Für die Ersteinrichtung brauchst du einmal Bildschirm (Mini-HDMI) und Tastatur
   (USB-OTG-Adapter am Micro-USB-Datenanschluss), alternativ einen USB-Seriell-Adapter an CON3 (115200 Baud).
   - Anmelden als `root`, Passwort `1234`. Armbian fragt dann nach einem neuen root-Passwort und legt einen Benutzer an.
   - WLAN einrichten: `sudo nmtui` → „Verbindung aktivieren“ → dein **2,4-GHz**-WLAN.
   - Hostname: `sudo hostnamectl set-hostname lauschbox`
   - IP merken: `hostname -I`. Ab jetzt geht alles per SSH: `ssh <benutzer>@<IP>`.

## 2. Lauschbox einrichten

```
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git
git clone https://github.com/constiVCH/lauschbox.git ~/lauschbox
bash ~/lauschbox/box/install.sh
sudo reboot
```

`install.sh` erkennt Armbian an `/boot/armbianEnv.txt` und erledigt dort zusätzlich:
- Overlays `spi-spidev uart3 i2c0` mit `param_spidev_spi_bus=0` (SPI0) und `param_spidev_max_freq=10000000`
- das Verstärker-Overlay [box/overlays/lauschbox-max98357a.dts](../box/overlays/lauschbox-max98357a.dts) über
  `armbian-add-overlay` (landet als `user_overlays=lauschbox-max98357a` in `/boot/armbianEnv.txt`)
- Gruppen `gpio`, `spi`, `i2c` plus udev-Regel, damit die Box-Software ohne root an GPIO und SPI darf
- go-librespot mit `audio_device: plughw:CARD=MAX98357A,DEV=0`, die Dienste und die Rechte für die App wie beim Pi

Danach geht alles Weitere (Spotify, Update, Neustart, Log) wie gewohnt aus der App.

## 3. Testen, Schritt für Schritt

| Schritt | Befehl | Erwartung |
|---|---|---|
| Overlays aktiv | `cat /boot/armbianEnv.txt` | `overlays=… spi-spidev uart3 i2c0` und `user_overlays=lauschbox-max98357a` |
| Verstärker | `aplay -l` | eine Karte `MAX98357A` |
| | `sudo systemctl stop lauschbox`, dann `speaker-test -c2 -t wav -l 1` | „Front left“, „Front right“. Bleibt es still: Die gestoppte Box-Software lässt den Verstärker womöglich stumm (SD auf LOW). Für den Test das SD-Kabel (Pin 36) kurz abziehen |
| SPI | `ls /dev/spidev*` | `/dev/spidev0.0` |
| UART | `ls -l /dev/ttyS3` | vorhanden, Gruppe `dialout` |
| GPIO | `gpiodetect` (Paket `gpiod`) | `1c20800.pinctrl` und `1f02c00.pinctrl` |
| Box-Software | App → Einstellungen → Hardware | NFC, Taster (PA7, PA8, PA9), LEDs (SPI0, Pin 19, PC0), Verstärker (PL4) jeweils OK |

## Fehlersuche

| Problem | Ursache / Lösung |
|---|---|
| `aplay -l` zeigt keine `MAX98357A` | `dmesg | grep -i -E "i2s|max98357|sound"` ansehen. Fehlt `i2s0_pins` im Kernel, lässt sich das Overlay nicht anwenden (Meldung beim Booten). Dann bitte die Ausgabe schicken |
| Ton nur auf einem Kanal oder verzerrt | BCLK/LRC vertauscht (Pin 27/28) |
| `/dev/spidev0.0` fehlt | `param_spidev_spi_bus=0` in `/boot/armbianEnv.txt`? Bei manchen Armbian-Versionen ist SPI am M2 Zero kaputt (Foren-Berichte), dann ein älteres Image probieren |
| LED-Ring flackert oder zeigt falsche Farben | Pegel 3,3 V → 5 V (siehe [testaufbau-pi3b.md](../hardware/testaufbau-pi3b.md), Abschnitt LED-Ring) |
| NFC: „Failed to detect the PN532“ | TX/RX tauschen (Pin 8/10), DIP-Schalter beide OFF, `uart3` in den Overlays? |
| Taster/Verstärker: „GPIO-Chip … nicht gefunden“ oder „Permission denied“ | `gpiodetect` prüfen; Benutzer in Gruppe `gpio` (`groups`), nach `install.sh` einmal neu anmelden bzw. neu starten |

## Zurück zum Raspberry Pi

Die Software läuft weiter auch auf dem Raspberry Pi: Sie erkennt das Board selbst. Beim Pi gilt die Pinbelegung aus
[hardware/teileliste.md](../hardware/teileliste.md) (BCLK Pin 12, LRC Pin 35) und die Einrichtung aus [pi-setup.md](pi-setup.md).
