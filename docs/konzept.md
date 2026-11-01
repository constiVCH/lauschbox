# Konzept

## Architektur

```
┌───────────────── Box (Raspberry Pi Zero W) ─────────────────┐
│  box-daemon (Python, asyncio)                               │
│   ├─ NfcService      PN532 pollt → token_placed/removed     │
│   ├─ InputService    3 Taster (kurz/lang)                   │
│   ├─ LedService      WS2812-Ring: Zustände, Lautstärke, Akku│
│   ├─ PowerService    PiSugar: Ladestand, lädt?, Netz?       │
│   ├─ Player          SpotifyPlayer (go-librespot-API)       │
│   │                  LocalPlayer (mpv, JSON-IPC)            │
│   ├─ MediaLibrary    lokale Medien auf der SD-Karte         │
│   ├─ Rules           Kindermodus, Max-Lautstärke, Timer     │
│   ├─ Store (SQLite)  Tokens, Medien, Fortschritt, Einst.    │
│   └─ API (FastAPI)   REST + WebSocket, mDNS-Announce        │
│  go-librespot        Connect-Gerät + API auf localhost:3678 │
│  mpv                 lokale Wiedergabe, IPC /run/mpv.sock   │
│  BLE-Provisioning    WLAN-Daten aus der App empfangen       │
└─────────────────────────────────────────────────────────────┘
                 ▲ WLAN (mDNS _lauschbox._tcp) / BLE
┌────────────────┴────────────────┐
│ Flutter-App (iOS/Android)       │
└─────────────────────────────────┘
```

## Abläufe

