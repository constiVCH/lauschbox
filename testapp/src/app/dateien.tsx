import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RequireBox, useBox } from '@/box/BoxContext';
import type { BoxApi, LocalFile, Medium } from '@/box/types';
import { confirm } from '@/components/confirm';
import { Tap } from '@/components/Tap';
import { Button, Card, Section, Txt } from '@/components/ui';
import { formatTime } from '@/format';
import { radius, space, type, useColors } from '@/theme';

export default function DateienScreen() {
  return (
    <RequireBox>
      <Dateien />
    </RequireBox>
  );
}

const size = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;

/** Dateien am Handy wählen und nacheinander hochladen. Gibt die Fehlermeldung zurück oder null. */
async function pickAndUpload(api: BoxApi, freeBytes: number, album: (firstName: string) => Promise<string>, onProgress: (text: string) => void) {
  const picked = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true });
  if (picked.canceled || picked.assets.length === 0) return null;
  const files = [...picked.assets].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
  const total = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
  if (total > freeBytes) return `Zu groß: ${size(total)} ausgewählt, auf der Box sind noch ${size(freeBytes)} frei.`;
  try {
    const uri = await album(files[0].name.replace(/\.[^.]+$/, ''));
    for (const [i, f] of files.entries()) {
      onProgress(`Lädt ${i + 1} von ${files.length}: ${f.name}`);
      await api.uploadLocalFile!(uri, { uri: f.uri, name: f.name, mimeType: f.mimeType });
    }
    return null;
  } catch (e) {
    return `${e instanceof Error ? e.message : String(e)} Bereits hochgeladene Dateien bleiben im Album.`;
  }
}

/** Eigene Dateien auf der SD-Karte der Box: Alben anlegen, Dateien hinzufügen und löschen. */
function Dateien() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { api } = useBox();
  const [data, setData] = useState<{ albums: Medium[]; freeBytes: number } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.localMedia!());
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const upload = async (target?: string) => {
    if (!data) return;
    setFailure(null);
    const error = await pickAndUpload(
      api,
      data.freeBytes,
      async (firstName) => target ?? (await api.createLocalAlbum!(title.trim() || firstName)),
      setProgress,
    );
    setProgress(null);
    if (error) setFailure(error);
    else if (!target) setTitle('');
    await load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: Platform.OS === 'ios' ? space.md : insets.top + space.sm }]}>
        <View style={{ width: 80 }} />
        <Txt variant="headline">Eigene Dateien</Txt>
        <Button label="Fertig" kind="plain" compact onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
        <Section
          title="Neues Album"
          footer={
            progress ??
            (data
              ? `Noch ${size(data.freeBytes)} frei auf der Box. Mehrere Dateien auswählen: Sie spielen in der Reihenfolge der Dateinamen.`
              : undefined)
          }
        >
          <View style={[styles.input, { backgroundColor: c.surface }]}>
            <Ionicons name="folder-open-outline" size={18} color={c.textTertiary} />
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Name (optional)"
              placeholderTextColor={c.textTertiary}
              maxLength={80}
              returnKeyType="done"
              accessibilityLabel="Name des neuen Albums"
              style={[type.body, { flex: 1, color: c.text, paddingVertical: space.md }]}
            />
            {progress && <ActivityIndicator color={c.textSecondary} />}
          </View>
          <Button
            label={progress ? 'Lädt hoch …' : 'Dateien vom Handy hochladen'}
            icon="cloud-upload-outline"
            onPress={() => upload()}
            disabled={!!progress || !data}
          />
          {failure && (
            <Txt variant="footnote" color={c.danger}>
              {failure}
            </Txt>
          )}
        </Section>

        <Section title="Auf der Box">
          {!data ? (
            !failure && <ActivityIndicator color={c.textSecondary} style={{ marginVertical: space.lg }} />
          ) : data.albums.length === 0 ? (
            <Txt variant="callout" color="secondary" style={{ padding: space.lg, textAlign: 'center' }}>
              Noch keine eigenen Dateien auf der Box.
            </Txt>
          ) : (
            data.albums.map((a) => (
              <Album
                key={a.uri}
                api={api}
                album={a}
                open={open === a.uri}
                busy={!!progress}
                onToggle={() => setOpen(open === a.uri ? null : a.uri)}
                onAdd={() => upload(a.uri)}
                onChanged={load}
                onError={setFailure}
              />
            ))
          )}
        </Section>
      </ScrollView>
    </View>
  );
}

