import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/Tap';
import { Button, Card, Txt } from '@/components/ui';
import { load, save } from '@/storage';
import { radius, space, type, useColors } from '@/theme';

const HOST_KEY = 'hw.host';

export default function Start() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [host, setHost] = useState('');

  useEffect(() => {
    load(HOST_KEY).then((h) => h && setHost(h));
  }, []);

  const valid = /^[\w.-]+(:\d+)?$/.test(host.trim());
  const connect = () => {
    if (!valid) return;
    save(HOST_KEY, host.trim());
    router.push({ pathname: '/hardware', params: { host: host.trim() } });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Image source={require('../../assets/logo.png')} style={styles.logo} accessibilityLabel="Lauschbox-Logo" />
          <Txt variant="largeTitle" style={{ textAlign: 'center' }} accessibilityRole="header">
            Lauschbox
          </Txt>
          <Txt variant="callout" color="secondary" style={{ textAlign: 'center', maxWidth: 320 }}>
            Test-App: die Bedienung mit einer simulierten Box ausprobieren oder den Testaufbau am Pi prüfen.
          </Txt>
        </View>

        <Tap onPress={() => router.push('/demo')} scaleTo={0.98} accessibilityRole="button" accessibilityLabel="Demo-Box öffnen">
          <Card style={styles.choice}>
            <View style={[styles.choiceIcon, { backgroundColor: c.accent }]}>
              <Ionicons name="radio-button-on" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="headline">Demo-Box</Txt>
              <Txt variant="footnote" color="secondary">
                Token auflegen, Kindermodus, Anlernen. Läuft ohne Hardware.
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.textTertiary} />
          </Card>
        </Tap>

        <Card style={{ gap: space.md }}>
          <View style={styles.choiceHead}>
            <View style={[styles.choiceIcon, { backgroundColor: c.learn }]}>
              <Ionicons name="hardware-chip" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="headline">Testaufbau</Txt>
              <Txt variant="footnote" color="secondary">
                NFC, Taster, LED-Ring und Lautsprecher am Pi live prüfen.
              </Txt>
            </View>
          </View>
          <View style={{ gap: space.xs }}>
            <Txt variant="footnote" color="secondary" nativeID="hostLabel">
              Adresse des Pi
            </Txt>
            <TextInput
              value={host}
              onChangeText={setHost}
              onSubmitEditing={connect}
              placeholder="z. B. 192.168.178.42"
              placeholderTextColor={c.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'url'}
              returnKeyType="go"
              accessibilityLabelledBy="hostLabel"
              accessibilityLabel="Adresse des Pi"
              style={[type.body, styles.input, { color: c.text, backgroundColor: c.fill }]}
            />
            <Txt variant="footnote" color="tertiary">
              Auf dem Pi: python spikes/hwtest_server.py, IP mit hostname -I. Port 8080 ist voreingestellt.
            </Txt>
          </View>
          <Button label="Verbinden" icon="wifi" onPress={connect} disabled={!valid} kind="secondary" />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, gap: space.lg, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  logo: { width: 112, height: 112, marginBottom: space.sm },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  choiceHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  choiceIcon: { width: 44, height: 44, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderRadius: radius.sm + 2, borderCurve: 'continuous', paddingHorizontal: space.md },
});
