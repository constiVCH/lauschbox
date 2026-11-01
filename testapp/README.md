# Lauschbox-App (Expo)

Die Eltern-App der Lauschbox. Drei Wege vom Startbildschirm:

- **Meine Box:** Verbindung zum box-daemon ([box/lauschbox/](../box/lauschbox/)) im WLAN: Token anlernen (per Spotify-Link),
  Wiedergabe steuern, Sleep-Timer, Tastensperre, Kindermodus mit Eltern-PIN (ab Werk **1234**).
- **Hardware testen:** NFC-Leser, Taster, LED-Ring und Lautsprecher am Pi live prüfen. Gegenstück auf dem Pi ist
  [box/spikes/hwtest_server.py](../box/spikes/hwtest_server.py), Verdrahtung in [hardware/testaufbau-pi3b.md](../hardware/testaufbau-pi3b.md).
- **Demo-Box:** dieselbe Bedienung mit einer simulierten Box, ganz ohne Hardware (Demo-PIN **1234**).

Gestaltet nach dem Skill `apple-design` (`.agents/skills/apple-design`): Federn statt fester Animationsdauer,
Rückmeldung beim Aufsetzen des Fingers, Gesten folgen 1:1 und nehmen den Schwung mit, Material statt harter Kanten,
Systemschrift mit größenabhängigem Buchstabenabstand, reduzierte Bewegung wird berücksichtigt.
Farben aus dem Logo: Koralle auf Nachtblau, dunkel ist der Normalfall.

## Starten

```
cd testapp
npm install
npx expo start
```

- **Handy:** App **Expo Go** installieren (App Store / Play Store), dann den QR-Code scannen.
  Handy und PC müssen im selben WLAN sein. Es braucht kein Android Studio, kein JDK und kein Xcode.
- **Browser:** im laufenden `expo start` die Taste `w` drücken. Ziehen und Haptik sind auf dem Handy aber deutlich besser.

## Mit der Box verbinden

1. Auf dem Pi läuft `python -m lauschbox` (Einrichtung: [docs/pi-setup.md](../docs/pi-setup.md), Schritt 7).
   Ohne Pi geht es am PC mit `python -m lauschbox --fake`: Dann legt man Token im Tab „Box“ per Ziehen auf.
2. IP des Pi (oder PCs) eintragen → „Mit Box verbinden“. Port 8080 ist voreingestellt, sonst `IP:Port`.

Die App merkt sich die Adresse. Per IP statt `lauschbox.local`, weil Android `.local`-Namen oft nicht auflöst.

**Token anlernen:** Tab „Token“ → „Neu“ → leeren Token auf die Box legen → in der Spotify-App beim Album, Hörbuch
oder der Playlist „Teilen → Link kopieren“ → in der App „Einfügen“ → Name und Farbe → „Token anlernen“.
Liegt der Token noch auf, spielt er sofort los.

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
    index.tsx          Start: Meine Box, Hardware testen, Demo
    box/               Tabs Box, Token, Kindermodus (für Demo und echte Box gleich)
    token-edit.tsx     Token anlegen/bearbeiten (Blatt)
    hardware.tsx       Hardware-Test live
  box/                 Gemeinsame Sicht auf eine Box (types.ts), Demo-Adapter, Client für den box-daemon, Context
  components/          Tap (Druck-Feedback), Slider (1:1, federnder Anschlag), LedRing, BoxSimulator, TabBar …
  demo/                Simulierte Box mit den Regeln aus docs/konzept.md
  hw/hardware.ts       Client für den Hardware-Testserver (REST + WebSocket)
  theme.ts             Farben, Schrift, Abstände, Federn
```

Der Ordner heißt aus historischen Gründen noch `testapp/`; die Flutter-App in `app/` ruht.
