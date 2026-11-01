import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { springs } from '@/theme';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Wie stark das Element beim Drücken nachgibt. */
  scaleTo?: number;
  haptic?: 'light' | 'medium' | 'selection' | null;
};

/**
 * Antippbares Element: Rückmeldung schon beim Aufsetzen des Fingers (nicht erst beim Loslassen),
 * per Feder, damit schnelles Antippen und Loslassen nicht ruckelt.
 */
export function Tap({ children, style, scaleTo = 0.96, haptic = 'light', onPressIn, onPressOut, disabled, ...rest }: Props) {
  const pressed = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const base = disabled ? 0.4 : 1;
  const animated = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: base * (1 - pressed.value * 0.35) }
      : { transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }], opacity: base * (1 - pressed.value * 0.12) },
  );

  // Layout-Angaben (flex, Ränder, Position) gehören an das äußere Element, sonst greifen sie im Elternlayout nicht
  const { outer, inner } = splitLayout(style);

  return (
    <Pressable
      {...rest}
      style={outer}
      disabled={disabled}
      hitSlop={rest.hitSlop ?? 6}
      onPressIn={(e) => {
        pressed.set(withSpring(1, springs.press));
        if (haptic && Platform.OS !== 'web') {
          if (haptic === 'selection') Haptics.selectionAsync();
          else Haptics.impactAsync(haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.set(withSpring(0, springs.ui));
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[inner, animated]}>{children}</Animated.View>
    </Pressable>
  );
}

const OUTER_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'position', 'top', 'left', 'right', 'bottom', 'zIndex',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
]);

function splitLayout(style: StyleProp<ViewStyle>) {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) (OUTER_KEYS.has(k) ? outer : inner)[k] = v;
  // Füllt das innere Element das äußere aus, wenn das äußere wächst
  if (outer.flex !== undefined || outer.flexGrow !== undefined) inner.flex = 1;
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}
