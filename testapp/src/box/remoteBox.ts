
import { KIND_LABELS, type BoxApi, type BoxView, type Medium, type Notice, type PlayMode, type SpotifyAccount } from './types';

/** Zustand, wie ihn der box-daemon schickt (box/lauschbox/engine.py, snapshot()). */
type RawMedium = {
  uri: string;
  title: string;
  kind: string;
  cover_url: string | null;
  subtitle?: string;
  track_count?: number | null;
  duration_ms?: number;
  size?: number;
};
type RawState = {
  player: {
    available: boolean;
    playing: boolean;
    track_uri: string | null;
    track_name: string | null;
    track_number: number | null;
    cover_url: string | null;
    position_ms: number;
    duration_ms: number;
    error: string | null;
    track_index: number | null;
    track_count: number | null;
    context_position_ms: number | null;
    context_duration_ms: number | null;
  };
  placed: string | null;
  loaded: string | null;
  removal_pending?: boolean;
  settings: { remove_grace_s?: number; fade_in_s?: number; led_brightness?: number; night_brightness?: number; standby_min?: number };
  volume: number;
  volume_cap: number;
  locked: boolean;
  bedtime_active: boolean;
  sleep: { kind: 'off' | 'minutes' | 'episode'; remaining_s?: number; total_s?: number };
  learning: boolean;
  learned_uid: string | null;
  led: BoxView['led'];
  notice: Notice | null;
  tokens: {
    uid: string;
    name: string;
    color: string;
    medium: RawMedium;
    progress: { track_number: number | null; track_name: string | null; position_ms: number; finished: boolean; fraction: number | null };
    mode: PlayMode;
  }[];
  kid: {
    enabled: boolean;
    max_volume: number;
    no_autoplay: boolean;
    bedtime_enabled: boolean;
    bedtime_from: string;
    bedtime_to: string;
    bedtime_max_volume: number;
    known_tokens_only: boolean;
    pin_required?: boolean;
  };
  box: { name: string; version: string; simulated: boolean; hardware?: Record<string, { ok: boolean; detail: string }> };
};

const medium = (m: RawMedium): Medium => ({
  uri: m.uri,
  title: m.title,
  kind: m.kind,
  kindLabel: KIND_LABELS[m.kind] ?? m.kind,
  subtitle: m.subtitle,
  coverUrl: m.cover_url,
  trackCount: m.track_count ?? undefined,
  durationS: m.duration_ms !== undefined ? m.duration_ms / 1000 : undefined,
  sizeBytes: m.size,
});

/** „192.168.1.5“ oder „box.local:8080“ → http://…:8080 */
export function baseUrl(host: string) {
  const h = host.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `http://${h.includes(':') ? h : `${h}:8080`}`;
}

/** local:<id> → <id> */
const localId = (uri: string) => encodeURIComponent(uri.replace(/^local:/, ''));

function randomUid() {
  return 'sim' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
}

/**
 * Verbindung zur echten Box. Hält den WebSocket offen (Neuverbindung 1 s … 8 s) und bietet dieselbe
 * Schnittstelle BoxApi. Fehler bei Aktionen erscheinen als Hinweis.
 */
export class RemoteBox {
  readonly url: string;
  private raw: RawState | null = null;
  private connection: BoxView['connection'] = 'connecting';
  private connectionError: string | null = null;
  private localNotice: Notice | null = null;
  private localNoticeId = 100000;
  private blankUid = randomUid();
  private view: BoxView | null = null;
  private listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private closed = false;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private lastSeen = 0;
  /** Ältere Box-Software antwortet nicht auf „ping“; dann nur auf das Schließen der Verbindung verlassen */
  private answersPing = false;

  constructor(host: string) {
    this.url = baseUrl(host);
  }

  /** Verbindung aufbauen (aus einem Effekt heraus, nicht beim Rendern). */
  start() {
    this.closed = false;
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) this.connect();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  get = () => this.view;

  close() {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    if (this.watchdog) clearInterval(this.watchdog);
    this.ws?.close();
    this.ws = null;
  }

  reconnect = () => {
    this.failures = 0;
    if (this.retry) clearTimeout(this.retry);
    this.ws?.close();
    this.connect();
  };

  private changed() {
    this.view = this.raw ? this.toView(this.raw) : null;
    this.listeners.forEach((fn) => fn());
  }

