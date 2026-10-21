import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../models.dart';
import 'box_connection.dart';
import 'demo_catalog.dart';

/// Simulierte Box im Speicher: Wiedergabe, Akku, LED-Ring und alle Regeln des Kindermodus.
///
/// Zusätzlich zur [BoxConnection] gibt es Methoden, die die echte Hardware ersetzen
/// (Token auflegen, Taster drücken, Netzteil einstecken) und einen Zeitraffer zum Ausprobieren.
class DemoBox extends BoxConnection {
  DemoBox({bool autoTick = true, Random? random}) : _random = random ?? Random() {
    _tokens.addAll([
      TokenConfig(uid: '04:5C:1E:7A:22:61:80', name: 'Funkel 1', color: Colors.red, medium: demoCatalog[0],
          progress: const Progress(trackIndex: 2, position: Duration(minutes: 1, seconds: 40))),
      TokenConfig(uid: '04:91:3B:C4:52:61:80', name: 'Kapitän Kraut', color: Colors.teal, medium: demoCatalog[2]),
      TokenConfig(uid: '04:0D:77:E9:12:61:81', name: 'Schlaflieder', color: Colors.indigo, medium: demoCatalog[3]),
    ]);
    _blankUids.addAll([_newUid(), _newUid()]);
    _volume = settings.startVolume;
    if (autoTick) _timer = Timer.periodic(tickInterval, (_) => tick(tickInterval));
  }

  static const tickInterval = Duration(milliseconds: 250);
  static const bootDuration = Duration(seconds: 3); // echte Box (Zero W): eher 40–60 s
  static const _flashDuration = Duration(milliseconds: 1500);

  final Random _random;
  Timer? _timer;
  final _events = StreamController<BoxEvent>.broadcast();

  final _tokens = <TokenConfig>[];
  final _blankUids = <String>[];
  @override
  final settings = BoxSettings();
  @override
  final kidMode = KidMode();

  PowerState _power = PowerState.on;
  double _batteryPercent = 72;
  bool _powerConnected = false;
  bool _warnedLowBattery = false;

  TokenConfig? _token;
  int _trackIndex = 0;
  Duration _position = Duration.zero;
  bool _playing = false;
  int _volume = 40;

  bool _learning = false;
  bool _locked = false;
  String? _placedUid;
  Duration? _sleepLeft;
  bool _sleepAfterTrack = false;
  bool _bedtimeStopArmed = false;
  Duration _listenedToday = const Duration(minutes: 12);
  Duration _idle = Duration.zero;

  Duration _bootLeft = Duration.zero;
  LedMode? _flash;
  Duration _flashLeft = Duration.zero;

  // ---- Simulator-Steuerung ----

  /// Zeitraffer-Faktor für Wiedergabe, Akku, Timer.
  int simSpeed = 1;

  /// Die Demo nutzt eine feste Uhrzeit, damit sie zu jeder Tageszeit gleich funktioniert:
  /// 10:00 Uhr, oder 20:00 Uhr zum Testen der Schlafenszeit.
  bool simulateEvening = false;

  String? get placedUid => _placedUid;
  List<String> get blankUids => _blankUids.where((u) => tokenByUid(u) == null).toList();

  @override
  String get name => 'Demo-Box';
  @override
  bool get isDemo => true;

  @override
  PowerState get power => _power;
  bool get booting => _bootLeft > Duration.zero;
  bool get _ready => _power == PowerState.on && !booting;

  @override
  Battery get battery => Battery(
        percent: _batteryPercent,
        charging: _powerConnected && _batteryPercent < 100,
        powerConnected: _powerConnected,
      );

  @override
  PlayerState get player =>
      PlayerState(token: _token, trackIndex: _trackIndex, position: _position, playing: _playing, volume: _volume);

  @override
  bool get learning => _learning;
  @override
  bool get buttonsLocked => _locked;
  @override
  Duration? get sleepTimerRemaining => _sleepLeft;
  @override
  bool get sleepAfterTrack => _sleepAfterTrack;
  @override
  Duration get listenedToday => _listenedToday;
  @override
  List<TokenConfig> get tokens => List.unmodifiable(_tokens);
  @override
  Stream<BoxEvent> get events => _events.stream;

  TokenConfig? tokenByUid(String uid) {
    for (final t in _tokens) {
      if (t.uid == uid) return t;
    }
    return null;
  }

  TimeOfDay get now => TimeOfDay(hour: simulateEvening ? 20 : 10, minute: 0);

  @override
  bool get isBedtime {
    if (!kidMode.enabled || !kidMode.bedtimeEnabled) return false;
    int m(TimeOfDay t) => t.hour * 60 + t.minute;
    final t = m(now), from = m(kidMode.bedtimeFrom), to = m(kidMode.bedtimeTo);
    return from <= to ? (t >= from && t < to) : (t >= from || t < to);
  }

