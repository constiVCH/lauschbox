import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lauschkiste/box/demo_box.dart';
import 'package:lauschkiste/models.dart';

void main() {
  late DemoBox box;
  final funkel = '04:5C:1E:7A:22:61:80';

  setUp(() {
    box = DemoBox(autoTick: false);
    box.tick(DemoBox.bootDuration); // Box ist sofort bereit, Boot spielt hier keine Rolle
  });
  tearDown(() => box.dispose());

  test('Token auflegen setzt beim gespeicherten Stand fort', () {
    box.placeToken(funkel);
    expect(box.player.playing, isTrue);
    expect(box.player.trackIndex, 2);
    expect(box.player.position, const Duration(minutes: 1, seconds: 40));
  });

  test('Einstellung "von vorn" ignoriert den Stand', () {
    box.settings.onReplace = ReplaceBehavior.restart;
    box.placeToken(funkel);
    expect(box.player.trackIndex, 0);
    expect(box.player.position, Duration.zero);
  });

  test('Abnehmen pausiert und speichert den Stand', () {
    box.placeToken(funkel);
    box.tick(const Duration(seconds: 10));
    box.removeToken();
    expect(box.player.playing, isFalse);
    expect(box.tokenByUid(funkel)!.progress.position, const Duration(minutes: 1, seconds: 50));
  });

  test('Lauter-Taste stoppt an der Maximallautstärke des Kindermodus', () {
    box.kidMode.maxVolume = 60;
    for (var i = 0; i < 30; i++) {
      box.pressVolume(up: true);
    }
    expect(box.player.volume, 60);
  });

  test('Schlafenszeit: neuer Token startet nicht, Lautstärke gedeckelt', () async {
    box.simulateEvening = true;
    final events = <BoxEvent>[];
    final sub = box.events.listen(events.add);
    box.placeToken(funkel);
    await Future<void>.delayed(Duration.zero);
    expect(box.player.playing, isFalse);
    expect(box.ledMode, LedMode.denied);
    expect(events.whereType<InfoEvent>().single.message, contains('Schlafenszeit'));
    expect(box.effectiveMaxVolume, box.kidMode.bedtimeMaxVolume);
    await sub.cancel();
  });

  test('Schlafenszeit beginnt während der Wiedergabe: aktueller Titel läuft zu Ende', () {
    box.placeToken(funkel);
    box.simulateEvening = true;
    box.tick(const Duration(seconds: 1));
    expect(box.player.playing, isTrue);
    box.simSpeed = 60;
    for (var i = 0; i < 10 && box.player.playing; i++) {
      box.tick(const Duration(seconds: 1));
    }
    expect(box.player.playing, isFalse);
    expect(box.player.trackIndex, 3);
  });

  test('Unbekannter Token wird zum Anlernen gemeldet, außer "nur bekannte Token"', () async {
    final events = <BoxEvent>[];
    final sub = box.events.listen(events.add);
    box.placeToken(box.blankUids.first);
    box.kidMode.knownTokensOnly = true;
    box.placeToken(box.blankUids.last);
    await Future<void>.delayed(Duration.zero);
    expect(events.whereType<UnknownTokenEvent>(), hasLength(1));
    await sub.cancel();
  });

  test('Lernmodus liefert die UID des nächsten Tokens', () async {
    final uid = box.blankUids.first;
    final learned = box.events.firstWhere((e) => e is LearnedUidEvent);
    await box.startLearn();
    box.placeToken(uid);
    expect(((await learned) as LearnedUidEvent).uid, uid);
    expect(box.learning, isFalse);
    expect(box.player.playing, isFalse);
  });

  test('Tastensperre blockiert die Taster, nicht die App', () async {
    box.placeToken(funkel);
    box.pressLockCombo();
    box.pressPlayPause();
    expect(box.player.playing, isTrue);
    await box.playPause();
    expect(box.player.playing, isFalse);
  });

  test('Ende des Albums: kein Autoplay, als fertig markiert', () {
    box.placeToken(funkel);
    box.simSpeed = 600;
    for (var i = 0; i < 20 && box.player.playing; i++) {
      box.tick(const Duration(seconds: 1));
    }
    expect(box.player.playing, isFalse);
    expect(box.tokenByUid(funkel)!.progress.finished, isTrue);
  });

  test('Sleep-Timer stoppt die Wiedergabe', () {
    box.placeToken(funkel);
    box.setSleepTimer(const Duration(minutes: 1));
    box.tick(const Duration(seconds: 61));
    expect(box.player.playing, isFalse);
    expect(box.sleepTimerRemaining, isNull);
  });

  test('Leerer Akku fährt die Box herunter und speichert den Stand', () {
    box.placeToken(funkel);
    box.setBatteryPercent(5.01);
    box.simSpeed = 600;
    box.tick(const Duration(seconds: 1));
    expect(box.power, PowerState.off);
    expect(box.tokenByUid(funkel)!.progress.trackIndex, greaterThanOrEqualTo(2));
  });

  test('Tagesbudget stoppt die Wiedergabe', () {
    box.kidMode.dailyBudgetEnabled = true;
    box.kidMode.dailyBudgetMinutes = 15; // 12 min sind schon gehört
    box.placeToken(funkel);
    box.tick(const Duration(minutes: 4));
    expect(box.player.playing, isFalse);
    unawaited(box.resetListenedToday());
  });
}
