import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setActiveBox } from '@/box/BoxContext';
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
  const openBox = () => {
    if (!valid) return;
    save(HOST_KEY, host.trim());
    setActiveBox(host.trim());
    router.push('/box' as Href);
  };
  const testHardware = () => {
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
            Mit deiner Box im WLAN verbinden.
          </Txt>
        </View>

        <Card style={{ gap: space.md }}>
          <View style={styles.choiceHead}>
            <View style={[styles.choiceIcon, { backgroundColor: c.accent }]}>
              <Ionicons name="radio-button-on" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="headline">Meine Box</Txt>
              <Txt variant="footnote" color="secondary">
                Token anlernen, Wiedergabe, Kindermodus. Box und Handy im selben WLAN.
              </Txt>
            </View>
          </View>
          <View style={{ gap: space.xs }}>
            <Txt variant="footnote" color="secondary" nativeID="hostLabel">
              Adresse der Box
            </Txt>
            <TextInput
              value={host}
              onChangeText={setHost}
              onSubmitEditing={openBox}
              placeholder="z. B. 192.168.178.42"
              placeholderTextColor={c.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'url'}
              returnKeyType="go"
              accessibilityLabelledBy="hostLabel"
              accessibilityLabel="Adresse der Box"
              style={[type.body, styles.input, { color: c.text, backgroundColor: c.fill }]}
            />
            <Txt variant="footnote" color="tertiary">
              Die IP zeigt hostname -I auf dem Pi. Port 8080 ist voreingestellt, sonst IP:Port.
            </Txt>
          </View>
          <Button label="Mit Box verbinden" icon="wifi" onPress={openBox} disabled={!valid} />
          <Button
            label="Hardware testen"
            icon="hardware-chip"
            kind="secondary"
            onPress={testHardware}
            disabled={!valid}
            accessibilityHint="Braucht auf dem Pi den Testserver spikes/hwtest_server.py statt der Box-Software"
          />
        </Card>

        <View style={styles.links}>
          <Button label="Anleitung" icon="book" kind="plain" compact onPress={() => router.push('/anleitung' as Href)} />
          <Button label="Impressum" icon="information-circle" kind="plain" compact onPress={() => router.push('/impressum' as Href)} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, gap: space.lg, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  logo: { width: 112, height: 112, marginBottom: space.sm },
  links: { flexDirection: 'row', justifyContent: 'center', gap: space.lg },
  choiceHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  choiceIcon: { width: 44, height: 44, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderRadius: radius.sm + 2, borderCurve: 'continuous', paddingHorizontal: space.md },
});
