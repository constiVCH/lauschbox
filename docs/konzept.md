# Konzept

## Architektur

```
┌──────────────── Box (Raspberry Pi Zero 2 W) ────────────────┐
│  box-daemon (Python, asyncio)                               │
│   ├─ NfcService      PN532 pollt → token_placed/removed     │
│   ├─ InputService    3 Taster (kurz/lang)                   │
│   ├─ LedService      WS2812-Ring: Zustände, Lautstärke, Akku│
│   ├─ (später) Akku   PiSugar: Ladestand, lädt?, Netz?       │
│   ├─ Player          SpotifyPlayer (go-librespot-API)       │
│   │                  LocalPlayer (mpv, JSON-IPC)            │
│   ├─ media           eigene Dateien auf der SD-Karte        │
│   ├─ Rules           Kindermodus, Max-Lautstärke, Timer     │
│   ├─ Store (SQLite)  Tokens, Medien, Fortschritt, Einst.    │
│   └─ API (aiohttp)   REST + WebSocket, mDNS-Announce        │
│  go-librespot        Connect-Gerät + API auf localhost:3678 │
│  mpv                 eigene Dateien, JSON-IPC (Unix-Socket) │
│   └─ wifi_setup      WLAN per Bluetooth (Improv Wi-Fi)      │
└─────────────────────────────────────────────────────────────┘
                 ▲ WLAN (REST + WebSocket) / Bluetooth LE
┌────────────────┴────────────────┐
│ App (Expo, iOS/Android)         │
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
4. Token abnehmen → nach einer Nachfrist (ab Werk 2 s, in der App 0–5 s) Pause und Stand speichern. Kommt derselbe Token
   in der Nachfrist zurück (Wackeln, Lesefehler), läuft es nahtlos weiter; ein anderer Token wechselt sofort.

**Token anlernen (App)**
1. App: „Neuer Token“ → Box geht in Lernmodus (LED blau pulsierend). Liegt schon ein leerer Token auf, gilt er sofort.
2. Token auflegen → Box meldet die UID im Zustand (`learned_uid`), die App öffnet das Blatt „Neuer Token“.
3. App: Inhalt wählen, immer ein ganzes Album, eine Playlist, ein Hörbuch oder ein Podcast:
   - **Suchen:** Spotify-Suche über die Box (siehe „Spotify-Login“).
   - **Meine:** eigene Playlists und gespeicherte Alben aus dem Spotify-Konto der Box.
   - **Link:** Spotify-Link einfügen (in Spotify: Teilen → Link kopieren). Die Box holt Titel und Cover über den
     öffentlichen oEmbed-Dienst von Spotify; das geht auch, wenn die Suche nicht verfügbar ist.
   - **Dateien:** eigenes Album von der SD-Karte der Box wählen oder vom Handy hochladen.
4. Name + Farbe vergeben, Wiedergabe wählen (der Reihe nach mit Weiterhören oder zufällig) → speichern. Liegt der neue Token noch auf, spielt er sofort (Bestätigung; Regeln gelten wie beim Auflegen).

**Ein Token = ein ganzer Inhalt**
- Album, Playlist, Hörbuch oder Podcast laufen als Einheit: Weiterhören an Titel und Position, „fertig gehört“ erst
  nach dem letzten Titel. Am Ende jedes Titels meldet go-librespot kurz „spielt nicht“; das zählt nur beim letzten
  Titel als Ende (bei unbekannter Titelliste erst, wenn nach ein paar Sekunden kein nächster Titel kommt).
- Der LED-Ring und die App zeigen den Fortschritt im ganzen Inhalt („Kapitel 3 von 12, insgesamt 34 %“). Die Titelliste
  holt die Box einmal von go-librespot (`/context/tracks`, braucht `metadata.enabled`) oder über die Web API und merkt
  sie sich (Playlists einen Tag lang).
- Pro Token einstellbar, die **Wiedergabe-Art**:
  - **Hörspiel** (Vorschlag für Alben und Hörbücher): alle Titel als ein Ganzes, Gesamtfortschritt am Ring und in der App,
    fertig erst nach dem letzten Titel.
  - **Einzelne Titel** (Vorschlag für Playlists): der Reihe nach mit Weiterhören, Ring und Fortschritt pro Titel.
  - **Zufällig**: jedes Auflegen gemischt ab einem zufälligen Titel, ohne Weiterhören.

**Verwalten ohne Terminal**
Nach `box/install.sh` laufen go-librespot und die Box-Software als systemd-Dienste. Die Box darf über eine enge
sudoers-Regel genau diese Befehle ausführen: go-librespot neu starten/stoppen/starten, sich selbst neu starten, Pi neu
starten, ausschalten. Die App (Tab „Einstellungen“, Eltern-PIN) bietet dafür Knöpfe, dazu „Anderes Konto anmelden“
(Spotify-Anmeldung zur Seite legen, neuer Code für spotify.com/pair), „Update installieren“ (git pull, Pakete,
Neustart) und das Log (journalctl beider Dienste).

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
| alle drei | | 3 s: WLAN-Einrichtung per Bluetooth starten bzw. abbrechen |

## Eigene Dateien & Offline-Betrieb

Ziel: Die Box funktioniert auch **ganz ohne WLAN**, z. B. im Auto, im Urlaub oder bei Großeltern ohne Netz.
Dafür gibt es neben Spotify eine zweite Quelle: Audiodateien, die auf der SD-Karte der Box liegen.

**Was offline geht und was nicht**

| | Offline |
|---|---|
| Token mit eigenen Dateien | spielt normal, inkl. Fortsetzen, Tasten, Lautstärke |
| Token mit Spotify-Inhalt | spielt **nicht** (Ring blinkt rot, Hinweis in der App) |
| Kindermodus, Sleep-Timer, Schlafenszeit | funktionieren; die Schlafenszeit braucht die Uhrzeit (später aus der RTC des PiSugar, siehe unten) |
| App-Steuerung | nein (WLAN neu einrichten geht per Bluetooth) |
| Neue Inhalte aufspielen | nein, nur im WLAN |

Spotify-Inhalte lassen sich **nicht** offline verfügbar machen: go-librespot kann keine Offline-Downloads, und Mitschneiden
verstößt gegen die Nutzungsbedingungen. Wer unterwegs hören will, lädt dafür eigene Dateien hoch.

**Eigene Dateien (so gebaut)**
- Ein Album = ein Ordner auf der SD-Karte: `~/.local/share/lauschbox/media/<id>/`, Titel in `title.txt`.
  Ein Token zeigt darauf mit der URI `local:<id>`.
- Reihenfolge nach Dateiname. Formate: MP3, M4A/AAC, OGG/Opus, FLAC, WAV, jeweils **ohne Kopierschutz**
  (selbst gerippte CDs, DRM-freie Käufe, eigene Aufnahmen). Die Box wandelt nichts um.
- Längen liest die Box aus den Dateiköpfen (`mutagen`); damit zeigen Ring und App den Fortschritt im ganzen Album.
- Hochladen in der App (Einstellungen → Eigene Dateien, oder beim Token unter „Dateien“): eine Datei je Anfrage,
  gestreamt, damit auch große Hörbücher nicht in den Speicher müssen. 300 MB bleiben immer frei.
- Speicherbedarf: 128 kbit/s ≈ 58 MB pro Stunde.

**Wiedergabe: mpv**
- Der box-daemon startet mpv bei Bedarf (`--idle`) und steuert es über JSON-IPC (Unix-Socket).
- `MixPlayer` wählt je nach URI Spotify (go-librespot) oder mpv. Regeln, Tasten, LEDs und Hörstand kennen die Quelle nicht.
- Der Verstärker (`plughw`) verträgt nur ein Programm gleichzeitig. Deshalb pausiert die Box vor dem Wechsel den anderen
  Player: go-librespot gibt das Gerät beim Pausieren frei, mpv wird bei Pause ganz gestoppt (die Stelle merkt sich die Box).

**Uhrzeit ohne Internet (mit dem Akku, noch nicht gebaut)**
Der Pi hat keine eigene Uhr. Ohne NTP wüsste die Box nach dem Booten nicht, wie spät es ist, und
die Schlafenszeit wäre falsch. Lösung: die **RTC des PiSugar 3 Air**.
- Beim Booten: Systemzeit aus der RTC setzen (`pisugar-server`: `rtc_rtc2pi`).
- Sobald NTP synchronisiert hat: RTC nachstellen (`rtc_pi2rtc`).
- Ist die Uhrzeit unbekannt (RTC nie gestellt), gelten zeitabhängige Regeln vorsichtig: Lautstärke-Deckel der
  Schlafenszeit aktiv.

**Booten ohne Netz**
- box-daemon wartet beim Start **nicht** auf das Netz. NFC, Tasten, LEDs und lokale Wiedergabe sind sofort bereit.
- go-librespot verbindet sich später selbst, wenn WLAN da ist. Der box-daemon fragt dessen Status ab
  und behandelt Spotify bis dahin als „nicht verfügbar“.

## WLAN-Einrichtung per Bluetooth

Protokoll [Improv Wi-Fi](https://www.improv-wifi.com/) (offener Standard, Bluetooth-Dienst `00467768-6228-2272-4663-277478268000`).
1. Nur von Hand, weil die Box auch ganz ohne WLAN laufen soll: alle drei Taster 3 s halten. Die Box meldet sich dann
   10 Minuten per Bluetooth als „Lauschbox“; der Ring pulsiert blau. Der Tastendruck ist zugleich die Freigabe:
   Ohne Zugang zum Gerät kann niemand in Funkreichweite das WLAN umstellen.
2. Die App schickt Netzname und Passwort; die Box verbindet sich über NetworkManager (`nmcli`) und antwortet mit ihrer
   Adresse (`http://IP:8080`). Die App öffnet die Box direkt, Bluetooth geht wieder aus.
