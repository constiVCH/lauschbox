import { StyleSheet, Text, View } from 'react-native';

import type { Medium } from '@/demo/catalog';

/** Platzhalter-Cover, solange es keine echten Bilder gibt. */
export function Cover({ medium, size = 56 }: { medium: Medium; size?: number }) {
  return (
    <View
      style={[styles.cover, { width: size, height: size, borderRadius: size * 0.2, backgroundColor: medium.cover }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[StyleSheet.absoluteFill, styles.sheen, { borderRadius: size * 0.2 }]} />
      <Text style={{ fontSize: size * 0.46 }} allowFontScaling={false}>
        {medium.emoji}
      </Text>
    </View>
  );
}

/** Ein NFC-Token: runde Scheibe in seiner Farbe. Leere Token sind gestrichelt. */
export function TokenDisc({ color, emoji, size = 56, blank }: { color?: string; emoji?: string; size?: number; blank?: boolean }) {
  return (
    <View
      style={[
        styles.disc,
        { width: size, height: size, borderRadius: size / 2 },
        blank ? [styles.blank, color ? { borderColor: color } : null] : { backgroundColor: color },
      ]}
    >
      {!blank && <View style={[styles.discInner, { width: size * 0.7, height: size * 0.7, borderRadius: size }]} />}
      <Text style={{ fontSize: size * 0.38, position: 'absolute' }} allowFontScaling={false}>
        {blank ? '' : emoji}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderCurve: 'continuous' },
  sheen: { backgroundColor: 'rgba(255,255,255,0.14)', transform: [{ translateY: -18 }, { scaleY: 0.5 }] },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  discInner: { backgroundColor: 'rgba(255,255,255,0.18)' },
  blank: { shadowOpacity: 0, elevation: 0, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.55)', backgroundColor: 'rgba(255,255,255,0.10)' },
});
