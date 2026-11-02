import { useSyncExternalStore } from 'react';

import type { LedMode } from '@/box/types';

import { catalog, mediumByUri, type Medium } from './catalog';

/**
 * Simulierte Box mit den Regeln aus docs/konzept.md (vereinfacht).
 * Die UI spricht nur über diese Schnittstelle; später ersetzt sie ein Client für die box-daemon-API.
 */

export type Progress = { track: number; position: number; finished: boolean };

export type Token = { uid: string; name: string; color: string; mediumUri: string; progress: Progress; shuffle?: boolean };

export type { LedMode };

export type Notice = { id: number; text: string; tone: 'info' | 'warning' | 'success' };

export type SleepTimer = { kind: 'off' } | { kind: 'minutes'; remaining: number; total: number } | { kind: 'episode' };

export type KidMode = {
  enabled: boolean;
  maxVolume: number;
  noAutoplay: boolean;
  bedtimeMaxVolume: number;
  knownTokensOnly: boolean;
};

export type BoxState = {
  tokens: Token[];
  /** UIDs, die in der Ablage neben der Box liegen (bekannte und leere Token). */
  tray: string[];
  placed: string | null;
  playing: boolean;
  track: number;
  position: number;
  volume: number;
  locked: boolean;
  /** Simuliert die Schlafenszeit (abends), ohne auf die echte Uhr zu warten. */
  bedtime: boolean;
  speed: 1 | 30;
  sleep: SleepTimer;
  learning: boolean;
  learnedUid: string | null;
  kid: KidMode;
  led: { mode: LedMode; color: string; fill: number };
  notice: Notice | null;
};

const initialTokens: Token[] = [
  { uid: '04a3f1c2', name: 'Funkel 1', color: '#FF8A3D', mediumUri: catalog[0].uri, progress: { track: 2, position: 74, finished: false } },
  { uid: '04b7d920', name: 'Kapitän Kraut', color: '#2EC4B6', mediumUri: catalog[2].uri, progress: { track: 0, position: 0, finished: false } },
  { uid: '04c19e57', name: 'Schlaflieder', color: '#7B61FF', mediumUri: catalog[3].uri, progress: { track: 0, position: 0, finished: false } },
  { uid: '04d2aa13', name: 'Sternenwald', color: '#5BCB6E', mediumUri: catalog[5].uri, progress: { track: 4, position: 312, finished: false } },
];

const BLANK_UIDS = ['04e8b4f6', '04f05c3d'];

export const isBlank = (state: BoxState, uid: string) => !state.tokens.some((t) => t.uid === uid);

class DemoBox {
  private state: BoxState = {
    tokens: initialTokens,
    tray: [...initialTokens.map((t) => t.uid), ...BLANK_UIDS],
    placed: null,
    playing: false,
    track: 0,
    position: 0,
    volume: 40,
    locked: false,
    bedtime: false,
    speed: 1,
    sleep: { kind: 'off' },
    learning: false,
    learnedUid: null,
    kid: { enabled: true, maxVolume: 60, noAutoplay: true, bedtimeMaxVolume: 30, knownTokensOnly: false },
    led: { mode: 'idle', color: '#FFFFFF', fill: 0 },
    notice: null,
  };

  private listeners = new Set<() => void>();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private flashUntil = 0;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeId = 0;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  get = () => this.state;

  private set(patch: Partial<BoxState>) {
    this.state = { ...this.state, ...patch };
    this.state = { ...this.state, led: this.computeLed() };
    this.syncTicker();
    this.listeners.forEach((fn) => fn());
  }

  // ---------- abgeleitete Werte ----------

  token(uid: string | null = this.state.placed) {
    return this.state.tokens.find((t) => t.uid === uid) ?? null;
  }

  medium(): Medium | null {
    const t = this.token();
    return t ? (mediumByUri(t.mediumUri) ?? null) : null;
  }