  bool get budgetExceeded =>
      kidMode.enabled && kidMode.dailyBudgetEnabled && _listenedToday >= Duration(minutes: kidMode.dailyBudgetMinutes);

  @override
  int get effectiveMaxVolume => [
        settings.maxVolume,
        if (kidMode.enabled) kidMode.maxVolume,
        if (isBedtime) kidMode.bedtimeMaxVolume,
      ].reduce(min);

  // ---- LED-Ring (wird im Simulator gezeichnet) ----

  LedMode get ledMode {
    if (_power == PowerState.off) return LedMode.off;
    if (booting) return LedMode.booting;
    if (_flashLeft > Duration.zero && _flash != null) return _flash!;
    if (_learning) return LedMode.learn;
    if (_playing) return LedMode.playing;
    if (battery.charging) return LedMode.charging;
    if (_token != null) return LedMode.paused;
    return LedMode.idle;
  }

  /// Füllstand des Rings 0..1 (Lautstärke, Titel-Fortschritt, Ladestand).
  double get ledFill => switch (ledMode) {
        LedMode.volume => _volume / 100,
        LedMode.playing || LedMode.paused => _trackFraction,
        LedMode.charging => _batteryPercent / 100,
        _ => 0,
      };

  Color get ledColor => switch (ledMode) {
        LedMode.playing || LedMode.paused => _token?.color ?? Colors.white,
        LedMode.learn => Colors.blue,
        LedMode.unknownToken => Colors.orange,
        LedMode.denied => Colors.purple,
        LedMode.locked => Colors.red,
        LedMode.charging => Colors.green,
        _ => Colors.white,
      };

  double get ledBrightness => settings.ledBrightness * ((settings.nightMode || isBedtime) ? 0.35 : 1);
  bool get ledLowBattery => !_powerConnected && _batteryPercent < settings.batteryWarnPercent;

  double get _trackFraction {
    final track = player.track;
    if (track == null || track.duration == Duration.zero) return 0;
    return (_position.inMilliseconds / track.duration.inMilliseconds).clamp(0, 1);
  }

  // ---- Simulierte Hardware ----

  void placeToken(String uid) {
    _placedUid = uid;
    if (_ready) _handlePlaced(uid);
    notifyListeners();
  }

  void removeToken() {
    _placedUid = null;
    if (_ready && _playing && settings.onRemove == RemoveBehavior.pause) {
      _playing = false;
      _saveProgress();
    }
    notifyListeners();
  }

  void pressPlayPause() {
    if (!_buttonAllowed()) return;
    if (_token != null) _togglePlay();
  }

  void pressVolume({required bool up}) {
    if (!_buttonAllowed()) return;
    _setVolume(_volume + (up ? settings.volumeStep : -settings.volumeStep));
    _startFlash(LedMode.volume);
  }

  /// Lauter + Leiser lang drücken.
  void pressLockCombo() {
    if (!_ready) return;
    if (!kidMode.enabled || !kidMode.buttonLockAllowed) {
      _emit('Tastensperre ist nicht aktiviert (Kindermodus)', Icons.lock_open);
      return;
    }
    _locked = !_locked;
    _startFlash(LedMode.locked);
    _emit(_locked ? 'Tasten gesperrt' : 'Tasten entsperrt', _locked ? Icons.lock : Icons.lock_open);
  }

  /// Ein/Aus-Taster am PiSugar.
  void pressPowerButton() {
    if (_power == PowerState.on) {
      _shutdown('Box ausgeschaltet');
    } else {
      _boot();
    }
  }

  void setPowerConnected(bool connected) {
    _powerConnected = connected;
    if (connected) _warnedLowBattery = false;
    notifyListeners();
  }

  void addBlankToken() {
    _blankUids.add(_newUid());
    notifyListeners();
  }

  void setBatteryPercent(double percent) {
    _batteryPercent = percent.clamp(0, 100);
    notifyListeners();
  }

  // ---- BoxConnection (App-Steuerung) ----

  @override
  Future<void> playPause() async {
    if (_ready && _token != null) _togglePlay();
  }

  @override
  Future<void> setVolume(int volume) async {
    if (!_ready) return;
    _setVolume(volume);
    _startFlash(LedMode.volume);
  }

  @override
  Future<void> nextTrack() async {
    final t = _token;
    if (!_ready || t == null || _trackIndex + 1 >= t.medium.tracks.length) return;
    _trackIndex++;
    _position = Duration.zero;
    _saveProgress();
    notifyListeners();
  }

