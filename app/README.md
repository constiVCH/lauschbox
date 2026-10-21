# Lauschring-App (Flutter)

Aktueller Stand: Die App läuft komplett mit einer **simulierten Demo-Box**. Es gibt noch keine Verbindung zu einer echten Box.

## Starten

```
cd app
flutter run -d chrome
```

Auf diesem PC funktioniert derzeit nur Chrome/Edge:
- **Windows-Desktop** braucht Visual Studio mit „Desktopentwicklung mit C++“.
- **Android** braucht ein JDK (`JAVA_HOME`). Dann geht es per Emulator oder USB-Handy mit `flutter run`.

Tests: `flutter test`

## Was man ausprobieren kann

**Tab „Box“, Box-Simulator** (ersetzt die Hardware):
- Token aus der Ablage antippen = auflegen, nochmal antippen oder Mitte des Rings = abnehmen
- Taster −, ▶, +, „+ und − lang“ (Tastensperre), Ein/Aus (PiSugar-Taster)
- Netzteil an/aus, Akkustand, Zeitraffer (10×/60×), „Abends“ für die Schlafenszeit
- Der LED-Ring zeigt, was die echte Box zeigen würde: Fortschritt in Token-Farbe, Lautstärke (weiß), Lernmodus (blau),
  unbekannter Token (orange), nicht erlaubt (lila), Laden (grün), Akku schwach (rote LED blinkt)

**Sonst:** Player-Steuerung, Sleep-Timer, Token anlernen (Lernmodus → leeren Token auflegen → Demo-Suche →
Name/Farbe), Kindermodus mit allen Regeln, Einstellungen. **Demo-PIN: 1234**

Ein paar Abläufe zum Testen:
1. „Funkel 1“ auflegen → spielt ab Kapitel 3 weiter. Abnehmen → Pause. Wieder auflegen → läuft weiter.
2. Lauter-Taste mehrmals drücken → stoppt bei 60 % (Kindermodus).
3. „Abends“ einschalten → neuer Token startet nicht, ein laufender spielt den Titel zu Ende.
4. Leeren Token auflegen → Hinweis „Unbekannter Token“ → „Anlernen“.
5. Zeitraffer 60× ohne Netzteil → Akku-Warnung, bei 5 % fährt die Box herunter.

## Aufbau

```
lib/
  models.dart              Datenmodelle (Token, Medium, Einstellungen, Kindermodus, Events)
  box/box_connection.dart  Schnittstelle zur Box, die einzige, die die UI kennt
  box/demo_box.dart        Simulation inkl. aller Regeln (Vorlage für die Logik im box-daemon)
  box/demo_catalog.dart    ausgedachte „Spotify“-Titel
  ui/                      Bildschirme
```

## Nächste Schritte
- `HttpBox implements BoxConnection`: REST + WebSocket gegen die box-daemon-API (docs/konzept.md)
- Box-Suche per mDNS (`_lauschring._tcp`), WLAN-Einrichtung per BLE
- Spotify-Login (PKCE) in der App, Refresh Token an die Box
- Device-Code von go-librespot (`GET /auth/code`) in der App anzeigen
