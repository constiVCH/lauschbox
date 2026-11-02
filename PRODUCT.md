# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

Expo-App (React Native) für iOS und Android mit **einem gemeinsamen Look** auf beiden Systemen (bewusst keine
systemabhängige Gestaltung), gestaltet nach dem Skill `apple-design`.

## Users

**Eltern**, ausschließlich. Sie richten die Box ein, lernen Token an, legen Regeln fest und greifen bei Bedarf
aus der Ferne ein (Lautstärke, Pause, Sleep-Timer). Kinder bedienen nur die Box selbst: Token auflegen, drei Taster.
Die App ist kein Kinderprodukt, auch wenn sie ein Kinderprodukt steuert.

Typische Situationen: abends neben dem Kinderbett (gedämpftes Licht, eine Hand frei), nebenbei zwischen
anderen Aufgaben, oder einmalig in Ruhe beim Einrichten neuer Token.

## Product Purpose

Eine Kinder-Audiobox auf Raspberry-Pi-Basis: NFC-Token auflegen, und ein Hörspiel, Hörbuch oder eine Playlist
von Spotify oder von der SD-Karte startet. Die Box spielt komplett ohne App, lokale Inhalte auch ohne WLAN. Die App ist das Werkzeug der Eltern zum Einrichten,
Verwalten und Begrenzen.

Erfolg: Das Kind hört selbstständig, die Eltern behalten die Kontrolle mit wenig Aufwand, und die Box
verhält sich vorhersehbar.

## Positioning

Selbstgebaut statt gekauft: eigene Hardware, Inhalte aus dem eigenen Spotify-Konto statt aus einem
geschlossenen Shop, keine Cloud des Herstellers. Die Zuordnung Token → Inhalt liegt auf der Box.
Der Kindermodus bündelt Regeln, die bei Fertigprodukten fehlen oder verstreut sind: Maximallautstärke,
Schlafenszeit, Tagesbudget, kein Autoplay, Tastensperre.

Die Box soll später **veröffentlicht** werden (Open Source und/oder App Store). Andere bauen sie dann
nach Anleitung nach und richten die App selbst ein.

## Operating Context

- Box im WLAN, App findet sie per mDNS; Ersteinrichtung des WLANs per Bluetooth LE (geplant).
- Spotify Premium ist Voraussetzung. Wiedergabe-Login der Box per Device-Code (spotify.com/pair),
  Suche über Spotify-Login (PKCE) in der App.
- Token anlernen: Lernmodus in der App → Token auf die Box legen → Inhalt suchen → Name und Farbe vergeben.
- Die Token-Farbe erscheint auch auf dem LED-Ring der Box. App und Gerät teilen sich diese Farbsprache.
- Akku- und Netzbetrieb (USB-C); Ladestand ist in der App und am Gerät sichtbar.

## Capabilities and Constraints

- Hardware: Raspberry Pi Zero W (ARMv6, 32-bit), go-librespot, PN532-NFC, WS2812-Ring (12 LEDs),
  3 Taster, PiSugar-3-Akku. Bootzeit ca. 40–60 s.
- Funktionen: Player-Fernsteuerung, Sleep-Timer, Token anlernen/bearbeiten/löschen, Hörstand je Token,
  Einstellungen (Lautstärke, Verhalten beim Auflegen/Abnehmen, LEDs, Energie), Kindermodus mit Eltern-PIN.
- Aktueller Stand (2026-11-01): box-daemon und App sind verbunden und am PC im Simulationsmodus durchgetestet;
  am echten Pi laufen Wiedergabe, NFC (über UART), Taster und LEDs. Es fehlen noch: BLE-Einrichtung, Akku-Anbindung,
  lokale Medien.
- Haupt-App seit 2026-11-01: Expo-App in `testapp/` (die erste Flutter-App wurde am 2026-11-02 entfernt). Verbindet sich mit dem box-daemon
  (Token anlernen per Spotify-Link, Wiedergabe, Sleep-Timer, Kindermodus mit PIN), dazu Hardware-Test (die Demo-Box wurde am 2026-11-02 entfernt; ohne Box: `python -m lauschbox --fake`).
  Gestaltung nach dem Skill `apple-design` (Federn, 1:1-Gesten, Material, reduzierte Bewegung). Läuft per Expo Go
  auf dem Handy, weil auf dem Entwicklungs-PC weder JDK noch Visual Studio installiert sind.
- Quellen: Spotify und lokale Audiodateien auf der Box (DRM-frei, per App hochgeladen; funktionieren offline).
  Spotify-Inhalte sind nie offline verfügbar. Audible bewusst zurückgestellt.
- Offline: Die Box bootet und spielt lokale Medien ohne Netz. Die App zeigt ehrlich, welche Token offline spielen
  (z. B. Kennzeichnung „offline verfügbar“ in der Token-Liste).
- Sprache: Deutsch.
- Name: **Lauschbox** (seit 2026-11-01; davor „Lauschbox“, „Lauschring“, „Hörspielbox“). Technische IDs: Dart-Paket `lauschbox`, Bundle-ID/applicationId `de.lauschbox.app`, mDNS `_lauschbox._tcp`.
- Offen: Lizenz, Vertriebsweg. Eine formale Markenprüfung des Namens steht aus.

## Brand Commitments

- Name: **Lauschbox** („lauschen“ + Box): kindgerecht und bodenständig; das Gehäuse ist eine Kiste mit Lautsprecher und LED-Ring oben.
- Logo: `brand/logo.svg`. Korallfarbene Kiste in leichter Draufsicht auf Nachtblau: vorne das Lautsprechergitter, oben in einer dunklen Mulde der LED-Ring (12 Punkte, 9 leuchtend) mit dem Token, darüber ein warmer Lichtschein. Alle Icons erzeugt `brand/make_logo.py`.
- Stimme: deutsch, direkt, für Erwachsene geschrieben.

## Evidence on Hand

Keine echten Nutzer, Testimonials, Fotos der Box oder Cover. Die Simulation (`--fake`) zeigt
ausgedachte Titel, die nicht als echter Inhalt dargestellt werden dürfen. Spotify-Inhalte und -Marken dürfen nur
im Rahmen der Spotify-Richtlinien gezeigt werden.

## Product Principles

1. **Die Box ist das Produkt, die App ist das Werkzeug.** Nichts Wichtiges darf nur über die App gehen.
2. **Kindersicher als Normalzustand.** Grenzen sind voreingestellt; Lockern braucht die Eltern-PIN.
3. **Vorhersehbar vor clever.** Die Box tut jedes Mal dasselbe; die App sagt ehrlich, was die Box gerade tut
   und warum (z. B. „Schlafenszeit: startet erst morgen“).
4. **Schnell im Alltag, gründlich beim Einrichten.** Häufige Handgriffe (Pause, leiser, Sleep-Timer)
   in Sekunden; Anlernen und Regeln dürfen mehr Schritte haben.
5. **Nachbaubar.** Jede Einrichtung muss ohne den ursprünglichen Bastler verständlich sein.

## Accessibility & Inclusion

Nutzung oft abends bei wenig Licht und mit einer Hand: Dunkelmodus und gut erreichbare Bedienelemente
sind Pflicht, nicht Extra. Kein festgelegter Standard darüber hinaus.