function Album({
  api,
  album,
  open,
  busy,
  onToggle,
  onAdd,
  onChanged,
  onError,
}: {
  api: BoxApi;
  album: Medium;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onChanged: () => void;
  onError: (text: string) => void;
}) {
  const c = useColors();
  const [files, setFiles] = useState<LocalFile[] | null>(null);
  const meta = [`${album.trackCount ?? 0} Titel`, album.durationS ? formatTime(album.durationS) : null, album.sizeBytes ? size(album.sizeBytes) : null]
    .filter(Boolean)
    .join(' · ');

  const loadFiles = useCallback(async () => {
    try {
      setFiles((await api.localAlbum!(album.uri)).files);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [api, album.uri, onError]);

  // Beim Aufklappen und nach jeder Änderung am Album (Titelzahl) neu lesen
  useFocusEffect(
    useCallback(() => {
      if (open) loadFiles();
    }, [open, loadFiles, album.trackCount]), // eslint-disable-line react-hooks/exhaustive-deps
  );

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
    onChanged();
  };

  const removeFile = async (name: string) => {
    if (await confirm('Datei löschen?', `„${name}“ wird von der Box gelöscht.`, 'Löschen', true))
      run(() => api.deleteLocalFile!(album.uri, name));
  };

  const removeAlbum = async () => {
    if (await confirm('Album löschen?', `„${album.title}“ wird mit allen Dateien gelöscht. Token, die es abspielen, bleiben dann still.`, 'Löschen', true))
      run(() => api.deleteLocalAlbum!(album.uri));
  };

  return (
    <Card padded={false}>
      <Tap onPress={onToggle} haptic="selection" scaleTo={0.985} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${album.title}, ${meta}`}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: c.accent }]}>
            <Ionicons name="musical-notes" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="subhead" style={{ fontWeight: '600' }} numberOfLines={2}>
              {album.title}
            </Txt>
            <Txt variant="footnote" color="secondary">
              {meta}
            </Txt>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.textTertiary} />
        </View>
      </Tap>
      {open && (
        <View style={{ paddingBottom: space.md }}>
          {!files ? (
            <ActivityIndicator color={c.textSecondary} style={{ marginVertical: space.md }} />
          ) : (
            files.map((f, i) => (
              <View key={f.name} style={[styles.file, { borderTopColor: c.fillStrong }]}>
                <Txt variant="footnote" color="tertiary" style={{ width: 22 }}>
                  {i + 1}
                </Txt>
                <Txt variant="subhead" style={{ flex: 1 }} numberOfLines={2}>
                  {f.name}
                </Txt>
                <Txt variant="footnote" color="secondary">
                  {f.durationS ? formatTime(f.durationS) : '–'}
                </Txt>
                <Tap onPress={() => removeFile(f.name)} haptic="selection" accessibilityRole="button" accessibilityLabel={`${f.name} löschen`} style={styles.trash}>
                  <Ionicons name="trash-outline" size={18} color={c.danger} />
                </Tap>
              </View>
            ))
          )}
          <View style={styles.actions}>
            <Button label="Dateien hinzufügen" icon="add" kind="secondary" compact onPress={onAdd} disabled={busy} />
            <Button label="Album löschen" kind="destructive" compact onPress={removeAlbum} disabled={busy} />
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, paddingBottom: space.sm },
  content: { paddingHorizontal: space.lg, width: '100%', maxWidth: 640, alignSelf: 'center' },
  input: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, borderRadius: radius.sm + 2, borderCurve: 'continuous' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  icon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  file: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  trash: { padding: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md },
});
