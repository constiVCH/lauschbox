import 'dart:async';

import 'package:flutter/material.dart';

import '../box/box_connection.dart';
import '../box/demo_box.dart';
import '../models.dart';
import 'parent_gate.dart';
import 'token_edit_screen.dart';
import 'widgets.dart';

class TokensTab extends StatelessWidget {
  const TokensTab({super.key, required this.box, required this.gate});
  final BoxConnection box;
  final ParentGate gate;

  Future<void> _edit(BuildContext context, String uid) async {
    if (!await gate.ensureAppOpen(context) || !context.mounted) return;
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => TokenEditScreen(box: box, uid: uid)));
  }

  Future<void> _learn(BuildContext context) async {
    if (!await gate.ensureAppOpen(context) || !context.mounted) return;
    final uid = await showDialog<String>(context: context, builder: (_) => _LearnDialog(box: box));
    if (uid != null && context.mounted) _edit(context, uid);
  }

  @override
  Widget build(BuildContext context) {
    final tokens = box.tokens;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _learn(context),
        icon: const Icon(Icons.add),
        label: const Text('Token anlernen'),
      ),
      body: tokens.isEmpty
          ? const Center(child: Text('Noch keine Token angelernt.'))
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              itemCount: tokens.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final t = tokens[i];
                final playing = box.player.token?.uid == t.uid;
                return Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    leading: CoverArt(medium: t.medium, size: 52, ring: t.color),
                    title: Text(t.name),
                    subtitle: Text('${t.medium.title}\n${_progressText(t)}', maxLines: 3),
                    isThreeLine: true,
                    trailing: playing
                        ? Icon(box.player.playing ? Icons.graphic_eq : Icons.pause, color: t.color)
                        : const Icon(Icons.chevron_right),
                    onTap: () => _edit(context, t.uid),
                  ),
                );
              },
            ),
    );
  }

  static String _progressText(TokenConfig t) {
    final p = t.progress;
    if (p.finished) return 'Fertig gehört';
    if (p.trackIndex == 0 && p.position == Duration.zero) return 'Noch nicht gehört';
    final track = t.medium.tracks[p.trackIndex];
    return 'Weiter bei ${track.title}, ${formatDuration(p.position)}';
  }
}

/// Lernmodus: wartet auf den nächsten aufgelegten Token und gibt seine UID zurück.
class _LearnDialog extends StatefulWidget {
  const _LearnDialog({required this.box});
  final BoxConnection box;

  @override
  State<_LearnDialog> createState() => _LearnDialogState();
}

class _LearnDialogState extends State<_LearnDialog> {
  late final StreamSubscription<BoxEvent> _sub;

  @override
  void initState() {
    super.initState();
    _sub = widget.box.events.listen((e) {
      if (e is LearnedUidEvent && mounted) Navigator.pop(context, e.uid);
    });
    widget.box.startLearn();
  }

  @override
  void dispose() {
    _sub.cancel();
    if (widget.box.learning) widget.box.cancelLearn();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final box = widget.box;
    return AlertDialog(
      icon: const Icon(Icons.nfc, size: 40, color: Colors.blue),
      title: const Text('Token auflegen'),
      content: ListenableBuilder(
        listenable: box,
        builder: (context, _) => Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Die Box ist im Lernmodus (LED-Ring pulsiert blau).\n'
              'Leg jetzt den neuen Token auf.\n\n'
              'Liegt schon ein Token auf der Box, nimm ihn kurz ab und leg ihn wieder auf.'),
          const SizedBox(height: 16),
          const LinearProgressIndicator(),
          if (box is DemoBox) ...[
            const SizedBox(height: 16),
            const Text('Demo: Token wählen'),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final uid in box.blankUids)
                ActionChip(label: Text('Leer ${uid.substring(3, 8)}'), onPressed: () => box.placeToken(uid)),
              ActionChip(avatar: const Icon(Icons.add, size: 18), label: const Text('Neuer leerer Token'), onPressed: () {
                box.addBlankToken();
                box.placeToken(box.blankUids.last);
              }),
            ]),
          ],
        ]),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Abbrechen'))],
    );
  }
}
