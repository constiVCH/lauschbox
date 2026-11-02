import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RequireBox, useBox } from '@/box/BoxContext';
import type { BoxApi, Medium } from '@/box/types';
import { Cover, TokenDisc } from '@/components/Cover';
import { Tap } from '@/components/Tap';
import { Button, Card, Section, Segmented, SwitchRow, Txt } from '@/components/ui';
import { formatTime } from '@/demo/catalog';
import { radius, space, tokenColorNames, tokenColors, type, useColors } from '@/theme';

export default function TokenEditScreen() {
  return (
    <RequireBox>
      <TokenEdit />
    </RequireBox>
  );
}

/** Token anlegen oder bearbeiten: Name, Farbe (auch auf dem LED-Ring), Inhalt. */
function TokenEdit() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { uid, isNew } = useLocalSearchParams<{ uid: string; isNew?: string }>();
  const { view, api } = useBox();
  const existing = view.tokens.find((t) => t.uid === uid);
  const creating = isNew === '1' || !existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState(existing?.color ?? tokenColors[(view.tokens.length * 3) % tokenColors.length]);
  const [medium, setMedium] = useState<Medium | null>(existing?.medium ?? null);
  const [shuffle, setShuffle] = useState(existing?.shuffle ?? false);
  const [triedSave, setTriedSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saved = useRef(false);

  // Blatt ohne Speichern geschlossen (auch per Wischgeste): Lernmodus nicht hängen lassen
  const learning = useRef(view.learning);
  useEffect(() => {
    learning.current = view.learning;
  }, [view.learning]);
  useEffect(
    () => () => {
      if (creating && !saved.current && learning.current) api.cancelLearn();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const nameError = triedSave && !name.trim() ? 'Gib dem Token einen Namen.' : null;
  const mediumError = triedSave && !medium ? 'Wähl einen Inhalt aus.' : null;

  const close = () => router.back();

  const saveToken = async () => {
    setTriedSave(true);
    if (!name.trim() || !medium || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.saveToken({ uid, name: name.trim(), color, medium, shuffle });
      saved.current = true;
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    const doIt = async () => {
      try {
        await api.deleteToken(uid);
        router.back();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e));
      }
    };
    const msg = `„${existing?.name}“ wird von der Box gelöscht. Der Token selbst bleibt leer zurück und kann neu angelernt werden.`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doIt();
    } else {
      Alert.alert('Token löschen?', msg, [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: doIt },
      ]);
    }
  };

  const pick = (m: Medium) => {
    setMedium(m);
    // Namen vorschlagen, solange keiner eingetippt ist
    if (!name.trim()) setName(shortName(m.title));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.bar, { paddingTop: Platform.OS === 'ios' ? space.md : insets.top + space.sm }]}>
        <Button label="Abbrechen" kind="plain" compact onPress={close} />
        <Txt variant="headline">{creating ? 'Neuer Token' : 'Token bearbeiten'}</Txt>
        <Button label="Sichern" kind="plain" compact onPress={saveToken} disabled={saving} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.preview}>
          <TokenDisc size={88} color={color} emoji={medium?.emoji} coverUrl={medium?.coverUrl} />
          <Txt variant="footnote" color="tertiary">
            UID {uid}
          </Txt>
        </View>

        <Section title="Name">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="z. B. Funkel 1"
            placeholderTextColor={c.textTertiary}
            maxLength={30}
            returnKeyType="done"
            accessibilityLabel="Name des Tokens"
            style={[type.body, styles.input, { color: c.text, backgroundColor: c.surface }, nameError && { borderColor: c.danger, borderWidth: 1 }]}
          />
          {nameError && (
            <Txt variant="footnote" color={c.danger}>
              {nameError}
            </Txt>
          )}
        </Section>

        <Section title="Farbe" footer="Leuchtet auf dem LED-Ring, solange der Token aufliegt.">
          <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Farbe">
            {tokenColors.map((col, i) => {
              const active = col === color;
              return (
                <Tap
                  key={col}
                  onPress={() => setColor(col)}
                  haptic="selection"
                  scaleTo={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={tokenColorNames[i]}
                  style={[styles.swatch, { backgroundColor: col }, active && { borderColor: c.text }]}
                >
                  {active && <Ionicons name="checkmark" size={18} color="#fff" />}
                </Tap>
              );
            })}
          </View>
        </Section>

        <Section
          title="Wiedergabe"
          footer={
            shuffle
              ? 'Jedes Auflegen startet gemischt bei einem zufälligen Titel. Gut für Musik.'
              : 'Der Reihe nach, beim nächsten Auflegen geht es an derselben Stelle weiter. Richtig für Hörspiele und Hörbücher.'
          }
        >
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            <SwitchRow first title="Zufällige Reihenfolge" icon="shuffle" iconColor="#C263E8" value={shuffle} onChange={setShuffle} />
          </Card>
        </Section>

        {api.catalog ? (
          <CatalogPicker catalog={api.catalog} selected={medium?.uri} onPick={pick} error={mediumError} />
        ) : (
          <SpotifyPicker api={api} medium={medium} onPick={pick} error={mediumError} />
        )}

        {saveError && (
          <Txt variant="footnote" color={c.danger} style={{ marginBottom: space.md, textAlign: 'center' }}>
            {saveError}
          </Txt>
        )}
        <Button label={saving ? 'Speichert …' : creating ? 'Token anlernen' : 'Änderungen sichern'} onPress={saveToken} disabled={saving} />
        {!creating && <Button label="Token löschen" kind="destructive" onPress={remove} style={{ marginTop: space.md }} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Echte Box: Inhalt per Spotify-Suche, aus den eigenen Playlists/Alben oder per Link wählen. */
function SpotifyPicker({ api, medium, onPick, error }: { api: BoxApi; medium: Medium | null; onPick: (m: Medium) => void; error: string | null }) {
  const c = useColors();
  const [mode, setMode] = useState<'search' | 'library' | 'link'>(api.search ? 'search' : 'link');
  const footer =
    mode === 'link'
      ? 'In der Spotify-App beim Album, Hörbuch oder der Playlist: Teilen → Link kopieren. Dann hier einfügen.'
      : mode === 'library'
        ? 'Deine Playlists und gespeicherten Alben aus dem Spotify-Konto der Box.'
        : 'Alben, Playlists, Hörbücher und Podcasts. Ein Token spielt den ganzen Inhalt, nicht nur ein Lied.';
  return (
    <Section title="Inhalt" footer={footer}>
      {medium && <PickedMedium medium={medium} />}
      {api.search && (
        <Segmented
          label="Inhalt finden über"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'search', label: 'Suchen' },
            { value: 'library', label: 'Meine' },
            { value: 'link', label: 'Link' },
          ]}
        />
      )}
      {mode === 'search' && <SearchResults api={api} selected={medium?.uri} onPick={onPick} />}
      {mode === 'library' && <LibraryResults api={api} selected={medium?.uri} onPick={onPick} />}
      {mode === 'link' && <LinkInput api={api} hasMedium={!!medium} onPick={onPick} />}
      {error && (
        <Txt variant="footnote" color={c.danger}>
          {error}
        </Txt>
      )}
    </Section>
  );
}