**Token auflegen (ohne App)**
1. PN532 liefert UID → Store-Lookup.
2. Unbekannt → LED kurz orange, nichts passiert.
3. Bekannt → je nach Quelle des Tokens:
   - `spotify`: `POST localhost:3678/player/play {uri, skip_to_uri, position}` an go-librespot.
   - `local`: Titelliste des Mediums an mpv übergeben (`loadfile`, dann `seek`).

   Je nach Einstellung beim gespeicherten Stand (Titel + Position) fortsetzen oder von vorn.
   Spotify-Token ohne Internet → LED-Signal „kein Netz“ (siehe [Offline-Betrieb](#lokale-medien--offline-betrieb)).
4. Token abnehmen → Pause (einstellbar), Stand speichern.

**Token anlernen (App)**
1. App: „Neuer Token“ → Box geht in Lernmodus (LED blau pulsierend).
2. Token auflegen → Box sendet UID per WebSocket.
3. App: Quelle wählen
   - Spotify-Suche (läuft über die Box-API) → Album/Playlist/Hörbuch wählen, oder
   - lokales Medium von der Box wählen bzw. direkt neu hochladen.
4. Name + Farbe vergeben → speichern.

**Spotify-Login**
Zwei getrennte Logins:
- **Wiedergabe (go-librespot):** einmalig per Device-Code (`credentials.type: device_auth`). go-librespot zeigt einen Code
  (auch über `GET /auth/code`), der auf spotify.com/pair eingegeben wird. Die App kann diesen Code später direkt anzeigen.
- **Suche/Metadaten (Web API):** Die App macht OAuth (Authorization Code + PKCE) und übergibt den Refresh Token an die Box.
  Die Box erneuert Access Tokens danach selbst (PKCE-Refresh braucht kein Client Secret).

Für die eigentliche Wiedergabe braucht die Box die Web API also nicht. Wenn die Web API ausfällt oder ihre Limits erreicht sind,
spielen die Token trotzdem weiter.

## Lokale Medien & Offline-Betrieb

Ziel: Die Box funktioniert auch **ganz ohne WLAN**, z. B. im Auto, im Urlaub oder bei Großeltern ohne Netz.
Dafür gibt es neben Spotify eine zweite Quelle: Audiodateien, die auf der SD-Karte der Box liegen.

**Was offline geht und was nicht**

| | Offline |
|---|---|
| Token mit lokalem Medium | spielt normal, inkl. Fortsetzen, Tasten, Lautstärke |
| Token mit Spotify-Inhalt | spielt **nicht** (LED-Signal „kein Netz“: Ring 2× langsam violett) |
| Kindermodus, Sleep-Timer, Schlafenszeit | funktionieren (Uhrzeit aus der RTC des PiSugar, siehe unten) |
| Akku, Herunterfahren | funktionieren |
| App-Steuerung | nur über den Hotspot der Box (optional, siehe unten) |
| Neue Inhalte aufspielen | nein, nur im WLAN |

Spotify-Inhalte lassen sich **nicht** offline verfügbar machen: go-librespot kann keine Offline-Downloads, und Mitschneiden
verstößt gegen die Nutzungsbedingungen. Wer unterwegs hören will, legt dafür lokale Medien an.

**Was ein lokales Medium ist**
- Ein Medium = ein Ordner (eine Hörspielfolge, ein Hörbuch, ein Album), z. B. `/var/lib/lauschbox/media/<id>/`.
- Titelreihenfolge: Track-Nummer aus den Tags, sonst Dateiname (natürlich sortiert, `2` vor `10`).
- Formate: MP3, M4A/AAC, OGG/Opus, FLAC, jeweils **ohne Kopierschutz**. Quellen z. B. selbst gerippte CDs,
  DRM-freie Käufe, eigene Aufnahmen.
- Die Box wandelt nicht um (zu viel CPU für den Zero W), sondern spielt die Dateien so, wie sie sind.
- Metadaten (Titel, Dauer, Cover) liest die Box beim Hochladen einmal aus (`mutagen`, reines Python) und legt sie im Store ab.
  Cover: eingebettetes Bild oder `cover.jpg`/`folder.jpg`, auf 300 px verkleinert gespeichert.
- Speicherbedarf: 128 kbit/s ≈ 58 MB pro Stunde. Auf einer 32-GB-Karte bleiben nach System und Reserve ca. 25 GB,
  also über 400 Stunden. Die App zeigt den freien Speicher an und verhindert Uploads unter 1 GB Rest.

**Wiedergabe: mpv**
- `mpv --idle --no-video --input-ipc-server=/run/mpv.sock` läuft dauerhaft als eigener Dienst.
- Der box-daemon steuert ihn über JSON-IPC: `loadfile`, `playlist-play-index`, `seek`, `set_property pause/volume`,
  und liest `time-pos`/`playlist-pos` für den Hörstand.
- Beide Player hängen hinter derselben Schnittstelle (`play`, `pause`, `resume`, `next`, `prev`, `seek`, `volume`, `position`).
  Regeln, Tasten, LEDs und Fortschritt kennen die Quelle nicht.
- Es läuft immer nur ein Player. Beim Wechsel der Quelle pausiert der box-daemon den anderen.
- Audio-Ausgabe: go-librespot und mpv teilen sich das I2S-Gerät über ALSA `dmix` (oder der jeweils andere gibt das Gerät frei).
  Das klärt der mpv-Spike.

**Inhalte auf die Box bringen**
1. **Über die App (Standard):** „Lokales Medium“ → Dateien vom Handy wählen → Upload über WLAN an die Box-API.
   Upload in Teilen (Chunks à 4 MB) mit Fortsetzen nach Abbruch. Der Zero W schafft im WLAN ca. 2–3 MB/s,
   eine Stunde Hörspiel ist also in rund 30 s übertragen.
2. **Vom Rechner (für Bastler):** Samba-Freigabe `lauschbox-import` (optional, standardmäßig aus). Neue Ordner dort
   übernimmt die Box beim nächsten Scan als Medien.

**Uhrzeit ohne Internet**
Der Pi hat keine eigene Uhr. Ohne NTP wüsste die Box nach dem Booten nicht, wie spät es ist, und
Schlafenszeit und Tagesbudget wären falsch. Lösung: die **RTC des PiSugar 3**.
- Beim Booten: Systemzeit aus der RTC setzen (`pisugar-server`: `rtc_rtc2pi`).
- Sobald NTP synchronisiert hat: RTC nachstellen (`rtc_pi2rtc`).
- Ist die Uhrzeit unbekannt (RTC nie gestellt), gelten zeitabhängige Regeln vorsichtig: Lautstärke-Deckel der
  Schlafenszeit aktiv, Tagesbudget zählt ab dem Booten.

**Booten ohne Netz**
- box-daemon wartet beim Start **nicht** auf das Netz. NFC, Tasten, LEDs und lokale Wiedergabe sind sofort bereit.
- go-librespot verbindet sich später selbst, wenn WLAN da ist. Der box-daemon fragt dessen Status ab
  und behandelt Spotify bis dahin als „nicht verfügbar“.

**App-Steuerung ohne Router (optional, später)**
Findet die Box nach 2 Minuten kein bekanntes WLAN, öffnet sie einen eigenen Hotspot (`Lauschbox-XXXX`, WPA2,
Passwort auf dem Etikett und in der App). Die App verbindet sich damit und spricht dieselbe API wie sonst (Box unter `192.168.4.1`).
Sobald ein bekanntes WLAN wieder erreichbar ist, wechselt die Box zurück. Für Kinder spielt das keine Rolle:
Token auflegen reicht.

## Einstellungen

- Startlautstärke, Maximallautstärke, Lautstärkeschritt
- Erneutes Auflegen: fortsetzen (fertig gehörte Folgen starten von vorn) / immer von vorn
- Token abnehmen: pausieren / weiterspielen
- LED: Farben je Zustand, Helligkeit, Nachtmodus (gedimmt)
- Sleep-Timer, automatisches Ausschalten bei Inaktivität
- Akku: Warnschwelle, Abschaltschwelle

## Kindermodus

Ein Bündel von Regeln, das die Box „kindersicher“ macht. Mit **Eltern-PIN** in der App geschützt:

| Funktion | Wirkung |
|---|---|
| Maximallautstärke | Lauter-Taste stoppt bei z. B. 60 % |
| Kein Autoplay | Nach Ende des Albums keine Spotify-Vorschläge (go-librespot `disable_autoplay: true`) |
| Schlafenszeit | z. B. 19:30–7:00: neue Token starten nicht, laufende Folge wird zu Ende gespielt, Lautstärke gedeckelt, LEDs gedimmt |
| Sleep-Timer | Nach X Minuten oder „nach dieser Folge“ ausblenden und stoppen |
| Tagesbudget (optional) | Maximal X Minuten Hörzeit pro Tag |
| Tastensperre | Langes Drücken von Lauter + Leiser sperrt/entsperrt die Tasten |
| Nur bekannte Token | Unbekannte Tags lösen nichts aus |
| App-Schutz | Einstellungen und Token-Verwaltung nur mit Eltern-PIN |

## Ressourcen (Pi Zero W)

Der Zero W hat einen Kern (ARMv6, 1 GHz) und 512 MB RAM. Daraus folgt:
- go-librespot (Go, ein Binary) statt raspotify/librespot, denn raspotify unterstützt ARMv6 nicht.
- Bitrate 160 kbit/s, kein Audio-Cache für Spotify auf der SD-Karte (schont Karte und CPU). Lokale Medien liegen
  bewusst auf der Karte und werden nur gelesen.
- mpv statt eines eigenen Decoders: MP3/AAC in Stereo sollte auf dem Zero W ca. 10–20 % CPU brauchen (im Spike messen).
- box-daemon schlank halten: asyncio, keine schweren Abhängigkeiten (kein pandas o. Ä.), NFC-Polling ca. 4–5×/s.
- Bootzeit von 40–60 s einplanen. Die LED zeigt beim Start sofort eine Animation, damit das Kind sieht, dass etwas passiert.

## Akku & Laden

- PiSugar 3 (Plus): USB-C-Laden mit Durchreichen, die Box läuft also auch am Netz.
- Der Ladestand wird über `pisugar-server` (TCP 8423) gelesen.
- **Gerät:** Ladezustand als LED-Animation (grün füllender Ring, solange geladen wird); unter 15 % blinkt eine LED rot.
- **App:** Prozentanzeige, „lädt“/„Netz“, geschätzte Restlaufzeit.
- Unter 5 %: Stand speichern, Ansage/LED-Signal, sauber herunterfahren.

## API-Entwurf (v1)

```
GET    /api/status                 Zustand, aktueller Token, Lautstärke, Akku, online/offline
WS     /api/events                 token_placed/removed, player, battery, learn
GET    /api/tokens                 Liste
PUT    /api/tokens/{uid}           Anlegen/Ändern {name, color, source: spotify|local, uri}
                                   (uri bei local: local:<media-id>)
DELETE /api/tokens/{uid}
POST   /api/learn                  Lernmodus starten → nächste UID per WS
GET    /api/spotify/search?q=      Proxy zur Spotify-Suche
POST   /api/spotify/auth           Refresh Token von der App übernehmen
GET    /api/media                  lokale Medien (Name, Titel, Dauer, Cover-URL, Größe)
POST   /api/media                  neues Medium anlegen {name} → {id}
POST   /api/media/{id}/upload      Datei hochladen (Chunks, Header Upload-Offset), danach Metadaten lesen
GET    /api/media/{id}/cover       Cover-Bild
PATCH  /api/media/{id}             umbenennen, Titelreihenfolge ändern
DELETE /api/media/{id}             Medium löschen (Token darauf werden „ohne Inhalt“)
GET    /api/storage                Speicher frei/belegt
GET/PUT /api/settings              allgemeine Einstellungen
GET/PUT /api/kidmode               Kindermodus (PIN-geschützt)
POST   /api/player/{play|pause|volume}
```
