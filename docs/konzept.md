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
│   └─ API (aiohttp)   REST + WebSocket, mDNS-Announce        │
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
1. App: „Neuer Token“ → Box geht in Lernmodus (LED blau pulsierend). Liegt schon ein leerer Token auf, gilt er sofort.
2. Token auflegen → Box meldet die UID im Zustand (`learned_uid`), die App öffnet das Blatt „Neuer Token“.
3. App: Inhalt wählen, immer ein ganzes Album, eine Playlist, ein Hörbuch oder ein Podcast:
   - **Suchen:** Spotify-Suche über die Box (siehe „Spotify-Login“).
   - **Meine:** eigene Playlists und gespeicherte Alben aus dem Spotify-Konto der Box.
   - **Link:** Spotify-Link einfügen (in Spotify: Teilen → Link kopieren). Die Box holt Titel und Cover über den
     öffentlichen oEmbed-Dienst von Spotify; das geht auch, wenn die Suche nicht verfügbar ist.
   - später: lokales Medium wählen bzw. hochladen.
4. Name + Farbe vergeben, Wiedergabe wählen (der Reihe nach mit Weiterhören oder zufällig) → speichern. Liegt der neue Token noch auf, spielt er sofort (Bestätigung; Regeln gelten wie beim Auflegen).

**Ein Token = ein ganzer Inhalt**
- Album, Playlist, Hörbuch oder Podcast laufen als Einheit: Weiterhören an Titel und Position, „fertig gehört“ erst
  nach dem letzten Titel. Am Ende jedes Titels meldet go-librespot kurz „spielt nicht“; das zählt nur beim letzten
  Titel als Ende (bei unbekannter Titelliste erst, wenn nach ein paar Sekunden kein nächster Titel kommt).
- Der LED-Ring und die App zeigen den Fortschritt im ganzen Inhalt („Kapitel 3 von 12, insgesamt 34 %“). Die Titelliste
  holt die Box einmal von go-librespot (`/context/tracks`, braucht `metadata.enabled`) oder über die Web API und merkt
  sie sich (Playlists einen Tag lang).
- Pro Token einstellbar: **Zufällige Reihenfolge** (für Musik). Dann startet jedes Auflegen gemischt bei einem
  zufälligen Titel, ohne Weiterhören; der Ring zeigt den Fortschritt im aktuellen Titel.

**Spotify-Login**
Nur ein Login, auf der Box:
- **Wiedergabe (go-librespot):** einmalig per Device-Code (`credentials.type: device_auth`). go-librespot zeigt einen Code
  (auch über `GET /auth/code`), der auf spotify.com/pair eingegeben wird. Die App kann diesen Code später direkt anzeigen.
- **Eigene Bibliothek (Playlists, gespeicherte Alben):** direkt von go-librespot (`/library/playlists`, `/library/albums`),
  das dafür Spotifys interne Dienste nutzt. Ältere go-librespot-Versionen kennen das nicht; dann versucht die Box die Web API.
- **Suche (Web API):** über eine **eigene Spotify-Developer-App** (Client-ID + Secret, Client-Credentials-Verfahren,
  nur Katalog, kein Benutzer-Login). Einrichten in der App: Tab „Box“ → Spotify → „Einrichten“. Ohne sie versucht die Box
  den Schlüssel von go-librespot (`POST /token`); den drosselt Spotify aber stark (429).
- **Angemeldetes Konto:** go-librespot meldet den Benutzernamen (`/status`), den Anzeigenamen holt die Box über die
  Web API (`/users/{name}`), sobald die Suche eingerichtet ist. Die App zeigt beides im Tab „Box“ unter „Spotify“.
- **Konto wechseln:** go-librespot beenden, `~/.config/go-librespot/state.json` zur Seite legen, neu starten und den neuen
  Code auf spotify.com/pair eingeben (im Browser des gewünschten Kontos).

Für die eigentliche Wiedergabe braucht die Box die Web API nicht. Wenn die Web API ausfällt oder ihre Limits erreicht sind,
spielen die Token trotzdem weiter.

**Taster an der Box**

| Taster | kurz | lang (1 s) |
|---|---|---|
| Play/Pause | Pause bzw. weiter (nur mit aufgelegtem Token) | Token von vorn starten (Ring leuchtet kurz ganz in der Token-Farbe) |
| Lauter | lauter (bis zur Grenze) | nächster Titel |
| Leiser | leiser | Titel zurück |
| Lauter + Leiser | | Tasten sperren/entsperren |

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

## API (v1)

Umgesetzt im box-daemon ([box/lauschbox/api.py](../box/lauschbox/api.py)), Port 8080. Die Box schickt bei jeder
Änderung ihren kompletten Zustand über den WebSocket; die App spiegelt ihn nur und ruft für Aktionen REST-Endpunkte auf.

```
GET    /api/status                 kompletter Zustand (Player, Token, Lautstärke, Regeln, LED, Hinweis, Hardware)
WS     /api/events                 {"type": "state", "data": <wie /api/status>} bei jeder Änderung
GET    /api/tokens                 Liste
PUT    /api/tokens/{uid}           Anlegen/Ändern {name, color, shuffle, medium: {uri, title, kind, cover_url}}
DELETE /api/tokens/{uid}
POST   /api/learn                  {active: true|false}
POST   /api/spotify/resolve        {link} → {uri, title, kind, cover_url} (Teilen-Link, Kurzlink oder spotify:-URI)
GET    /api/spotify/auth-code      Code für spotify.com/pair, solange go-librespot auf die Anmeldung wartet
POST   /api/player/{toggle|next|prev|restart}   restart = aufgelegten Token von vorn
GET    /api/spotify/search?q=      Suche (Alben, Playlists, Hörbücher, Podcasts) → [{uri, title, kind, subtitle, cover_url, track_count}]
GET    /api/spotify/library        eigene Playlists und gespeicherte Alben
GET    /api/spotify/account        {available, username, display_name, pair: {url, code}|null, search: app|box, client_id}
PUT    /api/spotify/app            {client_id, client_secret} eigene Spotify-App für die Suche (wird bei Spotify geprüft)
DELETE /api/spotify/app
POST   /api/player/seek            {position_ms}
POST   /api/player/volume          {volume} (wird auf die erlaubte Grenze gekappt)
POST   /api/button                 {name: play_pause|lauter|leiser|lock, press: kurz|lang} (Taster fernbedienen)
POST   /api/lock                   {locked}
POST   /api/sleep                  {kind: off|minutes|episode, minutes}
POST   /api/notice/{id}/dismiss
PUT    /api/settings               Teiländerung der Einstellungen
POST   /api/kidmode/verify         {pin} → {ok}
PUT    /api/kidmode                Teiländerung, Header X-Parent-Pin
POST   /api/sim/token              {uid|null} Token simulieren (nur mit --fake)
```

Noch offen (Entwurf):

```
GET    /api/media                  lokale Medien (Name, Titel, Dauer, Cover-URL, Größe)
POST   /api/media                  neues Medium anlegen {name} → {id}
POST   /api/media/{id}/upload      Datei hochladen (Chunks, Header Upload-Offset), danach Metadaten lesen
GET    /api/media/{id}/cover       Cover-Bild
PATCH  /api/media/{id}             umbenennen, Titelreihenfolge ändern
DELETE /api/media/{id}             Medium löschen (Token darauf werden „ohne Inhalt“)
GET    /api/storage                Speicher frei/belegt
```
