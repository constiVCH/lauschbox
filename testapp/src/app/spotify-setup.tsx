import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RequireBox, useBox } from '@/box/BoxContext';
import type { SpotifyAccount, SystemAction } from '@/box/types';
import { useSpotifyAccount } from '@/box/useSpotifyAccount';
import { confirm } from '@/components/confirm';
import { PinGate, useParentPin } from '@/components/PinGate';
import { Button, Card, Row, Section, Txt } from '@/components/ui';
import { radius, space, type, useColors } from '@/theme';

const DASHBOARD = 'https://developer.spotify.com/dashboard';
const REDIRECT = 'http://127.0.0.1:8888/callback';

export default function SpotifyScreen() {
  return (
    <RequireBox>
      <SpotifyConnect />
    </RequireBox>
  );
}

/**
 * Spotify verbinden, alles an einer Stelle. Spotify trennt Abspielen (Anmeldung der Box per Code) und Suchen
 * (eigene, kostenlose Entwickler-App). Beides wird hier nacheinander eingerichtet.
 */
function SpotifyConnect() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { account, reload } = useSpotifyAccount();
  const loggedIn = !!account?.username;
  const searchReady = account?.search === 'app' || account?.search === 'simulated';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.bar, { paddingTop: Platform.OS === 'ios' ? space.md : insets.top + space.sm }]}>
        <View style={{ width: 90 }} />
        <Txt variant="headline">Spotify</Txt>
        <View style={{ width: 90, alignItems: 'flex-end' }}>
          <Button label="Fertig" kind="plain" compact onPress={() => router.back()} />
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
        <Summary account={account} />

        <Section
          title="1 · Konto der Box"
          footer="Mit diesem Konto spielt die Box. Ein betreutes Kinderkonto im Family-Abo kann funktionieren; neue Konten lehnt Spotify für Geräte wie die Box manchmal ab."
        >
          <AccountStep account={account} onChanged={reload} />
        </Section>

        <Section
          title="2 · Suche (einmalig)"
          footer="Die Box sucht damit nur im öffentlichen Spotify-Katalog. Ohne diesen Schritt gehen beim Anlernen „Meine“ und Links trotzdem."
        >
          <SearchStep account={account} loggedIn={loggedIn} ready={searchReady} onChanged={reload} />
        </Section>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Summary({ account }: { account: SpotifyAccount | null }) {
  const c = useColors();
  if (!account) return <ActivityIndicator color={c.textSecondary} style={{ marginVertical: space.xl }} />;
  const name = account.displayName ?? account.username;
  const searchReady = account.search === 'app' || account.search === 'simulated';
  const ok = !!account.username && account.available;
  return (
    <Card style={styles.summary}>
      <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={40} color={ok ? c.success : c.warning} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="title2">{!account.available ? 'Spotify läuft nicht' : name ? name : 'Nicht verbunden'}</Txt>
        <Txt variant="footnote" color="secondary">
          {account.username ? `Abspielen bereit · Suche ${searchReady ? 'an' : 'aus'}` : 'Schritt 1 unten erledigen'}
        </Txt>
      </View>
    </Card>
  );
}

