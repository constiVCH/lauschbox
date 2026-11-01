import { useCallback, useEffect, useRef, useState } from 'react';

/** Client für box/spikes/hwtest_server.py auf dem Testaufbau (Pi 3B+). */

export type ComponentStatus = { ok: boolean; detail: string };

export type HwStatus = {
  host: string;
  model: string;
  cpu_temp_c: number | null;
  uptime_s: number | null;
  throttled: string | null;
  i2c: { address: string; name: string | null }[];
  components: Record<'nfc' | 'buttons' | 'leds' | 'audio', ComponentStatus>;
  token: string | null;
};

export type ButtonName = 'play_pause' | 'lauter' | 'leiser';

export type HwEvent =
  | { type: 'token'; uid: string | null }
  | { type: 'button'; name: ButtonName; press: 'down' | 'up' | 'kurz' | 'lang' };

export type LedCommand =
  | { mode: 'off' }
  | { mode: 'fill' | 'level' | 'test'; color: string; brightness: number; level?: number };

export type ToneCommand = { channel: 'left' | 'both' | 'right'; volume: number; freq?: number; seconds?: number };

export type Connection = 'connecting' | 'online' | 'offline';

export type LogEntry = { id: number; at: Date; text: string };

export function baseUrl(host: string) {
  const h = host.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `http://${h.includes(':') ? h : `${h}:8080`}`;
}

async function request<T>(url: string, init?: RequestInit, timeoutMs = 5000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('Keine Antwort (Zeitüberschreitung)');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const post = <T,>(url: string, body: unknown, timeoutMs?: number) =>
  request<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, timeoutMs);

/**
 * Verbindung zum Testaufbau: Status per REST, Ereignisse per WebSocket.
 * Bricht der WebSocket ab, verbindet der Hook mit wachsendem Abstand neu (1 s … 8 s).
 */
export function useHardware(host: string, onEvent?: (e: HwEvent) => void) {
  const url = baseUrl(host);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [status, setStatus] = useState<HwStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [history, setHistory] = useState<{ uid: string; at: Date }[]>([]);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });
  const logId = useRef(0);
  const currentToken = useRef<string | null | undefined>(undefined);

  const addLog = useCallback((text: string) => {
    setLog((l) => [{ id: ++logId.current, at: new Date(), text }, ...l].slice(0, 30));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await request<HwStatus>(`${url}/api/hw/status`);
      setStatus(s);
      setToken(s.token);
      currentToken.current = s.token;
      setError(null);
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [url]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let failures = 0;

    const connect = async () => {
      setConnection('connecting');
      const s = await refresh();
      if (closed) return;
      if (!s) return scheduleRetry();
      ws = new WebSocket(url.replace(/^http/, 'ws') + '/api/hw/events');
      ws.onopen = () => {
        failures = 0;
        setConnection('online');
      };
      ws.onmessage = (msg) => {
        let e: HwEvent;
        try {
          e = JSON.parse(String(msg.data));
        } catch {
          return;
        }
        if (e.type === 'token') {
          // Der Server schickt beim Verbinden den aktuellen Stand; das ist kein neues Ereignis
          if (e.uid === currentToken.current) return;
          currentToken.current = e.uid;
          setToken(e.uid);
          const uid = e.uid;
          if (uid) setHistory((h) => [{ uid, at: new Date() }, ...h.filter((x) => x.uid !== uid)].slice(0, 5));
          addLog(e.uid ? `Token aufgelegt: ${e.uid}` : 'Token abgenommen');
        } else if (e.type === 'button' && (e.press === 'kurz' || e.press === 'lang')) {
          addLog(`Taste ${buttonLabel[e.name]}: ${e.press}`);
        }
        onEventRef.current?.(e);
      };
      ws.onclose = () => {
        if (closed) return;
        setConnection('offline');
        scheduleRetry();
      };
      ws.onerror = () => ws?.close();
    };

    const scheduleRetry = () => {
      if (closed) return;
      setConnection('offline');
      failures += 1;
      retry = setTimeout(connect, Math.min(8000, 1000 * 2 ** (failures - 1)));
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [url, refresh, addLog, attempt]);

  const reconnect = useCallback(() => setAttempt((a) => a + 1), []);

  const leds = useCallback((cmd: LedCommand) => post(`${url}/api/hw/leds`, cmd), [url]);
  const tone = useCallback((cmd: ToneCommand) => post(`${url}/api/hw/tone`, cmd, 10000), [url]);

  return { url, connection, status, error, token, history, log, refresh, reconnect, leds, tone };
}

export const buttonLabel: Record<ButtonName, string> = { play_pause: 'Play/Pause', lauter: 'Lauter', leiser: 'Leiser' };

/**
 * Ruft fn höchstens alle `ms` Millisekunden auf; der letzte Aufruf geht immer durch.
 * Für Schieberegler, die beim Ziehen live an den Pi senden.
 */
export function useThrottled<A extends unknown[]>(fn: (...args: A) => void, ms = 90) {
  const last = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
  }, []);
  return useCallback(
    (...args: A) => {
      const now = Date.now();
      if (pending.current) clearTimeout(pending.current);
      const wait = last.current + ms - now;
      if (wait <= 0) {
        last.current = now;
        fnRef.current(...args);
      } else {
        pending.current = setTimeout(() => {
          last.current = Date.now();
          fnRef.current(...args);
        }, wait);
      }
    },
    [ms],
  );
}
