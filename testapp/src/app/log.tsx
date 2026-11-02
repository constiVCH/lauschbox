import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RequireBox, useBox } from '@/box/BoxContext';
import { PinGate, useParentPin } from '@/components/PinGate';
import { Button, Txt } from '@/components/ui';
import { space, useColors } from '@/theme';

export default function LogScreen() {
  return (
    <RequireBox>
      <Log />
    </RequireBox>
  );
}

/** Die letzten Zeilen aus dem Log von Box-Software und go-librespot. */
function Log() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { api } = useBox();
  const [pin, setPin] = useParentPin();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const load = useCallback(async () => {
    if (!pin) return;
    setLoading(true);
    try {
      setText(await api.systemLog(pin));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api, pin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: Platform.OS === 'ios' ? space.md : insets.top + space.sm }]}>
        <Button label="Neu laden" kind="plain" compact onPress={load} disabled={!pin || loading} />
        <Txt variant="headline">Log</Txt>
        <Button label="Fertig" kind="plain" compact onPress={() => router.back()} />
      </View>
      {!pin ? (
        <PinGate onUnlock={setPin} />
      ) : (
        <ScrollView
          ref={scroll}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}
        >
          {loading && !text && <ActivityIndicator color={c.textSecondary} />}
          {error && (
            <Txt variant="footnote" color={c.danger}>
              {error}
            </Txt>
          )}
          {text !== null && (
            <Txt variant="caption" selectable style={styles.log}>
              {text || 'Noch nichts im Log.'}
            </Txt>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, paddingBottom: space.sm },
  content: { paddingHorizontal: space.md },
  log: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), lineHeight: 17, letterSpacing: 0 },
});
