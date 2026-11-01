import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { useBox } from '@/box/BoxContext';
import type { KidView } from '@/box/types';
import { BackToStart } from '@/components/BackToStart';
import { Screen } from '@/components/Screen';
import { Slider } from '@/components/Slider';
import { Tap } from '@/components/Tap';
import { Button, Card, Row, Section, SwitchRow, Txt } from '@/components/ui';
import { space, useColors } from '@/theme';

// Für die Dauer der Sitzung entsperrt (pro Box), wie bei einer echten App nach erfolgreicher PIN
const unlocked = new Map<string, string>();

export default function RulesTab() {
  const { view } = useBox();
  const key = `${view.kind}:${view.name}`;
  const [pin, setPin] = useState<string | null>(unlocked.get(key) ?? null);
  const lock = (p: string | null) => {
    if (p) unlocked.set(key, p);
    else unlocked.delete(key);
    setPin(p);
  };
  return (
    <Screen
      title="Kindermodus"
      subtitle={pin ? 'Regeln für die Box' : 'Mit Eltern-PIN geschützt'}
      leading={<BackToStart />}
      trailing={pin ? <Button label="Sperren" icon="lock-closed" compact kind="secondary" onPress={() => lock(null)} /> : undefined}
    >
      {pin ? <Rules pin={pin} /> : <PinGate onUnlock={lock} />}
    </Screen>
  );
}

function Rules({ pin }: { pin: string }) {
  const c = useColors();
  const { view: s, api } = useBox();
  const k = s.kid;
  // Regler zeigen beim Ziehen den lokalen Wert; gesendet wird beim Loslassen
  const [draft, setDraft] = useState<Partial<KidView>>({});
  const kid = { ...k, ...draft };
  const set = (patch: Partial<KidView>) => {
    setDraft({});
    api.setKid(patch, pin);
  };

  return (
    <>
      <Section footer="Gilt sofort auf der Box, auch ohne dass die App offen ist.">
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <SwitchRow first title="Kindermodus" icon="shield-checkmark" iconColor={c.success} value={k.enabled} onChange={(v) => set({ enabled: v })} />
        </Card>
      </Section>

      <View style={{ opacity: k.enabled ? 1 : 0.45 }} pointerEvents={k.enabled ? 'auto' : 'none'}>
        <Section title="Lautstärke" footer="Die Lauter-Taste stoppt an dieser Grenze. Der Regler im Tab „Box“ gibt dort nur noch federnd nach.">
          <Card style={{ gap: space.lg }}>
            <LabeledSlider
              title="Maximal"
              value={kid.maxVolume}
              min={20}
              max={100}
              onChange={(v) => setDraft((d) => ({ ...d, maxVolume: v }))}
              onEnd={(v) => set({ maxVolume: v })}
            />
            <LabeledSlider
              title="Zur Schlafenszeit"
              value={Math.min(kid.bedtimeMaxVolume, kid.maxVolume)}
              min={10}
              max={kid.maxVolume}
              onChange={(v) => setDraft((d) => ({ ...d, bedtimeMaxVolume: v }))}
              onEnd={(v) => set({ bedtimeMaxVolume: v })}
            />
          </Card>
        </Section>

        <Section
          title="Schlafenszeit"
          footer={
            s.demo
              ? 'Neue Token starten nicht, ein laufender Titel spielt zu Ende. Zum Ausprobieren: Tab „Box“ → Simulation → Abends.'
              : 'Neue Token starten nicht, ein laufender Titel spielt zu Ende, die LEDs werden gedimmt. Die Box nutzt ihre eigene Uhr.'
          }
        >
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {!s.demo && (
              <SwitchRow first title="Schlafenszeit" icon="moon" iconColor="#7B61FF" value={k.bedtimeEnabled} onChange={(v) => set({ bedtimeEnabled: v })} />
            )}
            <Row first={!!s.demo} title={`${k.bedtimeFrom} bis ${k.bedtimeTo}`} subtitle={s.demo ? 'In der Demo fest eingestellt' : undefined} icon="time" iconColor="#7B61FF" />
            <Row
              title={s.bedtimeActive ? 'Gerade Schlafenszeit' : 'Gerade keine Schlafenszeit'}
              icon="timer"
              iconColor={s.bedtimeActive ? '#7B61FF' : c.textTertiary}
            />
          </Card>
        </Section>

        <Section title="Wiedergabe">
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            <SwitchRow
              first
              title="Kein Autoplay"
              subtitle="Nach dem Ende keine Spotify-Vorschläge"
              icon="stop-circle"
              iconColor={c.accent}
              value={k.noAutoplay}
              onChange={(v) => set({ noAutoplay: v })}
            />
            <SwitchRow
              title="Nur bekannte Token"
              subtitle="Unbekannte Token lösen gar nichts aus"
              icon="albums"
              iconColor={c.learn}
              value={k.knownTokensOnly}
              onChange={(v) => set({ knownTokensOnly: v })}
            />
          </Card>
        </Section>
      </View>
    </>
  );
}

function LabeledSlider({
  title,
  value,
  min,
  max,
  onChange,
  onEnd,
}: {
  title: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onEnd: (v: number) => void;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.sliderHead}>
        <Txt variant="body">{title}</Txt>
        <Txt variant="body" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
          {Math.round(value)} %
        </Txt>
      </View>
      <Slider label={`Lautstärke ${title}`} value={value} min={min} max={max} step={5} onChange={onChange} onEnd={onEnd} format={(v) => `${Math.round(v)} %`} />
    </View>
  );
}

function PinGate({ onUnlock }: { onUnlock: (pin: string) => void }) {
  const c = useColors();
  const { view, api } = useBox();
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
            {error ?? (view.kind === 'demo' ? 'Demo-PIN: 1234' : 'Ab Werk 1234. Bitte bald ändern.')}
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
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between' },
  gate: { alignItems: 'center', gap: space.md, paddingTop: space.lg },
  dots: { flexDirection: 'row', gap: space.lg, marginVertical: space.sm },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 3 * 76 + 2 * space.lg, gap: space.lg, justifyContent: 'center', marginTop: space.md },
  key: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
});
