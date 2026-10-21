import 'dart:async';

import 'package:flutter/material.dart';

import '../box/box_connection.dart';
import '../models.dart';
import 'widgets.dart';

/// Spotify-Suche (läuft später über GET /api/spotify/search der Box).
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, required this.box});
  final BoxConnection box;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  Timer? _debounce;
  List<Medium>? _results;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _search('');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _onChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => _search(q));
  }

  Future<void> _search(String q) async {
    setState(() {
      _query = q;
      _results = null;
    });
    final results = await widget.box.search(q);
    if (mounted && q == _query) setState(() => _results = results);
  }

  @override
  Widget build(BuildContext context) {
    final results = _results;
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Hörspiel, Hörbuch, Playlist …', border: InputBorder.none),
          onChanged: _onChanged,
          onSubmitted: _search,
        ),
      ),
      body: Column(children: [
        if (widget.box.isDemo)
          Container(
            width: double.infinity,
            color: Theme.of(context).colorScheme.secondaryContainer,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: const Text('Demo-Katalog: ausgedachte Titel, noch keine echte Spotify-Suche'),
          ),
        Expanded(
          child: results == null
              ? const Center(child: CircularProgressIndicator())
              : results.isEmpty
                  ? const Center(child: Text('Nichts gefunden'))
                  : ListView.builder(
                      itemCount: results.length,
                      itemBuilder: (context, i) {
                        final m = results[i];
                        return ListTile(
                          leading: CoverArt(medium: m, size: 48),
                          title: Text(m.title),
                          subtitle: Text('${m.artist} · ${m.kind.label} · ${formatDuration(m.totalDuration)}'),
                          onTap: () => Navigator.pop(context, m),
                        );
                      },
                    ),
        ),
      ]),
    );
  }
}
