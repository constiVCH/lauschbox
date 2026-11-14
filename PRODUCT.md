# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

Expo-App (React Native) für iOS und Android mit **einem gemeinsamen Look** auf beiden Systemen (bewusst keine
systemabhängige Gestaltung), gestaltet nach dem Skill `apple-design`.

## Users

**Eltern**, ausschließlich. Sie richten die Box ein, lernen Token an, legen Regeln fest und greifen bei Bedarf
aus der Ferne ein (Lautstärke, Pause, Sleep-Timer). Kinder bedienen nur die Box selbst: Token einstecken, drei Taster.
Die App ist kein Kinderprodukt, auch wenn sie ein Kinderprodukt steuert.

Typische Situationen: abends neben dem Kinderbett (gedämpftes Licht, eine Hand frei), nebenbei zwischen
anderen Aufgaben, oder einmalig in Ruhe beim Einrichten neuer Token.

## Product Purpose

Eine Kinder-Audiobox auf Raspberry-Pi-Basis: NFC-Token einstecken, und ein Hörspiel, Hörbuch oder eine Playlist
von Spotify oder von der SD-Karte startet. Die Box spielt komplett ohne App, lokale Inhalte auch ohne WLAN. Die App ist das Werkzeug der Eltern zum Einrichten,
Verwalten und Begrenzen.

Erfolg: Das Kind hört selbstständig, die Eltern behalten die Kontrolle mit wenig Aufwand, und die Box
verhält sich vorhersehbar.

## Positioning

Selbstgebaut statt gekauft: eigene Hardware, Inhalte aus dem eigenen Spotify-Konto statt aus einem
geschlossenen Shop, keine Cloud des Herstellers. Die Zuordnung Token → Inhalt liegt auf der Box.
Der Kindermodus bündelt Regeln, die bei Fertigprodukten fehlen oder verstreut sind: Maximallautstärke,
Schlafenszeit, kein Autoplay, Tastensperre.

Die Box soll später **veröffentlicht** werden (Open Source und/oder App Store). Andere bauen sie dann
nach Anleitung nach und richten die App selbst ein.

## Operating Context

- Box im WLAN, App verbindet sich per IP. Hat die Box kein WLAN, bringt die App sie per Bluetooth LE hinein
  (Freigabe durch einen Tastendruck an der Box).
- Spotify Premium ist Voraussetzung. Wiedergabe-Login der Box per Device-Code (spotify.com/pair),
  Suche über eine eigene Spotify-Developer-App (in der App eingerichtet).
- Token anlernen: an der Box (Lernmodus) oder mit dem NFC des Handys → Inhalt suchen oder hochladen → Name und Farbe vergeben.
- Die Token-Farbe erscheint auch auf dem LED-Ring der Box. App und Gerät teilen sich diese Farbsprache.
- Vorerst Netzbetrieb; später Akku (USB-C) mit Ladestand in der App und am Gerät.

## Capabilities and Constraints

- Hardware: Raspberry Pi Zero 2 W, go-librespot, mpv, PN532-NFC, WS2812-Ring (24 LEDs), 3 Taster,
  später PiSugar 3 Air. Bootzeit ca. 30–40 s.
- Funktionen: Player-Fernsteuerung, Sleep-Timer, Token anlernen/bearbeiten/löschen, Hörstand je Token,
  Einstellungen (Lautstärke, Verhalten beim Einstecken/Herausziehen, LEDs, Ruhemodus), eigene Dateien,
  Kindermodus mit Eltern-PIN (abschaltbar).
- Aktueller Stand (2026-11-14): Am Pi (Testaufbau 3B+) laufen Spotify, eigene Dateien, NFC (über UART), Taster,
  LED-Ring und Stummschaltung. Die WLAN-Einrichtung per Bluetooth ist gebaut, aber noch nicht am Zero 2 W getestet.
  Es fehlen noch: Akku-Anbindung, Gehäuse.
- App: Expo-App in `testapp/`, als APK über EAS gebaut (native Module für NFC, Bluetooth, Dateiauswahl).
  Ohne Box: `python -m lauschbox --fake`. Gestaltung nach dem Skill `apple-design` (Federn, 1:1-Gesten, Material,
  reduzierte Bewegung).
- Quellen: Spotify und lokale Audiodateien auf der Box (DRM-frei, per App hochgeladen; funktionieren offline).
  Spotify-Inhalte sind nie offline verfügbar. Audible bewusst zurückgestellt.
- Offline: Die Box bootet und spielt lokale Medien ohne Netz. Die App zeigt ehrlich, welche Token offline spielen
  (z. B. Kennzeichnung „offline verfügbar“ in der Token-Liste).
- Sprache: Deutsch.
- Name: **Lauschbox** (seit 2026-11-01; davor „Lauschbox“, „Lauschring“, „Hörspielbox“). Technische IDs: Bundle-ID/applicationId `de.lauschbox.app`, mDNS `_lauschbox._tcp`, Bluetooth-Name `Lauschbox`.
- Offen: Lizenz, Vertriebsweg. Eine formale Markenprüfung des Namens steht aus.

## Brand Commitments

- Name: **Lauschbox** („lauschen“ + Box): kindgerecht und bodenständig; das Gehäuse ist eine Kiste mit LED-Ring vorn, Token-Schlitz und Tasten oben, Lautsprechern in den Seiten und einer Kordel als Griff.
- Logo: `brand/logo.svg`. Die Box von vorn auf Nachtblau: korallfarbener Körper mit LED-Ring (12 Punkte, 9 leuchtend), drei Tasten oben, flache Kordel, Schallbögen links und rechts. Einfarbiges Piktogramm für die Box: `brand/piktogramm.svg`. Alle Icons erzeugt `brand/make_logo.py`.
- Stimme: deutsch, direkt, für Erwachsene geschrieben.

## Evidence on Hand

Keine echten Nutzer, Testimonials, Fotos der Box oder Cover. Die Simulation (`--fake`) zeigt
ausgedachte Titel, die nicht als echter Inhalt dargestellt werden dürfen. Spotify-Inhalte und -Marken dürfen nur
im Rahmen der Spotify-Richtlinien gezeigt werden.

## Product Principles

1. **Die Box ist das Produkt, die App ist das Werkzeug.** Nichts Wichtiges darf nur über die App gehen.
2. **Kindersicher als Normalzustand.** Grenzen sind voreingestellt; Lockern braucht die Eltern-PIN (die Eltern können sie abschalten, das Kind hat keine App).
3. **Vorhersehbar vor clever.** Die Box tut jedes Mal dasselbe; die App sagt ehrlich, was die Box gerade tut
   und warum (z. B. „Schlafenszeit: startet erst morgen“).
4. **Schnell im Alltag, gründlich beim Einrichten.** Häufige Handgriffe (Pause, leiser, Sleep-Timer)
   in Sekunden; Anlernen und Regeln dürfen mehr Schritte haben.
5. **Nachbaubar.** Jede Einrichtung muss ohne den ursprünglichen Bastler verständlich sein.

## Accessibility & Inclusion

Nutzung oft abends bei wenig Licht und mit einer Hand: Dunkelmodus und gut erreichbare Bedienelemente
sind Pflicht, nicht Extra. Kein festgelegter Standard darüber hinaus.
