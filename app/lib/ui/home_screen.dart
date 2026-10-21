import 'dart:async';

import 'package:flutter/material.dart';

import '../box/box_connection.dart';
import '../models.dart';
import 'kidmode_tab.dart';
import 'now_playing_tab.dart';
import 'parent_gate.dart';
import 'settings_tab.dart';
import 'token_edit_screen.dart';
import 'tokens_tab.dart';
import 'widgets.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.box});
  final BoxConnection box;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final ParentGate _gate = ParentGate(widget.box);
  late final StreamSubscription<BoxEvent> _events;
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    _events = widget.box.events.listen(_onEvent);
  }

  void _onEvent(BoxEvent event) {
    final messenger = ScaffoldMessenger.of(context);
    switch (event) {
      case InfoEvent(:final message, :final icon):
        messenger.showSnackBar(SnackBar(
          content: Row(children: [Icon(icon, color: Colors.white70), const SizedBox(width: 12), Expanded(child: Text(message))]),
        ));
      case UnknownTokenEvent(:final uid):
        messenger.showSnackBar(SnackBar(
          content: Text('Unbekannter Token ($uid) aufgelegt'),
          action: SnackBarAction(label: 'Anlernen', onPressed: () => _learnUid(uid)),
        ));
      case LearnedUidEvent():
        break; // behandelt der Anlern-Dialog
    }
  }

  Future<void> _learnUid(String uid) async {
    if (!await _gate.ensureAppOpen(context) || !mounted) return;
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => TokenEditScreen(box: widget.box, uid: uid)));
  }

  @override
  void dispose() {
    _events.cancel();
    widget.box.dispose();
    _gate.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final box = widget.box;
    return ListenableBuilder(
      listenable: Listenable.merge([box, _gate]),
      // Tabs hier drin erzeugen: neue Widget-Instanzen, sonst baut Flutter sie bei Änderungen nicht neu
      builder: (context, _) => Scaffold(
        appBar: AppBar(
          title: Text(box.name),
          actions: [
            BatteryChip(battery: box.battery, warnPercent: box.settings.batteryWarnPercent),
            if (_gate.unlocked)
              IconButton(tooltip: 'Eltern-Bereich sperren', icon: const Icon(Icons.lock_open), onPressed: _gate.lock),
            const SizedBox(width: 8),
          ],
        ),
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: switch (_tab) {
              0 => NowPlayingTab(box: box),
              1 => TokensTab(box: box, gate: _gate),
              2 => KidModeTab(box: box, gate: _gate),
              _ => SettingsTab(box: box, gate: _gate),
            },
          ),
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) => setState(() => _tab = i),
          destinations: [
            const NavigationDestination(icon: Icon(Icons.speaker_outlined), selectedIcon: Icon(Icons.speaker), label: 'Box'),
            const NavigationDestination(icon: Icon(Icons.nfc_outlined), selectedIcon: Icon(Icons.nfc), label: 'Token'),
            NavigationDestination(
              icon: Badge(isLabelVisible: box.kidMode.enabled, smallSize: 8, child: const Icon(Icons.child_care_outlined)),
              selectedIcon: const Icon(Icons.child_care),
              label: 'Kindermodus',
            ),
            const NavigationDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings), label: 'Einstellungen'),
          ],
        ),
      ),
    );
  }
}
