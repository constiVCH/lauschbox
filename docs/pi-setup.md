# Pi-Setup (Phase 1/2) – Raspberry Pi Zero W

> Gilt für den **Pi Zero W** (ARMv6, nur 32-bit). Mit einem Zero 2 W geht alles genauso, nur in Schritt 1 das
> 64-bit-Image und in Schritt 3 das `arm64`-Archiv nehmen.
> Für den Testaufbau mit einem **Pi 3B+** gelten die Abweichungen in [hardware/testaufbau-pi3b.md](../hardware/testaufbau-pi3b.md).

## 1. Grundsystem
- Raspberry Pi Imager → Gerät „Raspberry Pi Zero“ → **Raspberry Pi OS Lite (32-bit)**, Hostname `lauschbox`,
  SSH an, WLAN + Benutzer eintragen. (Der Zero W kann nur 2,4-GHz-WLAN.)
- `ssh <user>@lauschbox.local`, dann `sudo apt update && sudo apt full-upgrade -y`
  Das dauert auf dem Zero W gern 20–40 Minuten. Am besten am Netzteil machen, nicht am Akku.
- Optional, spart RAM und Bootzeit: `sudo systemctl disable --now ModemManager 2>/dev/null; sudo apt purge -y triggerhappy`

## 2. Audio (MAX98357A) + Schnittstellen
In `/boot/firmware/config.txt`:
```
dtparam=audio=off
dtoverlay=max98357a
dtparam=i2c_arm=on
dtparam=spi=on
# Konstanter SPI-Takt für den WS2812-Ring (sonst kann er flackern, wenn der Kerntakt schwankt)
core_freq_min=400
```
Für den NFC-Leser (über UART) außerdem:
```
sudo raspi-config nonint do_serial_hw 0     # serielle Schnittstelle an
sudo raspi-config nonint do_serial_cons 1   # Konsole darauf aus
```
Reboot, dann testen: `aplay -l` und `speaker-test -c2 -t wav`

## 3. Spotify-Connect: go-librespot
raspotify unterstützt den Zero W (ARMv6) nicht. Deshalb nehmen wir **go-librespot**: ein einzelnes Binary mit
eigener lokaler HTTP-API (URI abspielen, Lautstärke, Status, WebSocket-Events).

**Installieren** (Version auf https://github.com/devgianlu/go-librespot/releases prüfen; getestet ist das Setup mit v0.10.x):
```
VER=v0.10.5
cd /tmp
curl -LO https://github.com/devgianlu/go-librespot/releases/download/$VER/go-librespot_linux_armv6_rpi.tar.gz
tar xzf go-librespot_linux_armv6_rpi.tar.gz
sudo install -m 755 go-librespot /usr/local/bin/
ldd /usr/local/bin/go-librespot | grep "not found"   # leer = alles da
```
Wichtig ist das Archiv `armv6_rpi`: Das generische `armv6`-Archiv läuft auf Pi 1/Zero nicht.
Meldet `ldd` fehlende Bibliotheken, die passenden Pakete nachinstallieren (`apt search libvorbis`, `libogg`, `libflac`,
`libmpg123`, `libasound2`).

**Konfiguration** `~/.config/go-librespot/config.yml`:
```yaml
device_name: Lauschbox
device_type: speaker
audio_device: default
bitrate: 160
initial_volume: 40
volume_steps: 100
disable_autoplay: true        # Kindermodus: nach dem Album keine Vorschläge
metadata:
  enabled: true               # Titellisten für den Gesamtfortschritt (LED-Ring, App); ältere Versionen ignorieren das
zeroconf_enabled: false
credentials:
  type: device_auth           # Login per Code auf spotify.com/pair, ohne Browser auf dem Pi
server:
  enabled: true
  address: localhost          # nur der box-daemon spricht mit go-librespot
  port: 3678
```

**Einmalig anmelden:**
```
go-librespot
```
Im Log erscheinen ein Link und ein Code. Auf dem Handy spotify.com/pair öffnen, den Code eingeben und bestätigen.
Die Zugangsdaten landen in `~/.config/go-librespot/state.json`. Danach mit Strg+C beenden.

**Als Dienst** `/etc/systemd/system/go-librespot.service` (`<user>` ersetzen):
```
[Unit]
Description=go-librespot
Wants=network-online.target
After=network-online.target sound.target

[Service]
User=<user>
ExecStart=/usr/local/bin/go-librespot
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```
```
sudo systemctl daemon-reload && sudo systemctl enable --now go-librespot
curl -s localhost:3678/status
```

## 4. Spotify-Developer-App (für die Suche in der App)
Wird in der App eingerichtet: Tab „Box“ → Spotify → „Einrichten“. Dort steht Schritt für Schritt, was zu tun ist
(App anlegen, Client-ID und Client-Secret einfügen). Ohne sie gehen „Meine“ und Links trotzdem.

Die alten Schritte unten sind nur noch für den Spike `spotify_spike.py` nötig:
Zum Abspielen reicht go-librespot. Die Web API brauchen wir nur für die Suche beim Anlernen von Token.
1. https://developer.spotify.com/dashboard → App anlegen, „Web API“ auswählen.
2. Redirect URI: `http://127.0.0.1:8888/callback` (Spotify akzeptiert nur Loopback-IP, nicht `localhost`).
3. Client ID notieren. Der eigene Account muss Premium haben.

## 5. Spikes ausführen
**a) Abspielen über go-librespot** (auf dem Pi, ohne Web API):
```
cd box
sudo apt install -y python3-venv python3-gpiozero python3-lgpio
python3 -m venv --system-site-packages .venv && . .venv/bin/activate
pip install requests
python spikes/golibrespot_spike.py spotify:album:<ID>
python spikes/golibrespot_spike.py spotify:album:<ID> --position 90000   # ab 1:30 im ersten Titel
```
Erfolg = Hörspiel läuft aus dem Box-Lautsprecher, danach werden 10 s lang die WebSocket-Events ausgegeben.

