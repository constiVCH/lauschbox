import 'package:flutter/material.dart';

import '../models.dart';

class CoverArt extends StatelessWidget {
  const CoverArt({super.key, required this.medium, this.size = 56, this.ring});

  final Medium medium;
  final double size;

  /// Optional: Farbe des Tokens als Rand.
  final Color? ring;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.18),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [medium.coverColor.withValues(alpha: 0.65), medium.coverColor],
        ),
        border: ring == null ? null : Border.all(color: ring!, width: size * 0.05),
      ),
      child: Text(medium.coverEmoji, style: TextStyle(fontSize: size * 0.45)),
    );
  }
}

class BatteryChip extends StatelessWidget {
  const BatteryChip({super.key, required this.battery, required this.warnPercent});

  final Battery battery;
  final int warnPercent;

  @override
  Widget build(BuildContext context) {
    final p = battery.percent.round();
    final low = !battery.powerConnected && p < warnPercent;
    final icon = battery.charging
        ? Icons.battery_charging_full
        : battery.powerConnected
            ? Icons.power
            : switch (p) {
                >= 90 => Icons.battery_full,
                >= 60 => Icons.battery_5_bar,
                >= 40 => Icons.battery_4_bar,
                >= 20 => Icons.battery_2_bar,
                _ => Icons.battery_alert,
              };
    final color = low ? Theme.of(context).colorScheme.error : null;
    // Kompakt halten: passt sonst neben dem Schloss-Symbol nicht in die AppBar auf Handybreite
    return Tooltip(
      message: battery.charging
          ? 'Lädt'
          : battery.powerConnected
              ? 'Am Netzteil'
              : 'Restlaufzeit ca. ${_remaining(battery.percent)}',
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 20, color: color),
        const SizedBox(width: 4),
        Text('$p %', style: TextStyle(color: color)),
      ]),
    );
  }

  static String _remaining(double percent) {
    final minutes = (percent / 100 * 11 * 60).round(); // grob 11 h Wiedergabe bei vollem Akku
    return minutes >= 60 ? '${minutes ~/ 60} h ${minutes % 60} min' : '$minutes min';
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 4),
      child: Text(text,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(color: Theme.of(context).colorScheme.primary)),
    );
  }
}

/// Slider mit Titel und Wert, für Einstellungsseiten.
class SliderTile extends StatelessWidget {
  const SliderTile({
    super.key,
    required this.title,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
    this.divisions,
    this.unit = '',
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final double value;
  final double min;
  final double max;
  final int? divisions;
  final String unit;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Row(children: [
        Expanded(child: Text(title)),
        Text('${value.round()}$unit', style: Theme.of(context).textTheme.labelLarge),
      ]),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (subtitle != null) Text(subtitle!),
          Slider(value: value.clamp(min, max), min: min, max: max, divisions: divisions, onChanged: onChanged),
        ],
      ),
    );
  }
}

const tokenColors = <Color>[
  Colors.red,
  Colors.orange,
  Colors.amber,
  Colors.green,
  Colors.teal,
  Colors.cyan,
  Colors.blue,
  Colors.indigo,
  Colors.purple,
  Colors.pink,
];
