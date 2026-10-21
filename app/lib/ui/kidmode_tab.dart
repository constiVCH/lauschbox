import 'package:flutter/material.dart';

import '../box/box_connection.dart';
import '../models.dart';
import 'parent_gate.dart';
import 'widgets.dart';

class KidModeTab extends StatelessWidget {
  const KidModeTab({super.key, required this.box, required this.gate});
  final BoxConnection box;
  final ParentGate gate;

  @override
  Widget build(BuildContext context) {
    if (!gate.kidModeOpen) return LockedView(gate: gate, text: 'Der Kindermodus ist an.\nÄnderungen nur mit Eltern-PIN.');

    final k = box.kidMode;
    void update(VoidCallback change) {
      change();
      box.saveKidMode();
    }

    Future<void> pickTime(bool from) async {
      final picked = await showTimePicker(context: context, initialTime: from ? k.bedtimeFrom : k.bedtimeTo);
      if (picked != null) update(() => from ? k.bedtimeFrom = picked : k.bedtimeTo = picked);
    }

    return ListView(
      padding: const EdgeInsets.only(bottom: 32),
      children: [
        Card(
          margin: const EdgeInsets.all(16),
          color: k.enabled ? Theme.of(context).colorScheme.primaryContainer : null,
          child: SwitchListTile(
            secondary: const Icon(Icons.child_care, size: 32),
            title: const Text('Kindermodus'),
            subtitle: const Text('Bündelt die Regeln unten und macht die Box kindersicher'),
            value: k.enabled,
            onChanged: (v) => update(() => k.enabled = v),
          ),
        ),
        AbsorbPointer(
          absorbing: !k.enabled,
          child: Opacity(
            opacity: k.enabled ? 1 : 0.45,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const SectionHeader('Lautstärke'),
              SliderTile(
                title: 'Maximallautstärke',
                subtitle: 'Die Lauter-Taste stoppt hier',
                value: k.maxVolume.toDouble(),
                min: 10,
                max: 100,
                divisions: 18,
                unit: ' %',
                onChanged: (v) => update(() => k.maxVolume = v.round()),
              ),
              SwitchListTile(
                title: const Text('Kein Autoplay'),
                subtitle: const Text('Nach dem Ende keine Spotify-Vorschläge'),
                value: k.noAutoplay,
                onChanged: (v) => update(() => k.noAutoplay = v),
              ),
              SectionHeader('Schlafenszeit${box.isBedtime ? ' · jetzt aktiv' : ''}'),
              SwitchListTile(
                title: const Text('Schlafenszeit'),
                subtitle: const Text('Neue Token starten nicht, die laufende Folge wird zu Ende gespielt, LEDs gedimmt'),
                value: k.bedtimeEnabled,
                onChanged: (v) => update(() => k.bedtimeEnabled = v),
              ),
              ListTile(
                enabled: k.bedtimeEnabled,
                leading: const Icon(Icons.nightlight_outlined),
                title: const Text('Zeitraum'),
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  TextButton(onPressed: k.bedtimeEnabled ? () => pickTime(true) : null, child: Text(formatTime(k.bedtimeFrom))),
                  const Text('bis'),
                  TextButton(onPressed: k.bedtimeEnabled ? () => pickTime(false) : null, child: Text(formatTime(k.bedtimeTo))),
                ]),
              ),
              SliderTile(
                title: 'Lautstärke in der Schlafenszeit',
                value: k.bedtimeMaxVolume.toDouble(),
                min: 10,
                max: 100,
                divisions: 18,
                unit: ' %',
                onChanged: (v) => update(() => k.bedtimeMaxVolume = v.round()),
              ),
              const SectionHeader('Hörzeit'),
              SwitchListTile(
                title: const Text('Tagesbudget'),
                subtitle: Text('Heute gehört: ${box.listenedToday.inMinutes} min'),
                value: k.dailyBudgetEnabled,
                onChanged: (v) => update(() => k.dailyBudgetEnabled = v),
              ),
              if (k.dailyBudgetEnabled)
                SliderTile(
                  title: 'Maximal pro Tag',
                  value: k.dailyBudgetMinutes.toDouble(),
                  min: 15,
                  max: 240,
                  divisions: 15,
                  unit: ' min',
                  onChanged: (v) => update(() => k.dailyBudgetMinutes = v.round()),
                ),
              if (box.isDemo)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: TextButton.icon(
                    onPressed: box.resetListenedToday,
                    icon: const Icon(Icons.restart_alt),
                    label: const Text('Hörzeit von heute zurücksetzen (Demo)'),
                  ),
                ),
              const SectionHeader('Box & Token'),
              SwitchListTile(
                title: const Text('Tastensperre erlauben'),
                subtitle: const Text('Lauter + Leiser lange drücken sperrt bzw. entsperrt die Tasten'),
                value: k.buttonLockAllowed,
                onChanged: (v) => update(() => k.buttonLockAllowed = v),
              ),
              SwitchListTile(
                title: const Text('Nur bekannte Token'),
                subtitle: const Text('Unbekannte Token werden ignoriert und nicht zum Anlernen in der App gemeldet'),
                value: k.knownTokensOnly,
                onChanged: (v) => update(() => k.knownTokensOnly = v),
              ),
              const SectionHeader('App'),
              SwitchListTile(
                title: const Text('App-Schutz'),
                subtitle: const Text('Token-Verwaltung und Einstellungen nur mit Eltern-PIN'),
                value: k.protectApp,
                onChanged: (v) => update(() => k.protectApp = v),
              ),
              ListTile(
                leading: const Icon(Icons.pin_outlined),
                title: const Text('Eltern-PIN ändern'),
                onTap: () => _changePin(context),
              ),
            ]),
          ),
        ),
      ],
    );
  }

  Future<void> _changePin(BuildContext context) async {
    final controller = TextEditingController();
    final pin = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Neue PIN'),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: TextInputType.number,
          maxLength: 4,
          obscureText: true,
          decoration: const InputDecoration(helperText: '4 Ziffern'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Abbrechen')),
          FilledButton(
            onPressed: () {
              if (RegExp(r'^\d{4}$').hasMatch(controller.text)) Navigator.pop(context, controller.text);
            },
            child: const Text('Speichern'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (pin == null) return;
    box.kidMode.pin = pin;
    await box.saveKidMode();
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('PIN geändert')));
  }
}

class LockedView extends StatelessWidget {
  const LockedView({super.key, required this.gate, required this.text});
  final ParentGate gate;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.lock_outline, size: 56, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 16),
          Text(text, textAlign: TextAlign.center),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () => gate.unlock(context),
            icon: const Icon(Icons.pin_outlined),
            label: const Text('Mit PIN entsperren'),
          ),
        ]),
      ),
    );
  }
}
