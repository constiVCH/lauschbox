import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useBox } from '@/box/BoxContext';
import type { KidView } from '@/box/types';
import { BackToStart } from '@/components/BackToStart';
import { PinGate, useParentPin } from '@/components/PinGate';
import { Screen } from '@/components/Screen';
import { Slider } from '@/components/Slider';
import { Button, Card, Row, Section, SwitchRow, Txt } from '@/components/ui';
import { space, useColors } from '@/theme';

export default function RulesTab() {
  const [pin, lock] = useParentPin();
  return (
    <Screen
      title="Kindermodus"
      subtitle={pin ? 'Regeln für die Box' : 'Mit Eltern-PIN geschützt'}
      leading={<BackToStart />}
      trailing={pin ? <Button label="Sperren" icon="lock-closed" compact kind="secondary" onPress={() => lock(null)} /> : undefined}
    >
      {pin ? <Rules pin={pin} /> : <PinGate onUnlock={lock} />}
    </Screen>
  );
}

function Rules({ pin }: { pin: string }) {
  const c = useColors();
  const { view: s, api } = useBox();
  const k = s.kid;
  // Regler zeigen beim Ziehen den lokalen Wert; gesendet wird beim Loslassen
  const [draft, setDraft] = useState<Partial<KidView>>({});
  const kid = { ...k, ...draft };
  const set = (patch: Partial<KidView>) => {
    setDraft({});
    api.setKid(patch, pin);
  };

  return (
    <>
      <Section footer="Gilt sofort auf der Box, auch ohne dass die App offen ist.">
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <SwitchRow first title="Kindermodus" icon="shield-checkmark" iconColor={c.success} value={k.enabled} onChange={(v) => set({ enabled: v })} />
        </Card>
      </Section>

      <View style={{ opacity: k.enabled ? 1 : 0.45 }} pointerEvents={k.enabled ? 'auto' : 'none'}>
        <Section title="Lautstärke" footer="Die Lauter-Taste stoppt an dieser Grenze. Der Regler im Tab „Box“ gibt dort nur noch federnd nach.">
          <Card style={{ gap: space.lg }}>
            <LabeledSlider
              title="Maximal"
              value={kid.maxVolume}
              min={20}
              max={100}
              onChange={(v) => setDraft((d) => ({ ...d, maxVolume: v }))}
              onEnd={(v) => set({ maxVolume: v })}
            />
            <LabeledSlider
              title="Zur Schlafenszeit"
              value={Math.min(kid.bedtimeMaxVolume, kid.maxVolume)}
              min={10}
              max={kid.maxVolume}
              onChange={(v) => setDraft((d) => ({ ...d, bedtimeMaxVolume: v }))}
              onEnd={(v) => set({ bedtimeMaxVolume: v })}
            />
          </Card>
        </Section>

        <Section
          title="Schlafenszeit"
          footer={
            s.demo
              ? 'Neue Token starten nicht, ein laufender Titel spielt zu Ende. Zum Ausprobieren: Tab „Box“ → Simulation → Abends.'
              : 'Neue Token starten nicht, ein laufender Titel spielt zu Ende, die LEDs werden gedimmt. Die Box nutzt ihre eigene Uhr.'
          }
        >
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {!s.demo && (
              <SwitchRow first title="Schlafenszeit" icon="moon" iconColor="#7B61FF" value={k.bedtimeEnabled} onChange={(v) => set({ bedtimeEnabled: v })} />
            )}
            <Row first={!!s.demo} title={`${k.bedtimeFrom} bis ${k.bedtimeTo}`} subtitle={s.demo ? 'In der Demo fest eingestellt' : undefined} icon="time" iconColor="#7B61FF" />
            <Row
              title={s.bedtimeActive ? 'Gerade Schlafenszeit' : 'Gerade keine Schlafenszeit'}
              icon="timer"
              iconColor={s.bedtimeActive ? '#7B61FF' : c.textTertiary}
            />
          </Card>
        </Section>

        <Section title="Wiedergabe">
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            <SwitchRow
              first
              title="Kein Autoplay"
              subtitle="Nach dem Ende keine Spotify-Vorschläge"
              icon="stop-circle"
              iconColor={c.accent}
              value={k.noAutoplay}
              onChange={(v) => set({ noAutoplay: v })}
            />
            <SwitchRow
              title="Nur bekannte Token"
              subtitle="Unbekannte Token lösen gar nichts aus"
              icon="albums"
              iconColor={c.learn}
              value={k.knownTokensOnly}
              onChange={(v) => set({ knownTokensOnly: v })}
            />
          </Card>
        </Section>
      </View>
    </>
  );
}

function LabeledSlider({
  title,
  value,
  min,
  max,
  onChange,
  onEnd,
}: {
  title: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onEnd: (v: number) => void;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.sliderHead}>
        <Txt variant="body">{title}</Txt>
        <Txt variant="body" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
          {Math.round(value)} %
        </Txt>
      </View>
      <Slider label={`Lautstärke ${title}`} value={value} min={min} max={max} step={5} onChange={onChange} onEnd={onEnd} format={(v) => `${Math.round(v)} %`} />
    </View>
  );
}

const styles = StyleSheet.create({
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between' },
});
