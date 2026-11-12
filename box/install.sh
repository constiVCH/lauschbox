#!/usr/bin/env bash
# Lauschbox einmalig einrichten: Pakete, Schnittstellen, Python-Umgebung, go-librespot, Dienste, Rechte.
# Läuft auf Raspberry Pi OS (Raspberry Pi) und Armbian (Banana Pi M2 Zero, docs/bananapi-m2-zero.md).
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

ARMBIAN_ENV=/boot/armbianEnv.txt
if [ -f "$ARMBIAN_ENV" ]; then
  step "Schnittstellen (Armbian): SPI0 für den LED-Ring, UART3 für den NFC-Leser, I2C0, I2S für den Verstärker"
  add_overlay() {
    if ! grep -qE "^overlays=(.* )?$1( |\$)" "$ARMBIAN_ENV"; then
      if grep -q '^overlays=' "$ARMBIAN_ENV"; then sudo sed -i "s/^overlays=.*/& $1/" "$ARMBIAN_ENV"
      else echo "overlays=$1" | sudo tee -a "$ARMBIAN_ENV" >/dev/null; fi
    fi
  }
  set_param() {
    if grep -q "^$1=" "$ARMBIAN_ENV"; then sudo sed -i "s/^$1=.*/$1=$2/" "$ARMBIAN_ENV"
    else echo "$1=$2" | sudo tee -a "$ARMBIAN_ENV" >/dev/null; fi
  }
  for OVERLAY in spi-spidev uart3 i2c0; do add_overlay "$OVERLAY"; done
  set_param param_spidev_spi_bus 0         # SPI0 (Pin 19); SPI1 teilt sich die Pins 8/10 mit UART3
  set_param param_spidev_max_freq 10000000 # der LED-Ring braucht 6,4 MHz
  if ! grep -q 'lauschbox-max98357a' "$ARMBIAN_ENV"; then
    sudo armbian-add-overlay "$BOX_DIR/overlays/lauschbox-max98357a.dts"
  fi
  # Armbian lässt GPIO und SPI nur root benutzen: Gruppen anlegen und freigeben
  for GROUP in gpio spi i2c; do sudo groupadd -f "$GROUP"; done
  sudo tee /etc/udev/rules.d/99-lauschbox.rules >/dev/null <<'EOF'
SUBSYSTEM=="gpio", KERNEL=="gpiochip*", GROUP="gpio", MODE="0660"
SUBSYSTEM=="spidev", GROUP="spi", MODE="0660"
SUBSYSTEM=="i2c-dev", GROUP="i2c", MODE="0660"
EOF
  sudo udevadm control --reload-rules && sudo udevadm trigger || true
else
  step "Schnittstellen (I2C, SPI, serielle Schnittstelle für den NFC-Leser)"
  sudo raspi-config nonint do_i2c 0 || true
  sudo raspi-config nonint do_spi 0 || true
  sudo raspi-config nonint do_serial_hw 0 || true
  sudo raspi-config nonint do_serial_cons 1 || true
fi

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
  # Armbian: die Soundkarte entsteht erst nach dem Neustart, ihr Name steht aber fest (overlays/lauschbox-max98357a.dts)
  if [ -z "$CARD" ] && [ -f "$ARMBIAN_ENV" ]; then CARD=MAX98357A; fi
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
pkill -u "$USER_NAME" -f hwtest_server.py || true
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

step "Rechte: die Box darf ihre Dienste neu starten, den Pi neu starten und ausschalten"
SUDOERS=$(mktemp)
cat >"$SUDOERS" <<EOF
# Lauschbox: nur diese Befehle, ohne Passwort (für die App: Neustart, Konto wechseln, Update, Ausschalten)
$USER_NAME ALL=(root) NOPASSWD: $SYSTEMCTL restart go-librespot, $SYSTEMCTL stop go-librespot, $SYSTEMCTL start go-librespot, $SYSTEMCTL restart lauschbox, $SYSTEMCTL reboot, $SYSTEMCTL poweroff
EOF
sudo visudo -cf "$SUDOERS" >/dev/null
sudo install -m 440 -o root -g root "$SUDOERS" /etc/sudoers.d/lauschbox
rm -f "$SUDOERS"
# Log in der App lesen dürfen
for GROUP in systemd-journal gpio i2c spi dialout; do
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
