#!/usr/bin/env bash
# Lauschbox einmalig einrichten: Pakete, Schnittstellen, Python-Umgebung, go-librespot, Dienste, Rechte.
# Für Raspberry Pi OS Lite auf dem Pi Zero 2 W (docs/pi-setup.md).
# Danach starten go-librespot und die Box-Software beim Einschalten von selbst und lassen sich aus der App
# neu starten, aktualisieren und abmelden. Kann gefahrlos mehrfach ausgeführt werden.
#
#   bash ~/lauschbox/box/install.sh
set -euo pipefail

BOX_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_NAME="${SUDO_USER:-$USER}"
USER_HOME="$(getent passwd "$USER_NAME" | cut -d: -f6)"
SYSTEMCTL=/usr/bin/systemctl

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

if [ "$(id -u)" -eq 0 ] && [ -z "${SUDO_USER:-}" ]; then
  echo "Bitte als normaler Benutzer ausführen (nicht als root). sudo fragt bei Bedarf nach dem Passwort."
  exit 1
fi

step "Pakete"
sudo apt-get update -qq
# build-essential: pip baut gpiod (Taster, Stummschaltung) aus dem Quelltext, falls es kein fertiges Paket gibt
sudo apt-get install -y -qq python3-venv python3-dev build-essential i2c-tools alsa-utils git curl mpv

step "Schnittstellen: I2C, SPI (LED-Ring), serielle Schnittstelle (NFC-Leser), Verstärker (I2S)"
sudo raspi-config nonint do_i2c 0 || true
sudo raspi-config nonint do_spi 0 || true
sudo raspi-config nonint do_serial_hw 0 || true
sudo raspi-config nonint do_serial_cons 1 || true
BOOT_CONF=/boot/firmware/config.txt
add_conf() { grep -qxF "$1" "$BOOT_CONF" || echo "$1" | sudo tee -a "$BOOT_CONF" >/dev/null; }
sudo sed -i 's/^dtparam=audio=on/dtparam=audio=off/; s/^dtoverlay=vc4-kms-v3d$/dtoverlay=vc4-kms-v3d,noaudio/' "$BOOT_CONF"
add_conf "dtoverlay=max98357a"
add_conf "core_freq_min=400"  # fester Takt für SPI (LED-Ring) und die serielle Schnittstelle (NFC)

step "Python-Umgebung"
if [ ! -d "$BOX_DIR/.venv" ]; then
  python3 -m venv --system-site-packages "$BOX_DIR/.venv"
fi
"$BOX_DIR/.venv/bin/pip" install -q --upgrade pip
"$BOX_DIR/.venv/bin/pip" install -q -r "$BOX_DIR/requirements.txt"

