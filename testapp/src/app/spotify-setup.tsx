import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RequireBox, useBox } from '@/box/BoxContext';
import { useSpotifyAccount } from '@/box/useSpotifyAccount';
import { Button, Card, Section, Txt } from '@/components/ui';
import { radius, space, type, useColors } from '@/theme';

const DASHBOARD = 'https://developer.spotify.com/dashboard';
const REDIRECT = 'http://127.0.0.1:8888/callback';
const MOVE_CMD = 'mv ~/.config/go-librespot/state.json ~/.config/go-librespot/state.json.alt\ngo-librespot';

export default function SpotifySetupScreen() {
  return (
    <RequireBox>
      <SpotifySetup />
    </RequireBox>
  );
}

/** Suche einrichten (eigene Spotify-App) und erklären, wie man das Konto der Box wechselt. */
function SpotifySetup() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { api } = useBox();
  const { account, reload } = useSpotifyAccount();
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = account?.search === 'app';

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.setSpotifyApp?.({ clientId: clientId.trim(), clientSecret: secret.trim() });
      await reload();
      router.back();
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
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pasteInto = (set: (v: string) => void) => async () => set((await Clipboard.getStringAsync()).trim());

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
        <Section
          title="Suche einrichten"
          footer="Die Box sucht damit nur im öffentlichen Spotify-Katalog. Dein Konto und deine Daten braucht sie dafür nicht."
        >
          {configured && (
            <Card style={styles.done}>
              <Ionicons name="checkmark-circle" size={24} color={c.success} />
              <View style={{ flex: 1 }}>
                <Txt variant="headline">Eingerichtet</Txt>
                <Txt variant="footnote" color="secondary">
                  Client-ID {account?.clientId?.slice(0, 6)}…
                </Txt>
              </View>
              <Button label="Entfernen" kind="destructive" compact onPress={remove} disabled={busy} />
            </Card>
          )}
          <Card style={{ gap: space.md }}>
            <Txt variant="body">
              Spotify erlaubt die Suche nur mit einer eigenen, kostenlosen „Spotify-App“. Die legst du einmal an, das dauert etwa zwei Minuten:
            </Txt>
            <Step n={1} text="Spotify für Entwickler öffnen und mit deinem Spotify-Konto anmelden.">
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
            </Txt>
          )}
          <Button label={busy ? 'Prüfe bei Spotify …' : 'Prüfen und speichern'} onPress={save} disabled={busy || !clientId.trim() || !secret.trim()} />
        </Section>

        <Section title="Anderes Spotify-Konto" footer="Deine Token bleiben erhalten. Private Playlists des alten Kontos kann das neue Konto aber eventuell nicht abspielen.">
          <Card style={{ gap: space.md }}>
            <Txt variant="body">
              Angemeldet: {account?.displayName ?? account?.username ?? 'niemand'}. So meldest du die Box mit einem anderen Konto an (auf dem Pi, im Terminal von go-librespot):
            </Txt>
            <Step n={1} text="go-librespot mit Strg+C beenden." />
            <Step n={2} text="Alte Anmeldung zur Seite legen und neu starten:">
              <Txt variant="mono" selectable>
                {MOVE_CMD}
              </Txt>
            </Step>
            <Step
              n={3}
              text="Den neuen Code auf spotify.com/pair eingeben, und zwar im Browser, in dem das gewünschte Konto angemeldet ist (am einfachsten in einem privaten Fenster). Der Code erscheint dann auch im Tab „Box“ unter Spotify."
            />
            <Txt variant="footnote" color="secondary">
              Kinderprofile: Ein betreutes Konto im Family-Abo kann funktionieren, einfach ausprobieren. Konten der App „Spotify Kids“ sind für Geräte wie die
              Box nicht gedacht. Alternative: ein eigenes Family-Mitglied nur für die Box.
            </Txt>
          </Card>
        </Section>
      </ScrollView>
    </KeyboardAvoidingView>
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
  done: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: { flex: 1, minHeight: 46, borderRadius: radius.sm + 2, borderCurve: 'continuous', paddingHorizontal: space.md },
});
