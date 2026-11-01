import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cover, TokenDisc } from '@/components/Cover';
import { Tap } from '@/components/Tap';
import { Button, Card, Section, Txt } from '@/components/ui';
import { catalog, formatTime, mediumByUri, totalSeconds } from '@/demo/catalog';
import { demoBox, useDemoBox } from '@/demo/demoBox';
import { radius, space, tokenColorNames, tokenColors, type, useColors } from '@/theme';

/** Token anlegen oder bearbeiten: Name, Farbe (auch auf dem LED-Ring), Inhalt. */
export default function TokenEdit() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { uid, isNew } = useLocalSearchParams<{ uid: string; isNew?: string }>();
  const s = useDemoBox();
  const existing = s.tokens.find((t) => t.uid === uid);
  const creating = isNew === '1' || !existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState(existing?.color ?? tokenColors[(s.tokens.length * 3) % tokenColors.length]);
  const [mediumUri, setMediumUri] = useState(existing?.mediumUri ?? '');
  const [query, setQuery] = useState('');
  const [triedSave, setTriedSave] = useState(false);

  // Blatt per Wischgeste geschlossen: Lernmodus nicht hängen lassen
  useEffect(
    () => () => {
      if (creating && demoBox.get().learning) demoBox.cancelLearn();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? catalog.filter((m) => `${m.title} ${m.artist}`.toLowerCase().includes(q)) : catalog;
  }, [query]);

  const medium = mediumByUri(mediumUri);
  const nameError = triedSave && !name.trim() ? 'Gib dem Token einen Namen.' : null;
  const mediumError = triedSave && !medium ? 'Wähl einen Inhalt aus.' : null;

  const close = () => {
    if (creating) demoBox.cancelLearn();
    router.back();
  };

  const saveToken = () => {
    setTriedSave(true);
    if (!name.trim() || !medium) return;
    demoBox.saveToken({ uid, name: name.trim(), color, mediumUri });
    router.back();
  };

  const remove = () => {
    const doIt = () => {
      demoBox.deleteToken(uid);
      router.back();
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

  const pick = (uri: string) => {
    setMediumUri(uri);
    // Namen vorschlagen, solange keiner eingetippt ist
    if (!name.trim()) setName(shortName(mediumByUri(uri)?.title ?? ''));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.bar, { paddingTop: Platform.OS === 'ios' ? space.md : insets.top + space.sm }]}>
        <Button label="Abbrechen" kind="plain" compact onPress={close} />
        <Txt variant="headline">{creating ? 'Neuer Token' : 'Token bearbeiten'}</Txt>
        <Button label="Sichern" kind="plain" compact onPress={saveToken} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.preview}>
          <TokenDisc size={88} color={color} emoji={medium?.emoji} />
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
            {tokenColors.map((col) => {
              const active = col === color;
              return (
                <Tap
                  key={col}
                  onPress={() => setColor(col)}
                  haptic="selection"
                  scaleTo={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={tokenColorNames[tokenColors.indexOf(col)]}
                  style={[styles.swatch, { backgroundColor: col }, active && { borderColor: c.text }]}
                >
                  {active && <Ionicons name="checkmark" size={18} color="#fff" />}
                </Tap>
              );
            })}
          </View>
        </Section>

        <Section title="Inhalt" footer="Demo-Katalog mit ausgedachten Titeln. Später sucht die Box direkt bei Spotify.">
          <View style={[styles.search, { backgroundColor: c.surface }, mediumError && { borderColor: c.danger, borderWidth: 1 }]}>
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
          {mediumError && (
            <Txt variant="footnote" color={c.danger}>
              {mediumError}
            </Txt>
          )}
          <Card padded={false}>
            {results.map((m, i) => {
              const active = m.uri === mediumUri;
              return (
                <Tap
                  key={m.uri}
                  onPress={() => pick(m.uri)}
                  haptic="selection"
                  scaleTo={0.985}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${m.title}, ${m.kind}, ${m.tracks.length} Titel`}
                >
                  <View style={[styles.result, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.fillStrong }]}>
                    <Cover medium={m} size={44} />
                    <View style={{ flex: 1 }}>
                      <Txt variant="subhead" style={{ fontWeight: '600' }} numberOfLines={2}>
                        {m.title}
                      </Txt>
                      <Txt variant="footnote" color="secondary">
                        {m.kind} · {m.tracks.length} Titel · {formatTime(totalSeconds(m))}
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

        <Button label={creating ? 'Token anlernen' : 'Änderungen sichern'} onPress={saveToken} />
        {!creating && <Button label="Token löschen" kind="destructive" onPress={remove} style={{ marginTop: space.md }} />}
      </ScrollView>
    </KeyboardAvoidingView>
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
});
