<p align="center"><img src="brand/logo.svg" width="128" alt="Lauschring-Logo"></p>

# Lauschring

Kinder-Audiobox auf Raspberry-Pi-Basis: NFC-Token auflegen → Hörspiel/Musik von Spotify startet.
Konfiguration über eine eigene App (Flutter, iOS + Android). Die Box spielt komplett ohne App.

## Struktur

| Ordner      | Inhalt |
|-------------|--------|
| `box/`      | Software auf dem Pi: `box-daemon` (Python) + Hardware-Testskripte (`box/spikes/`) |
| `app/`      | Flutter-App, aktuell mit Demo-Box zum Ausprobieren ([app/README.md](app/README.md)) |
| `brand/`    | Logo (SVG/PNG) und Skript, das daraus alle App-Icons erzeugt |
| `hardware/` | Teileliste, Pinbelegung, später Schaltplan und Gehäuse (STL) |
| `docs/`     | Konzept, API-Entwurf, Setup-Anleitungen |

## Entscheidungen

- **Hardware:** Raspberry Pi Zero W (32-bit; Zero 2 W ist kompatibel), I2S-Verstärker, PN532 (I2C), WS2812-LED-Ring, 3 Taster, PiSugar-3-Akku (USB-C, Ladestand per I2C).
- **Quellen:** Spotify (Wiedergabe über go-librespot und dessen lokale API, Suche über die Spotify Web API). Lokale Dateien optional später. Audible vorerst nicht.
- **Token:** Zuordnung UID → Medium liegt auf der Box, nicht auf dem Tag.
- **App:** native Flutter-App; Box-Erkennung per mDNS, WLAN-Ersteinrichtung per Bluetooth LE.

Details: [docs/konzept.md](docs/konzept.md), Hardware: [hardware/teileliste.md](hardware/teileliste.md).

## Phasen

1. **Spike Spotify** – go-librespot auf dem Pi, Wiedergabe über die lokale API starten → [docs/pi-setup.md](docs/pi-setup.md), `box/spikes/golibrespot_spike.py`
2. **Hardware-Prototyp** – NFC, Taster, LEDs, Akku einzeln testen (`box/spikes/*_test.py`)
3. **box-daemon** – Token → Wiedergabe, Taster, Lautstärke, Fortschritt, LED-Zustände, Kindermodus
4. **API + App** – Verbinden, Token anlernen/ändern, Einstellungen, Akkuanzeige
5. **Robustheit** – Autostart, sauberes Herunterfahren bei leerem Akku, WLAN-Setup per BLE, Updates
6. **Gehäuse & Token** (3D-Druck), parallel möglich
