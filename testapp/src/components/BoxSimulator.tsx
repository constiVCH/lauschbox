import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type AnimatedRef,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useBox } from '@/box/BoxContext';
import type { BoxApi, BoxView } from '@/box/types';
import { radius, space, springs, useColors } from '@/theme';

import { TokenDisc } from './Cover';
import { LedRing } from './LedRing';
import { Tap } from './Tap';
import { Txt } from './ui';

const RING = 176;
const CHIP = 56;

/** Wohin eine Geste mit dieser Geschwindigkeit ausrollen würde (wie Scroll-Abbremsung). */
function project(velocity: number, decelerationRate = 0.99) {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

function haptic(kind: 'lift' | 'place' | 'warn') {
  if (Platform.OS === 'web') return;
  if (kind === 'lift') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  else if (kind === 'place') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

/**
 * Die Box zum Anfassen: Token aus der Ablage auf die Mulde ziehen (oder antippen), Taster drücken.
 * Der Ring zeigt, was die Box gerade zeigt. Bei der echten Box gibt es die Ablage nur im Simulationsmodus
 * (box-daemon mit --fake); sonst liegt der Token wirklich auf, und die Taster wirken als Fernbedienung.
 */
export function BoxSimulator({ onDragChange }: { onDragChange?: (dragging: boolean) => void }) {
  const c = useColors();
  const { view: s, api } = useBox();
  const well = useAnimatedRef<Animated.View>();
  const placed = s.placed ? s.tokens.find((t) => t.uid === s.placed) : null;
  const playing = s.now?.playing ?? false;
  const canPlace = !!s.sim && !!api.place;

  return (
    <View style={{ gap: space.lg }}>
      <View style={[styles.box, { backgroundColor: c.boxBody }]}>
        <Animated.View ref={well} style={styles.wellWrap} collapsable={false}>
          <LedRing mode={s.led.mode} color={s.led.color} fill={s.led.fill} size={RING} well={c.boxWell} />
          {s.placed && (
            <PlacedToken
              key={s.placed}
              well={well}
              color={placed?.color}
              emoji={placed?.medium.emoji}
              coverUrl={placed?.medium.coverUrl}
              blank={!placed}
              onRemove={canPlace ? api.remove : undefined}
            />
          )}
        </Animated.View>
        <View style={styles.front}>
          <Grille />
          <View style={styles.keys}>
            <BoxKey icon="remove" label="Leiser" onPress={() => api.boxButton('minus')} />
            <BoxKey icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Abspielen'} onPress={() => api.boxButton('play')} big />
            <BoxKey icon="add" label="Lauter" onPress={() => api.boxButton('plus')} />
          </View>
        </View>
      </View>

      {s.removalPending && (
        <Txt variant="footnote" color="secondary" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
          Token abgenommen. Die Box spielt noch {s.settings.removeGraceS.toLocaleString('de-DE')} s weiter, falls er zurückkommt.
        </Txt>
      )}
      {s.sim && canPlace ? (
        <View style={{ gap: space.sm }}>
          <Txt variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
            {s.learning ? 'Lernmodus: Leg einen leeren Token auf die Box.' : 'Token auf die Mulde ziehen oder antippen'}
          </Txt>
          <View style={styles.tray}>
            {s.sim.tray.map((uid) =>
              uid === s.placed ? (
                <View key={uid} style={[styles.slot, { borderColor: c.fillStrong }]} />
              ) : (
                <DraggableToken key={uid} uid={uid} view={s} api={api} well={well} onDragChange={onDragChange} />
              ),
            )}
          </View>
        </View>
      ) : (
        <Txt variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
          {s.learning
            ? 'Lernmodus: Leg einen leeren Token auf die Box.'
            : placed
              ? `„${placed.name}“ liegt auf. Die Taster oben bedienen die Box aus der Ferne.`
              : s.placed
                ? 'Ein unbekannter Token liegt auf.'
                : 'Leg einen Token auf die Box. Die Taster oben bedienen sie aus der Ferne.'}
        </Txt>
      )}
    </View>
  );
}

function DraggableToken({
  uid,
  view,
  api,
  well,
  onDragChange,
}: {
  uid: string;
  view: BoxView;
  api: BoxApi;
  well: AnimatedRef<Animated.View>;
  onDragChange?: (dragging: boolean) => void;
}) {
  const c = useColors();
  const token = view.tokens.find((t) => t.uid === uid);
  const blank = !token;
  const label = token ? `Token „${token.name}“` : 'Leerer Token';

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const lift = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const setDragging = (d: boolean) => onDragChange?.(d);
  const liftFeedback = () => haptic('lift');
  const drop = () => {
    api.place?.(uid);
    haptic(token || view.learning ? 'place' : 'warn');
  };

  const pan = usePanGesture({
    activateAfterLongPress: 140,
    onActivate: () => {
      'worklet';
      lift.set(withSpring(1, springs.press));
      scheduleOnRN(liftFeedback);
      scheduleOnRN(setDragging, true);
    },
    onUpdate: (e) => {
      'worklet';
      x.set(e.translationX);
      y.set(e.translationY);
    },
    onDeactivate: (e) => {
      'worklet';
      scheduleOnRN(setDragging, false);
      lift.set(withSpring(0, springs.ui));
      const m = measure(well);
      if (!m) {
        x.set(withSpring(0, springs.ui));
        y.set(withSpring(0, springs.ui));
        return;
      }
      const cx = m.pageX + m.width / 2;
      const cy = m.pageY + m.height / 2;
      // Nicht vom Loslass-Punkt aus entscheiden, sondern von dort, wohin der Schwung den Token trägt
      const px = e.absoluteX + project(e.velocityX);
      const py = e.absoluteY + project(e.velocityY);
      const hit = Math.hypot(px - cx, py - cy) < m.width * 0.55;
      if (hit) {
        // Mitte des Tokens auf die Mitte der Mulde, Fingergeschwindigkeit mitnehmen
        const tx = x.value + (cx - e.absoluteX);
        const ty = y.value + (cy - e.absoluteY);
        x.set(withSpring(tx, { ...springs.ui, velocity: e.velocityX }));
        y.set(
          withSpring(ty, { ...springs.ui, velocity: e.velocityY }, (done) => {
            if (done) scheduleOnRN(drop);
          }),
        );
      } else {
        // Zurück in die Ablage, mit Schwung: hier darf es leicht nachfedern
        x.set(withSpring(0, { ...springs.momentum, velocity: e.velocityX }));
        y.set(withSpring(0, { ...springs.momentum, velocity: e.velocityY }));
      }
    },
  });

  const tap = useTapGesture({
    onDeactivate: () => {
      'worklet';
      scheduleOnRN(drop);
    },
  });

  const gesture = useCompetingGestures(pan, tap);

  const style = useAnimatedStyle(() => ({
    zIndex: lift.value > 0.01 ? 10 : 0,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: reduceMotion ? 1 : 1 + lift.value * 0.12 },
    ],
    shadowOpacity: lift.value * 0.4,
    shadowRadius: 5 + lift.value * 10,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.chip, style]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Legt den Token auf die Box"
        onAccessibilityTap={drop}
      >
        <TokenDisc size={CHIP} color={blank ? c.textTertiary : token?.color} emoji={token?.medium.emoji} coverUrl={token?.medium.coverUrl} blank={blank} />
      </Animated.View>
    </GestureDetector>
  );
}

/** Token in der Mulde. Antippen oder herausziehen nimmt ihn ab. */
function PlacedToken({
  well,
  color,
  emoji,
  coverUrl,
  blank,
  onRemove,
}: {
  well: AnimatedRef<Animated.View>;
  color?: string;
  emoji?: string;
  coverUrl?: string | null;
  blank: boolean;
  onRemove?: () => void;
}) {
  const c = useColors();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const appear = useSharedValue(0.85);
  useEffect(() => {
    appear.set(withSpring(1, springs.ui));
  }, [appear]);

  const remove = () => onRemove?.();

  const movable = !!onRemove;
  const pan = usePanGesture({
    enabled: movable,
    minDistance: 8,
    onUpdate: (e) => {
      'worklet';
      x.set(e.translationX);
      y.set(e.translationY);
    },
    onDeactivate: (e) => {
      'worklet';
      const m = measure(well);
      const r = m ? m.width * 0.5 : RING / 2;
      const out = Math.hypot(e.translationX + project(e.velocityX), e.translationY + project(e.velocityY)) > r;
      if (out) {
        x.set(withSpring(e.translationX + project(e.velocityX), { ...springs.ui, velocity: e.velocityX }));
        y.set(withSpring(e.translationY + project(e.velocityY), { ...springs.ui, velocity: e.velocityY }));
        scheduleOnRN(remove);
      } else {
        x.set(withSpring(0, { ...springs.momentum, velocity: e.velocityX }));
        y.set(withSpring(0, { ...springs.momentum, velocity: e.velocityY }));
      }
    },
  });
  const tap = useTapGesture({
    enabled: movable,
    onDeactivate: () => {
      'worklet';
      scheduleOnRN(remove);
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: appear.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.placed, style]}
        accessible
        accessibilityRole={movable ? 'button' : 'image'}
        accessibilityLabel={blank ? 'Leerer Token liegt auf der Box' : 'Token liegt auf der Box'}
        accessibilityHint={movable ? 'Nimmt den Token ab' : undefined}
        onAccessibilityTap={movable ? remove : undefined}
      >
        <TokenDisc size={CHIP + 8} color={blank ? c.textTertiary : color} emoji={emoji} coverUrl={coverUrl} blank={blank} />
      </Animated.View>
    </GestureDetector>
  );
}

function BoxKey({ icon, label, onPress, big }: { icon: 'remove' | 'add' | 'play' | 'pause'; label: string; onPress: () => void; big?: boolean }) {
  const size = big ? 54 : 44;
  return (
    <Tap
      onPress={onPress}
      haptic="medium"
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={`Taste ${label}`}
      style={[styles.key, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Ionicons name={icon} size={big ? 26 : 22} color="#FFE7DC" />
    </Tap>
  );
}

/** Lautsprechergitter vorn an der Kiste, wie im Logo. */
function Grille() {
  return (
    <View style={styles.grille} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 3 }, (_, row) => (
        <View key={row} style={styles.grilleRow}>
          {Array.from({ length: 7 }, (_, i) => (
            <View key={i} style={styles.hole} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.lg + 6,
    borderCurve: 'continuous',
    alignItems: 'center',
    paddingTop: space.xl,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  wellWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  placed: { position: 'absolute' },
  front: {
    alignSelf: 'stretch',
    marginTop: space.xl,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
    backgroundColor: '#B04224',
    borderBottomLeftRadius: radius.lg + 6,
    borderBottomRightRadius: radius.lg + 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.lg,
  },
  keys: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  key: { backgroundColor: 'rgba(0,0,0,0.22)', alignItems: 'center', justifyContent: 'center' },
  grille: { gap: 6 },
  grilleRow: { flexDirection: 'row', gap: 6 },
  hole: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.28)' },
  // Über der Kiste zeichnen, damit gezogene Token nicht hinter ihr verschwinden (Android ordnet nach elevation)
  tray: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.md, overflow: 'visible', zIndex: 2, elevation: 8 },
  chip: { width: CHIP, height: CHIP, borderRadius: CHIP / 2, shadowColor: '#000', shadowOffset: { width: 0, height: 6 } },
  slot: { width: CHIP, height: CHIP, borderRadius: CHIP / 2, borderWidth: 2, borderStyle: 'dashed' },
});
