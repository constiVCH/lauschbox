import 'dart:math';

import 'package:flutter/material.dart';

import '../models.dart';

/// Zeichnet den WS2812-Ring (12 LEDs) so, wie ihn die Box ansteuern würde.
class LedRing extends StatefulWidget {
  const LedRing({
    super.key,
    required this.mode,
    required this.color,
    required this.fill,
    required this.brightness,
    required this.lowBattery,
    this.size = 150,
  });

  final LedMode mode;
  final Color color;
  final double fill;
  final double brightness;
  final bool lowBattery;
  final double size;

  @override
  State<LedRing> createState() => _LedRingState();
}

class _LedRingState extends State<LedRing> with SingleTickerProviderStateMixin {
  late final AnimationController _anim =
      AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat();

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (context, _) => CustomPaint(
        size: Size.square(widget.size),
        painter: _RingPainter(
          leds: _leds(_anim.value),
          body: Theme.of(context).colorScheme.surfaceContainerHighest,
        ),
      ),
    );
  }

  /// Farbe jeder LED für den Animationszeitpunkt [t] (0..1).
  List<Color?> _leds(double t) {
    const n = 12;
    final pulse = 0.55 + 0.45 * sin(t * 2 * pi);
    final blink = (t * 4).floor().isEven;
    final c = widget.color;
    Color? dim(Color color, double f) => color.withValues(alpha: (f * widget.brightness).clamp(0, 1));

    List<Color?> filled(Color color, {double rest = 0.08}) => [
          for (var i = 0; i < n; i++) dim(color, i < (widget.fill * n).ceil() ? 1 : rest),
        ];

    final leds = switch (widget.mode) {
      LedMode.off => List<Color?>.filled(n, null),
      LedMode.booting => [for (var i = 0; i < n; i++) dim(HSVColor.fromAHSV(1, (i / n + t) * 360 % 360, 0.8, 1).toColor(), 1)],
      LedMode.idle => [for (var i = 0; i < n; i++) i == (t * n).floor() % n ? dim(Colors.white, 0.5) : null],
      LedMode.playing => filled(c),
      LedMode.paused => [for (final l in filled(c)) l?.withValues(alpha: l.a * pulse)],
      LedMode.volume => filled(Colors.white, rest: 0.04),
      LedMode.learn => List<Color?>.filled(n, dim(Colors.blue, pulse)),
      LedMode.unknownToken => List<Color?>.filled(n, blink ? dim(Colors.orange, 1) : null),
      LedMode.denied => List<Color?>.filled(n, dim(Colors.purple, pulse)),
      LedMode.locked => List<Color?>.filled(n, blink ? dim(Colors.red, 1) : null),
      LedMode.charging => [
          for (var i = 0; i < n; i++)
            i < (widget.fill * n).floor()
                ? dim(Colors.green, 1)
                : i == (widget.fill * n).floor()
                    ? dim(Colors.green, pulse)
                    : dim(Colors.green, 0.06),
        ],
      LedMode.lowBattery => List<Color?>.filled(n, blink ? dim(Colors.red, 1) : null),
    };
    if (widget.lowBattery && widget.mode != LedMode.off) leds[0] = blink ? dim(Colors.red, 1) : null;
    return leds;
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({required this.leds, required this.body});

  final List<Color?> leds;
  final Color body;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = size.width * 0.38;
    final ledRadius = size.width * 0.055;
    canvas.drawCircle(center, size.width * 0.48, Paint()..color = body);
    for (var i = 0; i < leds.length; i++) {
      final angle = -pi / 2 + i * 2 * pi / leds.length;
      final pos = center + Offset(cos(angle), sin(angle)) * radius;
      final color = leds[i];
      canvas.drawCircle(pos, ledRadius, Paint()..color = Colors.black.withValues(alpha: 0.35));
      if (color != null && color.a > 0.01) {
        canvas.drawCircle(pos, ledRadius * 2.2,
            Paint()
              ..color = color.withValues(alpha: color.a * 0.45)
              ..maskFilter = MaskFilter.blur(BlurStyle.normal, ledRadius));
        canvas.drawCircle(pos, ledRadius, Paint()..color = color);
      }
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) => true;
}
