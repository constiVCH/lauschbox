import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BackToStart } from '@/components/BackToStart';
import { Cover } from '@/components/Cover';
import { LedRing } from '@/components/LedRing';
import { Screen } from '@/components/Screen';
import { Tap } from '@/components/Tap';
import { Button, Card, Pill, Section, Txt } from '@/components/ui';
import { formatTime, mediumByUri, totalSeconds } from '@/demo/catalog';
import { demoBox, isBlank, useDemoBox, type Token } from '@/demo/demoBox';
import { radius, space, useColors } from '@/theme';

export default function TokensTab() {
  const s = useDemoBox();

  return (
    <Screen
      title="Token"
      subtitle={`${s.tokens.length} angelernt`}
      leading={<BackToStart />}
      trailing={!s.learning ? <Button label="Neu" icon="add" compact kind="secondary" onPress={demoBox.startLearn} /> : undefined}
    >
      {s.learning && <LearnCard />}
      <Section title="Auf der Box gespeichert" footer="Die Zuordnung Token → Inhalt liegt auf der Box, nicht auf dem Token.">
        <View style={{ gap: space.sm }}>
          {s.tokens.map((t) => (
            <TokenCard key={t.uid} token={t} placed={s.placed === t.uid} playing={s.playing} />
          ))}
        </View>
      </Section>
    </Screen>
  );
}

function LearnCard() {
  const c = useColors();
  const s = useDemoBox();
  const blank = s.tray.find((uid) => isBlank(s, uid));
  return (
    <Section title="Neuer Token">
      <Card style={styles.learn}>
        <LedRing mode="learn" color={c.learn} fill={1} size={96} well={c.boxWell} />
        <View style={{ flex: 1, gap: space.sm }}>
          <Txt variant="headline">Leg einen leeren Token auf die Box.</Txt>
          <Txt variant="footnote" color="secondary">
            Der Ring pulsiert blau, bis die Box den Token erkennt. In der Demo geht das auch im Tab „Box“ per Ziehen.
          </Txt>
          <View style={styles.learnActions}>
            {blank && <Button label="Leeren Token auflegen" compact onPress={() => demoBox.place(blank)} />}
            <Button label="Abbrechen" compact kind="plain" onPress={demoBox.cancelLearn} />
          </View>
        </View>
      </Card>
    </Section>
  );
}

function TokenCard({ token, placed, playing }: { token: Token; placed: boolean; playing: boolean }) {
  const c = useColors();
  const m = mediumByUri(token.mediumUri);
  if (!m) return null;
  const done = m.tracks.slice(0, token.progress.track).reduce((a, t) => a + t.seconds, 0) + token.progress.position;
  const total = totalSeconds(m);
  const frac = token.progress.finished ? 1 : total ? done / total : 0;
  const status = placed
    ? playing
      ? { text: 'Läuft', color: c.success }
      : { text: 'Liegt auf, pausiert', color: c.warning }
    : token.progress.finished
      ? { text: 'Fertig gehört', color: c.textSecondary }
      : done > 0
        ? { text: `Noch ${formatTime(total - done)}`, color: c.textSecondary }
        : null;

  return (
    <Tap
      onPress={() => router.push({ pathname: '/token-edit', params: { uid: token.uid } })}
      scaleTo={0.98}
      haptic={null}
      accessibilityRole="button"
      accessibilityLabel={`${token.name}, ${m.title}${status ? `, ${status.text}` : ''}`}
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
              {m.kind} · {m.title}
            </Txt>
          </View>
          <View style={[styles.bar, { backgroundColor: c.fillStrong }]}>
            <View style={[styles.barFill, { width: `${Math.round(frac * 100)}%`, backgroundColor: token.color }]} />
          </View>
          {status && <Pill text={status.text} color={status.color} />}
        </View>
      </Card>
    </Tap>
  );
}

const styles = StyleSheet.create({
  learn: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  learnActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  token: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  colorBadge: { position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
  bar: { height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },
});
