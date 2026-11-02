import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useBox } from '@/box/BoxContext';
import type { BoxView } from '@/box/types';
import { BackToStart } from '@/components/BackToStart';
import { BoxSimulator } from '@/components/BoxSimulator';
import { Cover } from '@/components/Cover';
import { Screen } from '@/components/Screen';
import { Slider } from '@/components/Slider';
import { Tap } from '@/components/Tap';
import { Button, Card, Pill, Row, Section, Segmented, SwitchRow, Txt } from '@/components/ui';
import { formatTime } from '@/demo/catalog';
import { space, useColors } from '@/theme';

export default function BoxTab() {
  const { view } = useBox();
  const [dragging, setDragging] = useState(false);
  return (
    <Screen
      title="Box"
      subtitle={subtitle(view)}
      leading={<BackToStart />}
      trailing={view.kind === 'remote' ? <ConnectionPill view={view} /> : undefined}
      scrollEnabled={!dragging}
    >
      <StatusBanner view={view} />
      <View style={{ marginBottom: space.xxl }}>
        <BoxSimulator onDragChange={setDragging} />
      </View>
      <NowPlaying />
      <SleepTimerSection />
      <MoreSection />
    </Screen>
  );
}

function subtitle(view: BoxView) {
  if (view.kind === 'demo') return 'Demo, ohne Hardware';
  return view.sim ? `${view.name} · Simulation` : view.name;
}

function ConnectionPill({ view }: { view: BoxView }) {
  const c = useColors();
  const map = {
    online: { text: 'Verbunden', color: c.success },
    connecting: { text: 'Verbinde …', color: c.warning },
    offline: { text: 'Getrennt', color: c.danger },
  } as const;
  return <Pill text={map[view.connection].text} color={map[view.connection].color} />;
}

/** Ehrlich sagen, wenn etwas nicht geht: Verbindung weg oder Spotify (go-librespot) nicht erreichbar. */
function StatusBanner({ view }: { view: BoxView }) {
  const c = useColors();
  if (view.kind !== 'remote') return null;
  let text: string | null = null;
  if (view.connection !== 'online') text = 'Verbindung zur Box unterbrochen. Die App verbindet sich neu, angezeigt wird der letzte Stand.';
  else if (!view.playerAvailable)
    text = `Spotify ist auf der Box nicht erreichbar (go-librespot). Token lassen sich anlernen, aber nicht abspielen.${view.playerError ? `\n${view.playerError}` : ''}`;
  if (!text) return null;
  return (
    <Card style={[styles.banner, { backgroundColor: c.warning + '22' }]}>
      <Ionicons name="alert-circle" size={22} color={c.warning} />
      <Txt variant="footnote" style={{ flex: 1 }}>
        {text}
      </Txt>
    </Card>
  );
}

function emptyText(s: BoxView) {
  if (!s.placed) return 'Nichts. Leg einen Token auf die Box.';
  const token = s.tokens.find((t) => t.uid === s.placed);
  if (!token) return 'Auf der Box liegt ein Token ohne Inhalt.';
  return `„${token.name}“ liegt auf, spielt aber gerade nicht.`;
}

function NowPlaying() {
  const c = useColors();
  const { view: s, api } = useBox();
  const token = s.tokens.find((t) => t.uid === s.loadedUid);
  const now = s.now;

  if (!token || !now) {
    return (
      <Section title="Läuft gerade">
        <Card style={styles.empty}>
          <Ionicons name="musical-notes" size={28} color={c.textTertiary} />
          <Txt variant="callout" color="secondary" style={{ textAlign: 'center' }}>
            {emptyText(s)}
          </Txt>
        </Card>
      </Section>
    );
  }

  const medium = now.coverUrl ? { ...token.medium, coverUrl: now.coverUrl } : token.medium;
  const position = Math.min(now.positionS, now.durationS || now.positionS);
  return (
    <Section title="Läuft gerade">
      <Card style={{ gap: space.lg }}>
        <View style={styles.nowHead}>
          <Cover medium={medium} size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="headline" numberOfLines={2}>
              {token.medium.title}
            </Txt>
            <Txt variant="footnote" color="secondary" numberOfLines={2}>
              {now.trackTitle}
              {now.trackNumber ? ` · ${now.trackCount ? `${now.trackNumber} von ${now.trackCount}` : `Titel ${now.trackNumber}`}` : ''}
            </Txt>
          </View>
          <View style={[styles.tokenDot, { backgroundColor: token.color }]} accessibilityLabel={`Token-Farbe von ${token.name}`} />
        </View>

        <View style={{ gap: space.xs }}>
          <Slider
            label="Position im Titel"
            value={position}
            max={Math.max(1, now.durationS)}
            onChange={() => {}}
            onEnd={(v) => api.seek(v)}
            format={formatTime}
            color={token.color}
          />
          <View style={styles.times}>
            <Txt variant="caption" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
              {formatTime(position)}
            </Txt>
            <Txt variant="caption" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
              −{formatTime(Math.max(0, now.durationS - position))}
            </Txt>
          </View>
        </View>

        {now.contextDurationS ? <WholeProgress now={now} color={token.color} /> : null}

        <View style={styles.transport}>
          <Transport icon="play-skip-back" label="Zurück" onPress={() => api.skip(-1)} />
          <Transport icon={now.playing ? 'pause' : 'play'} label={now.playing ? 'Pause' : 'Abspielen'} onPress={api.togglePlay} big />
          <Transport icon="play-skip-forward" label="Weiter" onPress={() => api.skip(1)} />
        </View>
        {s.placed === token.uid && (
          <Button
            label="Von vorn"
            icon="refresh"
            kind="plain"
            compact
            onPress={api.restart}
            style={{ alignSelf: 'center', marginTop: -space.sm }}
            accessibilityHint="Startet den aufgelegten Token beim ersten Titel. An der Box: Play lange drücken."
          />
        )}

        <VolumeControl />
      </Card>
    </Section>
  );
}

