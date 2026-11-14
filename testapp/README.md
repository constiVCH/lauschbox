# Lauschbox-App (Expo)

Die Eltern-App der Lauschbox. Vom Startbildschirm aus:

- **Mit Box verbinden** (IP der Box im WLAN): Token anlernen (an der Box oder mit dem NFC des Handys; Inhalt per
  Spotify-Suche, eigene Playlists, Link oder eigene Dateien), Wiedergabe steuern, Sleep-Timer, Tastensperre,
  Kindermodus und Einstellungen (Spotify, LED-Ring, eigene Dateien, Update, Neustart, Ausschalten, Log).
  Kindermodus und Einstellungen sind mit der Eltern-PIN geschützt (ab Werk **1234**, im Kindermodus abschaltbar).
- **Neue Box ins WLAN bringen:** per Bluetooth, wenn die Box noch kein WLAN hat ([docs/pi-setup.md](../docs/pi-setup.md), Schritt 4).
- **Ohne Box ausprobieren:** am PC `cd box && python -m lauschbox --fake`, dann in der App die IP des PCs eintragen.
  Token legt man dann im Tab „Box“ per Ziehen auf.

Gestaltet nach dem Skill `apple-design` (`.agents/skills/apple-design`): Federn statt fester Animationsdauer,
Rückmeldung beim Aufsetzen des Fingers, Gesten folgen 1:1, reduzierte Bewegung wird berücksichtigt.
Farben aus dem Logo: Koralle auf Nachtblau, dunkel ist der Normalfall.

## Bauen

Die App nutzt native Module (NFC, Bluetooth, Dateiauswahl), die es in Expo Go nicht gibt. Sie wird deshalb als APK
in der Cloud gebaut (EAS, Projekt `@constih/lauschbox-testapp`):

```
cd testapp
npm install
npx -y eas-cli@latest build -p android --profile preview
```

Zum Entwickeln geht `npx expo start` mit Expo Go weiterhin; NFC-Lesen am Handy, Bluetooth-Einrichtung und Hochladen
melden dort, dass sie in dieser App-Version nicht verfügbar sind.

## Prüfen

```
npx tsc --noEmit
npx eslint src
npx expo-doctor
```

## Aufbau

```
src/
  app/                 Bildschirme (Expo Router)
    index.tsx          Start: Box verbinden, neue Box ins WLAN bringen
    box/               Tabs Box, Token, Kindermodus, Einstellungen
    token-edit.tsx     Token anlegen/bearbeiten (Blatt)
    dateien.tsx        Eigene Dateien auf der Box verwalten
    wlan.tsx           WLAN-Einrichtung per Bluetooth
  box/                 Sicht auf eine Box (types.ts), Client für den box-daemon (remoteBox.ts), Context
  components/          Tap, Slider, LedRing, PinGate, BoxSimulator, TabBar …
  improv.ts            Bluetooth-Einrichtung (Improv Wi-Fi)
  nfc.ts               Token-UID mit dem NFC des Handys lesen
  theme.ts             Farben, Schrift, Abstände, Federn
```
