import 'package:flutter/material.dart';

import '../box/box_connection.dart';
import '../box/demo_box.dart';
import '../models.dart';
import 'box_simulator.dart';
import 'widgets.dart';

class NowPlayingTab extends StatelessWidget {
  const NowPlayingTab({super.key, required this.box});
  final BoxConnection box;

  @override
  Widget build(BuildContext context) {
    final b = box;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (b is DemoBox) ...[BoxSimulator(box: b), const SizedBox(height: 16)],
        _PlayerCard(box: box),
        const SizedBox(height: 16),
        _StatusChips(box: box),
      ],
    );
  }
}

class _PlayerCard extends StatelessWidget {
  const _PlayerCard({required this.box});
  final BoxConnection box;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final p = box.player;
    final token = p.token;
    final track = p.track;

    if (box.power == PowerState.off) {
      return const _Placeholder(icon: Icons.power_settings_new, text: 'Die Box ist ausgeschaltet.');
    }
    if (box is DemoBox && (box as DemoBox).booting) {
      return const _Placeholder(icon: Icons.hourglass_top, text: 'Die Box startet …');
    }
    if (token == null || track == null) {
      return const _Placeholder(icon: Icons.nfc, text: 'Kein Token aufgelegt.\nLeg einen Token auf die Box, dann geht es los.');
    }

    final maxVolume = box.effectiveMaxVolume;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              CoverArt(medium: token.medium, size: 84, ring: token.color),
              const SizedBox(width: 16),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(token.name, style: text.titleLarge, maxLines: 1, overflow: TextOverflow.ellipsis),
                  Text(token.medium.title, style: text.bodyMedium, maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Text('${track.title} · ${p.trackIndex + 1} von ${token.medium.tracks.length}',
                      style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                ]),
              ),
            ]),
            const SizedBox(height: 8),
            Slider(
              value: p.position.inMilliseconds.clamp(0, track.duration.inMilliseconds).toDouble(),
              max: track.duration.inMilliseconds.toDouble(),
              onChanged: (v) => box.seek(Duration(milliseconds: v.round())),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Row(children: [
                Text(formatDuration(p.position), style: text.bodySmall),
                const Spacer(),
                Text(formatDuration(track.duration), style: text.bodySmall),
              ]),
            ),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              IconButton(iconSize: 32, onPressed: box.previousTrack, icon: const Icon(Icons.skip_previous)),
              const SizedBox(width: 8),
              IconButton.filled(
                iconSize: 40,
                onPressed: box.playPause,
                icon: Icon(p.playing ? Icons.pause : Icons.play_arrow),
              ),
              const SizedBox(width: 8),
              IconButton(iconSize: 32, onPressed: box.nextTrack, icon: const Icon(Icons.skip_next)),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              const Icon(Icons.volume_down),
              Expanded(
                child: Slider(
                  value: p.volume.toDouble(),
                  max: 100,
                  divisions: 100,
                  label: '${p.volume} %',
                  onChanged: (v) => box.setVolume(v.round()),
                ),
              ),
              SizedBox(width: 48, child: Text('${p.volume} %', textAlign: TextAlign.end)),
            ]),
            if (maxVolume < 100)
              Padding(
                padding: const EdgeInsets.only(left: 40),
                child: Text(
                  'Maximal $maxVolume %${box.isBedtime ? ' (Schlafenszeit)' : box.kidMode.enabled ? ' (Kindermodus)' : ''}',
                  style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ),
            const Divider(height: 32),
            _SleepTimer(box: box),
          ],
        ),
      ),
    );
  }
}

class _SleepTimer extends StatelessWidget {
  const _SleepTimer({required this.box});
  final BoxConnection box;

  @override
  Widget build(BuildContext context) {
    final left = box.sleepTimerRemaining;
    final afterTrack = box.sleepAfterTrack;
    final selected = afterTrack ? -1 : (left == null ? 0 : null);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        const Icon(Icons.bedtime_outlined, size: 20),
        const SizedBox(width: 8),
        Text('Sleep-Timer', style: Theme.of(context).textTheme.titleSmall),
        const Spacer(),
        if (left != null) Text('noch ${formatDuration(left)}'),
        if (afterTrack) const Text('nach diesem Titel'),
      ]),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 8, children: [
        ChoiceChip(label: const Text('Aus'), selected: selected == 0, onSelected: (_) => box.setSleepTimer(null)),
        for (final m in [15, 30, 45])
          ChoiceChip(
            label: Text('$m min'),
            selected: false,
            onSelected: (_) => box.setSleepTimer(Duration(minutes: m)),
          ),
        ChoiceChip(
          label: const Text('Nach diesem Titel'),
          selected: selected == -1,
          onSelected: (_) => box.setSleepTimer(null, afterTrack: true),
        ),
      ]),
    ]);
  }
}

class _StatusChips extends StatelessWidget {
  const _StatusChips({required this.box});
  final BoxConnection box;

  @override
  Widget build(BuildContext context) {
    final kid = box.kidMode;
    final listened = box.listenedToday.inMinutes;
    return Wrap(spacing: 8, runSpacing: 8, children: [
      Chip(
        avatar: Icon(kid.enabled ? Icons.child_care : Icons.child_care_outlined, size: 18),
        label: Text(kid.enabled ? 'Kindermodus an' : 'Kindermodus aus'),
      ),
      if (box.isBedtime) const Chip(avatar: Icon(Icons.bedtime, size: 18), label: Text('Schlafenszeit')),
      if (box.buttonsLocked) const Chip(avatar: Icon(Icons.lock, size: 18), label: Text('Tasten gesperrt')),
      Chip(
        avatar: const Icon(Icons.timer_outlined, size: 18),
        label: Text(kid.enabled && kid.dailyBudgetEnabled
            ? 'Heute $listened / ${kid.dailyBudgetMinutes} min'
            : 'Heute $listened min gehört'),
      ),
    ]);
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
        child: Column(children: [
          Icon(icon, size: 48, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(text, textAlign: TextAlign.center),
        ]),
      ),
    );
  }
}