3. NetworkManager merkt sich jedes WLAN. An jedem Ort einmal einrichten, danach verbindet sich die Box dort von selbst.

## Einstellungen

- Startlautstärke, Maximallautstärke, Lautstärkeschritt
- Erneutes Auflegen: fortsetzen (fertig gehörte Folgen starten von vorn) / immer von vorn
- Token abnehmen: pausieren / weiterspielen
- LED: Farben je Zustand, Helligkeit, Nachtmodus (gedimmt)
- Ruhemodus: LED-Ring nach X Minuten ohne Wiedergabe und Bedienung aus
- Sleep-Timer
- später Akku: Warnschwelle, Abschaltschwelle

## Kindermodus

Ein Bündel von Regeln, das die Box „kindersicher“ macht. In der App mit der **Eltern-PIN** geschützt (abschaltbar):

| Funktion | Wirkung |
|---|---|
| Maximallautstärke | Lauter-Taste stoppt bei z. B. 60 % |
| Kein Autoplay | Nach Ende des Albums keine Spotify-Vorschläge (go-librespot `disable_autoplay: true`) |
| Schlafenszeit | z. B. 19:30–7:00: neue Token starten nicht, laufende Folge wird zu Ende gespielt, Lautstärke gedeckelt, LEDs gedimmt |
| Sleep-Timer | Nach X Minuten oder „nach dieser Folge“ ausblenden und stoppen |
| Tagesbudget (noch nicht gebaut) | Maximal X Minuten Hörzeit pro Tag |
| Tastensperre | Langes Drücken von Lauter + Leiser sperrt/entsperrt die Tasten |
| Nur bekannte Token | Unbekannte Tags lösen nichts aus |
| App-Schutz | Einstellungen und Kindermodus nur mit Eltern-PIN; lässt sich abschalten, weil das Kind die App nicht hat |

