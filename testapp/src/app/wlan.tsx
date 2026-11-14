import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setActiveBox } from '@/box/BoxContext';
import { Button, Card, Txt } from '@/components/ui';
import { AUTH_REQUIRED, AUTHORIZED, bluetoothProblem, connect, scan, type BoxLink } from '@/improv';
import { HOST_KEY, save } from '@/storage';
import { radius, space, type, useColors } from '@/theme';

type Phase = 'search' | 'connecting' | 'auth' | 'form' | 'sending' | 'done';

/** Box ohne WLAN per Bluetooth ins Heimnetz bringen. */
export default function WlanScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('search');
  const [boxes, setBoxes] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [address, setAddress] = useState<string | null>(null);
  const link = useRef<BoxLink | null>(null);

  // Beim Öffnen suchen, beim Schließen Suche und Verbindung beenden
  useEffect(() => {
    let stop = () => {};
    let alive = true;
    bluetoothProblem().then((problem) => {
      if (!alive) return;
      if (problem) setError(problem);
      else stop = scan((box) => setBoxes((list) => [...list, box]));
    });
    return () => {
      alive = false;
      stop();
      link.current?.close();
    };
  }, []);

  const choose = async (id: string) => {
    setError(null);
    setPhase('connecting');
    try {
      link.current = await connect(id, (state) => {
        if (state === AUTH_REQUIRED) setPhase('auth');
        else if (state === AUTHORIZED) setPhase((p) => (p === 'sending' ? p : 'form'));
      });
    } catch (e) {
      setError(`Verbindung zur Box fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
      setPhase('search');
    }
  };

  const send = async () => {
    if (!link.current || !ssid.trim()) return;
    setError(null);
    setPhase('sending');
    try {
      const url = await link.current.sendWifi(ssid.trim(), password);
      const host = url.replace(/^https?:\/\//, '').replace(/:8080$/, '');
      setAddress(host);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('form');
    }
  };

  const openBox = () => {
    if (!address) return;
    save(HOST_KEY, address);
    setActiveBox(address);
    router.replace('/box' as Href);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.bar, { paddingTop: Platform.OS === 'ios' ? space.md : insets.top + space.sm }]}>
        <View style={{ width: 80 }} />
        <Txt variant="headline">Box ins WLAN bringen</Txt>
        <Button label="Fertig" kind="plain" compact onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
        {phase === 'search' && (
          <>
            <Txt variant="callout" color="secondary">
              Hat die Box kein WLAN, wartet sie nach etwa einer halben Minute per Bluetooth auf die Einrichtung. Der LED-Ring pulsiert dann blau.
              Handy in die Nähe der Box halten.
            </Txt>
            {boxes.length === 0 && !error && (
              <View style={styles.waiting}>
                <ActivityIndicator color={c.textSecondary} />
                <Txt variant="footnote" color="secondary">
                  Suche Boxen …
                </Txt>
              </View>
            )}
            {boxes.map((b) => (
              <Button key={b.id} label={`${b.name} einrichten`} icon="bluetooth" onPress={() => choose(b.id)} />
            ))}
          </>
        )}
        {phase === 'connecting' && <Waiting text="Verbinde mit der Box …" />}
        {phase === 'auth' && (
          <Card style={styles.step}>
            <Ionicons name="play-circle" size={40} color={c.accent} />
            <Txt variant="headline" style={{ textAlign: 'center' }}>
              Drück an der Box kurz auf Play
            </Txt>
            <Txt variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
              So weiß die Box, dass du vor ihr stehst. Der Ring leuchtet danach ruhig blau.
            </Txt>
            <ActivityIndicator color={c.textSecondary} />
          </Card>
        )}
        {phase === 'form' && (
          <>
            <TextInput
              value={ssid}
              onChangeText={setSsid}
              placeholder="WLAN-Name"
              placeholderTextColor={c.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Name des WLANs"
              style={[type.body, styles.input, { color: c.text, backgroundColor: c.surface }]}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={send}
              placeholder="Passwort"
              placeholderTextColor={c.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              returnKeyType="go"
              accessibilityLabel="WLAN-Passwort"
              style={[type.body, styles.input, { color: c.text, backgroundColor: c.surface }]}
            />
            <Txt variant="footnote" color="tertiary">
              Die Box kann nur 2,4-GHz-WLAN.
            </Txt>
            <Button label="Verbinden" icon="wifi" onPress={send} disabled={!ssid.trim()} />
          </>
        )}
        {phase === 'sending' && <Waiting text="Die Box verbindet sich mit dem WLAN. Das dauert bis zu einer Minute …" />}
        {phase === 'done' && (
          <Card style={styles.step}>
            <Ionicons name="checkmark-circle" size={40} color={c.success} />
            <Txt variant="headline">Die Box ist im WLAN</Txt>
            <Txt variant="footnote" color="secondary">
              Adresse {address}
            </Txt>
            <Button label="Zur Box" icon="arrow-forward" onPress={openBox} />
          </Card>
        )}
        {error && (
          <Txt variant="footnote" color={c.danger} accessibilityLiveRegion="polite">
            {error}
          </Txt>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Waiting({ text }: { text: string }) {
  const c = useColors();
  return (
    <View style={styles.waiting}>
      <ActivityIndicator color={c.textSecondary} />
      <Txt variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, paddingBottom: space.sm },
  content: { paddingHorizontal: space.lg, gap: space.md, width: '100%', maxWidth: 560, alignSelf: 'center' },
  waiting: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  step: { alignItems: 'center', gap: space.md },
  input: { minHeight: 48, borderRadius: radius.sm + 2, borderCurve: 'continuous', paddingHorizontal: space.md },
});
