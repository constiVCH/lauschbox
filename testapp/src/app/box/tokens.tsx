import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useBox } from '@/box/BoxContext';
import type { Token } from '@/box/types';
import { BackToStart } from '@/components/BackToStart';
import { Cover } from '@/components/Cover';
import { LedRing } from '@/components/LedRing';
import { Screen } from '@/components/Screen';
import { Tap } from '@/components/Tap';
import { Button, Card, Pill, Section, Txt } from '@/components/ui';
import { formatTime } from '@/demo/catalog';
import { radius, space, useColors } from '@/theme';

export default function TokensTab() {
  const { view: s, api } = useBox();
  return (
    <Screen
      title="Token"
      subtitle={`${s.tokens.length} angelernt`}
      leading={<BackToStart />}
      trailing={!s.learning ? <Button label="Neu" icon="add" compact kind="secondary" onPress={api.startLearn} /> : undefined}
    >
      {s.learning && <LearnCard />}
      <Section title="Auf der Box gespeichert" footer="Die Zuordnung Token → Inhalt liegt auf der Box, nicht auf dem Token.">
        {s.tokens.length === 0 && !s.learning ? (
          <Card style={styles.empty}>
            <Txt variant="callout" color="secondary" style={{ textAlign: 'center' }}>
              Noch keine Token. Tipp auf „Neu“ und leg einen leeren Token auf die Box.
            </Txt>
          </Card>
        ) : (
          <View style={{ gap: space.sm }}>
            {s.tokens.map((t) => (
              <TokenCard key={t.uid} token={t} placed={s.placed === t.uid} playing={s.loadedUid === t.uid && !!s.now?.playing} />
            ))}
          </View>
        )}
      </Section>
    </Screen>
  );
}

function LearnCard() {
  const c = useColors();
  const { view: s, api } = useBox();
  const known = new Set(s.tokens.map((t) => t.uid));
  const blank = s.sim?.tray.find((uid) => !known.has(uid));
  return (
    <Section title="Neuer Token">
      <Card style={styles.learn}>
        <LedRing mode="learn" color={c.learn} fill={1} size={96} well={c.boxWell} />
        <View style={{ flex: 1, gap: space.sm }}>
          <Txt variant="headline">Leg einen leeren Token auf die Box.</Txt>
          <Txt variant="footnote" color="secondary">
            Der Ring pulsiert blau, bis die Box den Token erkennt. Danach wählst du hier den Inhalt aus.
          </Txt>
          <View style={styles.learnActions}>
            {blank && api.place && <Button label="Leeren Token auflegen" compact onPress={() => api.place?.(blank)} />}
            <Button label="Abbrechen" compact kind="plain" onPress={api.cancelLearn} />
          </View>
        </View>
      </Card>
    </Section>
  );
}

function TokenCard({ token, placed, playing }: { token: Token; placed: boolean; playing: boolean }) {
  const c = useColors();
  const m = token.medium;
  const p = token.progress;
  const started = p.positionS > 0 || (p.trackNumber ?? 1) > 1;
  const status = placed
    ? playing
      ? { text: 'Läuft', color: c.success }
      : { text: 'Liegt auf', color: c.warning }
    : p.finished
      ? { text: 'Fertig gehört', color: c.textSecondary }
      : null;
  const progressText =
    !p.finished && started ? `${p.trackName ?? `Titel ${p.trackNumber}`} · ${formatTime(p.positionS)}` : null;

  return (
    <Tap
      onPress={() => router.push({ pathname: '/token-edit', params: { uid: token.uid } })}
      scaleTo={0.98}
      haptic={null}
      accessibilityRole="button"
      accessibilityLabel={`${token.name}, ${m.title}${status ? `, ${status.text}` : ''}${progressText ? `, ${progressText}` : ''}`}
      accessibilityHint="Token bearbeiten"
    >
      <Card style={styles.token}>
        <View>
          <Cover medium={m} size={56} />
          <View style={[styles.colorBadge, { backgroundColor: token.color, borderColor: c.surface }]} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ gap: 1 }}>
            <Txt variant="headline" numberOfLines={1}>
              {token.name}
            </Txt>
            <Txt variant="footnote" color="secondary" numberOfLines={1}>
              {m.kindLabel} · {m.title}
            </Txt>
          </View>
          {p.fraction !== undefined && (
            <View style={[styles.bar, { backgroundColor: c.fillStrong }]}>
              <View style={[styles.barFill, { width: `${Math.round(p.fraction * 100)}%`, backgroundColor: token.color }]} />
            </View>
          )}
          {token.mode === 'zufall' ? (
            <Txt variant="footnote" color="tertiary" numberOfLines={1}>
              Zufällige Reihenfolge
            </Txt>
          ) : (
            progressText && (
              <Txt variant="footnote" color="tertiary" numberOfLines={1}>
                Weiter bei {progressText}
              </Txt>
            )
          )}
          {status && <Pill text={status.text} color={status.color} />}
        </View>
      </Card>
    </Tap>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: space.xl },
  learn: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  learnActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  token: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  colorBadge: { position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
  bar: { height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },
});
