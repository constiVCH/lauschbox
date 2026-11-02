/**
 * Gemeinsame Sicht auf eine Box, egal ob simuliert (Demo) oder echt (box-daemon über WLAN).
 * Die Bildschirme kennen nur BoxView und BoxApi.
 */

export type LedMode = 'off' | 'idle' | 'playing' | 'paused' | 'volume' | 'learn' | 'unknown' | 'denied' | 'locked' | 'unlocked' | 'error';

export type Medium = {
  uri: string;
  title: string;
  kind: string;
  kindLabel: string;
  /** Künstler, Autor oder Besitzer der Playlist */
  subtitle?: string;
  coverUrl?: string | null;
  /** Platzhalter-Cover der Demo */
  color?: string;
  emoji?: string;
  trackCount?: number;
  durationS?: number;
};

export type TokenProgress = {
  trackNumber?: number | null;
  trackName?: string | null;
  positionS: number;
  finished: boolean;
  /** 0..1, nur wenn die Gesamtlänge bekannt ist (Demo) */
  fraction?: number;
};

/** hoerspiel: alle Titel als ein Ganzes · titel: der Reihe nach, Fortschritt pro Titel · zufall: gemischt */
export type PlayMode = 'hoerspiel' | 'titel' | 'zufall';

export const PLAY_MODES: { value: PlayMode; label: string; hint: string }[] = [
  {
    value: 'hoerspiel',
    label: 'Hörspiel',
    hint: 'Alle Kapitel sind ein Ganzes: Der Ring zeigt den Fortschritt im ganzen Hörspiel, es geht beim nächsten Auflegen an derselben Stelle weiter.',
  },
  {
    value: 'titel',
    label: 'Einzelne Titel',
    hint: 'Der Reihe nach, aber jeder Titel zählt für sich: Der Ring zeigt den Fortschritt im aktuellen Titel.',
  },
  { value: 'zufall', label: 'Zufällig', hint: 'Jedes Auflegen startet gemischt bei einem zufälligen Titel. Gut für Musik.' },
];

/** Vorschlag je nach Inhalt: Hörspiele kommen bei Spotify als Album oder Hörbuch, Musik eher als Playlist. */
export const defaultMode = (kind: string): PlayMode => (kind === 'album' || kind === 'audiobook' ? 'hoerspiel' : 'titel');

export type Token = {
  uid: string;
  name: string;
  color: string;
  medium: Medium;
  progress: TokenProgress;
  mode: PlayMode;
};

export type NowPlaying = {
  trackTitle: string;
  trackNumber?: number | null;
  trackCount?: number;
  positionS: number;
  durationS: number;
  playing: boolean;
  coverUrl?: string | null;
  /** Fortschritt im ganzen Inhalt, falls die Titelliste bekannt ist */
  contextPositionS?: number;
  contextDurationS?: number;
};

export type Notice = { id: number; text: string; tone: 'info' | 'warning' | 'success' };

export type SleepView = { kind: 'off' } | { kind: 'minutes'; remainingS: number; totalS: number } | { kind: 'episode' };

export type KidView = {
  enabled: boolean;
  maxVolume: number;
  noAutoplay: boolean;
  bedtimeEnabled: boolean;
  bedtimeFrom: string;
  bedtimeTo: string;
  bedtimeMaxVolume: number;
  knownTokensOnly: boolean;
};

export type BoxView = {
  kind: 'demo' | 'remote';
  name: string;
  connection: 'online' | 'connecting' | 'offline';
  connectionError?: string | null;
  tokens: Token[];
  placed: string | null;
  /** Token, dessen Inhalt gerade im Player liegt */
  loadedUid: string | null;
  now: NowPlaying | null;
  playerAvailable: boolean;
  playerError?: string | null;
  volume: number;
  volumeCap: number;
  locked: boolean;
  bedtimeActive: boolean;
  sleep: SleepView;
  learning: boolean;
  learnedUid: string | null;
  kid: KidView;
  led: { mode: LedMode; color: string; fill: number; brightness?: number };
  notice: Notice | null;
  /** Token per App auflegen (Demo und box-daemon mit --fake) */
  sim: { tray: string[] } | null;
  /** Nur Demo: Zeitraffer und „Abends“ vorspielen */
  demo: { speed: 1 | 30; bedtime: boolean } | null;
};

export type BoxButton = 'minus' | 'play' | 'plus';

export type SystemAction = 'restart-spotify' | 'restart-box' | 'reboot' | 'poweroff' | 'spotify-logout' | 'update';

export type SystemInfo = {
  /** Laufen go-librespot und die Box-Software als Dienste (install.sh ausgeführt)? */
  managed: boolean;
  host: string;
  version: string;
  commit: string | null;
  librespot: string | null;
  uptimeS: number | null;
  simulated: boolean;
};

/** Spotify-Anmeldung der Box */
export type SpotifyAccount = {
  available: boolean;
  username: string | null;
  displayName: string | null;
  /** Code für spotify.com/pair, solange niemand angemeldet ist */
  pair: { url: string; code: string } | null;
  /** app = eigene Spotify-App eingerichtet, box = nur Anmeldung der Box (wird oft gedrosselt) */
  search: 'app' | 'box' | 'simulated';
  clientId: string | null;
};

export interface BoxApi {
  togglePlay(): void;
  /** Aufgelegten Token von vorn starten (wie Play lang drücken) */
  restart(): void;
  skip(dir: 1 | -1): void;
  seek(positionS: number): void;
  setVolume(volume: number): void;
  boxButton(button: BoxButton): void;
  setLock(locked: boolean): void;
  setSleep(sleep: { kind: 'off' } | { kind: 'minutes'; minutes: number } | { kind: 'episode' }): void;
  startLearn(): void;
  cancelLearn(): void;
  saveToken(token: { uid: string; name: string; color: string; medium: Medium; mode: PlayMode }): Promise<void>;
  deleteToken(uid: string): Promise<void>;
  dismissNotice(id: number): void;
  verifyPin(pin: string): Promise<boolean>;
  setKid(patch: Partial<KidView>, pin: string): Promise<void>;
  /** Nur mit sim: Token auflegen/abnehmen */
  place?(uid: string): void;
  remove?(): void;
  /** Echte Box: Spotify-Link → Inhalt */
  resolveLink?(text: string): Promise<Medium>;
  /** Echte Box: Spotify durchsuchen (Alben, Playlists, Hörbücher, Podcasts) */
  search?(query: string): Promise<Medium[]>;
  /** Echte Box: eigene Playlists und gespeicherte Alben */
  library?(): Promise<Medium[]>;
  /** Echte Box: angemeldetes Spotify-Konto */
  spotifyAccount?(): Promise<SpotifyAccount>;
  /** Echte Box: eigene Spotify-App für die Suche hinterlegen (null = entfernen) */
  setSpotifyApp?(app: { clientId: string; clientSecret: string } | null): Promise<void>;
  /** Box verwalten (statt Terminal) */
  systemInfo(): Promise<SystemInfo>;
  systemAction(action: SystemAction, pin: string): Promise<string | null>;
  systemLog(pin: string): Promise<string>;
  /** Demo: fester Katalog statt Spotify */
  catalog?: Medium[];
  demo?: { setSpeed(speed: 1 | 30): void; setBedtime(on: boolean): void };
}

export const KIND_LABELS: Record<string, string> = {
  album: 'Album',
  playlist: 'Playlist',
  show: 'Podcast',
  episode: 'Folge',
  track: 'Titel',
  artist: 'Künstler',
  audiobook: 'Hörbuch',
};
