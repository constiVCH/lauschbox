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
│   ├─ Rules           Kindermodus, Max-Lautstärke, Timer     │
│   ├─ Store (SQLite)  Tokens, Fortschritt, Einstellungen     │
│   └─ API (FastAPI)   REST + WebSocket, mDNS-Announce        │
│  go-librespot        Connect-Gerät + API auf localhost:3678 │
│  BLE-Provisioning    WLAN-Daten aus der App empfangen       │
└─────────────────────────────────────────────────────────────┘
                 ▲ WLAN (mDNS _lauschkiste._tcp) / BLE
┌────────────────┴────────────────┐
│ Flutter-App (iOS/Android)       │
└─────────────────────────────────┘
```

## Abläufe

**Token auflegen (ohne App)**
1. PN532 liefert UID → Store-Lookup.
2. Unbekannt → LED kurz orange, nichts passiert.
3. Bekannt → `POST localhost:3678/player/play {uri, skip_to_uri, position}` an go-librespot; je nach Einstellung beim gespeicherten Stand (Titel + Position) fortsetzen oder von vorn.
4. Token abnehmen → Pause (einstellbar), Stand speichern.

**Token anlernen (App)**
1. App: „Neuer Token“ → Box geht in Lernmodus (LED blau pulsierend).
2. Token auflegen → Box sendet UID per WebSocket.
3. App: Spotify-Suche (läuft über die Box-API) → Album/Playlist/Hörbuch wählen, Name + Farbe vergeben → speichern.

**Spotify-Login**
Zwei getrennte Logins:
- **Wiedergabe (go-librespot):** einmalig per Device-Code (`credentials.type: device_auth`). go-librespot zeigt einen Code
  (auch über `GET /auth/code`), der auf spotify.com/pair eingegeben wird. Die App kann diesen Code später direkt anzeigen.
- **Suche/Metadaten (Web API):** Die App macht OAuth (Authorization Code + PKCE) und übergibt den Refresh Token an die Box.
  Die Box erneuert Access Tokens danach selbst (PKCE-Refresh braucht kein Client Secret).

Für die eigentliche Wiedergabe braucht die Box die Web API also nicht. Wenn die Web API ausfällt oder ihre Limits erreicht sind,
spielen die Token trotzdem weiter.

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
- Bitrate 160 kbit/s, kein Audio-Cache auf der SD-Karte (schont Karte und CPU).
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
GET    /api/status                 Zustand, aktueller Token, Lautstärke, Akku
WS     /api/events                 token_placed/removed, player, battery, learn
GET    /api/tokens                 Liste
PUT    /api/tokens/{uid}           Anlegen/Ändern {name, color, source, uri}
DELETE /api/tokens/{uid}
POST   /api/learn                  Lernmodus starten → nächste UID per WS
GET    /api/spotify/search?q=      Proxy zur Spotify-Suche
POST   /api/spotify/auth           Refresh Token von der App übernehmen
GET/PUT /api/settings              allgemeine Einstellungen
GET/PUT /api/kidmode               Kindermodus (PIN-geschützt)
POST   /api/player/{play|pause|volume}
```
