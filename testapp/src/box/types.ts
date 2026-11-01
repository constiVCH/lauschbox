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

export type Token = { uid: string; name: string; color: string; medium: Medium; progress: TokenProgress };

export type NowPlaying = {
  trackTitle: string;
  trackNumber?: number | null;
  trackCount?: number;
  positionS: number;
  durationS: number;
  playing: boolean;
  coverUrl?: string | null;
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

export interface BoxApi {
  togglePlay(): void;
  skip(dir: 1 | -1): void;
  seek(positionS: number): void;
  setVolume(volume: number): void;
  boxButton(button: BoxButton): void;
  setLock(locked: boolean): void;
  setSleep(sleep: { kind: 'off' } | { kind: 'minutes'; minutes: number } | { kind: 'episode' }): void;
  startLearn(): void;
  cancelLearn(): void;
  saveToken(token: { uid: string; name: string; color: string; medium: Medium }): Promise<void>;
  deleteToken(uid: string): Promise<void>;
  dismissNotice(id: number): void;
  verifyPin(pin: string): Promise<boolean>;
  setKid(patch: Partial<KidView>, pin: string): Promise<void>;
  /** Nur mit sim: Token auflegen/abnehmen */
  place?(uid: string): void;
  remove?(): void;
  /** Echte Box: Spotify-Link → Inhalt */
  resolveLink?(text: string): Promise<Medium>;
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
