import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { BackToStart } from '@/components/BackToStart';
import { TokenDisc } from '@/components/Cover';
import { LedRing } from '@/components/LedRing';
import { Screen } from '@/components/Screen';
import { Slider } from '@/components/Slider';
import { Tap } from '@/components/Tap';
import { Button, Card, Pill, Row, Section, Segmented, Txt, type IconName } from '@/components/ui';
import { buttonLabel, useHardware, useThrottled, type ButtonName, type HwEvent, type HwStatus, type LedCommand } from '@/hw/hardware';
import { space, springs, tokenColorNames, tokenColors, useColors } from '@/theme';

const COMPONENT_INFO: Record<keyof HwStatus['components'], { title: string; icon: IconName }> = {
  nfc: { title: 'NFC-Leser (PN532)', icon: 'radio-button-on' },
  buttons: { title: 'Taster', icon: 'ellipse' },
  leds: { title: 'LED-Ring (WS2812)', icon: 'color-palette' },
  audio: { title: 'Lautsprecher (MAX98357A)', icon: 'volume-high' },
};

/** Testaufbau am Pi live prüfen (box/spikes/hwtest_server.py). */
export default function Hardware() {
  const { host = '' } = useLocalSearchParams<{ host: string }>();
  const [pressed, setPressed] = useState<Partial<Record<ButtonName, 'down' | 'kurz' | 'lang'>>>({});
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const onEvent = (e: HwEvent) => {
    if (Platform.OS !== 'web') {
      if (e.type === 'token' && e.uid) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (e.type === 'button' && e.press === 'down') Haptics.selectionAsync();
    }
    if (e.type !== 'button') return;
    clearTimeout(flashTimers.current[e.name]);
    if (e.press === 'down') setPressed((p) => ({ ...p, [e.name]: 'down' }));
    else if (e.press === 'kurz' || e.press === 'lang') {
      setPressed((p) => ({ ...p, [e.name]: e.press as 'kurz' | 'lang' }));
      // Lang gedrückt bleibt sichtbar, bis losgelassen wird; danach kurz stehen lassen
      if (e.press === 'kurz') flashTimers.current[e.name] = setTimeout(() => setPressed((p) => ({ ...p, [e.name]: undefined })), 1200);
    } else if (e.press === 'up') {
      flashTimers.current[e.name] = setTimeout(() => setPressed((p) => ({ ...p, [e.name]: undefined })), 1200);
    }
  };

  const hw = useHardware(host, onEvent);

  return (
    <Screen title="Testaufbau" subtitle={hw.status ? `${hw.status.model} · ${hw.status.host}` : hw.url} leading={<BackToStart />} trailing={<ConnectionPill connection={hw.connection} />} bottomSpace={space.xl}>
      {hw.connection !== 'online' && !hw.status && <Offline error={hw.error} connecting={hw.connection === 'connecting'} onRetry={hw.reconnect} url={hw.url} />}
      {hw.status && (
        <>
          <Components status={hw.status} onRefresh={hw.refresh} />
          <NfcSection token={hw.token} history={hw.history} ok={hw.status.components.nfc.ok} />
          <ButtonsSection pressed={pressed} ok={hw.status.components.buttons.ok} />
          <LedSection send={hw.leds} ok={hw.status.components.leds.ok} />
          <AudioSection tone={hw.tone} ok={hw.status.components.audio.ok} />
          <LogSection log={hw.log} />
        </>
      )}
    </Screen>
  );
}

function ConnectionPill({ connection }: { connection: 'connecting' | 'online' | 'offline' }) {
  const c = useColors();
  const map = {
    online: { text: 'Verbunden', color: c.success },
    connecting: { text: 'Verbinde …', color: c.warning },
    offline: { text: 'Getrennt', color: c.danger },
  } as const;
  return <Pill text={map[connection].text} color={map[connection].color} />;
}

