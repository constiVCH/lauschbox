import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useBox } from '@/box/BoxContext';
import type { SystemAction, SystemInfo } from '@/box/types';
import { useSpotifyAccount } from '@/box/useSpotifyAccount';
import { BackToStart } from '@/components/BackToStart';
import { confirm } from '@/components/confirm';
import { PinGate, useParentPin } from '@/components/PinGate';
import { Screen } from '@/components/Screen';
import { Slider } from '@/components/Slider';
import { Button, Card, Row, Section, Txt } from '@/components/ui';
import { radius, space, useColors } from '@/theme';

/** Alles, wofür man sonst ein Terminal auf dem Pi bräuchte. Mit Eltern-PIN geschützt. */
export default function SettingsTab() {
  const [pin, lock] = useParentPin();
  return (
    <Screen
      title="Einstellungen"
      subtitle={pin ? 'Spotify und Box verwalten' : 'Mit Eltern-PIN geschützt'}
      leading={<BackToStart />}
      trailing={pin ? <Button label="Sperren" icon="lock-closed" compact kind="secondary" onPress={() => lock(null)} /> : undefined}
    >
      {pin ? <Settings pin={pin} /> : <PinGate onUnlock={lock} />}
    </Screen>
  );
}

function Settings({ pin }: { pin: string }) {
  const c = useColors();
  const { api } = useBox();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [busy, setBusy] = useState<SystemAction | null>(null);
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null);

  const loadInfo = useCallback(async () => {
    try {
      setInfo(await api.systemInfo());
    } catch (e) {
      setResult({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      loadInfo();
    }, [loadInfo]),
  );

  const run = async (action: SystemAction, ask?: { title: string; message: string; button: string; destructive?: boolean }) => {
    if (ask && !(await confirm(ask.title, ask.message, ask.button, ask.destructive))) return;
    setBusy(action);
    setResult(null);
    try {
      const output = await api.systemAction(action, pin);
      setResult(output ? { text: output, error: false } : null);
    } catch (e) {
      setResult({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(null);
    }
  };

  const managed = info?.managed ?? true;
  return (
    <>
      {!managed && (
        <Card style={[styles.banner, { backgroundColor: c.warning + '22' }]}>
          <Ionicons name="construct" size={22} color={c.warning} />
          <View style={{ flex: 1, gap: space.xs }}>
            <Txt variant="headline">Einmal einrichten</Txt>
            <Txt variant="footnote">
              Damit die Knöpfe hier funktionieren, muss die Box einmalig als Dienst eingerichtet werden. Auf dem Pi im Terminal:
            </Txt>
            <Txt variant="mono" selectable>
              bash ~/lauschbox/box/install.sh
            </Txt>
            <Txt variant="footnote" color="secondary">
              Danach startet alles beim Einschalten von selbst, und das Terminal wird nicht mehr gebraucht.
            </Txt>
          </View>
        </Card>
      )}

      {result && (
        <Card style={[styles.result, { backgroundColor: (result.error ? c.danger : c.success) + '1F' }]}>
          <Txt variant="footnote" color={result.error ? c.danger : 'primary'} selectable>
            {result.text}
          </Txt>
        </Card>
      )}

      <SpotifySection />

      <BehaviorSection />

      <Section title="Box" footer="Nach einem Update oder Neustart verbindet sich die App von selbst wieder.">
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <Row
            first
            title={info ? `Version ${info.version}` : 'Wird geladen …'}
            subtitle={[info?.commit, info?.librespot].filter(Boolean).join('\n') || undefined}
            icon="information-circle"
            iconColor={c.learn}
          />
          <ActionRow
            title="Update installieren"
            subtitle="Holt die neueste Box-Software und startet sie neu"
            icon="cloud-download"
            busy={busy === 'update'}
            disabled={!managed || !!busy}
            onPress={() =>
              run('update', {
                title: 'Update installieren?',
                message: 'Die Box holt die neueste Version und startet die Box-Software neu. Das dauert bis zu einer Minute.',
                button: 'Installieren',
              })
            }
          />
          <ActionRow
            title="Box-Software neu starten"
            icon="refresh"
            busy={busy === 'restart-box'}
            disabled={!managed || !!busy}
            onPress={() => run('restart-box')}
          />
          <ActionRow
            title="Pi neu starten"
            icon="power"
            busy={busy === 'reboot'}
            disabled={!managed || !!busy}
            onPress={() =>
              run('reboot', { title: 'Box neu starten?', message: 'Die Box ist etwa eine Minute nicht erreichbar.', button: 'Neu starten' })
            }
          />
          <ActionRow
            title="Ausschalten"
            icon="moon"
            destructive
            busy={busy === 'poweroff'}
            disabled={!managed || !!busy}
            onPress={() =>
              run('poweroff', {
                title: 'Box ausschalten?',
                message: 'Zum Einschalten danach den Stecker kurz ziehen bzw. den Ein-Taster drücken.',
                button: 'Ausschalten',
                destructive: true,
              })
            }
          />
        </Card>
      </Section>

      <HardwareSection />

      <Section title="Hilfe" footer="Was die Box zuletzt getan hat. Hilfreich, wenn etwas nicht klappt.">
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <Row first title="Log ansehen" icon="document-text" iconColor={c.textTertiary} onPress={() => router.push('/log' as Href)} />
        </Card>
      </Section>
    </>
  );
}

/** Verhalten der Box: Nachfrist beim Abnehmen eines Tokens. */
function BehaviorSection() {
  const { view, api } = useBox();
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? view.settings.removeGraceS;
  const label = value === 0 ? 'Aus' : `${value.toLocaleString('de-DE')} s`;
  return (
    <Section
      title="Token abnehmen"
      footer="So lange spielt die Box weiter, wenn ein Token kurz abgenommen wird, etwa beim Wackeln oder wenn der Leser kurz aussetzt. Kommt derselbe Token zurück, geht es nahtlos weiter."
    >
      <Card style={{ gap: space.sm }}>
        <View style={styles.sliderHead}>
          <Txt variant="body">Weiterspielen für</Txt>
          <Txt variant="body" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
            {label}
          </Txt>
        </View>
        <Slider
          label="Nachfrist beim Abnehmen"
          value={value}
          min={0}
          max={5}
          step={0.5}
          onChange={setDraft}
          onEnd={(v) => {
            setDraft(null);
            api.setSettings({ removeGraceS: v });
          }}
          format={(v) => (v === 0 ? 'aus' : `${v} Sekunden`)}
        />
      </Card>
    </Section>
  );
}

const PART_NAMES: Record<string, string> = { nfc: 'NFC-Leser', buttons: 'Taster', leds: 'LED-Ring' };

/** Wie die Box ihre Bauteile beim Start vorgefunden hat. Bei FEHLER steht die Meldung darunter. */
function HardwareSection() {
  const c = useColors();
  const { view } = useBox();
  const parts = Object.entries(view.hardware);
  if (view.kind !== 'remote' || parts.length === 0) return null;
  return (
    <Section title="Hardware" footer="Stand beim letzten Start der Box-Software. Nach dem Beheben: „Box-Software neu starten“.">
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {parts.map(([key, part], i) => (
          <Row
            key={key}
            first={i === 0}
            title={PART_NAMES[key] ?? key}
            subtitle={part.detail}
            icon={part.ok ? 'checkmark-circle' : 'alert-circle'}
            iconColor={part.ok ? c.success : c.danger}
          />
        ))}
      </Card>
    </Section>
  );
}

/** Eine Zeile mit Zusammenfassung; alles Weitere (Anmelden, Suche, Neustart) auf der Seite „Spotify“. */
function SpotifySection() {
  const c = useColors();
  const { account, error } = useSpotifyAccount();
  const searchReady = account?.search === 'app' || account?.search === 'simulated';
  const name = account?.displayName ?? account?.username;

  let subtitle: string;
  let ok = false;
  if (error) subtitle = error;
  else if (!account) subtitle = 'Wird geladen …';
  else if (!account.available) subtitle = 'Spotify läuft nicht – antippen zum Neustarten';
  else if (!account.username) subtitle = account.pair ? `Nicht angemeldet · Code ${account.pair.code}` : 'Nicht angemeldet';
  else {
    ok = true;
    subtitle = `${name} · Suche ${searchReady ? 'an' : 'aus'}`;
  }
  return (
    <Section title="Spotify" footer="Anmelden, Konto wechseln, Suche einrichten und neu starten: alles auf der Seite „Spotify“.">
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <Row
          first
          title="Spotify"
          subtitle={subtitle}
          icon={ok ? 'checkmark-circle' : 'alert-circle'}
          iconColor={ok ? c.success : c.warning}
          onPress={() => router.push('/spotify-setup' as Href)}
        />
      </Card>
    </Section>
  );
}

function ActionRow({
  title,
  subtitle,
  icon,
  onPress,
  busy,
  disabled,
  destructive,
}: {
  title: string;
  subtitle?: string;
  icon: 'refresh' | 'power' | 'moon' | 'cloud-download';
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const c = useColors();
  return (
    <View style={{ opacity: disabled && !busy ? 0.45 : 1 }}>
      <Row
        title={title}
        subtitle={subtitle}
        icon={icon}
        iconColor={destructive ? c.danger : c.accent}
        trailing={busy ? <ActivityIndicator color={c.textSecondary} /> : undefined}
        onPress={disabled ? undefined : onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginBottom: space.lg },
  result: { marginBottom: space.lg, borderRadius: radius.md },
});
