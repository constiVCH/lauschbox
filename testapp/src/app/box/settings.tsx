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

      <SpotifySection busy={busy} onRun={run} disabled={!managed} />

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

      <Section title="Hilfe" footer="Was die Box zuletzt getan hat. Hilfreich, wenn etwas nicht klappt.">
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <Row first title="Log ansehen" icon="document-text" iconColor={c.textTertiary} onPress={() => router.push('/log' as Href)} />
        </Card>
      </Section>
    </>
  );
}

/** Wer ist bei Spotify angemeldet, Suche, Neustart und Kontowechsel. */
function SpotifySection({
  busy,
  onRun,
  disabled,
}: {
  busy: SystemAction | null;
  onRun: (action: SystemAction, ask?: { title: string; message: string; button: string; destructive?: boolean }) => void;
  disabled: boolean;
}) {
  const c = useColors();
  const { account, error } = useSpotifyAccount();

  let who: { title: string; subtitle?: string };
  if (error) who = { title: 'Unbekannt', subtitle: error };
  else if (!account) who = { title: 'Wird geladen …' };
  else if (!account.available) who = { title: 'Spotify läuft nicht', subtitle: 'go-librespot antwortet nicht. „Spotify neu starten“ hilft meist.' };
  else if (account.username)
    who = {
      title: account.displayName ?? account.username,
      subtitle: account.displayName ? `Benutzername ${account.username}` : 'Anzeigename erscheint, sobald die Suche eingerichtet ist',
    };
  else who = { title: 'Niemand angemeldet' };

  const searchReady = account?.search === 'app' || account?.search === 'simulated';
  return (
    <Section title="Spotify" footer="Ein Konto für die ganze Box. Ein betreutes Kinderkonto im Family-Abo kann funktionieren, einfach ausprobieren.">
      {account && !account.username && account.pair && <PairCode code={account.pair.code} />}
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <Row first title={who.title} subtitle={who.subtitle} icon="person" iconColor={c.success} />
        <Row
          title="Suche"
          subtitle={searchReady ? 'Eingerichtet' : 'Nicht eingerichtet. Ohne eigene Spotify-App bremst Spotify die Suche.'}
          icon="search"
          iconColor={searchReady ? c.success : c.warning}
          trailing={<Button label={searchReady ? 'Ändern' : 'Einrichten'} kind="secondary" compact onPress={() => router.push('/spotify-setup' as Href)} />}
        />
        <ActionRow
          title="Spotify neu starten"
          subtitle="Wenn nichts mehr spielt oder die Box nicht reagiert"
          icon="refresh"
          busy={busy === 'restart-spotify'}
          disabled={disabled || !!busy}
          onPress={() => onRun('restart-spotify')}
        />
        <ActionRow
          title="Anderes Konto anmelden"
          subtitle="Meldet die Box ab; danach erscheint hier ein Code für spotify.com/pair"
          icon="swap-horizontal"
          busy={busy === 'spotify-logout'}
          disabled={disabled || !!busy}
          onPress={() =>
            onRun('spotify-logout', {
              title: 'Spotify abmelden?',
              message: 'Die Box spielt erst wieder, wenn du den neuen Code auf spotify.com/pair eingegeben hast. Die Token bleiben erhalten.',
              button: 'Abmelden',
              destructive: true,
            })
          }
        />
      </Card>
    </Section>
  );
}

/** Code für spotify.com/pair, groß und kopierbar. */
function PairCode({ code }: { code: string }) {
  const c = useColors();
  return (
    <Card style={[styles.pair, { backgroundColor: c.success + '1A' }]}>
      <Txt variant="footnote" color="secondary">
        Auf spotify.com/pair eingeben, im Browser des Kontos, mit dem die Box spielen soll:
      </Txt>
      <Txt variant="largeTitle" selectable style={styles.code}>
        {code}
      </Txt>
      <Txt variant="footnote" color="secondary">
        Die Anmeldung erscheint hier von selbst, sobald sie geklappt hat.
      </Txt>
    </Card>
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
  icon: 'refresh' | 'power' | 'moon' | 'cloud-download' | 'swap-horizontal';
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
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginBottom: space.lg },
  result: { marginBottom: space.lg, borderRadius: radius.md },
  pair: { alignItems: 'center', gap: space.sm },
  code: { letterSpacing: 6, fontVariant: ['tabular-nums'] },
});
