import 'package:flutter/material.dart';

/// Ein Spotify-Medium (Album, Playlist, Hörbuch), wie es die Suche liefert.
class Medium {
  const Medium({
    required this.uri,
    required this.title,
    required this.artist,
    required this.kind,
    required this.tracks,
    this.coverColor = Colors.blueGrey,
    this.coverEmoji = '🎧',
  });

  final String uri;
  final String title;
  final String artist;
  final MediumKind kind;
  final List<Track> tracks;

  /// Platzhalter fürs Cover, solange es keine echten Bilder gibt.
  final Color coverColor;
  final String coverEmoji;

  Duration get totalDuration => tracks.fold(Duration.zero, (sum, t) => sum + t.duration);
}

enum MediumKind {
  album('Album'),
  playlist('Playlist'),
  audiobook('Hörbuch');

  const MediumKind(this.label);
  final String label;
}

class Track {
  const Track(this.title, this.duration);
  final String title;
  final Duration duration;
}

/// Gespeicherter Hörstand eines Tokens.
class Progress {
  const Progress({this.trackIndex = 0, this.position = Duration.zero, this.finished = false});
  final int trackIndex;
  final Duration position;
  final bool finished;
}

/// Zuordnung NFC-UID → Medium (liegt auf der Box).
class TokenConfig {
  TokenConfig({
    required this.uid,
    required this.name,
    required this.color,
    required this.medium,
    this.progress = const Progress(),
  });

  final String uid;
  String name;
  Color color;
  Medium medium;
  Progress progress;
}

class Battery {
  const Battery({required this.percent, required this.charging, required this.powerConnected});
  final double percent;
  final bool charging;
  final bool powerConnected;
}

enum PowerState { on, off }

/// Was der LED-Ring gerade zeigt; die Box setzt das, die App visualisiert es.
enum LedMode { off, booting, idle, playing, paused, volume, learn, unknownToken, denied, charging, lowBattery, locked }

class PlayerState {
  const PlayerState({
    this.token,
    this.trackIndex = 0,
    this.position = Duration.zero,
    this.playing = false,
    this.volume = 40,
  });

  final TokenConfig? token;
  final int trackIndex;
  final Duration position;
  final bool playing;
  final int volume;

  Track? get track {
    final t = token;
    if (t == null || trackIndex >= t.medium.tracks.length) return null;
    return t.medium.tracks[trackIndex];
  }
}

enum ReplaceBehavior {
  resume('Fortsetzen (fertig gehörte Folgen starten von vorn)'),
  restart('Immer von vorn');

  const ReplaceBehavior(this.label);
  final String label;
}

enum RemoveBehavior {
  pause('Pausieren'),
  keepPlaying('Weiterspielen');

  const RemoveBehavior(this.label);
  final String label;
}

class BoxSettings {
  int startVolume = 40;
  int maxVolume = 80;
  int volumeStep = 5;
  ReplaceBehavior onReplace = ReplaceBehavior.resume;
  RemoveBehavior onRemove = RemoveBehavior.pause;
  double ledBrightness = 0.6;
  bool nightMode = false;
  int autoOffMinutes = 15;
  int batteryWarnPercent = 15;
  int batteryShutdownPercent = 5;
}

class KidMode {
  bool enabled = true;
  String pin = '1234';
  int maxVolume = 60;
  bool noAutoplay = true;
  bool bedtimeEnabled = true;
  TimeOfDay bedtimeFrom = const TimeOfDay(hour: 19, minute: 30);
  TimeOfDay bedtimeTo = const TimeOfDay(hour: 7, minute: 0);
  int bedtimeMaxVolume = 30;
  bool dailyBudgetEnabled = false;
  int dailyBudgetMinutes = 60;
  bool buttonLockAllowed = true;
  bool knownTokensOnly = false;
  bool protectApp = true;
}

/// Meldungen der Box, die die App als Hinweis anzeigt (später per WebSocket /api/events).
sealed class BoxEvent {
  const BoxEvent();
}

class UnknownTokenEvent extends BoxEvent {
  const UnknownTokenEvent(this.uid);
  final String uid;
}

class LearnedUidEvent extends BoxEvent {
  const LearnedUidEvent(this.uid);
  final String uid;
}

class InfoEvent extends BoxEvent {
  const InfoEvent(this.message, {this.icon = Icons.info_outline});
  final String message;
  final IconData icon;
}

String formatDuration(Duration d) {
  final h = d.inHours;
  final m = d.inMinutes.remainder(60).toString().padLeft(h > 0 ? 2 : 1, '0');
  final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
  return h > 0 ? '$h:$m:$s' : '$m:$s';
}

String formatTime(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