function AccountStep({ account, onChanged }: { account: SpotifyAccount | null; onChanged: () => void }) {
  const c = useColors();
  const { api } = useBox();
  const [pin, setPin] = useParentPin();
  const [askPin, setAskPin] = useState(false);
  const [busy, setBusy] = useState<SystemAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async (action: SystemAction) => {
    if (!pin) return setAskPin(true);
    if (
      action === 'spotify-logout' &&
      !(await confirm(
        'Anderes Konto anmelden?',
        'Die Box meldet sich bei Spotify ab und spielt erst wieder, wenn der neue Code eingegeben ist. Die Token bleiben erhalten.',
        'Abmelden',
        true,
      ))
    )
      return;
    setBusy(action);
    setError(null);
    setDone(null);
    try {
      await api.systemAction(action, pin);
      setDone(
        action === 'spotify-logout'
          ? 'Abgemeldet. Der neue Code erscheint gleich oben.'
          : 'Spotify startet neu. Nach ein paar Sekunden spielt die Box wieder.',
      );
      setTimeout(onChanged, 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (askPin && !pin) {
    return (
      <Card>
        <PinGate
          onUnlock={(p) => {
            setPin(p);
            setAskPin(false);
          }}
        />
      </Card>
    );
  }

  return (
    <>
      {account && !account.username && account.available && <PairCode code={account.pair?.code} />}
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {account?.username && (
          <Row
            first
            title={account.displayName ?? account.username}
            subtitle={account.displayName ? `Benutzername ${account.username}` : undefined}
            icon="person"
            iconColor={c.success}
          />
        )}
        <Row
          first={!account?.username}
          title={account?.username ? 'Anderes Konto anmelden' : 'Neu anmelden'}
          subtitle={account?.username ? 'Meldet ab; danach erscheint hier ein neuer Code' : 'Falls kein Code erscheint'}
          icon="swap-horizontal"
          iconColor={c.accent}
          trailing={busy === 'spotify-logout' ? <ActivityIndicator color={c.textSecondary} /> : undefined}
          onPress={busy ? undefined : () => run('spotify-logout')}
        />
        <Row
          title="Spotify neu starten"
          subtitle="Wenn nichts mehr spielt"
          icon="refresh"
          iconColor={c.accent}
          trailing={busy === 'restart-spotify' ? <ActivityIndicator color={c.textSecondary} /> : undefined}
          onPress={busy ? undefined : () => run('restart-spotify')}
        />
      </Card>
      {error && (
        <Txt variant="footnote" color={c.danger}>
          {error}
        </Txt>
      )}
      {done && !error && (
        <Txt variant="footnote" color={c.success} accessibilityLiveRegion="polite">
          {done}
        </Txt>
      )}
    </>
  );
}

/** Code für spotify.com/pair, groß. Die App fragt alle paar Sekunden nach, bis die Anmeldung da ist. */
function PairCode({ code }: { code?: string }) {
  const c = useColors();
  return (
    <Card style={[styles.pair, { backgroundColor: c.success + '1A' }]}>
      <Txt variant="callout" style={{ textAlign: 'center' }}>
        Öffne spotify.com/pair im Browser des Kontos, mit dem die Box spielen soll, und gib diesen Code ein:
      </Txt>
      {code ? (
        <Txt variant="largeTitle" selectable style={styles.code}>
          {code}
        </Txt>
      ) : (
        <ActivityIndicator color={c.textSecondary} />
      )}
      <Button label="spotify.com/pair öffnen" icon="open-outline" kind="secondary" compact onPress={() => Linking.openURL('https://www.spotify.com/pair')} />
      <Txt variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
        Die Anmeldung erscheint hier von selbst.
      </Txt>
    </Card>
  );
}

function SearchStep({
  account,
  loggedIn,
  ready,
  onChanged,
}: {
  account: SpotifyAccount | null;
  loggedIn: boolean;
  ready: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const c = useColors();
  const { api } = useBox();
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.setSpotifyApp?.({ clientId: clientId.trim(), clientSecret: secret.trim() });
      setEditing(false);
      setClientId('');
      setSecret('');
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.setSpotifyApp?.(null);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pasteInto = (set: (v: string) => void) => async () => set((await Clipboard.getStringAsync()).trim());

  if (ready && !editing) {
    return (
      <Card style={styles.done}>
        <Ionicons name="checkmark-circle" size={24} color={c.success} />
        <View style={{ flex: 1 }}>
          <Txt variant="headline">Suche ist an</Txt>
          {account?.clientId && (
            <Txt variant="footnote" color="secondary">
              Spotify-App {account.clientId.slice(0, 6)}…
            </Txt>
          )}
        </View>
        <Button label="Ändern" kind="secondary" compact onPress={() => setEditing(true)} disabled={busy} />
        {account?.search === 'app' && <Button label="Aus" kind="destructive" compact onPress={remove} disabled={busy} />}
      </Card>
    );
  }

  return (
    <>
      <Card style={{ gap: space.md, opacity: loggedIn ? 1 : 0.6 }}>
        <Txt variant="body">Spotify erlaubt die Suche nur mit einer kleinen, kostenlosen „Spotify-App“. Einmal anlegen, etwa zwei Minuten:</Txt>
        <Step n={1} text="Spotify für Entwickler öffnen, mit einem Premium-Konto anmelden (am besten dasselbe wie oben).">
          <Button label="Dashboard öffnen" icon="open-outline" kind="secondary" compact onPress={() => Linking.openURL(DASHBOARD)} style={{ alignSelf: 'flex-start' }} />
        </Step>
        <Step n={2} text="„Create app“ antippen. Name: Lauschbox, Beschreibung: beliebig." />
        <Step n={3} text="Bei „Redirect URIs“ eintragen (wird nicht benutzt, ist aber Pflicht):">
          <Txt variant="mono" selectable>
            {REDIRECT}
          </Txt>
        </Step>
        <Step n={4} text="Haken bei „Web API“ setzen, Bedingungen bestätigen, speichern." />
        <Step n={5} text="In der neuen App auf „Settings“: Client ID kopieren und unten einfügen. Dann „View client secret“, kopieren, einfügen." />
      </Card>
      <Field label="Client ID" value={clientId} onChange={setClientId} onPaste={pasteInto(setClientId)} />
      <Field label="Client Secret" value={secret} onChange={setSecret} onPaste={pasteInto(setSecret)} secure />
      {error && (
        <Txt variant="footnote" color={c.danger}>
          {error}
          {/premium/i.test(error) ? '\nSpotify verlangt, dass das Konto, dem die Entwickler-App gehört, Premium hat. Nimm am besten dein eigenes Premium-Konto.' : ''}
        </Txt>
      )}
      <Button label={busy ? 'Prüfe bei Spotify …' : 'Prüfen und speichern'} onPress={save} disabled={busy || !clientId.trim() || !secret.trim()} />
      {editing && <Button label="Abbrechen" kind="plain" compact onPress={() => setEditing(false)} />}
    </>
  );
}

function Step({ n, text, children }: { n: number; text: string; children?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.step}>
      <View style={[styles.stepNum, { backgroundColor: c.fillStrong }]}>
        <Txt variant="footnote" style={{ fontWeight: '700' }}>
          {n}
        </Txt>
      </View>
      <View style={{ flex: 1, gap: space.sm }}>
        <Txt variant="callout">{text}</Txt>
        {children}
      </View>
    </View>
  );
}

function Field({ label, value, onChange, onPaste, secure }: { label: string; value: string; onChange: (v: string) => void; onPaste: () => void; secure?: boolean }) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs }}>
      <Txt variant="footnote" color="secondary">
        {label}
      </Txt>
      <View style={styles.fieldRow}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="32 Zeichen"
          placeholderTextColor={c.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secure}
          accessibilityLabel={label}
          style={[type.mono, styles.input, { color: c.text, backgroundColor: c.surface }]}
        />
        <Button label="Einfügen" icon="clipboard" kind="secondary" compact onPress={onPaste} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, paddingBottom: space.sm },
  content: { paddingHorizontal: space.lg, width: '100%', maxWidth: 640, alignSelf: 'center' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xl },
  done: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pair: { alignItems: 'center', gap: space.md },
  code: { letterSpacing: 6, fontVariant: ['tabular-nums'] },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: { flex: 1, minHeight: 46, borderRadius: radius.sm + 2, borderCurve: 'continuous', paddingHorizontal: space.md },
});
