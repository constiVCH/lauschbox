import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { radius, springs, useColors } from '@/theme';

import type { IconName } from './ui';

type Props = {
  value: number;
  min?: number;
  max?: number;
  /** Feste Grenze unterhalb von max (z. B. Maximallautstärke im Kindermodus). Darüber gibt der Regler nur noch federnd nach. */
  cap?: number;
  step?: number;
  onChange: (v: number) => void;
  onEnd?: (v: number) => void;
  label: string;
  format?: (v: number) => string;
  iconMin?: IconName;
  iconMax?: IconName;
  color?: string;
};

const TRACK_H = 30;

/** Weicher Anschlag: je weiter über die Grenze, desto weniger folgt der Regler. */
function rubberband(overshoot: number, dimension: number, c = 0.55) {
  'worklet';
  return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
}

/**
 * Schieberegler, der 1:1 dem Finger folgt (ab der Stelle, an der man ihn gegriffen hat),
 * an Grenzen federnd nachgibt und beim Loslassen per Feder einrastet.
 */
export function Slider({ value, min = 0, max = 100, cap, step = 1, onChange, onEnd, label, format, iconMin, iconMax, color }: Props) {
  const c = useColors();
  const accent = color ?? c.accent;
  const limit = Math.min(cap ?? max, max);
  const [width, setWidth] = useState(0);
  const w = useSharedValue(0);
  const shown = useSharedValue(value); // angezeigter Wert, darf beim Ziehen über die Grenze hinaus
  const start = useSharedValue(value);
  const dragging = useSharedValue(false);
  const hitCap = useSharedValue(false);

  useEffect(() => {
    if (!dragging.value) shown.set(withSpring(value, springs.ui));
  }, [value, dragging, shown]);

  const emit = (v: number) => onChange(v);
  const end = (v: number) => onEnd?.(v);
  const bump = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
  };

  const quantize = (raw: number) => {
    'worklet';
    const clamped = Math.max(min, Math.min(limit, raw));
    return Math.round(clamped / step) * step;
  };

  const pan = usePanGesture({
    activeOffsetX: [-6, 6],
    failOffsetY: [-14, 14],
    onActivate: () => {
      'worklet';
      dragging.set(true);
      start.set(shown.value);
      hitCap.set(false);
    },
    onUpdate: (e) => {
      'worklet';
      if (w.value <= 0) return;
      const range = max - min;
      const raw = start.value + (e.translationX / w.value) * range;
      // Über die Grenze hinaus: nur gedämpft folgen (in Pixeln rechnen, dann zurück in Werte)
      let display = raw;
      if (raw > limit) display = limit + (rubberband(((raw - limit) / range) * w.value, w.value) / w.value) * range;
      else if (raw < min) display = min - (rubberband(((min - raw) / range) * w.value, w.value) / w.value) * range;
      shown.set(display);
      const atCap = raw > limit && limit < max;
      if (atCap && !hitCap.value) scheduleOnRN(bump);
      hitCap.set(atCap);
      scheduleOnRN(emit, quantize(raw));
    },
    onDeactivate: (e) => {
      'worklet';
      dragging.set(false);
      const range = max - min;
      const v = quantize(start.value + (e.translationX / Math.max(1, w.value)) * range);
      // Zurückfedern mit der Geschwindigkeit des Fingers, damit kein Ruck entsteht
      shown.set(withSpring(v, { ...springs.ui, velocity: (e.velocityX / Math.max(1, w.value)) * range }));
      scheduleOnRN(emit, v);
      scheduleOnRN(end, v);
    },
  });

  const tap = useTapGesture({
    onDeactivate: (e) => {
      'worklet';
      if (w.value <= 0) return;
      const v = quantize(min + (e.x / w.value) * (max - min));
      shown.set(withSpring(v, springs.ui));
      scheduleOnRN(emit, v);
      scheduleOnRN(end, v);
    },
  });

  const gesture = useCompetingGestures(pan, tap);

  const fillStyle = useAnimatedStyle(() => {
    const f = (shown.value - min) / (max - min);
    return { width: Math.max(TRACK_H * 0.6, f * w.value) };
  });

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
    w.set(e.nativeEvent.layout.width);
  };

  const capX = cap !== undefined && cap < max ? ((cap - min) / (max - min)) * width : null;
  const text = format ? format(value) : String(Math.round(value));

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max: limit, now: Math.round(value), text }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const delta = (e.nativeEvent.actionName === 'increment' ? 1 : -1) * Math.max(step, (max - min) / 20);
        const v = Math.max(min, Math.min(limit, value + delta));
        onChange(v);
        onEnd?.(v);
      }}
    >
      {iconMin && <Ionicons name={iconMin} size={18} color={c.textSecondary} />}
      <GestureDetector gesture={gesture}>
        <View style={[styles.track, { backgroundColor: c.fillStrong }]} onLayout={onLayout}>
          <Animated.View style={[styles.fill, { backgroundColor: accent }, fillStyle]} />
          {capX !== null && <View style={[styles.cap, { left: capX - 1, backgroundColor: c.text }]} />}
        </View>
      </GestureDetector>
      {iconMax && <Ionicons name={iconMax} size={18} color={c.textSecondary} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { flex: 1, height: TRACK_H, borderRadius: radius.pill, overflow: 'hidden', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.pill },
  cap: { position: 'absolute', top: 7, bottom: 7, width: 2, borderRadius: 1, opacity: 0.55 },
});
