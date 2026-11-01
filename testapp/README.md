# Lauschbox-Test-App (Expo)

Test-App mit zwei Teilen:

- **Demo-Box:** Bedienung mit einer simulierten Box ausprobieren (Token auflegen per Ziehen oder Antippen, Player,
  Sleep-Timer, Token anlernen, Kindermodus mit Eltern-PIN **1234**). Läuft ohne Hardware.
- **Testaufbau:** NFC-Leser, Taster, LED-Ring und Lautsprecher am Pi live prüfen. Gegenstück auf dem Pi ist
  [box/spikes/hwtest_server.py](../box/spikes/hwtest_server.py), Verdrahtung in [hardware/testaufbau-pi3b.md](../hardware/testaufbau-pi3b.md).

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

## Testaufbau verbinden

1. Auf dem Pi: `cd box && . .venv/bin/activate && python spikes/hwtest_server.py`
2. IP des Pi mit `hostname -I` ablesen.
3. In der App „Testaufbau“ die IP eintragen (Port 8080 ist voreingestellt) → „Verbinden“.

Die App merkt sich die Adresse. Per IP statt `lauschbox.local`, weil Android `.local`-Namen oft nicht auflöst.

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
    index.tsx          Start: Demo oder Testaufbau
    demo/              Tabs Box, Token, Kindermodus
    token-edit.tsx     Token anlegen/bearbeiten (Blatt)
    hardware.tsx       Testaufbau live
  components/          Tap (Druck-Feedback), Slider (1:1, federnder Anschlag), LedRing, BoxSimulator, TabBar …
  demo/                Simulierte Box mit den Regeln aus docs/konzept.md
  hw/hardware.ts       Client für den Hardware-Testserver (REST + WebSocket)
  theme.ts             Farben, Schrift, Abstände, Federn
```
