# Pi einrichten (Raspberry Pi Zero 2 W)

Einmal am PC und per SSH, danach geht alles in der App. Verdrahtung vorher: [hardware/aufbau.md](../hardware/aufbau.md).

## 1. SD-Karte

Raspberry Pi Imager → Gerät **Raspberry Pi Zero 2 W** → **Raspberry Pi OS Lite (64-bit)**. In den Einstellungen des Imagers:
- Hostname `lauschbox`, Benutzer und Passwort, **SSH an**
- WLAN eintragen (nur **2,4 GHz**). Ohne WLAN geht es auch: Die Box lässt sich später per Bluetooth ins WLAN bringen
  (Schritt 4), die Installation in Schritt 2 braucht aber einmal Internet.

## 2. Box-Software installieren

```
ssh <benutzer>@lauschbox.local          # oder die IP aus dem Router
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git
git clone https://github.com/constiVCH/lauschbox.git ~/lauschbox
bash ~/lauschbox/box/install.sh
sudo reboot
```

[box/install.sh](../box/install.sh) erledigt alles Weitere und kann gefahrlos erneut laufen:
- Pakete (mpv, Python, Werkzeuge), Python-Umgebung `box/.venv`
- Schnittstellen: I2C, SPI, serielle Schnittstelle für den NFC-Leser (Konsole darauf aus); in `/boot/firmware/config.txt`
  `dtoverlay=max98357a`, HDMI-Ton aus, `core_freq_min=400` (fester Takt für LED-Ring und NFC)
- go-librespot (Spotify Connect, eigene API auf `localhost:3678`) mit Konfiguration in `~/.config/go-librespot/config.yml`
  (Ausgabe direkt auf den Verstärker, kein Autoplay, Titellisten an)
- Dienste `go-librespot` und `lauschbox`, die beim Einschalten starten
- Rechte (`/etc/sudoers.d/lauschbox`): Die Box darf genau diese Befehle ohne Passwort: ihre Dienste neu starten,
  den Pi neu starten und ausschalten, sich mit einem WLAN verbinden (`nmcli … wifi connect`).
  Gruppen: `gpio`, `i2c`, `spi`, `dialout`, `bluetooth`, `systemd-journal`

## 3. In der App

Startbildschirm → IP der Box eintragen → „Mit Box verbinden“. Danach unter **Einstellungen**:
- **Spotify:** Code für spotify.com/pair anzeigen und anmelden; für die Suche einmal eine eigene Spotify-Developer-App
  hinterlegen (Schritt für Schritt erklärt in der App)
- **Hardware:** Zustand von NFC, Tastern, LED-Ring und Verstärker
- Update installieren, Box neu starten, ausschalten, Log ansehen

## 4. WLAN per Bluetooth (ohne Bildschirm und ohne SSH)

Hat die Box eine halbe Minute lang kein WLAN, wartet sie per Bluetooth auf die Einrichtung (Protokoll
[Improv Wi-Fi](https://www.improv-wifi.com/)); der LED-Ring pulsiert blau.
1. App → Startbildschirm → „Neue Box ins WLAN bringen“ → Box auswählen.
2. An der Box kurz **Play** drücken (Freigabe, der Ring leuchtet dann ruhig blau). So kann niemand in Funkreichweite
   die Box ohne Zugang zum Gerät umstellen.
3. WLAN-Name und Passwort eingeben → Die Box verbindet sich und die App öffnet sie direkt.

Das funktioniert auch beim Umzug in ein anderes WLAN. Code: [box/lauschbox/wifi_setup.py](../box/lauschbox/wifi_setup.py)
und [testapp/src/improv.ts](../testapp/src/improv.ts).

## Daten

Token, Hörstand und Einstellungen: `~/.local/share/lauschbox/lauschbox.db`; eigene Audiodateien: `~/.local/share/lauschbox/media/`;
Spotify-Anmeldung: `~/.config/go-librespot/state.json`.

## Am PC ohne Hardware

```
cd box
python -m venv .venv
.venv\Scripts\activate            # Windows; Linux/Mac: . .venv/bin/activate
pip install aiohttp zeroconf mutagen pytest
python -m lauschbox --fake        # Simulation: Token legt man in der App im Tab „Box“ per Ziehen auf
python -m pytest -q               # Tests
```

In der App dann die IP des PCs eintragen. Unter Windows muss die Firewall Port 8080 im privaten Netz erlauben:
`New-NetFirewallRule -DisplayName "Lauschbox 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private`.

## Von Hand (nur zur Fehlersuche)

```
sudo systemctl status lauschbox go-librespot
journalctl -u lauschbox -u go-librespot -f
cd ~/lauschbox/box && . .venv/bin/activate && python -m lauschbox -v    # vorher: sudo systemctl stop lauschbox
curl -s localhost:3678/status
```
