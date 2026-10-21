import 'package:flutter/material.dart';

import '../box/box_connection.dart';
import '../models.dart';
import 'search_screen.dart';
import 'widgets.dart';

/// Token anlegen oder ändern: Inhalt aus der Spotify-Suche, Name und Farbe.
class TokenEditScreen extends StatefulWidget {
  const TokenEditScreen({super.key, required this.box, required this.uid});
  final BoxConnection box;
  final String uid;

  @override
  State<TokenEditScreen> createState() => _TokenEditScreenState();
}

class _TokenEditScreenState extends State<TokenEditScreen> {
  late final TokenConfig? _existing = widget.box.tokens.where((t) => t.uid == widget.uid).firstOrNull;
  late final _name = TextEditingController(text: _existing?.name ?? '');
  late Color _color = _existing?.color ?? tokenColors[widget.box.tokens.length % tokenColors.length];
  late Medium? _medium = _existing?.medium;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _pickMedium() async {
    final medium = await Navigator.of(context).push<Medium>(
      MaterialPageRoute(builder: (_) => SearchScreen(box: widget.box)),
    );
    if (medium == null) return;
    setState(() {
      _medium = medium;
      if (_name.text.trim().isEmpty) _name.text = medium.title.split(' – ').first;
    });
  }

  Future<void> _save() async {
    final medium = _medium!;
    final name = _name.text.trim().isEmpty ? medium.title : _name.text.trim();
    await widget.box.saveToken(TokenConfig(
      uid: widget.uid,
      name: name,
      color: _color,
      medium: medium,
      progress: _existing?.progress ?? const Progress(),
    ));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('„$name“ gespeichert')));
    Navigator.pop(context);
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Token löschen?'),
        content: Text('„${_existing!.name}“ wird von der Box entfernt. Der Token selbst kann neu angelernt werden.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Löschen')),
        ],
      ),
    );
    if (ok != true) return;
    await widget.box.deleteToken(widget.uid);
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final medium = _medium;
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(_existing == null ? 'Neuer Token' : 'Token bearbeiten')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('UID ${widget.uid}', style: text.bodySmall),
              const SizedBox(height: 16),
              Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.all(12),
                  leading: medium == null
                      ? const CircleAvatar(radius: 26, child: Icon(Icons.search))
                      : CoverArt(medium: medium, size: 52),
                  title: Text(medium?.title ?? 'Inhalt auswählen'),
                  subtitle: Text(medium == null
                      ? 'Album, Playlist oder Hörbuch von Spotify'
                      : '${medium.artist} · ${medium.kind.label} · ${medium.tracks.length} Titel · ${formatDuration(medium.totalDuration)}'),
                  trailing: const Icon(Icons.edit),
                  onTap: _pickMedium,
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder()),
                textCapitalization: TextCapitalization.sentences,
              ),
              const SizedBox(height: 24),
              Text('Farbe (für LED-Ring und App)', style: text.labelLarge),
              const SizedBox(height: 8),
              Wrap(spacing: 10, runSpacing: 10, children: [
                for (final c in tokenColors)
                  InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () => setState(() => _color = c),
                    child: CircleAvatar(
                      radius: 20,
                      backgroundColor: c,
                      child: c == _color ? const Icon(Icons.check, color: Colors.white) : null,
                    ),
                  ),
              ]),
              const SizedBox(height: 32),
              FilledButton.icon(
                onPressed: medium == null ? null : _save,
                icon: const Icon(Icons.save),
                label: const Text('Speichern'),
              ),
              if (_existing != null) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () async {
                    await widget.box.resetProgress(widget.uid);
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Hörstand zurückgesetzt')));
                    }
                  },
                  icon: const Icon(Icons.restart_alt),
                  label: const Text('Hörstand zurücksetzen'),
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: _delete,
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Token löschen'),
                  style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
