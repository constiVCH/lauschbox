import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, useColors, useIsDark } from '@/theme';

import { Tap } from './Tap';
import { Txt, type IconName } from './ui';

export const tabIcons: Record<string, IconName> = {
  index: 'radio-button-on',
  tokens: 'albums',
  rules: 'shield-checkmark',
};

/**
 * Schwebende Tab-Leiste aus Material: Inhalt scrollt sichtbar darunter durch.
 * Ein heller Rand oben wirkt wie Licht auf der Kante.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const c = useColors();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();

  const items = state.routes.map((route, index) => {
    const { options } = descriptors[route.key];
    const label = typeof options.title === 'string' ? options.title : route.name;
    const focused = state.index === index;
    const color = focused ? c.accentText : c.textSecondary;
    return (
      <Tap
        key={route.key}
        haptic="selection"
        scaleTo={0.9}
        style={styles.item}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={() => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        }}
      >
        <Ionicons name={tabIcons[route.name] ?? 'ellipse'} size={23} color={color} />
        <Txt variant="caption" color={color} maxFontSizeMultiplier={1.3} numberOfLines={1}>
          {label}
        </Txt>
      </Tap>
    );
  });

  const bottom = Math.max(insets.bottom, space.md);
  const shell = [styles.bar, { bottom, borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.7)' }];

  return Platform.OS === 'android' ? (
    <View style={[shell, { backgroundColor: c.materialSolid }]}>{items}</View>
  ) : (
    <View style={shell}>
      <BlurView intensity={70} tint={dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c.material, opacity: 0.4 }]} />
      {items}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    alignSelf: 'center',
    maxWidth: 420,
    flexDirection: 'row',
    borderRadius: radius.lg + 6,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingVertical: 7,
    paddingHorizontal: space.sm,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 50 },
});