function Offline({ error, connecting, onRetry, url }: { error: string | null; connecting: boolean; onRetry: () => void; url: string }) {
  const c = useColors();
  return (
    <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xl }}>
      {connecting ? <ActivityIndicator color={c.textSecondary} /> : <Ionicons name="wifi" size={30} color={c.textTertiary} />}
      <Txt variant="headline" style={{ textAlign: 'center' }}>
        {connecting ? 'Suche den Pi …' : 'Pi nicht erreichbar'}
      </Txt>
      <Txt variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
        {error ? `${url}: ${error}` : url}
        {'\n'}Läuft auf dem Pi python spikes/hwtest_server.py? Sind Handy und Pi im selben WLAN?
      </Txt>
      <Button label="Erneut versuchen" icon="refresh" kind="secondary" compact onPress={onRetry} />
    </Card>
  );
}

function Components({ status, onRefresh }: { status: HwStatus; onRefresh: () => void }) {
  const c = useColors();
  const throttled = status.throttled !== null && !status.throttled.endsWith('=0x0');
  const entries = Object.entries(status.components) as [keyof HwStatus['components'], HwStatus['components']['nfc']][];
  return (
    <Section title="Bauteile" action={<Button label="Neu prüfen" icon="refresh" kind="plain" compact onPress={onRefresh} />}>
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {entries.map(([key, comp], i) => (
          <Row
            key={key}
            first={i === 0}
            title={COMPONENT_INFO[key].title}
            subtitle={comp.detail}
            icon={comp.ok ? 'checkmark-circle' : 'alert-circle'}
            iconColor={comp.ok ? c.success : c.danger}
          />
        ))}
        <Row
          title="I2C-Bus"
          subtitle={
            status.i2c.length
              ? status.i2c.map((d) => `${d.address}${d.name ? ` ${d.name}` : ''}`).join(', ')
              : 'Leer. Normal, solange kein PiSugar dran ist (der NFC-Leser hängt an UART).'
          }
          icon="hardware-chip"
          iconColor={status.i2c.length ? c.success : c.textTertiary}
        />
        <Row
          title={`CPU ${status.cpu_temp_c ?? '–'} °C`}
          subtitle={
            status.throttled === null
              ? 'Stromversorgung nicht messbar (vcgencmd fehlt)'
              : throttled
                ? 'Unterspannung oder Drosselung erkannt: Netzteil prüfen'
                : 'Stromversorgung ok'
          }
          icon="flash"
          iconColor={status.throttled === null ? c.textTertiary : throttled ? c.warning : c.success}
        />
      </Card>
    </Section>
  );
}

function NfcSection({ token, history, ok }: { token: string | null; history: { uid: string }[]; ok: boolean }) {
  const c = useColors();
  const pop = useSharedValue(1);

  useEffect(() => {
    if (!token) return;
    // Kurzes Anheben, wenn ein Token erkannt wird: Ursache und Wirkung im selben Moment
    pop.set(withSequence(withTiming(1.12, { duration: 90 }), withSpring(1, springs.momentum)));
  }, [token, pop]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <Section title="NFC" footer={ok ? 'Token auf die Antenne legen. Die UID erscheint sofort.' : 'NFC-Leser antwortet nicht, siehe Bauteile.'}>
      <Card style={styles.nfc}>
        <Animated.View style={style}>
          {token ? <TokenDisc size={72} color={c.accent} emoji="🏷️" /> : <TokenDisc size={72} blank color={c.textTertiary} />}
        </Animated.View>
        <View style={{ flex: 1, gap: 4 }} accessibilityLiveRegion="polite">
          <Txt variant="headline">{token ? 'Token liegt auf' : 'Kein Token'}</Txt>
          <Txt variant="mono" color={token ? 'primary' : 'tertiary'} selectable>
            {token ?? '— — — —'}
          </Txt>
          {history.length > 0 && (
            <Txt variant="footnote" color="tertiary">
              Zuletzt: {history.map((h) => h.uid.slice(0, 8)).join(', ')}
            </Txt>
          )}
        </View>
      </Card>
    </Section>
  );
}

