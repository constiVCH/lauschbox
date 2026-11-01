import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackToStart } from '@/components/BackToStart';
import { BoxSimulator } from '@/components/BoxSimulator';
import { Cover } from '@/components/Cover';
import { Screen } from '@/components/Screen';
import { Slider } from '@/components/Slider';
import { Tap } from '@/components/Tap';
import { Button, Card, Row, Section, Segmented, SwitchRow, Txt } from '@/components/ui';
import { formatTime, mediumByUri } from '@/demo/catalog';
import { demoBox, useDemoBox, type SleepTimer } from '@/demo/demoBox';
import { space, useColors } from '@/theme';

export default function BoxTab() {
  const [dragging, setDragging] = useState(false);
  return (
    <Screen title="Box" subtitle="Demo, ohne Hardware" leading={<BackToStart />} scrollEnabled={!dragging}>
      <View style={{ marginBottom: space.xxl }}>
        <BoxSimulator onDragChange={setDragging} />
      </View>
      <NowPlaying />
      <SleepTimerSection />
      <SimulationSection />
    </Screen>
  );
}

function NowPlaying() {
  const c = useColors();
  const s = useDemoBox();
  const token = s.tokens.find((t) => t.uid === s.placed);
  const medium = token ? mediumByUri(token.mediumUri) : undefined;
  const cap = demoBox.volumeCap(s);

  if (!token || !medium) {
    return (
      <Section title="Läuft gerade">
        <Card style={styles.empty}>
          <Ionicons name="musical-notes" size={28} color={c.textTertiary} />
          <Txt variant="callout" color="secondary" style={{ textAlign: 'center' }}>
            {s.placed ? 'Auf der Box liegt ein Token ohne Inhalt.' : 'Nichts. Leg oben einen Token auf die Box.'}
          </Txt>
        </Card>
      </Section>
    );
  }

  const track = medium.tracks[s.track];
  return (
    <Section title="Läuft gerade">
      <Card style={{ gap: space.lg }}>
        <View style={styles.nowHead}>
          <Cover medium={medium} size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="headline" numberOfLines={2}>
              {medium.title}
            </Txt>
            <Txt variant="footnote" color="secondary">
              {track.title} · {s.track + 1} von {medium.tracks.length}
            </Txt>
          </View>
          <View style={[styles.tokenDot, { backgroundColor: token.color }]} accessibilityLabel={`Token-Farbe von ${token.name}`} />
        </View>

        <View style={{ gap: space.xs }}>
          <Slider
            label="Position im Titel"
            value={s.position}
            max={track.seconds}
            onChange={(v) => demoBox.seek(v)}
            format={formatTime}
            color={token.color}
          />
          <View style={styles.times}>
            <Txt variant="caption" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
              {formatTime(s.position)}
            </Txt>
            <Txt variant="caption" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
              −{formatTime(track.seconds - s.position)}
            </Txt>
          </View>
        </View>

        <View style={styles.transport}>
          <Transport icon="play-skip-back" label="Zurück" onPress={() => demoBox.skip(-1)} />
          <Transport icon={s.playing ? 'pause' : 'play'} label={s.playing ? 'Pause' : 'Abspielen'} onPress={demoBox.togglePlay} big />
          <Transport icon="play-skip-forward" label="Weiter" onPress={() => demoBox.skip(1)} />
        </View>

        <View style={{ gap: space.xs }}>
          <Slider
            label="Lautstärke"
            value={s.volume}
            cap={cap < 100 ? cap : undefined}
            onChange={(v) => demoBox.setVolume(v)}
            format={(v) => `${Math.round(v)} %`}
            iconMin="volume-low"
            iconMax="volume-high"
          />
          {cap < 100 && (
            <Txt variant="footnote" color="tertiary" style={{ textAlign: 'center' }}>
              {s.bedtime && s.kid.enabled ? 'Schlafenszeit' : 'Kindermodus'}: höchstens {cap} %
            </Txt>
          )}
        </View>
      </Card>
    </Section>
  );
}

function Transport({ icon, label, onPress, big }: { icon: 'play' | 'pause' | 'play-skip-back' | 'play-skip-forward'; label: string; onPress: () => void; big?: boolean }) {
  const c = useColors();
  const size = big ? 64 : 48;
  return (
    <Tap
      onPress={onPress}
      scaleTo={0.88}
      haptic={big ? 'medium' : 'light'}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.transportBtn, { width: size, height: size, borderRadius: size / 2, backgroundColor: big ? c.accent : 'transparent' }]}
    >
      <Ionicons name={icon} size={big ? 30 : 26} color={big ? c.onAccent : c.text} />
    </Tap>
  );
}

function SleepTimerSection() {
  const s = useDemoBox();
  const value = s.sleep.kind === 'minutes' ? s.sleep.total : s.sleep.kind;
  const options: { value: number | 'off' | 'episode'; label: string }[] = [
    { value: 'off', label: 'Aus' },
    { value: 15 * 60, label: '15 min' },
    { value: 30 * 60, label: '30 min' },
    { value: 'episode', label: 'Nach Titel' },
  ];
  const set = (v: number | 'off' | 'episode') => {
    const sleep: SleepTimer = v === 'off' ? { kind: 'off' } : v === 'episode' ? { kind: 'episode' } : { kind: 'minutes', remaining: v, total: v };
    demoBox.setSleep(sleep);
  };
  const footer =
    s.sleep.kind === 'minutes'
      ? `Stoppt in ${formatTime(s.sleep.remaining)}.`
      : s.sleep.kind === 'episode'
        ? 'Stoppt, wenn der aktuelle Titel zu Ende ist.'
        : 'Blendet am Ende aus und stoppt die Box.';
  return (
    <Section title="Sleep-Timer" footer={footer}>
      <Segmented label="Sleep-Timer" options={options} value={value} onChange={set} />
    </Section>
  );
}

function SimulationSection() {
  const c = useColors();
  const s = useDemoBox();
  return (
    <Section title="Simulation" footer="Nur in der Demo: Zeit schneller laufen lassen, Abend vorspielen, die Tastensperre auslösen.">
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <Row
          first
          title="Zeitraffer"
          icon="speedometer"
          iconColor={c.learn}
          trailing={
            <View style={{ width: 120 }}>
              <Segmented label="Zeitraffer" options={[{ value: 1 as const, label: '1×' }, { value: 30 as const, label: '30×' }]} value={s.speed} onChange={demoBox.setSpeed} />
            </View>
          }
        />
        <SwitchRow title="Abends (Schlafenszeit)" icon="moon" iconColor="#7B61FF" value={s.bedtime} onChange={demoBox.setBedtime} />
        <Row
          title={s.locked ? 'Tasten gesperrt' : 'Tasten frei'}
          subtitle="+ und − lange drücken"
          icon={s.locked ? 'lock-closed' : 'lock-open'}
          iconColor={s.locked ? c.danger : c.success}
          trailing={<Button label={s.locked ? 'Entsperren' : 'Sperren'} kind="secondary" compact onPress={demoBox.toggleLock} />}
        />
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  nowHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tokenDot: { width: 14, height: 14, borderRadius: 7, alignSelf: 'flex-start', marginTop: 4 },
  times: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl },
  transportBtn: { alignItems: 'center', justifyContent: 'center', borderCurve: 'continuous' },
});
