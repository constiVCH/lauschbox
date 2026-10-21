import 'package:flutter/material.dart';

import '../box/demo_box.dart';
import '../models.dart';
import 'led_ring.dart';

/// Ersetzt die echte Hardware: LED-Ring, drei Taster, Ein/Aus, Token-Ablage, Netzteil, Zeitraffer.
class BoxSimulator extends StatelessWidget {
  const BoxSimulator({super.key, required this.box});
  final DemoBox box;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final placed = box.placedUid;
    final placedToken = placed == null ? null : box.tokenByUid(placed);

    return Card(
      color: scheme.surfaceContainerLow,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(Icons.science_outlined, size: 18, color: scheme.primary),
              const SizedBox(width: 8),
              Text('Box-Simulator', style: Theme.of(context).textTheme.titleMedium),
              const Spacer(),
              Text(_ledLabel(box.ledMode), style: Theme.of(context).textTheme.bodySmall),
            ]),
            const SizedBox(height: 12),
            Wrap(
              spacing: 24,
              runSpacing: 16,
              crossAxisAlignment: WrapCrossAlignment.center,
              alignment: WrapAlignment.center,
              children: [
                Stack(alignment: Alignment.center, children: [
                  LedRing(
                    mode: box.ledMode,
                    color: box.ledColor,
                    fill: box.ledFill,
                    brightness: box.ledBrightness,
                    lowBattery: box.ledLowBattery,
                  ),
                  // Lesefeld in der Mitte des Rings: hier liegt der Token
                  GestureDetector(
                    onTap: placed == null ? null : box.removeToken,
                    child: Tooltip(
                      message: placed == null ? 'Token aus der Ablage unten auflegen' : 'Antippen zum Abnehmen',
                      child: CircleAvatar(
                        radius: 34,
                        backgroundColor: placed == null ? scheme.surface : (placedToken?.color ?? Colors.grey.shade400),
                        child: placed == null
                            ? Icon(Icons.nfc, color: scheme.outline)
                            : Text(placedToken?.medium.coverEmoji ?? '?', style: const TextStyle(fontSize: 28)),
                      ),
                    ),
                  ),
                ]),
                Column(mainAxisSize: MainAxisSize.min, children: [
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    _HwButton(icon: Icons.remove, tooltip: 'Leiser', onTap: () => box.pressVolume(up: false)),
                    const SizedBox(width: 12),
                    _HwButton(icon: Icons.play_arrow, tooltip: 'Play/Pause', onTap: box.pressPlayPause, big: true),
                    const SizedBox(width: 12),
                    _HwButton(icon: Icons.add, tooltip: 'Lauter', onTap: () => box.pressVolume(up: true)),
                  ]),
                  const SizedBox(height: 12),
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    TextButton.icon(
                      onPressed: box.pressLockCombo,
                      icon: Icon(box.buttonsLocked ? Icons.lock : Icons.lock_open, size: 18),
                      label: const Text('+ und − lang'),
                    ),
                    const SizedBox(width: 4),
                    IconButton.filledTonal(
                      tooltip: box.power == PowerState.on ? 'Ausschalten (PiSugar-Taster)' : 'Einschalten (PiSugar-Taster)',
                      onPressed: box.pressPowerButton,
                      icon: Icon(Icons.power_settings_new,
                          color: box.power == PowerState.on ? Colors.green : scheme.outline),
                    ),
                  ]),
                ]),
              ],
            ),
            const SizedBox(height: 16),
            Text('Token-Ablage (antippen = auflegen)', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final t in box.tokens)
                ChoiceChip(
                  avatar: CircleAvatar(backgroundColor: t.color, child: Text(t.medium.coverEmoji, style: const TextStyle(fontSize: 11))),
                  label: Text(t.name),
                  selected: placed == t.uid,
                  onSelected: (_) => placed == t.uid ? box.removeToken() : box.placeToken(t.uid),
                ),
              for (final uid in box.blankUids)
                ChoiceChip(
                  avatar: const Icon(Icons.circle_outlined, size: 18),
                  label: Text('Leer ${uid.substring(3, 8)}'),
                  selected: placed == uid,
                  onSelected: (_) => placed == uid ? box.removeToken() : box.placeToken(uid),
                ),
              ActionChip(avatar: const Icon(Icons.add, size: 18), label: const Text('Leerer Token'), onPressed: box.addBlankToken),
            ]),
            const SizedBox(height: 8),
            Wrap(spacing: 16, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
              _Toggle(label: 'Netzteil (USB-C)', value: box.battery.powerConnected, onChanged: box.setPowerConnected),
              _Toggle(label: 'Abends (20 Uhr statt 10 Uhr)', value: box.simulateEvening, onChanged: (v) => box.simulateEvening = v),
              Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, children: [
                const Text('Zeitraffer'),
                SegmentedButton<int>(
                  showSelectedIcon: false,
                  style: const ButtonStyle(visualDensity: VisualDensity.compact),
                  segments: const [
                    ButtonSegment(value: 1, label: Text('1×')),
                    ButtonSegment(value: 10, label: Text('10×')),
                    ButtonSegment(value: 60, label: Text('60×')),
                  ],
                  selected: {box.simSpeed},
                  onSelectionChanged: (s) => box.simSpeed = s.first,
                ),
              ]),
            ]),
            Row(children: [
              const Text('Akku'),
              Expanded(
                child: Slider(
                  value: box.battery.percent,
                  max: 100,
                  label: '${box.battery.percent.round()} %',
                  divisions: 100,
                  onChanged: box.setBatteryPercent,
                ),
              ),
            ]),
          ],
        ),
      ),
    );
  }

  static String _ledLabel(LedMode mode) => switch (mode) {
        LedMode.off => 'aus',
        LedMode.booting => 'startet …',
        LedMode.idle => 'bereit',
        LedMode.playing => 'spielt',
        LedMode.paused => 'pausiert',
        LedMode.volume => 'Lautstärke',
        LedMode.learn => 'Lernmodus',
        LedMode.unknownToken => 'unbekannter Token',
        LedMode.denied => 'nicht erlaubt',
        LedMode.charging => 'lädt',
        LedMode.lowBattery => 'Akku schwach',
        LedMode.locked => 'Tasten gesperrt',
      };
}

class _HwButton extends StatelessWidget {
  const _HwButton({required this.icon, required this.tooltip, required this.onTap, this.big = false});
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final bool big;

  @override
  Widget build(BuildContext context) {
    final size = big ? 64.0 : 52.0;
    return Tooltip(
      message: tooltip,
      child: Material(
        shape: const CircleBorder(),
        color: Theme.of(context).colorScheme.secondaryContainer,
        elevation: 3,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox.square(dimension: size, child: Icon(icon, size: size * 0.5)),
        ),
      ),
    );
  }
}

class _Toggle extends StatelessWidget {
  const _Toggle({required this.label, required this.value, required this.onChanged});
  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Switch(value: value, onChanged: onChanged),
      const SizedBox(width: 4),
      Flexible(child: Text(label)),
    ]);
  }
}
