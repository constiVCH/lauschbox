import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useSyncExternalStore, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { useBox } from '@/box/BoxContext';
import { space, useColors } from '@/theme';

import { Tap } from './Tap';
import { Txt } from './ui';

// Für die Dauer der Sitzung entsperrt (pro Box), wie bei einer echten App nach erfolgreicher PIN.
// Kindermodus und Einstellungen teilen sich das: einmal eingeben reicht.
const unlocked = new Map<string, string>();
const listeners = new Set<() => void>();

/** [PIN oder null, setzen/sperren]. Gilt für die verbundene Box, bis die App beendet wird. */
export function useParentPin(): [string | null, (pin: string | null) => void] {
  const { view } = useBox();
  const key = view.name;
  const pin = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => unlocked.get(key) ?? null,
    () => unlocked.get(key) ?? null,
  );
  const set = (p: string | null) => {
    if (p) unlocked.set(key, p);
    else unlocked.delete(key);
    listeners.forEach((fn) => fn());
  };
  return [pin, set];
}

export function PinGate({ onUnlock }: { onUnlock: (pin: string) => void }) {
  const c = useColors();
  const { api } = useBox();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const shake = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const wrong = (text: string) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setError(text);
    // Kopfschütteln: kräftiger Anstoß, die Feder schwingt aus
    if (!reduceMotion) {
      shake.set(0);
      shake.set(withSpring(0, { dampingRatio: 0.25, duration: 500, velocity: 900 }));
    }
    setTimeout(() => setPin(''), 450);
  };

  const press = async (d: string) => {
    if (pin.length >= 4 || checking) return;
    const next = pin + d;
    setError(null);
    setPin(next);
    if (next.length < 4) return;
    setChecking(true);
    try {
      if (await api.verifyPin(next)) {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onUnlock(next);
      } else wrong('Falsche PIN. Nochmal versuchen.');
    } catch (e) {
      wrong(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const dotsStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <View style={styles.gate}>
      <Ionicons name="lock-closed" size={30} color={c.textSecondary} />
      <Txt variant="headline">Eltern-PIN eingeben</Txt>
      <Animated.View style={[styles.dots, dotsStyle]} accessible accessibilityLabel={`${pin.length} von 4 Ziffern eingegeben`}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { borderColor: error ? c.danger : c.textSecondary },
              i < pin.length && { backgroundColor: error ? c.danger : c.text, borderColor: 'transparent' },
            ]}
          />
        ))}
      </Animated.View>
      <View style={{ minHeight: 20, alignItems: 'center' }}>
        {checking ? (
          <ActivityIndicator color={c.textSecondary} />
        ) : (
          <Txt variant="footnote" color={error ? c.danger : 'tertiary'} accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>
            {error ?? 'Ab Werk 1234. Im Kindermodus änderbar.'}
          </Txt>
        )}
      </View>
      <View style={styles.pad}>
        {keys.map((k, i) =>
          k === '' ? (
            <View key={i} style={styles.key} />
          ) : (
            <Tap
              key={i}
              onPress={() => (k === '⌫' ? setPin((p) => p.slice(0, -1)) : press(k))}
              haptic="light"
              scaleTo={0.9}
              accessibilityRole="button"
              accessibilityLabel={k === '⌫' ? 'Löschen' : k}
              style={[styles.key, k !== '⌫' && { backgroundColor: c.fillStrong }]}
            >
              {k === '⌫' ? <Ionicons name="backspace-outline" size={26} color={c.text} /> : <Txt variant="title">{k}</Txt>}
            </Tap>
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gate: { alignItems: 'center', gap: space.md, paddingTop: space.lg },
  dots: { flexDirection: 'row', gap: space.lg, marginVertical: space.sm },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 3 * 76 + 2 * space.lg, gap: space.lg, justifyContent: 'center', marginTop: space.md },
  key: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
});
