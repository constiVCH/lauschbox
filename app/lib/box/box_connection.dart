import 'package:flutter/foundation.dart';

import '../models.dart';

/// Verbindung zu einer Box. Die UI kennt nur diese Schnittstelle.
///
/// Heute gibt es nur [DemoBox] (Simulation im Speicher). Die echte Box spricht später
/// REST + WebSocket (siehe docs/konzept.md, API-Entwurf v1) und implementiert dieselbe Klasse.
abstract class BoxConnection extends ChangeNotifier {
  String get name;
  bool get isDemo;

  PowerState get power;
  Battery get battery;
  PlayerState get player;
  bool get learning;
  bool get buttonsLocked;
  bool get isBedtime;

  /// Restzeit des Sleep-Timers; null = aus.
  Duration? get sleepTimerRemaining;
  bool get sleepAfterTrack;
  Duration get listenedToday;

  /// Höchste Lautstärke, die gerade erlaubt ist (Einstellungen, Kindermodus, Schlafenszeit).
  int get effectiveMaxVolume;

  List<TokenConfig> get tokens;
  BoxSettings get settings;
  KidMode get kidMode;

  Stream<BoxEvent> get events;

  Future<void> playPause();
  Future<void> setVolume(int volume);
  Future<void> nextTrack();
  Future<void> previousTrack();
  Future<void> seek(Duration position);
  Future<void> setSleepTimer(Duration? duration, {bool afterTrack = false});

  /// Lernmodus: der nächste aufgelegte Token wird als [LearnedUidEvent] gemeldet.
  Future<void> startLearn();
  Future<void> cancelLearn();

  Future<void> saveToken(TokenConfig token);
  Future<void> deleteToken(String uid);
  Future<void> resetProgress(String uid);
  Future<List<Medium>> search(String query);

  /// [settings] und [kidMode] werden in der UI direkt bearbeitet und dann gespeichert.
  Future<void> saveSettings();
  Future<void> saveKidMode();
  Future<void> resetListenedToday();
}
