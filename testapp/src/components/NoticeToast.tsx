import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useBox } from '@/box/BoxContext';
import { radius, space, springs, useColors } from '@/theme';

import { TAB_BAR_SPACE } from './Screen';
import { Tap } from './Tap';
import { Txt } from './ui';

const VISIBLE_MS = 3800;

/**
 * Meldungen der Box („Unbekannter Token“, „Schlafenszeit“ …) über der Tab-Leiste.
 * Die Meldung bleibt im Zustand der Box, bis sie ausgeblendet ist; erst dann wird sie verworfen.
 */
export function NoticeToast() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { view, api } = useBox();
  const notice = view.notice;
  const dismiss = api.dismissNotice;
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  const hide = useCallback(
    (id: number) => {
      const done = (finished?: boolean) => {
        'worklet';
        if (finished) scheduleOnRN(dismiss, id);
      };
      progress.set(reduceMotion ? withTiming(0, { duration: 180 }, done) : withSpring(0, springs.ui, done));
    },
    [progress, reduceMotion, dismiss],
  );

  const id = notice?.id;
  const text = notice?.text;
  useEffect(() => {
    if (id === undefined || !text) return;
    AccessibilityInfo.announceForAccessibility(text);
    progress.set(reduceMotion ? withTiming(1, { duration: 180 }) : withSpring(1, springs.ui));
    const timer = setTimeout(() => hide(id), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [id, text, hide, progress, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    // Rein und raus auf demselben Weg: von unten
    transform: reduceMotion ? [] : [{ translateY: (1 - progress.value) * 40 }, { scale: 0.96 + progress.value * 0.04 }],
  }));

  if (!notice) return null;
  const tone = notice.tone === 'warning' ? c.warning : notice.tone === 'success' ? c.success : c.learn;
  const icon = notice.tone === 'warning' ? 'alert-circle' : notice.tone === 'success' ? 'checkmark-circle' : 'information-circle';

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + TAB_BAR_SPACE - space.md }, style]}>
      <Tap
        onPress={() => hide(notice.id)}
        haptic={null}
        scaleTo={0.98}
        accessibilityRole="alert"
        accessibilityHint="Schließt den Hinweis"
        style={styles.tap}
      >
        <View style={[styles.toast, { backgroundColor: c.surfaceRaised }]}>
          <Ionicons name={icon} size={22} color={tone} />
          {/* flexShrink statt flex: 1 – mit flex: 1 bekommt der Text auf dem Handy keine Breite und nur das Symbol bleibt;
              so wird der Hinweis so breit wie sein Text und bricht erst an der Bildschirmkante um */}
          <Txt variant="subhead" style={{ flexShrink: 1, fontWeight: '500' }}>
            {notice.text}
          </Txt>
        </View>
      </Tap>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  tap: { maxWidth: '100%' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    maxWidth: 520,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
});