## Ressourcen (Pi Zero 2 W)

Der Zero 2 W hat vier Kerne (ARMv8, 1 GHz) und 512 MB RAM. Daraus folgt:
- go-librespot (Go, ein Binary) mit eigener lokaler API, ohne Desktop und ohne PipeWire.
- Bitrate 160 kbit/s, kein Audio-Cache für Spotify auf der SD-Karte (schont Karte und CPU). Lokale Medien liegen
  bewusst auf der Karte und werden nur gelesen.
- mpv statt eines eigenen Decoders.
- box-daemon schlank halten: asyncio, keine schweren Abhängigkeiten (kein pandas o. Ä.), NFC-Polling ca. 4–5×/s.
- Bootzeit von 30–40 s einplanen.

## Akku & Laden (später)

- PiSugar 3 Air mit 5000-mAh-LiPo: USB-C-Laden, die Box läuft also auch am Netz. Vorerst nur Netzteil.
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
PUT    /api/tokens/{uid}           Anlegen/Ändern {name, color, mode: hoerspiel|titel|zufall, medium: {uri, title, kind, cover_url}}
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
GET    /api/system/info            {managed, host, version, commit, librespot, uptime_s}
GET    /api/system/log             letzte Zeilen beider Dienste (Header X-Parent-Pin)
POST   /api/system/{restart-spotify|restart-box|reboot|poweroff|spotify-logout|update}   (Header X-Parent-Pin)
POST   /api/sim/token              {uid|null} Token simulieren (nur mit --fake)
GET    /api/media                  {albums: [{uri: local:<id>, title, track_count, duration_ms, size}], free_bytes}
POST   /api/media                  {title} → {uri} neues leeres Album
GET    /api/media/{id}             {title, files: [{name, size, duration_ms}]}
POST   /api/media/{id}/files       eine Datei hochladen (multipart, Feld „file“, gestreamt)
DELETE /api/media/{id}/files/{name}
DELETE /api/media/{id}             Album mit allen Dateien löschen
```

Ist die Eltern-PIN abgeschaltet (`pin_required: false` im Kindermodus), prüft die Box `X-Parent-Pin` nicht.
