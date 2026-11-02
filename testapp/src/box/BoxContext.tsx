import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackToStart } from '@/components/BackToStart';
import { Button, Card, Txt } from '@/components/ui';
import { space, useColors } from '@/theme';

import { RemoteBox } from './remoteBox';
import type { BoxApi, BoxView } from './types';

// ---------- Welche Box ist gewählt? (IP[:Port] des box-daemon) ----------

let activeHost: string | null = null;
const hostListeners = new Set<() => void>();

export function setActiveBox(host: string) {
  activeHost = host;
  hostListeners.forEach((fn) => fn());
}

function useActiveHost() {
  return useSyncExternalStore(
    (fn) => {
      hostListeners.add(fn);
      return () => hostListeners.delete(fn);
    },
    () => activeHost,
    () => activeHost,
  );
}

// ---------- Context ----------

type BoxContextValue = { view: BoxView | null; api: BoxApi; url: string; reconnect?: () => void };

const Ctx = createContext<BoxContextValue | null>(null);

/** Für Bildschirme innerhalb von <RequireBox>: Box ist verbunden. */
export function useBox(): { view: BoxView; api: BoxApi } {
  const value = useContext(Ctx);
  if (!value?.view) throw new Error('useBox ohne verbundene Box (RequireBox fehlt?)');
  return { view: value.view, api: value.api };
}

type Source = {
  subscribe: (fn: () => void) => () => void;
  get: () => BoxView | null;
  api: BoxApi;
  url: string;
  start?: () => void;
  close?: () => void;
  reconnect?: () => void;
};

function remoteSource(host: string): Source {
  const remote = new RemoteBox(host);
  return {
    subscribe: remote.subscribe,
    get: remote.get,
    api: remote.api,
    url: remote.url,
    start: () => remote.start(),
    close: () => remote.close(),
    reconnect: remote.reconnect,
  };
}

// Ohne Box zeigt RequireBox nur „Verbinde …“; api wird dann nie aufgerufen
const NO_BOX: Source = { subscribe: () => () => {}, get: () => null, api: {} as BoxApi, url: '' };

/**
 * Hängt an der Wurzel der App, damit auch Blätter (Token bearbeiten) die Box kennen.
 * Immer derselbe Provider (nur die Quelle wechselt), sonst würde die Navigation neu aufgebaut.
 */
export function ActiveBoxProvider({ children }: { children: ReactNode }) {
  const host = useActiveHost();
  const source = useMemo(() => (host ? remoteSource(host) : NO_BOX), [host]);
  useEffect(() => {
    source.start?.();
    return () => source.close?.();
  }, [source]);
  const view = useSyncExternalStore(source.subscribe, source.get, source.get);
  const value = useMemo(() => ({ view, api: source.api, url: source.url, reconnect: source.reconnect }), [view, source]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Zeigt die Kinder erst, wenn die Box ihren Zustand geschickt hat. */
export function RequireBox({ children }: { children: ReactNode }) {
  const value = useContext(Ctx);
  if (value?.view) return <>{children}</>;
  return <Connecting url={value?.url ?? ''} onRetry={value?.reconnect} />;
}

function Connecting({ url, onRetry }: { url: string; onRetry?: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top + space.sm }]}>
      <View style={{ alignSelf: 'flex-start', marginLeft: space.sm }}>
        <BackToStart />
      </View>
      <View style={styles.center}>
        <Card style={styles.card}>
          {slow ? <Ionicons name="wifi" size={30} color={c.textTertiary} /> : <ActivityIndicator color={c.textSecondary} />}
          <Txt variant="headline" style={{ textAlign: 'center' }}>
            {slow ? 'Box antwortet nicht' : 'Verbinde mit der Box …'}
          </Txt>
          <Txt variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
            {url}
            {slow ? '\nLäuft auf der Box python -m lauschbox? Sind Handy und Box im selben WLAN?' : ''}
          </Txt>
          {slow && onRetry && <Button label="Erneut versuchen" icon="refresh" kind="secondary" compact onPress={onRetry} />}
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: space.lg },
  card: { alignItems: 'center', gap: space.md, paddingVertical: space.xl, maxWidth: 480, width: '100%', alignSelf: 'center' },
});