  @override
  Future<void> previousTrack() async {
    if (!_ready || _token == null) return;
    if (_position < const Duration(seconds: 3) && _trackIndex > 0) _trackIndex--;
    _position = Duration.zero;
    _saveProgress();
    notifyListeners();
  }

  @override
  Future<void> seek(Duration position) async {
    if (!_ready || player.track == null) return;
    _position = position;
    _saveProgress();
    notifyListeners();
  }

  @override
  Future<void> setSleepTimer(Duration? duration, {bool afterTrack = false}) async {
    _sleepLeft = duration;
    _sleepAfterTrack = afterTrack;
    notifyListeners();
  }

  @override
  Future<void> startLearn() async {
    if (!_ready) return;
    _learning = true;
    notifyListeners();
  }

  @override
  Future<void> cancelLearn() async {
    _learning = false;
    notifyListeners();
  }

  @override
  Future<void> saveToken(TokenConfig token) async {
    final i = _tokens.indexWhere((t) => t.uid == token.uid);
    if (i >= 0) {
      if (_tokens[i].medium.uri != token.medium.uri) token.progress = const Progress();
      _tokens[i] = token;
    } else {
      _tokens.add(token);
    }
    if (_token?.uid == token.uid) _token = token;
    notifyListeners();
  }

  @override
  Future<void> deleteToken(String uid) async {
    _tokens.removeWhere((t) => t.uid == uid);
    if (_token?.uid == uid) {
      _token = null;
      _playing = false;
    }
    notifyListeners();
  }

  @override
  Future<void> resetProgress(String uid) async {
    tokenByUid(uid)?.progress = const Progress();
    if (_token?.uid == uid) {
      _trackIndex = 0;
      _position = Duration.zero;
    }
    notifyListeners();
  }

  @override
  Future<List<Medium>> search(String query) async {
    await Future<void>.delayed(const Duration(milliseconds: 350));
    final q = query.trim().toLowerCase();
    return demoCatalog
        .where((m) => q.isEmpty || m.title.toLowerCase().contains(q) || m.artist.toLowerCase().contains(q))
        .toList();
  }

  @override
  Future<void> saveSettings() async {
    _setVolume(_volume);
    notifyListeners();
  }

  @override
  Future<void> saveKidMode() async {
    if (!kidMode.enabled || !kidMode.buttonLockAllowed) _locked = false;
    _setVolume(_volume);
    notifyListeners();
  }

  @override
  Future<void> resetListenedToday() async {
    _listenedToday = Duration.zero;
    notifyListeners();
  }

  // ---- Simulation ----

  /// Ein Simulationsschritt; [real] ist die vergangene echte Zeit.
  void tick(Duration real) {
    final sim = real * simSpeed;
    _updateBattery(sim);

    if (_power == PowerState.on) {
      if (_flashLeft > Duration.zero) _flashLeft -= real;
      if (booting) {
        _bootLeft -= real;
        if (!booting && _placedUid != null) _handlePlaced(_placedUid!);
      } else if (_playing) {
        _advancePlayback(sim);
      } else {
        _idle += sim;
        if (settings.autoOffMinutes > 0 && _idle >= Duration(minutes: settings.autoOffMinutes)) {
          _shutdown('Automatisch ausgeschaltet nach ${settings.autoOffMinutes} min ohne Wiedergabe', Icons.power_settings_new);
        }
      }
      if (_volume > effectiveMaxVolume) _volume = effectiveMaxVolume;
    }
    notifyListeners();
  }

  void _advancePlayback(Duration sim) {
    final token = _token!;
    _idle = Duration.zero;
    _position += sim;
    _listenedToday += sim;

    if (isBedtime && !_bedtimeStopArmed) {
      _bedtimeStopArmed = true;
      _emit('Schlafenszeit: Die laufende Folge wird noch zu Ende gespielt', Icons.bedtime);
    }

    while (_playing && _position >= token.medium.tracks[_trackIndex].duration) {
      final overflow = _position - token.medium.tracks[_trackIndex].duration;
      if (_trackIndex + 1 >= token.medium.tracks.length) {
        _playing = false;
        _bedtimeStopArmed = false;
        _position = Duration.zero;
        _trackIndex = 0;
        token.progress = const Progress(finished: true);
        _emit(kidMode.enabled && kidMode.noAutoplay
            ? '„${token.name}“ ist zu Ende. Kein Autoplay, die Box bleibt still.'
            : '„${token.name}“ ist zu Ende. (Ohne Kindermodus würde Spotify jetzt Vorschläge spielen.)', Icons.check_circle_outline);
        return;
      }
      _trackIndex++;
      _position = overflow;
      if (_sleepAfterTrack || _bedtimeStopArmed) {
        _playing = false;
        _position = Duration.zero;
        _emit(_sleepAfterTrack ? 'Sleep-Timer: nach dem Titel gestoppt' : 'Schlafenszeit: gute Nacht!', Icons.bedtime);
        _sleepAfterTrack = false;
      }
    }

    final left = _sleepLeft;
    if (_playing && left != null) {
      _sleepLeft = left - sim;
      if (_sleepLeft! <= Duration.zero) {
        _sleepLeft = null;
        _playing = false;
        _emit('Sleep-Timer abgelaufen, Wiedergabe gestoppt', Icons.bedtime);
      }
    }

    if (_playing && budgetExceeded) {
      _playing = false;
      _emit('Tagesbudget von ${kidMode.dailyBudgetMinutes} min aufgebraucht', Icons.hourglass_bottom);
    }
    _saveProgress();
  }

