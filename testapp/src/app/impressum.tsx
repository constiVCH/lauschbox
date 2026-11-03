import { Linking } from 'react-native';

import { BackToStart } from '@/components/BackToStart';
import { Screen } from '@/components/Screen';
import { Card, Row, Section, Txt } from '@/components/ui';
import { space } from '@/theme';

const MAIL = 'lauschbox@c-herzog.de';

export default function Impressum() {
  return (
    <Screen title="Impressum" leading={<BackToStart />} bottomSpace={space.xl}>
      <Section title="Kontakt">
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <Row first title={MAIL} subtitle="E-Mail schreiben" icon="mail" onPress={() => Linking.openURL(`mailto:${MAIL}`)} />
        </Card>
      </Section>
      <Section title="Hinweise">
        <Card style={{ gap: space.sm }}>
          <Txt variant="body" color="secondary">
            Die Lauschbox-App steuert die eigene Lauschbox im Heimnetz. Sie sammelt keine Daten und spricht nur mit der Box.
          </Txt>
          <Txt variant="body" color="secondary">
            Spotify ist eine Marke der Spotify AB. Die Lauschbox ist kein Produkt von Spotify und nicht mit Spotify verbunden.
          </Txt>
        </Card>
      </Section>
    </Screen>
  );
}
