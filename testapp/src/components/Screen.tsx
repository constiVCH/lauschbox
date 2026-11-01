import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, useColors, useIsDark } from '@/theme';

import { Txt } from './ui';

/** Unter der Tab-Leiste bleibt so viel Platz, dass der letzte Inhalt nicht verdeckt wird. */
export const TAB_BAR_SPACE = 92;

/**
 * Seitenrahmen: großer Titel im Inhalt, der mitscrollt. Über der Statusleiste liegt ein Material,
 * unter dem der Inhalt durchscrollt (statt einer harten Kante).
 */
export function Screen({
  title,
  subtitle,
  leading,
  trailing,
  children,
  scrollEnabled = true,
  bottomSpace = TAB_BAR_SPACE,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  scrollEnabled?: boolean;
  bottomSpace?: number;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <ScrollView
        scrollEnabled={scrollEnabled}
        contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + bottomSpace, paddingHorizontal: space.lg }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.content}>
          {leading && <View style={styles.leading}>{leading}</View>}
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Txt variant="largeTitle" accessibilityRole="header">
                {title}
              </Txt>
              {subtitle && (
                <Txt variant="subhead" color="secondary" style={{ marginTop: 2 }}>
                  {subtitle}
                </Txt>
              )}
            </View>
            {trailing}
          </View>
          {children}
        </View>
      </ScrollView>
      <StatusMaterial height={insets.top} />
    </View>
  );
}

export function StatusMaterial({ height }: { height: number }) {
  const c = useColors();
  const dark = useIsDark();
  if (height <= 0) return null;
  // Android: BlurView braucht dort ein eigenes Blur-Ziel; eine fast deckende Fläche wirkt gleich ruhig
  if (Platform.OS === 'android') return <View style={[styles.status, { height, backgroundColor: c.materialSolid, opacity: 0.94 }]} />;
  return <BlurView intensity={60} tint={dark ? 'dark' : 'light'} style={[styles.status, { height }]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  leading: { flexDirection: 'row', marginBottom: space.xs, marginLeft: -space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginBottom: space.xl, marginTop: space.sm },
  status: { position: 'absolute', top: 0, left: 0, right: 0 },
});