  void _updateBattery(Duration sim) {
    final hours = sim.inMilliseconds / Duration.millisecondsPerHour;
    if (_powerConnected) {
      _batteryPercent = min(100, _batteryPercent + hours * 100 / 3.5); // ca. 3,5 h voll laden
      return;
    }
    if (_power == PowerState.off) return;
    // PiSugar 3 Plus (5000 mAh): grob 11 h Wiedergabe, 16 h Leerlauf
    _batteryPercent = max(0, _batteryPercent - hours * 100 / (_playing ? 11 : 16));
    if (_batteryPercent < settings.batteryWarnPercent && !_warnedLowBattery) {
      _warnedLowBattery = true;
      _emit('Akku schwach (${_batteryPercent.round()} %)', Icons.battery_alert);
    }
    if (_batteryPercent <= settings.batteryShutdownPercent) {
      _shutdown('Akku fast leer: Stand gespeichert, Box fährt herunter', Icons.battery_0_bar);
    }
  }

  void _handlePlaced(String uid) {
    _idle = Duration.zero;
    if (_learning) {
      _learning = false;
      _events.add(LearnedUidEvent(uid));
      return;
    }
    final token = tokenByUid(uid);
    if (token == null) {
      _startFlash(LedMode.unknownToken);
      if (!(kidMode.enabled && kidMode.knownTokensOnly)) _events.add(UnknownTokenEvent(uid));
      return;
    }
    if (isBedtime) {
      _startFlash(LedMode.denied);
      _emit('Schlafenszeit: „${token.name}“ startet erst morgen wieder', Icons.bedtime);
      return;
    }
    if (budgetExceeded) {
      _startFlash(LedMode.denied);
      _emit('Tagesbudget aufgebraucht: „${token.name}“ startet nicht', Icons.hourglass_bottom);
      return;
    }
    final p = token.progress;
    final restart = settings.onReplace == ReplaceBehavior.restart || p.finished;
    _token = token;
    _trackIndex = restart ? 0 : p.trackIndex;
    _position = restart ? Duration.zero : p.position;
    _playing = true;
    _bedtimeStopArmed = false;
    _setVolume(_volume);
  }

  void _togglePlay() {
    _playing = !_playing;
    _idle = Duration.zero;
    _saveProgress();
    notifyListeners();
  }

  bool _buttonAllowed() {
    if (!_ready) return false;
    if (_locked) {
      _startFlash(LedMode.locked);
      return false;
    }
    return true;
  }

  void _setVolume(int v) {
    _volume = v.clamp(0, effectiveMaxVolume);
    notifyListeners();
  }

  void _saveProgress() {
    final t = _token;
    if (t != null) t.progress = Progress(trackIndex: _trackIndex, position: _position);
  }

  void _boot() {
    if (!_powerConnected && _batteryPercent <= settings.batteryShutdownPercent) {
      _emit('Akku leer: bitte erst laden', Icons.battery_0_bar);
      return;
    }
    _power = PowerState.on;
    _bootLeft = bootDuration;
    _volume = min(settings.startVolume, effectiveMaxVolume);
    _idle = Duration.zero;
    _warnedLowBattery = false;
    notifyListeners();
  }

  void _shutdown(String message, [IconData icon = Icons.power_settings_new]) {
    _saveProgress();
    _playing = false;
    _learning = false;
    _locked = false;
    _sleepLeft = null;
    _sleepAfterTrack = false;
    _token = null;
    _power = PowerState.off;
    _emit(message, icon);
    notifyListeners();
  }

  void _startFlash(LedMode mode) {
    _flash = mode;
    _flashLeft = _flashDuration;
    notifyListeners();
  }

  void _emit(String message, IconData icon) => _events.add(InfoEvent(message, icon: icon));

  String _newUid() =>
      ['04', for (var i = 0; i < 6; i++) _random.nextInt(256).toRadixString(16).padLeft(2, '0').toUpperCase()].join(':');

  @override
  void dispose() {
    _timer?.cancel();
    _events.close();
    super.dispose();
  }
}
