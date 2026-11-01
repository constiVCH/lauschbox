import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { BackToStart } from '@/components/BackToStart';
import { Screen } from '@/components/Screen';
import { Slider } from '@/components/Slider';
import { Tap } from '@/components/Tap';
import { Button, Card, Row, Section, SwitchRow, Txt } from '@/components/ui';
import { demoBox, useDemoBox } from '@/demo/demoBox';
import { space, useColors } from '@/theme';

const DEMO_PIN = '1234';

// Für die Dauer der Sitzung entsperrt, wie bei einer echten App nach erfolgreicher PIN
let unlockedThisSession = false;

export default function RulesTab() {
  const [unlocked, setUnlocked] = useState(unlockedThisSession);
  const lock = (v: boolean) => {
    unlockedThisSession = v;
    setUnlocked(v);
  };
  return (
    <Screen
      title="Kindermodus"
      subtitle={unlocked ? 'Regeln für die Box' : 'Mit Eltern-PIN geschützt'}
      leading={<BackToStart />}
      trailing={unlocked ? <Button label="Sperren" icon="lock-closed" compact kind="secondary" onPress={() => lock(false)} /> : undefined}
    >
      {unlocked ? <Rules /> : <PinGate onUnlock={() => lock(true)} />}
    </Screen>
  );
}

function Rules() {
  const c = useColors();
  const s = useDemoBox();
  const k = s.kid;
  return (
    <>
      <Section footer="Gilt sofort auf der Box, auch ohne dass die App offen ist.">
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <SwitchRow first title="Kindermodus" icon="shield-checkmark" iconColor={c.success} value={k.enabled} onChange={(v) => demoBox.setKid({ enabled: v })} />
        </Card>
      </Section>

      <View style={{ opacity: k.enabled ? 1 : 0.45 }} pointerEvents={k.enabled ? 'auto' : 'none'}>
        <Section title="Lautstärke" footer="Die Lauter-Taste stoppt an dieser Grenze. Der Regler im Tab „Box“ gibt dort nur noch federnd nach.">
          <Card style={{ gap: space.lg }}>
            <LabeledSlider title="Maximal" value={k.maxVolume} min={20} max={100} onChange={(v) => demoBox.setKid({ maxVolume: v })} />
            <LabeledSlider title="Zur Schlafenszeit" value={k.bedtimeMaxVolume} min={10} max={k.maxVolume} onChange={(v) => demoBox.setKid({ bedtimeMaxVolume: v })} />
          </Card>
        </Section>

        <Section title="Schlafenszeit" footer="Neue Token starten nicht, ein laufender Titel spielt zu Ende. Zum Ausprobieren: Tab „Box“ → Simulation → Abends.">
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            <Row first title="19:30 bis 7:00" subtitle="In der Demo fest eingestellt" icon="moon" iconColor="#7B61FF" />
            <Row
              title={s.bedtime ? 'Gerade Schlafenszeit' : 'Gerade keine Schlafenszeit'}
              icon="timer"
              iconColor={s.bedtime ? '#7B61FF' : c.textTertiary}
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
              onChange={(v) => demoBox.setKid({ noAutoplay: v })}
            />
            <SwitchRow
              title="Nur bekannte Token"
              subtitle="Unbekannte Token lösen gar nichts aus"
              icon="albums"
              iconColor={c.learn}
              value={k.knownTokensOnly}
              onChange={(v) => demoBox.setKid({ knownTokensOnly: v })}
            />
          </Card>
        </Section>
      </View>
    </>
  );
}

function LabeledSlider({ title, value, min, max, onChange }: { title: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.sliderHead}>
        <Txt variant="body">{title}</Txt>
        <Txt variant="body" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
          {Math.round(value)} %
        </Txt>
      </View>
      <Slider label={`Lautstärke ${title}`} value={value} min={min} max={max} step={5} onChange={onChange} format={(v) => `${Math.round(v)} %`} />
    </View>
  );
}

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const c = useColors();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const shake = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const press = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setError(false);
    setPin(next);
    if (next.length < 4) return;
    if (next === DEMO_PIN) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onUnlock();
    } else {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(true);
      // Kopfschütteln: kräftiger Anstoß, die Feder schwingt aus
      if (!reduceMotion) {
        shake.set(0);
        shake.set(withSpring(0, { dampingRatio: 0.25, duration: 500, velocity: 900 }));
      }
      setTimeout(() => setPin(''), 450);
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
            style={[styles.dot, { borderColor: error ? c.danger : c.textSecondary }, i < pin.length && { backgroundColor: error ? c.danger : c.text, borderColor: 'transparent' }]}
          />
        ))}
      </Animated.View>
      <Txt variant="footnote" color={error ? c.danger : 'tertiary'} accessibilityLiveRegion="polite">
        {error ? 'Falsche PIN. Nochmal versuchen.' : 'Demo-PIN: 1234'}
      </Txt>
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
