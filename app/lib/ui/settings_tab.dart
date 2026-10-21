import 'package:flutter/material.dart';

import '../box/box_connection.dart';
import '../models.dart';
import 'kidmode_tab.dart';
import 'parent_gate.dart';
import 'widgets.dart';

class SettingsTab extends StatelessWidget {
  const SettingsTab({super.key, required this.box, required this.gate});
  final BoxConnection box;
  final ParentGate gate;

  @override
  Widget build(BuildContext context) {
    if (!gate.appOpen) return LockedView(gate: gate, text: 'Einstellungen sind durch den App-Schutz gesperrt.');

    final s = box.settings;
    void update(VoidCallback change) {
      change();
      box.saveSettings();
    }

    return ListView(
      padding: const EdgeInsets.only(bottom: 32),
      children: [
        const SectionHeader('Lautstärke'),
        SliderTile(
          title: 'Startlautstärke',
          subtitle: 'Nach dem Einschalten',
          value: s.startVolume.toDouble(),
          min: 5,
          max: 100,
          divisions: 19,
          unit: ' %',
          onChanged: (v) => update(() => s.startVolume = v.round()),
        ),
        SliderTile(
          title: 'Maximallautstärke (immer)',
          subtitle: box.kidMode.enabled ? 'Der Kindermodus begrenzt zusätzlich auf ${box.kidMode.maxVolume} %' : null,
          value: s.maxVolume.toDouble(),
          min: 10,
          max: 100,
          divisions: 18,
          unit: ' %',
          onChanged: (v) => update(() => s.maxVolume = v.round()),
        ),
        SliderTile(
          title: 'Schritt pro Tastendruck',
          value: s.volumeStep.toDouble(),
          min: 1,
          max: 20,
          divisions: 19,
          unit: ' %',
          onChanged: (v) => update(() => s.volumeStep = v.round()),
        ),
        const SectionHeader('Token'),
        ListTile(
          title: const Text('Erneut auflegen'),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 8),
            child: SegmentedButton<ReplaceBehavior>(
              segments: const [
                ButtonSegment(value: ReplaceBehavior.resume, label: Text('Fortsetzen')),
                ButtonSegment(value: ReplaceBehavior.restart, label: Text('Von vorn')),
              ],
              selected: {s.onReplace},
              onSelectionChanged: (v) => update(() => s.onReplace = v.first),
            ),
          ),
        ),
        ListTile(
          title: const Text('Token abnehmen'),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 8),
            child: SegmentedButton<RemoveBehavior>(
              segments: [for (final b in RemoveBehavior.values) ButtonSegment(value: b, label: Text(b.label))],
              selected: {s.onRemove},
              onSelectionChanged: (v) => update(() => s.onRemove = v.first),
            ),
          ),
        ),
        const SectionHeader('LED-Ring'),
        SliderTile(
          title: 'Helligkeit',
          value: s.ledBrightness * 100,
          min: 10,
          max: 100,
          divisions: 9,
          unit: ' %',
          onChanged: (v) => update(() => s.ledBrightness = v / 100),
        ),
        SwitchListTile(
          title: const Text('Nachtmodus'),
          subtitle: const Text('LEDs dauerhaft gedimmt'),
          value: s.nightMode,
          onChanged: (v) => update(() => s.nightMode = v),
        ),
        const SectionHeader('Energie'),
        ListTile(
          title: const Text('Ausschalten ohne Wiedergabe nach'),
          trailing: DropdownButton<int>(
            value: s.autoOffMinutes,
            items: [
              for (final m in [0, 5, 10, 15, 30, 60])
                DropdownMenuItem(value: m, child: Text(m == 0 ? 'nie' : '$m min')),
            ],
            onChanged: (v) => update(() => s.autoOffMinutes = v!),
          ),
        ),
        SliderTile(
          title: 'Akku-Warnung ab',
          value: s.batteryWarnPercent.toDouble(),
          min: 5,
          max: 40,
          divisions: 7,
          unit: ' %',
          onChanged: (v) => update(() => s.batteryWarnPercent = v.round()),
        ),
        SliderTile(
          title: 'Herunterfahren ab',
          subtitle: 'Stand speichern und sauber ausschalten',
          value: s.batteryShutdownPercent.toDouble(),
          min: 2,
          max: 15,
          divisions: 13,
          unit: ' %',
          onChanged: (v) => update(() => s.batteryShutdownPercent = v.round()),
        ),
        const SectionHeader('Box'),
        ListTile(
          leading: const Icon(Icons.memory),
          title: Text(box.name),
          subtitle: Text(box.isDemo
              ? 'Simulation · Ziel-Hardware: Raspberry Pi Zero W, go-librespot'
              : 'Raspberry Pi Zero W'),
        ),
        ListTile(
          leading: const Icon(Icons.logout),
          title: const Text('Verbindung trennen'),
          onTap: () => Navigator.of(context).pop(),
        ),
      ],
    );
  }
}