  /** Höchste erlaubte Lautstärke unter den aktuellen Regeln. */
  volumeCap(s: BoxState = this.state) {
    let cap = 100;
    if (s.kid.enabled) cap = Math.min(cap, s.kid.maxVolume);
    if (s.kid.enabled && s.bedtime) cap = Math.min(cap, s.kid.bedtimeMaxVolume);
    return cap;
  }

  private computeLed(): BoxState['led'] {
    const s = this.state;
    const prev = s.led;
    if (Date.now() < this.flashUntil) return prev;
    if (s.learning) return { mode: 'learn', color: '#5B9BFF', fill: 1 };
    const t = this.token();
    const m = this.medium();
    if (t && m) {
      const done = m.tracks.slice(0, s.track).reduce((a, tr) => a + tr.seconds, 0) + s.position;
      const total = m.tracks.reduce((a, tr) => a + tr.seconds, 0);
      return { mode: s.playing ? 'playing' : 'paused', color: t.color, fill: total ? done / total : 0 };
    }
    return { mode: 'idle', color: '#FFFFFF', fill: 0 };
  }

  /** Kurzzeitige LED-Anzeige (Lautstärke, unbekannter Token …), danach wieder der normale Zustand. */
  private flash(led: BoxState['led'], ms = 1600) {
    this.flashUntil = Date.now() + ms;
    this.state = { ...this.state, led };
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.flashUntil = 0;
      this.set({});
    }, ms);
    this.listeners.forEach((fn) => fn());
  }

  /** Eine neue Aktion löst eine laufende Kurzanzeige sofort ab. */
  private clearFlash() {
    this.flashUntil = 0;
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = null;
  }

  private notify(text: string, tone: Notice['tone'] = 'info') {
    this.set({ notice: { id: ++this.noticeId, text, tone } });
  }

  dismissNotice = (id: number) => {
    if (this.state.notice?.id === id) this.set({ notice: null });
  };

  // ---------- Token ----------

  place = (uid: string): 'started' | 'learned' | 'unknown' | 'denied' | 'ignored' => {
    const s = this.state;
    this.clearFlash();
    if (s.placed) this.remove();
    if (s.learning) {
      if (!isBlank(this.state, uid)) {
        this.set({ placed: uid });
        this.notify('Dieser Token ist schon angelernt. Leg einen leeren auf.', 'warning');
        return 'ignored';
      }
      this.set({ placed: uid, learnedUid: uid });
      return 'learned';
    }
    const token = this.token(uid);
    if (!token) {
      this.set({ placed: uid });
      if (s.kid.enabled && s.kid.knownTokensOnly) return 'ignored';
      this.flash({ mode: 'unknown', color: '#FF9F40', fill: 1 }, 2000);
      this.notify('Unbekannter Token. Unter „Token“ kannst du ihn anlernen.', 'warning');
      return 'unknown';
    }
    if (s.kid.enabled && s.bedtime) {
      this.set({ placed: uid });
      this.flash({ mode: 'denied', color: '#B07CFF', fill: 1 }, 2000);
      this.notify('Schlafenszeit: Neue Geschichten starten erst morgen früh.', 'info');
      return 'denied';
    }
    const m = mediumByUri(token.mediumUri);
    // Zufall: jedes Mal ein zufälliger Titel, kein Weiterhören
    const p = token.shuffle && m
      ? { track: Math.floor(Math.random() * m.tracks.length), position: 0 }
      : token.progress.finished
        ? { track: 0, position: 0 }
        : token.progress;
    this.set({
      placed: uid,
      playing: true,
      track: p.track,
      position: p.position,
      volume: Math.min(s.volume, this.volumeCap()),
    });
    return 'started';
  };

  remove = () => {
    const s = this.state;
    if (!s.placed) return;
    this.saveProgress();
    this.set({ placed: null, playing: false, sleep: s.sleep.kind === 'episode' ? { kind: 'off' } : s.sleep });
  };

  private saveProgress(finished = false) {
    const s = this.state;
    const uid = s.placed;
    if (!uid || !this.token(uid)) return;
    this.state = {
      ...s,
      tokens: s.tokens.map((t) =>
        t.uid === uid ? { ...t, progress: { track: s.track, position: s.position, finished } } : t,
      ),
    };
  }

  // ---------- Player / Taster ----------

  togglePlay = () => {
    const s = this.state;
    if (!this.token()) return;
    if (!s.playing && s.kid.enabled && s.bedtime) {
      this.flash({ mode: 'denied', color: '#B07CFF', fill: 1 }, 1600);
      this.notify('Schlafenszeit: Weiterhören geht morgen früh wieder.');
      return;
    }
    if (s.playing) this.saveProgress();
    this.set({ playing: !s.playing });
  };

  /** Aufgelegten Token von vorn starten (Play lang drücken) */
  restart = () => {
    const token = this.token();
    if (!token) return;
    const s = this.state;
    if (s.kid.enabled && s.bedtime) {
      this.flash({ mode: 'denied', color: '#B07CFF', fill: 1 }, 1600);
      this.notify('Schlafenszeit: Neue Geschichten starten erst morgen früh.');
      return;
    }
    this.set({ playing: true, track: 0, position: 0 });
    this.flash({ mode: 'playing', color: token.color, fill: 1 }, 900);
    this.notify(`„${token.name}“ startet von vorn.`);
  };

  skip = (dir: 1 | -1) => {
    const m = this.medium();
    if (!m) return;
    const s = this.state;
    // Zurück: in den ersten 3 Sekunden zum vorigen Titel, sonst an den Anfang des aktuellen
    if (dir === -1 && s.position > 3) return this.set({ position: 0 });
    const track = Math.max(0, Math.min(m.tracks.length - 1, s.track + dir));
    this.set({ track, position: 0 });
  };

  seek = (position: number) => {
    const m = this.medium();
    if (!m) return;
    this.set({ position: Math.max(0, Math.min(position, m.tracks[this.state.track].seconds - 1)) });
  };

  setVolume = (v: number, fromBox = false) => {
    const volume = Math.round(Math.max(0, Math.min(v, this.volumeCap())));
    if (volume === this.state.volume && !fromBox) return;
    this.state = { ...this.state, volume };
    if (fromBox) this.flash({ mode: 'volume', color: '#FFFFFF', fill: volume / 100 }, 1200);
    else this.set({});
  };

  /** Hardware-Taster der Box. Bei Tastensperre zeigt der Ring nur kurz Rot. */
  boxButton = (button: 'minus' | 'play' | 'plus') => {
    if (this.state.locked) {
      this.flash({ mode: 'locked', color: '#FF5A4E', fill: 1 }, 900);
      return false;
    }
    if (button === 'play') this.togglePlay();
    else this.setVolume(this.state.volume + (button === 'plus' ? 5 : -5), true);
    return true;
  };

  toggleLock = () => {
    const locked = !this.state.locked;
    this.state = { ...this.state, locked };
    this.flash({ mode: 'locked', color: locked ? '#FF5A4E' : '#5BCB6E', fill: 1 }, 1000);
    this.notify(locked ? 'Tasten gesperrt. Zum Entsperren + und − lange drücken.' : 'Tasten wieder frei.');
  };

  setSleep = (sleep: SleepTimer) => this.set({ sleep });

  setBedtime = (bedtime: boolean) => {
    this.set({ bedtime });
    if (bedtime) this.setVolume(this.state.volume);
  };

  setSpeed = (speed: BoxState['speed']) => this.set({ speed });

  setKid = (patch: Partial<KidMode>) => {
    const kid = { ...this.state.kid, ...patch };
    kid.bedtimeMaxVolume = Math.min(kid.bedtimeMaxVolume, kid.maxVolume);
    this.set({ kid });
    this.setVolume(this.state.volume);
  };

  // ---------- Anlernen / Verwalten ----------

  startLearn = () => {
    this.clearFlash();
    if (this.state.placed) this.remove();
    this.set({ learning: true, learnedUid: null });
  };

  cancelLearn = () => {
    this.clearFlash();
    this.set({ learning: false, learnedUid: null });
  };

  saveToken = (token: Omit<Token, 'progress'>) => {
    const s = this.state;
    const existing = s.tokens.find((t) => t.uid === token.uid);
    const tokens = existing
      ? s.tokens.map((t) =>
          t.uid === token.uid
            ? { ...t, ...token, progress: t.mediumUri === token.mediumUri ? t.progress : { track: 0, position: 0, finished: false } }
            : t,
        )
      : [...s.tokens, { ...token, progress: { track: 0, position: 0, finished: false } }];
    // Neue leere Token nachlegen, damit man weiter anlernen kann
    const tray = existing || s.tray.some((u) => isBlank({ ...s, tokens }, u)) ? s.tray : [...s.tray, randomUid()];
    this.set({ tokens, tray, learning: false, learnedUid: null });
    if (!existing) {
      this.notify(`„${token.name}“ ist angelernt.`, 'success');
      if (s.placed === token.uid) {
        // Der neue Token liegt noch auf: gleich abspielen, als Bestätigung
        this.state = { ...this.state, placed: null };
        this.place(token.uid);
      }
    }
  };

  deleteToken = (uid: string) => {
    if (this.state.placed === uid) this.remove();
    this.set({ tokens: this.state.tokens.filter((t) => t.uid !== uid) });
  };

  // ---------- Zeit ----------

  private syncTicker() {
    const run = this.state.playing || this.state.sleep.kind === 'minutes';
    if (run && !this.ticker) this.ticker = setInterval(this.tick, 1000);
    if (!run && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  private tick = () => {
    const s = this.state;
    const m = this.medium();
    if (!s.playing || !m) return;
    let { track, position, sleep } = s;
    let playing = true;
    let notice: string | null = null;
    position += s.speed;

    if (sleep.kind === 'minutes') {
      const remaining = sleep.remaining - s.speed;
      sleep = remaining > 0 ? { ...sleep, remaining } : { kind: 'off' };
      if (remaining <= 0) {
        playing = false;
        notice = 'Sleep-Timer abgelaufen. Gute Nacht!';
      }
    }

    if (position >= m.tracks[track].seconds) {
      position = 0;
      if (sleep.kind === 'episode') {
        playing = false;
        sleep = { kind: 'off' };
        notice = 'Folge zu Ende, Sleep-Timer hat gestoppt.';
        track = Math.min(track + 1, m.tracks.length - 1);
      } else if (s.kid.enabled && s.bedtime) {
        playing = false;
        notice = 'Schlafenszeit: Der Titel ist zu Ende, die Box macht Pause.';
        track = Math.min(track + 1, m.tracks.length - 1);
      } else if (track + 1 < m.tracks.length) {
        track += 1;
      } else {
        playing = false;
        track = 0;
        this.state = { ...this.state, track: m.tracks.length - 1, position: m.tracks[m.tracks.length - 1].seconds };
        this.saveProgress(true);
        notice = s.kid.enabled && s.kid.noAutoplay
          ? `„${m.title}“ ist zu Ende. Kein Autoplay, die Box bleibt still.`
          : `„${m.title}“ ist zu Ende. Ohne Kindermodus würde Spotify jetzt Vorschläge spielen.`;
      }
    }

    this.set({ track, position, playing, sleep });
    if (!playing) this.saveProgress(this.token()?.progress.finished ?? false);
    if (notice) this.notify(notice);
  };
}

function randomUid() {
  return '04' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
}

export const demoBox = new DemoBox();

export function useDemoBox(): BoxState {
  return useSyncExternalStore(demoBox.subscribe, demoBox.get, demoBox.get);
}
