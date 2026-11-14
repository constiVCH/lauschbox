<p align="center"><img src="brand/logo.svg" width="128" alt="Lauschbox-Logo"></p>

# Lauschbox

Kinder-Audiobox auf Raspberry-Pi-Basis: Token einstecken → Hörspiel oder Musik von Spotify oder von der SD-Karte startet.
Eingerichtet wird sie mit einer eigenen App (Android, Expo). Die Box spielt komplett ohne App, eigene Dateien auch ohne WLAN.

## Struktur

| Ordner      | Inhalt |
|-------------|--------|
| `box/`      | Software auf dem Pi: box-daemon `box/lauschbox/` (Python, `python -m lauschbox`), Tests `box/tests/`, Einrichtung `box/install.sh` |
| `testapp/`  | **Die App** (Expo) ([testapp/README.md](testapp/README.md)); der Ordner heißt aus historischen Gründen so |
| `brand/`    | Logo, Piktogramm (einfarbig, für die Box) und das Skript, das daraus alle App-Icons erzeugt |
| `hardware/` | [Teileliste und Pinbelegung](hardware/teileliste.md), [Aufbau und Test](hardware/aufbau.md) |
| `docs/`     | [Pi einrichten](docs/pi-setup.md), [Konzept und API](docs/konzept.md) |

## Stand

- **Hardware:** Raspberry Pi Zero 2 W, Verstärker MAX98357A, NFC-Leser PN532 (UART), LED-Ring WS2812 (24 LEDs), 3 Taster.
  Strom vorerst per Netzteil; Akku (PiSugar 3 Air + 5000 mAh) folgt.
- **Box-Software:** Token → Wiedergabe mit Hörstand, Taster, LED-Ring (Fortschritt, Lautstärke, Ruhemodus), Kindermodus
  (Maximallautstärke, Schlafenszeit, kein Autoplay, Tastensperre), Sleep-Timer, eigene Audiodateien (mpv), WLAN-Einrichtung
  per Bluetooth, Verwaltung ohne Terminal (Update, Neustart, Log).
- **Quellen:** Spotify (go-librespot, Suche über die Spotify Web API) und eigene Audiodateien auf der SD-Karte, die offline spielen.
- **App:** Token am Handy oder an der Box anlernen, Inhalte suchen oder hochladen, Wiedergabe, Kindermodus, Einstellungen.
  Eltern-PIN, auf Wunsch abschaltbar.
- **Offen:** Akku (Ladestand, sauberes Ausschalten per Taster, Uhrzeit ohne Netz über die RTC), Gehäuse.

## Schnellstart

1. Verdrahten: [hardware/aufbau.md](hardware/aufbau.md)
2. Pi einrichten: [docs/pi-setup.md](docs/pi-setup.md) (Raspberry Pi OS Lite, dann `box/install.sh`)
3. App installieren (APK aus dem EAS-Build) und mit der Box verbinden