**b) Web API** (auf dem PC oder dem Pi), prüft den Login für die spätere Suche. Wenn go-librespot läuft,
taucht „Lauschbox“ als Gerät in der Web API auf:
```
python spikes/spotify_spike.py --client-id <ID> --uri spotify:album:<ID>
```

## 6. Hardware-Tests (auf dem Pi)
```
sudo apt install -y python3-venv python3-dev i2c-tools python3-gpiozero python3-lgpio
# gpiozero und lgpio kommen als Systempakete; die Umgebung darf sie mitbenutzen (--system-site-packages).
# Per pip müsste lgpio auf dem Pi erst gebaut werden (braucht swig) und scheitert sonst.
# Fertige Pakete (Wheels) für ARMv6 kommen von piwheels (bei Raspberry Pi OS schon eingestellt).
pip install -r requirements.txt
i2cdetect -y 1          # 57/68/75 = PiSugar (der PN532 hängt an UART, nicht hier)
python spikes/nfc_test.py
python spikes/buttons_test.py
python spikes/leds_test.py
python spikes/battery_test.py   # vorher pisugar-server installieren (siehe PiSugar-Doku)
```

## 7. box-daemon (die eigentliche Box-Software)
Voraussetzung: Die Hardware-Tests aus Schritt 6 laufen, go-librespot ist angemeldet (Schritt 3).
Hardware-Testserver und box-daemon nutzen beide Port 8080, also immer nur einen von beiden starten.

```
cd ~/lauschbox/box          # Pfad zum geklonten Repo
. .venv/bin/activate
pip install -r requirements.txt
python -m lauschbox
```
Im Log steht für NFC, Taster und LEDs jeweils OK oder FEHLER. Dann in der App „Mit Box verbinden“ mit der IP des Pi.

**Als Dienst** `/etc/systemd/system/lauschbox.service` (`<user>` und Pfad ersetzen):
```
[Unit]
Description=Lauschbox box-daemon
After=network.target sound.target go-librespot.service
Wants=go-librespot.service

[Service]
User=<user>
WorkingDirectory=/home/<user>/lauschbox/box
ExecStart=/home/<user>/lauschbox/box/.venv/bin/python -m lauschbox
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```
```
sudo systemctl daemon-reload && sudo systemctl enable --now lauschbox
journalctl -u lauschbox -f        # Log mitlesen
```
Der Benutzer muss in den Gruppen `gpio`, `i2c` und `spi` sein (bei Raspberry Pi OS ist der erste Benutzer das schon).
Daten (Token, Hörstand, Einstellungen) liegen in `~/.local/share/lauschbox/lauschbox.db`.

**Am PC ohne Hardware** (zum Ausprobieren der App):
```
cd box
python -m venv .venv
.venv\Scripts\activate            # Windows; Linux/Mac: . .venv/bin/activate
pip install aiohttp zeroconf
python -m lauschbox --fake
```
In der App dann die IP des PCs eintragen. Token legt man im Tab „Box“ per Ziehen auf. Unter Windows muss die Firewall
Port 8080 im privaten Netz erlauben (wie bei Expo: `New-NetFirewallRule -DisplayName "Lauschbox 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private`).