  private connect() {
    if (this.closed) return;
    this.connection = 'connecting';
    this.changed();
    const ws = new WebSocket(this.url.replace(/^http/, 'ws') + '/api/events');
    this.ws = ws;
    ws.onopen = () => {
      this.lastSeen = Date.now();
      this.startWatchdog(ws);
      this.failures = 0;
      this.connection = 'online';
      this.connectionError = null;
      this.changed();
    };
    ws.onmessage = (msg) => {
      this.lastSeen = Date.now();
      try {
        const data = JSON.parse(String(msg.data));
        if (data.type === 'pong') this.answersPing = true;
        if (data.type === 'state') {
          this.raw = data.data as RawState;
          this.changed();
        }
      } catch {
        // Unbekannte Nachricht: ignorieren
      }
    };
    ws.onerror = () => {
      this.connectionError = `Keine Verbindung zu ${this.url}`;
    };
    ws.onclose = () => this.lost(ws);
  }

  /** Verbindung weg (geschlossen oder stumm): offline anzeigen und neu verbinden. */
  private lost(ws: WebSocket) {
    if (this.closed || this.ws !== ws) return;
    this.ws = null;
    if (this.watchdog) clearInterval(this.watchdog);
    this.connection = 'offline';
    this.changed();
    this.failures += 1;
    this.retry = setTimeout(() => this.connect(), Math.min(8000, 1000 * 2 ** (this.failures - 1)));
  }

  /**
   * Startet die Box neu oder fällt das WLAN weg, meldet Android das Ende der Verbindung oft erst nach Minuten.
   * Deshalb alle 3 s anfragen; kommt 7 s lang nichts zurück, gilt die Box als weg.
   */
  private startWatchdog(ws: WebSocket) {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = setInterval(() => {
      if (this.answersPing && Date.now() - this.lastSeen > 7000) {
        this.lost(ws);
        ws.close();
        return;
      }
      try {
        ws.send('ping');
      } catch {
        // schließt gerade; lost() kommt über onclose
      }
    }, 3000);
  }

  private toView(r: RawState): BoxView {
    const known = new Set(r.tokens.map((t) => t.uid));
    // Nach dem Anlernen ist der simulierte leere Token kein leerer mehr: neuen nachlegen
    if (known.has(this.blankUid)) this.blankUid = randomUid();
    const p = r.player;
    const loaded = r.tokens.find((t) => t.uid === r.loaded);
    return {
      name: r.box.name,
      connection: this.connection,
      connectionError: this.connectionError,
      tokens: r.tokens.map((t) => ({
        uid: t.uid,
        name: t.name,
        color: t.color,
        medium: medium(t.medium),
        progress: {
          trackNumber: t.progress.track_number,
          trackName: t.progress.track_name,
          positionS: t.progress.position_ms / 1000,
          finished: t.progress.finished,
          fraction: t.progress.fraction ?? undefined,
        },
        mode: t.mode,
      })),
      placed: r.placed,
      loadedUid: r.loaded,
      now:
        p.track_uri && loaded
          ? {
              trackTitle: p.track_name ?? 'Unbekannter Titel',
              // Stelle in der Playlist bzw. im Hörspiel, sonst die Titelnummer im Album
              trackNumber: p.track_index !== null ? p.track_index + 1 : p.track_number,
              trackCount: p.track_count ?? undefined,
              contextPositionS: p.context_position_ms !== null ? p.context_position_ms / 1000 : undefined,
              contextDurationS: p.context_duration_ms !== null ? p.context_duration_ms / 1000 : undefined,
              positionS: p.position_ms / 1000,
              durationS: p.duration_ms / 1000,
              playing: p.playing,
              coverUrl: p.cover_url ?? loaded.medium.cover_url,
            }
          : null,
      playerAvailable: p.available,
      playerError: p.error,
      volume: r.volume,
      volumeCap: r.volume_cap,
      locked: r.locked,
      bedtimeActive: r.bedtime_active,
      sleep:
        r.sleep.kind === 'minutes'
          ? { kind: 'minutes', remainingS: r.sleep.remaining_s ?? 0, totalS: r.sleep.total_s ?? 0 }
          : { kind: r.sleep.kind },
      learning: r.learning,
      learnedUid: r.learned_uid,
      kid: {
        enabled: r.kid.enabled,
        maxVolume: r.kid.max_volume,
        noAutoplay: r.kid.no_autoplay,
        bedtimeEnabled: r.kid.bedtime_enabled,
        bedtimeFrom: r.kid.bedtime_from,
        bedtimeTo: r.kid.bedtime_to,
        bedtimeMaxVolume: r.kid.bedtime_max_volume,
        knownTokensOnly: r.kid.known_tokens_only,
        pinRequired: r.kid.pin_required ?? true, // ältere Box-Software kennt das nicht
      },
      led: r.led,
      notice: this.localNotice ?? r.notice,
      sim: r.box.simulated ? { tray: [...r.tokens.map((t) => t.uid), this.blankUid] } : null,
      hardware: r.box.hardware ?? {},
      settings: {
        removeGraceS: r.settings?.remove_grace_s ?? 2,
        fadeInS: r.settings?.fade_in_s ?? 1,
        ledBrightness: r.settings?.led_brightness ?? 0.25,
        nightBrightness: r.settings?.night_brightness ?? 0.08,
        standbyMin: r.settings?.standby_min ?? 10,
      },
      removalPending: !!r.removal_pending,
    };
  }