function ButtonsSection({ pressed, ok }: { pressed: Partial<Record<ButtonName, 'down' | 'kurz' | 'lang'>>; ok: boolean }) {
  const c = useColors();
  const items: { name: ButtonName; icon: IconName; gpio: number }[] = [
    { name: 'leiser', icon: 'remove', gpio: 13 },
    { name: 'play_pause', icon: 'play', gpio: 5 },
    { name: 'lauter', icon: 'add', gpio: 6 },
  ];
  return (
    <Section title="Taster" footer={ok ? 'Drück die Taster am Aufbau: kurz und lang (ab 1 s).' : 'Taster nicht bereit, siehe Bauteile.'}>
      <Card style={styles.buttons}>
        {items.map((b) => {
          const state = pressed[b.name];
          const active = !!state;
          return (
            <View key={b.name} style={styles.buttonItem} accessible accessibilityLabel={`${buttonLabel[b.name]}: ${state === 'lang' ? 'lang gedrückt' : state === 'kurz' ? 'kurz gedrückt' : state === 'down' ? 'gedrückt' : 'nicht gedrückt'}`}>
              <View style={[styles.buttonCap, { backgroundColor: active ? c.accent : c.fillStrong, transform: [{ scale: state === 'down' || state === 'lang' ? 0.92 : 1 }] }]}>
                <Ionicons name={b.icon} size={26} color={active ? c.onAccent : c.text} />
              </View>
              <Txt variant="footnote" style={{ fontWeight: '600' }}>
                {buttonLabel[b.name]}
              </Txt>
              <Txt variant="caption" color={active ? 'accent' : 'tertiary'}>
                {state === 'kurz' ? 'kurz' : state === 'lang' ? 'lang' : state === 'down' ? 'gedrückt' : `GPIO ${b.gpio}`}
              </Txt>
            </View>
          );
        })}
      </Card>
    </Section>
  );
}

function LedSection({ send, ok }: { send: (cmd: LedCommand) => Promise<unknown>; ok: boolean }) {
  const c = useColors();
  const [color, setColor] = useState(tokenColors[1]);
  const [brightness, setBrightness] = useState(20);
  const [level, setLevel] = useState(12);
  const [mode, setMode] = useState<'off' | 'fill' | 'level'>('off');
  const [error, setError] = useState<string | null>(null);

  const run = (cmd: LedCommand) => send(cmd).then(() => setError(null), (e: Error) => setError(e.message));
  const sendLive = useThrottled(run, 100);
  const apply = (next: { color?: string; brightness?: number; level?: number; mode?: 'fill' | 'level' }) => {
    const m = next.mode ?? (mode === 'off' ? 'fill' : mode);
    setMode(m);
    sendLive({ mode: m, color: next.color ?? color, brightness: (next.brightness ?? brightness) / 100, level: next.level ?? level });
  };

  const preview = mode === 'off' ? 'off' : 'playing';
  const fill = mode === 'level' ? level / 12 : 1;

  return (
    <Section title="LED-Ring" footer={error ?? (ok ? 'Änderungen gehen beim Ziehen live an den Ring. Helligkeit ist auf 60 % begrenzt.' : 'LED-Ring nicht bereit, siehe Bauteile.')}>
      <Card style={{ gap: space.lg, opacity: ok ? 1 : 0.5 }}>
        <View style={styles.ledHead}>
          <LedRing mode={preview} color={color} fill={fill} size={112} well={c.boxWell} brightness={brightness / 100} />
          <View style={{ flex: 1, gap: space.sm }}>
            <Segmented
              label="Anzeige"
              value={mode}
              onChange={(m) => (m === 'off' ? (setMode('off'), run({ mode: 'off' })) : apply({ mode: m }))}
              options={[
                { value: 'off', label: 'Aus' },
                { value: 'fill', label: 'Voll' },
                { value: 'level', label: 'Füllstand' },
              ]}
            />
            <Button label="Testlauf" icon="sparkles" kind="secondary" compact onPress={() => run({ mode: 'test', color, brightness: brightness / 100 })} disabled={!ok} accessibilityHint="Jede LED einzeln in Rot, Grün und Blau" />
          </View>
        </View>
        <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="LED-Farbe">
          {[...tokenColors, '#FFFFFF'].map((col) => (
            <Tap
              key={col}
              onPress={() => {
                setColor(col);
                apply({ color: col });
              }}
              haptic="selection"
              scaleTo={0.85}
              accessibilityRole="radio"
              accessibilityState={{ selected: col === color }}
              accessibilityLabel={col === '#FFFFFF' ? 'Weiß' : tokenColorNames[tokenColors.indexOf(col)]}
              style={[styles.swatch, { backgroundColor: col }, col === color && { borderColor: c.text }]}
            />
          ))}
        </View>
        <View style={{ gap: space.xs }}>
          <Txt variant="footnote" color="secondary">
            Helligkeit {brightness} %
          </Txt>
          <Slider label="Helligkeit" value={brightness} min={0} max={60} step={1} onChange={(v) => { setBrightness(v); apply({ brightness: v }); }} format={(v) => `${v} %`} iconMin="sunny-outline" iconMax="sunny" />
        </View>
        <View style={{ gap: space.xs }}>
          <Txt variant="footnote" color="secondary">
            Füllstand {level} von 12 LEDs
          </Txt>
          <Slider label="Füllstand" value={level} min={0} max={12} step={1} onChange={(v) => { setLevel(v); apply({ level: v, mode: 'level' }); }} format={(v) => `${v} LEDs`} />
        </View>
      </Card>
    </Section>
  );
}

