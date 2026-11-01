import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { Medium } from '@/box/types';

/** Cover eines Inhalts: echtes Bild (Spotify) oder Platzhalter mit Farbe und Emoji (Demo). */
export function Cover({ medium, size = 56 }: { medium: Medium; size?: number }) {
  const r = size * 0.2;
  if (medium.coverUrl) {
    return (
      <Image
        source={{ uri: medium.coverUrl }}
        style={{ width: size, height: size, borderRadius: r }}
        contentFit="cover"
        transition={180}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    );
  }
  return (
    <View
      style={[styles.cover, { width: size, height: size, borderRadius: r, backgroundColor: medium.color ?? '#5E7690' }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[StyleSheet.absoluteFill, styles.sheen, { borderRadius: r }]} />
      {medium.emoji ? (
        <Text style={{ fontSize: size * 0.46 }} allowFontScaling={false}>
          {medium.emoji}
        </Text>
      ) : (
        <Ionicons name="musical-notes" size={size * 0.42} color="rgba(255,255,255,0.85)" />
      )}
    </View>
  );
}

/** Ein NFC-Token: runde Scheibe in seiner Farbe, optional mit Cover. Leere Token sind gestrichelt. */
export function TokenDisc({
  color,
  emoji,
  coverUrl,
  size = 56,
  blank,
}: {
  color?: string;
  emoji?: string;
  coverUrl?: string | null;
  size?: number;
  blank?: boolean;
}) {
  return (
    <View
      style={[
        styles.disc,
        { width: size, height: size, borderRadius: size / 2 },
        blank ? [styles.blank, color ? { borderColor: color } : null] : { backgroundColor: color },
      ]}
    >
      {!blank && coverUrl ? (
        <Image
          source={{ uri: coverUrl }}
          style={{ width: size * 0.72, height: size * 0.72, borderRadius: size }}
          contentFit="cover"
          accessible={false}
        />
      ) : (
        !blank && <View style={[styles.discInner, { width: size * 0.7, height: size * 0.7, borderRadius: size }]} />
      )}
      {!blank && !coverUrl && (
        <Text style={{ fontSize: size * 0.38, position: 'absolute' }} allowFontScaling={false}>
          {emoji ?? '🎧'}
        </Text>
      )}
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
  blank: {
    shadowOpacity: 0,
    elevation: 0,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
});