/** Fortschritt im ganzen Hörspiel bzw. in der ganzen Playlist (wie der LED-Ring). */
function WholeProgress({ now, color }: { now: NonNullable<BoxView['now']>; color: string }) {
  const c = useColors();
  const total = now.contextDurationS ?? 0;
  const done = Math.min(now.contextPositionS ?? 0, total);
  const frac = total ? done / total : 0;
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`Insgesamt ${Math.round(frac * 100)} Prozent gehört, noch ${formatTime(total - done)}`}>
      <View style={[styles.whole, { backgroundColor: c.fillStrong }]}>
        <View style={[styles.wholeFill, { width: `${Math.round(frac * 100)}%`, backgroundColor: color }]} />
      </View>
      <Txt variant="caption" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
        Insgesamt {Math.round(frac * 100)} % · noch {formatTime(total - done)}
      </Txt>
    </View>
  );
}

function VolumeControl() {
  const { view: s, api } = useBox();
  const cap = s.volumeCap;
  // Beim Ziehen lokal anzeigen, gesendet wird beim Loslassen (bei der echten Box sonst viele Anfragen)
  const [dragValue, setDragValue] = useState<number | null>(null);
  const remote = s.kind === 'remote';
  return (
    <View style={{ gap: space.xs }}>
      <Slider
        label="Lautstärke"
        value={dragValue ?? s.volume}
        cap={cap < 100 ? cap : undefined}
        onChange={(v) => (remote ? setDragValue(v) : api.setVolume(v))}
        onEnd={(v) => {
          setDragValue(null);
          api.setVolume(v);
        }}
        format={(v) => `${Math.round(v)} %`}
        iconMin="volume-low"
        iconMax="volume-high"
      />
      {cap < 100 && (
        <Txt variant="footnote" color="tertiary" style={{ textAlign: 'center' }}>
          {s.bedtimeActive ? 'Schlafenszeit' : 'Kindermodus'}: höchstens {cap} %
        </Txt>
      )}
    </View>
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
  const { view: s, api } = useBox();
  const value: number | 'off' | 'episode' = s.sleep.kind === 'minutes' ? Math.round(s.sleep.totalS / 60) : s.sleep.kind;
  const options: { value: number | 'off' | 'episode'; label: string }[] = [
    { value: 'off', label: 'Aus' },
    { value: 15, label: '15 min' },
    { value: 30, label: '30 min' },
    { value: 'episode', label: 'Nach Titel' },
  ];
  const set = (v: number | 'off' | 'episode') =>
    api.setSleep(v === 'off' ? { kind: 'off' } : v === 'episode' ? { kind: 'episode' } : { kind: 'minutes', minutes: v });
  const footer =
    s.sleep.kind === 'minutes'
      ? `Stoppt in ${formatTime(s.sleep.remainingS)}.`
      : s.sleep.kind === 'episode'
        ? 'Stoppt, wenn der aktuelle Titel zu Ende ist.'
        : 'Stoppt die Box nach der gewählten Zeit.';
  return (
    <Section title="Sleep-Timer" footer={footer}>
      <Segmented label="Sleep-Timer" options={options} value={value} onChange={set} />
    </Section>
  );
}

function MoreSection() {
  const c = useColors();
  const { view: s, api } = useBox();
  const demo = s.demo;
  return (
    <Section
      title={demo ? 'Simulation' : 'Tasten'}
      footer={demo ? 'Nur in der Demo: Zeit schneller laufen lassen, Abend vorspielen.' : 'Gesperrt reagiert die Box nicht auf ihre Taster. Token wirken weiter.'}
    >
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {demo && api.demo && (
          <>
            <Row
              first
              title="Zeitraffer"
              icon="speedometer"
              iconColor={c.learn}
              trailing={
                <View style={{ width: 120 }}>
                  <Segmented
                    label="Zeitraffer"
                    options={[
                      { value: 1 as const, label: '1×' },
                      { value: 30 as const, label: '30×' },
                    ]}
                    value={demo.speed}
                    onChange={api.demo.setSpeed}
                  />
                </View>
              }
            />
            <SwitchRow title="Abends (Schlafenszeit)" icon="moon" iconColor="#7B61FF" value={demo.bedtime} onChange={api.demo.setBedtime} />
          </>
        )}
        <Row
          first={!demo}
          title={s.locked ? 'Tasten gesperrt' : 'Tasten frei'}
          subtitle="An der Box: + und − lange drücken"
          icon={s.locked ? 'lock-closed' : 'lock-open'}
          iconColor={s.locked ? c.danger : c.success}
          trailing={<Button label={s.locked ? 'Entsperren' : 'Sperren'} kind="secondary" compact onPress={() => api.setLock(!s.locked)} />}
        />
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  nowHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tokenDot: { width: 14, height: 14, borderRadius: 7, alignSelf: 'flex-start', marginTop: 4 },
  times: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  whole: { height: 4, borderRadius: 2, overflow: 'hidden' },
  wholeFill: { height: '100%', borderRadius: 2 },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl },
  transportBtn: { alignItems: 'center', justifyContent: 'center', borderCurve: 'continuous' },
});