function AudioSection({ tone, ok }: { tone: (cmd: { channel: 'left' | 'both' | 'right'; volume: number }) => Promise<unknown>; ok: boolean }) {
  const [channel, setChannel] = useState<'left' | 'both' | 'right'>('both');
  const [volume, setVolume] = useState(30);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const play = async () => {
    setBusy(true);
    setResult(null);
    try {
      await tone({ channel, volume });
      setResult('Ton gespielt. Nichts gehört? Verdrahtung BCLK/LRC/DIN prüfen.');
    } catch (e) {
      setResult(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section
      title="Lautsprecher"
      footer={result ?? (ok ? 'Ohne Mute-Leitung mischt der MAX98357A links und rechts: Alle drei Töne kommen aus dem einen Lautsprecher.' : 'Soundkarte nicht gefunden, siehe Bauteile.')}
    >
      <Card style={{ gap: space.lg, opacity: ok ? 1 : 0.5 }}>
        <Segmented
          label="Kanal"
          value={channel}
          onChange={setChannel}
          options={[
            { value: 'left', label: 'Links' },
            { value: 'both', label: 'Beide' },
            { value: 'right', label: 'Rechts' },
          ]}
        />
        <Slider label="Lautstärke Testton" value={volume} min={5} max={80} step={5} onChange={setVolume} format={(v) => `${v} %`} iconMin="volume-low" iconMax="volume-high" />
        <Button label={busy ? 'Spielt …' : 'Testton 440 Hz'} icon="musical-notes" onPress={play} disabled={!ok || busy} />
      </Card>
    </Section>
  );
}

function LogSection({ log }: { log: { id: number; at: Date; text: string }[] }) {
  if (log.length === 0) return null;
  return (
    <Section title="Ereignisse">
      <Card style={{ gap: space.sm }}>
        {log.slice(0, 12).map((e) => (
          <View key={e.id} style={styles.logRow}>
            <Txt variant="caption" color="tertiary" style={{ fontVariant: ['tabular-nums'], width: 64 }}>
              {e.at.toLocaleTimeString('de-DE')}
            </Txt>
            <Txt variant="footnote" style={{ flex: 1 }}>
              {e.text}
            </Txt>
          </View>
        ))}
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  nfc: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  buttons: { flexDirection: 'row', justifyContent: 'space-around' },
  buttonItem: { alignItems: 'center', gap: 4, minWidth: 80 },
  buttonCap: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  ledHead: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: 'transparent' },
  logRow: { flexDirection: 'row', gap: space.sm, alignItems: 'baseline' },
});