function PickedMedium({ medium }: { medium: Medium }) {
  const c = useColors();
  return (
    <Card style={styles.picked}>
      <Cover medium={medium} size={56} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="headline" numberOfLines={2}>
          {medium.title}
        </Txt>
        <Txt variant="footnote" color="secondary" numberOfLines={1}>
          {[medium.kindLabel, medium.subtitle].filter(Boolean).join(' · ')}
        </Txt>
      </View>
      <Ionicons name="checkmark-circle" size={24} color={c.success} />
    </Card>
  );
}

function SearchResults({ api, selected, onPick }: { api: BoxApi; selected?: string; onPick: (m: Medium) => void }) {
  const c = useColors();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Medium[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const latest = useRef(0);

  // Suchen, sobald eine kurze Tipp-Pause entsteht; ältere Antworten verwerfen
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !api.search) return;
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const found = await api.search!(q);
        if (id === latest.current) {
          setResults(found);
          setFailure(null);
        }
      } catch (e) {
        if (id === latest.current) setFailure(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === latest.current) setBusy(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, api]);

  const tooShort = query.trim().length < 2;
  return (
    <>
      <View style={[styles.search, { backgroundColor: c.surface }]}>
        <Ionicons name="search" size={18} color={c.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="z. B. Drache Funkel, Schlaflieder"
          placeholderTextColor={c.textTertiary}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Bei Spotify suchen"
          style={[type.body, { flex: 1, color: c.text, paddingVertical: space.md }]}
        />
        {busy && <ActivityIndicator color={c.textSecondary} />}
      </View>
      {failure ? (
        <View style={{ gap: space.sm }}>
          <Txt variant="footnote" color={c.danger}>
            {failure}
          </Txt>
          {api.setSpotifyApp && (
            <Button
              label="Suche einrichten"
              icon="settings-outline"
              kind="secondary"
              compact
              onPress={() => router.push('/spotify-setup' as Href)}
              style={{ alignSelf: 'flex-start' }}
            />
          )}
        </View>
      ) : (
        !tooShort && results && <MediumList items={results} selected={selected} onPick={onPick} empty={`Nichts gefunden für „${query.trim()}“.`} />
      )}
    </>
  );
}

