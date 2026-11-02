import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useBox } from '@/box/BoxContext';
import type { KidView } from '@/box/types';
import { BackToStart } from '@/components/BackToStart';
import { PinGate, useParentPin } from '@/components/PinGate';
import { Screen } from '@/components/Screen';
import { Slider } from '@/components/Slider';
import { Button, Card, Row, Section, SwitchRow, Txt } from '@/components/ui';
import { radius, space, type, useColors } from '@/theme';

export default function RulesTab() {
  const [pin, lock] = useParentPin();
  return (
    <Screen
      title="Kindermodus"
      subtitle={pin ? 'Regeln für die Box' : 'Mit Eltern-PIN geschützt'}
      leading={<BackToStart />}
      trailing={pin ? <Button label="Sperren" icon="lock-closed" compact kind="secondary" onPress={() => lock(null)} /> : undefined}
    >
      {pin ? <Rules pin={pin} onPinChanged={lock} /> : <PinGate onUnlock={lock} />}
    </Screen>
  );
}

function Rules({ pin, onPinChanged }: { pin: string; onPinChanged: (pin: string) => void }) {
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
  const [newPin, setNewPin] = useState('');
  const changePin = async () => {
    await api.setKid({ pin: newPin }, pin);
    // Erst übernehmen, wenn die Box die neue PIN kennt; sonst wäre die App ausgesperrt
    if (await api.verifyPin(newPin)) onPinChanged(newPin);
    setNewPin('');
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
            <Row first={!!s.demo} title={`${kid.bedtimeFrom} bis ${kid.bedtimeTo}`} subtitle={s.demo ? 'In der Demo fest eingestellt' : undefined} icon="time" iconColor="#7B61FF" />
            {!s.demo && (
              <View style={{ gap: space.lg, paddingVertical: space.md }}>
                <TimeSlider
                  title="Ab"
                  value={kid.bedtimeFrom}
                  min={17 * 60}
                  max={23 * 60 + 45}
                  onChange={(v) => setDraft((d) => ({ ...d, bedtimeFrom: v }))}
                  onEnd={(v) => set({ bedtimeFrom: v })}
                />
                <TimeSlider
                  title="Bis"
                  value={kid.bedtimeTo}
                  min={5 * 60}
                  max={10 * 60}
                  onChange={(v) => setDraft((d) => ({ ...d, bedtimeTo: v }))}
                  onEnd={(v) => set({ bedtimeTo: v })}
                />
              </View>
            )}
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

      {!s.demo && (
        <Section title="Eltern-PIN" footer="Gilt für Kindermodus und Einstellungen. Ab Werk 1234.">
          <Card style={styles.pinRow}>
            <TextInput
              value={newPin}
              onChangeText={(t) => setNewPin(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="Neue PIN"
              placeholderTextColor={c.textTertiary}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              accessibilityLabel="Neue Eltern-PIN, 4 Ziffern"
              style={[type.body, styles.pinInput, { color: c.text, backgroundColor: c.bg }]}
            />
            <Button label="Ändern" icon="key" compact disabled={newPin.length !== 4} onPress={changePin} />
          </Card>
        </Section>
      )}
    </>
  );
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

function TimeSlider({
  title,
  value,
  min,
  max,
  onChange,
  onEnd,
}: {
  title: string;
  value: string;
  min: number;
  max: number;
  onChange: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.sliderHead}>
        <Txt variant="body">{title}</Txt>
        <Txt variant="body" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
          {value} Uhr
        </Txt>
      </View>
      <Slider
        label={`Schlafenszeit ${title}`}
        value={Math.max(min, Math.min(max, minutes(value)))}
        min={min}
        max={max}
        step={15}
        onChange={(v) => onChange(hhmm(Math.round(v)))}
        onEnd={(v) => onEnd(hhmm(Math.round(v)))}
        format={(v) => `${hhmm(Math.round(v))} Uhr`}
      />
    </View>
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
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pinInput: { flex: 1, minHeight: 46, borderRadius: radius.sm + 2, borderCurve: 'continuous', paddingHorizontal: space.md },
});