step "go-librespot"
if ! command -v go-librespot >/dev/null; then
  VER=$(curl -fsSL https://api.github.com/repos/devgianlu/go-librespot/releases/latest | grep -oP '"tag_name": "\K[^"]+')
  ARCH=$([ "$(uname -m)" = "aarch64" ] && echo arm64 || echo armv6_rpi)
  TMP=$(mktemp -d)
  curl -fsSL -o "$TMP/glr.tar.gz" "https://github.com/devgianlu/go-librespot/releases/download/$VER/go-librespot_linux_$ARCH.tar.gz"
  tar xzf "$TMP/glr.tar.gz" -C "$TMP"
  sudo install -m 755 "$TMP/go-librespot" /usr/local/bin/
  rm -rf "$TMP"
  echo "installiert: $VER ($ARCH)"
else
  echo "vorhanden: $(command -v go-librespot)"
fi
CONF="$USER_HOME/.config/go-librespot/config.yml"
if [ ! -f "$CONF" ]; then
  mkdir -p "$(dirname "$CONF")"
  CARD=$(aplay -l 2>/dev/null | grep -oP 'card \d+: \K[^ ]+(?= \[MAX98357)' | head -1 || true)
  # Beim ersten Durchlauf entsteht die Soundkarte erst nach dem Neustart, ihr Name steht aber fest
  if [ -z "$CARD" ] && grep -qxF "dtoverlay=max98357a" "$BOOT_CONF"; then CARD=MAX98357A; fi
  AUDIO=default
  if [ -n "$CARD" ]; then AUDIO="plughw:CARD=$CARD,DEV=0"; fi  # direkt auf den Verstärker, nicht über PipeWire
  cat >"$CONF" <<EOF
device_name: Lauschbox
device_type: speaker
audio_device: $AUDIO
bitrate: 160
volume_steps: 100
disable_autoplay: true
zeroconf_enabled: false
credentials:
  type: device_auth
server:
  enabled: true
  address: localhost
  port: 3678
metadata:
  enabled: true
EOF
  chown -R "$USER_NAME": "$(dirname "$CONF")"
  echo "Konfiguration angelegt: $CONF"
elif ! grep -q '^metadata:' "$CONF"; then
  printf 'metadata:\n  enabled: true\n' >>"$CONF"
  echo "metadata.enabled ergänzt (Titellisten für den Gesamtfortschritt)"
fi

step "Laufende Instanzen aus dem Terminal beenden"
pkill -u "$USER_NAME" -f "python -m lauschbox" || true
pkill -u "$USER_NAME" -x go-librespot || true
sleep 1

step "Dienste"
sudo tee /etc/systemd/system/go-librespot.service >/dev/null <<EOF
[Unit]
Description=go-librespot (Spotify für die Lauschbox)
Wants=network-online.target
After=network-online.target sound.target

[Service]
User=$USER_NAME
ExecStart=/usr/local/bin/go-librespot
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/lauschbox.service >/dev/null <<EOF
[Unit]
Description=Lauschbox box-daemon
After=network.target sound.target go-librespot.service
Wants=go-librespot.service

[Service]
User=$USER_NAME
WorkingDirectory=$BOX_DIR
ExecStart=$BOX_DIR/.venv/bin/python -m lauschbox
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

step "Rechte: Dienste neu starten, Pi neu starten und ausschalten, WLAN wechseln (Einrichtung per Bluetooth)"
SUDOERS=$(mktemp)
cat >"$SUDOERS" <<EOF
# Lauschbox: nur diese Befehle, ohne Passwort (für die App: Neustart, Konto wechseln, Update, Ausschalten, WLAN)
$USER_NAME ALL=(root) NOPASSWD: $SYSTEMCTL restart go-librespot, $SYSTEMCTL stop go-librespot, $SYSTEMCTL start go-librespot, $SYSTEMCTL restart lauschbox, $SYSTEMCTL reboot, $SYSTEMCTL poweroff, /usr/bin/nmcli --wait 45 device wifi connect *
EOF
sudo visudo -cf "$SUDOERS" >/dev/null
sudo install -m 440 -o root -g root "$SUDOERS" /etc/sudoers.d/lauschbox
rm -f "$SUDOERS"
# Log lesen, Hardware, Bluetooth (WLAN-Einrichtung)
for GROUP in systemd-journal gpio i2c spi dialout bluetooth; do
  if getent group "$GROUP" >/dev/null; then sudo usermod -aG "$GROUP" "$USER_NAME"; fi
done

sudo $SYSTEMCTL daemon-reload
sudo $SYSTEMCTL enable --now go-librespot lauschbox
sleep 3

step "Fertig"
$SYSTEMCTL --no-pager --lines=0 status go-librespot lauschbox | grep -E "●|Active:" || true
IP=$(hostname -I | awk '{print $1}')
cat <<EOF

Die Box läuft jetzt als Dienst und startet beim Einschalten von selbst.
In der App: „Mit Box verbinden“ mit $IP. Alles Weitere (Spotify neu starten, Konto wechseln,
Update, Neustart, Ausschalten, Log) unter „Einstellungen“.

Ist Spotify noch nicht angemeldet, steht der Code für spotify.com/pair in der App unter Einstellungen → Spotify.
Wurden Schnittstellen eben erst eingeschaltet, einmal neu starten: sudo reboot
EOF