function LibraryResults({ api, selected, onPick }: { api: BoxApi; selected?: string; onPick: (m: Medium) => void }) {
  const c = useColors();
  const [items, setItems] = useState<Medium[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api.library?.().then(
      (found) => alive && setItems(found),
      (e: Error) => alive && setFailure(e.message),
    );
    return () => {
      alive = false;
    };
  }, [api]);
  if (failure)
    return (
      <Txt variant="footnote" color={c.danger}>
        {failure}
      </Txt>
    );
  if (!items) return <ActivityIndicator color={c.textSecondary} style={{ marginVertical: space.lg }} />;
  return <MediumList items={items} selected={selected} onPick={onPick} empty="Keine Playlists oder gespeicherten Alben gefunden." />;
}

function MediumList({ items, selected, onPick, empty }: { items: Medium[]; selected?: string; onPick: (m: Medium) => void; empty: string }) {
  const c = useColors();
  if (items.length === 0)
    return (
      <Txt variant="callout" color="secondary" style={{ padding: space.lg, textAlign: 'center' }}>
        {empty}
      </Txt>
    );
  return (
    <Card padded={false}>
      {items.map((m, i) => {
        const active = m.uri === selected;
        const meta = [m.kindLabel, m.subtitle, m.trackCount ? `${m.trackCount} Titel` : null].filter(Boolean).join(' · ');
        return (
          <Tap
            key={m.uri}
            onPress={() => onPick(m)}
            haptic="selection"
            scaleTo={0.985}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${m.title}, ${meta}`}
          >
            <View style={[styles.result, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.fillStrong }]}>
              <Cover medium={m} size={44} />
              <View style={{ flex: 1 }}>
                <Txt variant="subhead" style={{ fontWeight: '600' }} numberOfLines={2}>
                  {m.title}
                </Txt>
                <Txt variant="footnote" color="secondary" numberOfLines={1}>
                  {meta}
                </Txt>
              </View>
              <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={active ? c.accent : c.textTertiary} />
            </View>
          </Tap>
        );
      })}
    </Card>
  );
}

function LinkInput({ api, hasMedium, onPick }: { api: BoxApi; hasMedium: boolean; onPick: (m: Medium) => void }) {
  const c = useColors();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const resolve = async (text: string) => {
    if (!text.trim() || !api.resolveLink) return;
    setBusy(true);
    setLinkError(null);
    try {
      onPick(await api.resolveLink(text));
      setLink('');
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    setLink(text);
    resolve(text);
  };

  return (
    <>
      <View style={[styles.search, { backgroundColor: c.surface }, linkError && { borderColor: c.danger, borderWidth: 1 }]}>
        <Ionicons name="link" size={18} color={c.textTertiary} />
        <TextInput
          value={link}
          onChangeText={setLink}
          onSubmitEditing={() => resolve(link)}
          placeholder={hasMedium ? 'Anderen Link einfügen' : 'https://open.spotify.com/…'}
          placeholderTextColor={c.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          accessibilityLabel="Spotify-Link"
          style={[type.body, { flex: 1, color: c.text, paddingVertical: space.md }]}
        />
        {busy && <ActivityIndicator color={c.textSecondary} />}
      </View>
      <View style={styles.linkActions}>
        <Button label="Einfügen" icon="clipboard" kind="secondary" compact onPress={paste} disabled={busy} />
        {link.trim() !== '' && <Button label="Übernehmen" compact onPress={() => resolve(link)} disabled={busy} />}
      </View>
      {linkError && (
        <Txt variant="footnote" color={c.danger}>
          {linkError}
        </Txt>
      )}
    </>
  );
}

/** Demo: ausgedachter Katalog statt Spotify. */
function CatalogPicker({ catalog, selected, onPick, error }: { catalog: Medium[]; selected?: string; onPick: (m: Medium) => void; error: string | null }) {
  const c = useColors();
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? catalog.filter((m) => m.title.toLowerCase().includes(q)) : catalog;
  }, [query, catalog]);

  return (
    <Section title="Inhalt" footer="Demo-Katalog mit ausgedachten Titeln. Mit der echten Box fügst du hier einen Spotify-Link ein.">
      <View style={[styles.search, { backgroundColor: c.surface }, error && { borderColor: c.danger, borderWidth: 1 }]}>
        <Ionicons name="search" size={18} color={c.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Hörspiel, Hörbuch oder Playlist"
          placeholderTextColor={c.textTertiary}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Inhalt suchen"
          style={[type.body, { flex: 1, color: c.text, paddingVertical: space.md }]}
        />
      </View>
      {error && (
        <Txt variant="footnote" color={c.danger}>
          {error}
        </Txt>
      )}
      <Card padded={false}>
        {results.map((m, i) => {
          const active = m.uri === selected;
          return (
            <Tap
              key={m.uri}
              onPress={() => onPick(m)}
              haptic="selection"
              scaleTo={0.985}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${m.title}, ${m.kindLabel}, ${m.trackCount} Titel`}
            >
              <View style={[styles.result, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.fillStrong }]}>
                <Cover medium={m} size={44} />
                <View style={{ flex: 1 }}>
                  <Txt variant="subhead" style={{ fontWeight: '600' }} numberOfLines={2}>
                    {m.title}
                  </Txt>
                  <Txt variant="footnote" color="secondary">
                    {m.kindLabel} · {m.trackCount} Titel · {formatTime(m.durationS ?? 0)}
                  </Txt>
                </View>
                <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={active ? c.accent : c.textTertiary} />
              </View>
            </Tap>
          );
        })}
        {results.length === 0 && (
          <Txt variant="callout" color="secondary" style={{ padding: space.lg, textAlign: 'center' }}>
            Nichts gefunden für „{query}“.
          </Txt>
        )}
      </Card>
    </Section>
  );
}

/** „Drache Funkel – Folge 1: …“ → „Drache Funkel 1“ */
function shortName(title: string) {
  const m = title.match(/^(.*?)\s+–\s+Folge\s+(\d+)/);
  return (m ? `${m[1]} ${m[2]}` : title).slice(0, 30);
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, paddingBottom: space.sm },
  content: { paddingHorizontal: space.lg, width: '100%', maxWidth: 640, alignSelf: 'center' },
  preview: { alignItems: 'center', gap: space.sm, marginVertical: space.lg },
  input: { minHeight: 48, borderRadius: radius.sm + 2, borderCurve: 'continuous', paddingHorizontal: space.md },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'transparent' },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, borderRadius: radius.sm + 2, borderCurve: 'continuous' },
  result: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  picked: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  linkActions: { flexDirection: 'row', gap: space.sm },
});