  private fail(e: unknown) {
    const text = e instanceof Error ? e.message : String(e);
    this.localNotice = { id: ++this.localNoticeId, text, tone: 'warning' };
    this.changed();
  }

  private async call<T = unknown>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(this.url + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.status === 404 && path.startsWith('/api/media'))
        throw new Error('Die Box-Software ist zu alt dafür. Einstellungen → „Update installieren“.');
      if (!res.ok) throw new Error((await res.text()) || `Fehler ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw new Error('Die Box antwortet nicht.');
      if (e instanceof TypeError) throw new Error('Box nicht erreichbar. Gleiches WLAN?');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Aktion ohne Rückgabe: Fehler werden als Hinweis angezeigt. */
  private fire(method: string, path: string, body?: unknown) {
    this.call(method, path, body).catch((e) => this.fail(e));
  }

  readonly api: BoxApi = {
    togglePlay: () => this.fire('POST', '/api/player/toggle'),
    restart: () => this.fire('POST', '/api/player/restart'),
    skip: (dir) => this.fire('POST', dir > 0 ? '/api/player/next' : '/api/player/prev'),
    seek: (s) => this.fire('POST', '/api/player/seek', { position_ms: Math.round(s * 1000) }),
    setVolume: (v) => this.fire('POST', '/api/player/volume', { volume: Math.round(v) }),
    boxButton: (b) =>
      this.fire('POST', '/api/button', { name: b === 'play' ? 'play_pause' : b === 'plus' ? 'lauter' : 'leiser', press: 'kurz' }),
    setLock: (locked) => this.fire('POST', '/api/lock', { locked }),
    setSleep: (s) => this.fire('POST', '/api/sleep', s.kind === 'minutes' ? { kind: 'minutes', minutes: s.minutes } : { kind: s.kind }),
    startLearn: () => this.fire('POST', '/api/learn', { active: true }),
    cancelLearn: () => this.fire('POST', '/api/learn', { active: false }),
    saveToken: async ({ uid, name, color, medium: m, mode }) => {
      await this.call('PUT', `/api/tokens/${encodeURIComponent(uid)}`, {
        name,
        color,
        mode,
        medium: { uri: m.uri, title: m.title, kind: m.kind, cover_url: m.coverUrl ?? null },
      });
    },
    deleteToken: async (uid) => {
      await this.call('DELETE', `/api/tokens/${encodeURIComponent(uid)}`);
    },
    dismissNotice: (id) => {
      if (this.localNotice?.id === id) {
        this.localNotice = null;
        this.changed();
      } else this.fire('POST', `/api/notice/${id}/dismiss`);
    },
    setSettings: async (patch) => {
      const body: Record<string, unknown> = {};
      if (patch.removeGraceS !== undefined) body.remove_grace_s = patch.removeGraceS;
      if (patch.fadeInS !== undefined) body.fade_in_s = patch.fadeInS;
      if (patch.ledBrightness !== undefined) body.led_brightness = patch.ledBrightness;
      if (patch.nightBrightness !== undefined) body.night_brightness = patch.nightBrightness;
      if (patch.standbyMin !== undefined) body.standby_min = patch.standbyMin;
      await this.call('PUT', '/api/settings', body).catch((e) => this.fail(e));
    },
    verifyPin: async (pin) => (await this.call<{ ok: boolean }>('POST', '/api/kidmode/verify', { pin })).ok,
    setKid: async (patch, pin) => {
      const map: Record<string, string> = {
        enabled: 'enabled',
        maxVolume: 'max_volume',
        noAutoplay: 'no_autoplay',
        bedtimeEnabled: 'bedtime_enabled',
        bedtimeFrom: 'bedtime_from',
        bedtimeTo: 'bedtime_to',
        bedtimeMaxVolume: 'bedtime_max_volume',
        knownTokensOnly: 'known_tokens_only',
        pinRequired: 'pin_required',
        pin: 'pin',
      };
      const body = Object.fromEntries(Object.entries(patch).map(([k, v]) => [map[k], v]));
      await this.call('PUT', '/api/kidmode', body, { 'X-Parent-Pin': pin }).catch((e) => this.fail(e));
    },
    place: (uid) => this.fire('POST', '/api/sim/token', { uid }),
    remove: () => this.fire('POST', '/api/sim/token', { uid: null }),
    resolveLink: async (text) => {
      const m = await this.call<RawMedium>('POST', '/api/spotify/resolve', { link: text });
      return medium(m);
    },
    search: async (query) =>
      (await this.call<RawMedium[]>('GET', `/api/spotify/search?q=${encodeURIComponent(query)}`)).map(medium),
    library: async () => (await this.call<RawMedium[]>('GET', '/api/spotify/library')).map(medium),
    localMedia: async () => {
      const r = await this.call<{ albums: RawMedium[]; free_bytes: number }>('GET', '/api/media');
      return { albums: r.albums.map(medium), freeBytes: r.free_bytes };
    },
    createLocalAlbum: async (title) => (await this.call<{ uri: string }>('POST', '/api/media', { title })).uri,
    uploadLocalFile: async (albumUri, file) => {
      // Ohne die 10-s-Grenze von call(): ein Hörbuch braucht im WLAN der Box auch mal Minuten
      const form = new FormData();
      form.append('file', { uri: file.uri, name: file.name, type: file.mimeType ?? 'audio/mpeg' } as unknown as Blob);
      // XMLHttpRequest statt fetch: Expos fetch kann Dateien vom Handy ({uri, name, type}) nicht als Formular senden
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${this.url}/api/media/${localId(albumUri)}/files`);
        xhr.onload = () => (xhr.status < 400 ? resolve() : reject(new Error(xhr.responseText || `Fehler ${xhr.status}`)));
        xhr.onerror = () => reject(new Error(`Hochladen von „${file.name}“ abgebrochen. Box nicht erreichbar?`));
        xhr.send(form);
      });
    },
    deleteLocalAlbum: async (albumUri) => {
      await this.call('DELETE', `/api/media/${localId(albumUri)}`);
    },
    localAlbum: async (albumUri) => {
      const r = await this.call<{ title: string; files: { name: string; size: number; duration_ms: number }[] }>(
        'GET',
        `/api/media/${localId(albumUri)}`,
      );
      return { title: r.title, files: r.files.map((f) => ({ name: f.name, sizeBytes: f.size, durationS: f.duration_ms / 1000 })) };
    },
    deleteLocalFile: async (albumUri, name) => {
      await this.call('DELETE', `/api/media/${localId(albumUri)}/files/${encodeURIComponent(name)}`);
    },
    spotifyAccount: async () => {
      const a = await this.call<{
        available: boolean;
        username: string | null;
        display_name: string | null;
        pair: { url: string; code: string } | null;
        search: SpotifyAccount['search'];
        client_id: string | null;
      }>('GET', '/api/spotify/account');
      return { available: a.available, username: a.username, displayName: a.display_name, pair: a.pair, search: a.search, clientId: a.client_id };
    },
    systemInfo: async () => {
      const i = await this.call<{
        managed: boolean;
        host: string;
        version: string;
        commit: string | null;
        librespot: string | null;
        uptime_s: number | null;
        simulated: boolean;
      }>('GET', '/api/system/info');
      return { managed: i.managed, host: i.host, version: i.version, commit: i.commit, librespot: i.librespot, uptimeS: i.uptime_s, simulated: i.simulated };
    },
    systemAction: async (action, pin) =>
      (await this.call<{ output?: string | null }>('POST', `/api/system/${action}`, {}, { 'X-Parent-Pin': pin })).output ?? null,
    systemLog: async (pin) => (await this.call<{ log: string }>('GET', '/api/system/log', undefined, { 'X-Parent-Pin': pin })).log,
    setSpotifyApp: async (app) => {
      if (app) await this.call('PUT', '/api/spotify/app', { client_id: app.clientId, client_secret: app.clientSecret });
      else await this.call('DELETE', '/api/spotify/app');
    },
  };
}
