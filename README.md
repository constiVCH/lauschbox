<p align="center"><img src="brand/logo.svg" width="128" alt="Lauschkiste-Logo"></p>

# Lauschkiste

Kinder-Audiobox auf Raspberry-Pi-Basis: NFC-Token auflegen → Hörspiel/Musik von Spotify oder von der SD-Karte startet.
Konfiguration über eine eigene App (Flutter, iOS + Android). Die Box spielt komplett ohne App, lokale Inhalte auch ohne WLAN.

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
- **Quellen:** Spotify (Wiedergabe über go-librespot und dessen lokale API, Suche über die Spotify Web API) und lokale Audiodateien auf der SD-Karte (Wiedergabe über mpv, funktioniert offline). Audible vorerst nicht.
- **Offline:** Lokale Medien, Kindermodus und Akku funktionieren ohne WLAN; Uhrzeit kommt aus der RTC des PiSugar. Spotify braucht immer Internet.
- **Token:** Zuordnung UID → Medium liegt auf der Box, nicht auf dem Tag.
- **App:** native Flutter-App; Box-Erkennung per mDNS, WLAN-Ersteinrichtung per Bluetooth LE.

Details: [docs/konzept.md](docs/konzept.md), Hardware: [hardware/teileliste.md](hardware/teileliste.md).

## Phasen

1. **Spike Spotify** – go-librespot auf dem Pi, Wiedergabe über die lokale API starten → [docs/pi-setup.md](docs/pi-setup.md), `box/spikes/golibrespot_spike.py`
2. **Hardware-Prototyp** – NFC, Taster, LEDs, Akku einzeln testen (`box/spikes/*_test.py`)
3. **box-daemon** – Token → Wiedergabe, Taster, Lautstärke, Fortschritt, LED-Zustände, Kindermodus
4. **API + App** – Verbinden, Token anlernen/ändern, Einstellungen, Akkuanzeige
5. **Lokale Medien & Offline** – Spike mpv auf dem Zero W (CPU, ALSA-Teilung mit go-librespot), LocalPlayer, Upload aus der App, Booten ohne Netz, RTC-Uhrzeit; optional Hotspot-Modus
6. **Robustheit** – Autostart, sauberes Herunterfahren bei leerem Akku, WLAN-Setup per BLE, Updates
7. **Gehäuse & Token** (3D-Druck), parallel möglich
