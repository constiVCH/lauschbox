import { BackToStart } from '@/components/BackToStart';
import { Screen } from '@/components/Screen';
import { Card, Row, Section, Txt } from '@/components/ui';
import { space } from '@/theme';

/** Kurze Anleitung: Einrichten, Token, Taster, LED-Ring, Kindermodus, Hilfe bei Problemen. */
export default function Anleitung() {
  return (
    <Screen title="Anleitung" subtitle="So funktioniert die Lauschbox" leading={<BackToStart />} bottomSpace={space.xl}>
      <Section title="1. Einrichten">
        <Card style={{ gap: space.sm }}>
          <Txt variant="body">Box und Handy müssen im selben WLAN sein.</Txt>
          <Txt variant="body" color="secondary">
            Hat die Box noch kein WLAN, pulsiert ihr Ring nach einer halben Minute blau. Dann auf dem Start-Bildschirm „Neue Box
            ins WLAN bringen“ tippen, an der Box kurz Play drücken und WLAN-Name und Passwort eingeben.
          </Txt>
          <Txt variant="body" color="secondary">
            Sonst die Adresse der Box eintragen (z. B. 192.168.178.42) und „Mit Box verbinden“ tippen. Die Adresse zeigt dein Router.
          </Txt>
          <Txt variant="body" color="secondary">
            Spotify anmelden: Tab „Einstellungen“ → Spotify. Den angezeigten Code auf spotify.com/pair eingeben. Für die Suche
            einmal „Suche einrichten“ durchgehen.
          </Txt>
        </Card>
      </Section>

      <Section title="2. Token anlernen">
        <Card style={{ gap: space.sm }}>
          <Txt variant="body">Tab „Token“ → „Neu“, dann einen leeren Token auf die Box legen oder mit „Mit dem Handy lesen“ an die Rückseite des Handys halten.</Txt>
          <Txt variant="body" color="secondary">
            Namen und Farbe wählen, Inhalt suchen oder einen Spotify-Link einfügen (in Spotify: Teilen → Link kopieren).
            Wiedergabe-Art: „Hörspiel“ merkt sich die Stelle im ganzen Hörspiel, „Einzelne Titel“ zählt jeden Titel für sich,
            „Zufällig“ mischt bei jedem Auflegen.
          </Txt>
        </Card>
      </Section>

      <Section title="3. An der Box" footer="Token kurz abnehmen und wieder auflegen ist kein Problem: Die Box spielt die Nachfrist lang weiter.">
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <Row first title="Token auflegen" subtitle="Spielt ab, wo zuletzt aufgehört wurde" icon="disc" />
          <Row title="Token abnehmen" subtitle="Pause, die Stelle wird gemerkt" icon="pause" />
          <Row title="Play kurz" subtitle="Pause oder weiter" icon="play" />
          <Row title="Play lang" subtitle="Aufgelegten Token von vorn starten" icon="play-skip-back" />
          <Row title="+ / − kurz" subtitle="Lauter oder leiser" icon="volume-high" />
          <Row title="+ / − lang" subtitle="Nächster oder vorheriger Titel" icon="play-forward" />
          <Row title="+ und − zusammen lang" subtitle="Tasten sperren oder entsperren" icon="lock-closed" />
        </Card>
      </Section>

      <Section title="4. Der LED-Ring">
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <Row first title="Ein Lichtpunkt mit Schweif kreist" subtitle="Bereit, kein Token aufgelegt" icon="ellipse" iconColor="#8A93A6" />
          <Row title="Ring ganz aus" subtitle="Ruhemodus: Taste drücken oder Token auflegen weckt die Box" icon="ellipse-outline" iconColor="#3A4152" />
          <Row title="Ring in Token-Farbe" subtitle="Spielt; der Ring füllt sich mit dem Fortschritt" icon="ellipse" iconColor="#E8663D" />
          <Row title="Token-Farbe pulsiert" subtitle="Pause" icon="ellipse" iconColor="#E8663D" />
          <Row title="Weiß füllt sich kurz" subtitle="Lautstärke" icon="ellipse" iconColor="#B8BFCC" />
          <Row title="Blau pulsiert" subtitle="Lernmodus: leeren Token auflegen. Oder: kein WLAN, Einrichtung per Bluetooth wartet" icon="ellipse" iconColor="#5B9BFF" />
          <Row title="Blau leuchtet ruhig" subtitle="WLAN-Einrichtung freigegeben, weiter in der App" icon="ellipse" iconColor="#5B9BFF" />
          <Row title="Orange blinkt" subtitle="Unbekannter Token" icon="ellipse" iconColor="#FF9F40" />
          <Row title="Lila pulsiert" subtitle="Schlafenszeit: startet erst morgen" icon="ellipse" iconColor="#B07CFF" />
          <Row title="Rot blinkt" subtitle="Tasten gesperrt oder Fehler" icon="ellipse" iconColor="#FF5A4E" />
          <Row title="Grün blinkt" subtitle="Tasten wieder frei" icon="ellipse" iconColor="#5BCB6E" />
        </Card>
      </Section>

      <Section title="5. Kindermodus" footer="Die Eltern-PIN ist ab Werk 1234. Im Tab „Kindermodus“ lässt sie sich ändern oder abschalten.">
        <Card style={{ gap: space.sm }}>
          <Txt variant="body" color="secondary">
            Maximallautstärke, Schlafenszeit (neue Geschichten starten dann nicht, die Box wird leiser und die LEDs dunkler),
            kein Autoplay nach dem Ende und „nur bekannte Token“. Alles gilt auf der Box, auch wenn die App zu ist.
          </Txt>
        </Card>
      </Section>

      <Section title="6. Wenn etwas nicht geht">
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <Row first title="App findet die Box nicht" subtitle="Gleiches WLAN? Adresse richtig? Box eingeschaltet?" icon="wifi" />
          <Row title="Token startet nicht" subtitle="Einstellungen → Spotify: angemeldet? Sonst „Spotify neu starten“" icon="musical-notes" />
          <Row title="Ein Bauteil zeigt FEHLER" subtitle="Einstellungen → Hardware; danach „Box-Software neu starten“" icon="hardware-chip" />
          <Row title="Was hat die Box gemacht?" subtitle="Einstellungen → Log ansehen" icon="document-text" />
        </Card>
      </Section>
    </Screen>
  );
}
