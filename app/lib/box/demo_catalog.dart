import 'package:flutter/material.dart';

import '../models.dart';

/// Ausgedachte Titel für die Demo-Suche (keine echten Spotify-Inhalte).
List<Track> _episodes(String prefix, List<int> minutes) => [
      for (var i = 0; i < minutes.length; i++) Track('$prefix ${i + 1}', Duration(minutes: minutes[i], seconds: 17 * i % 60)),
    ];

final demoCatalog = <Medium>[
  Medium(
    uri: 'spotify:album:demo-drache-funkel-1',
    title: 'Drache Funkel – Folge 1: Das verlorene Feuer',
    artist: 'Drache Funkel',
    kind: MediumKind.album,
    coverColor: Colors.deepOrange,
    coverEmoji: '🐉',
    tracks: _episodes('Kapitel', [4, 5, 3, 6, 4, 5, 3]),
  ),
  Medium(
    uri: 'spotify:album:demo-drache-funkel-2',
    title: 'Drache Funkel – Folge 2: Funkel lernt fliegen',
    artist: 'Drache Funkel',
    kind: MediumKind.album,
    coverColor: Colors.orange,
    coverEmoji: '🐲',
    tracks: _episodes('Kapitel', [5, 4, 4, 6, 5, 3]),
  ),
  Medium(
    uri: 'spotify:album:demo-kapitaen-kraut',
    title: 'Kapitän Kraut und die Gurkeninsel',
    artist: 'Kapitän Kraut',
    kind: MediumKind.album,
    coverColor: Colors.teal,
    coverEmoji: '🏴‍☠️',
    tracks: _episodes('Teil', [8, 7, 9, 6]),
  ),
  Medium(
    uri: 'spotify:playlist:demo-schlaflieder',
    title: 'Sanfte Schlaflieder',
    artist: 'Playlist · Lauschbox',
    kind: MediumKind.playlist,
    coverColor: Colors.indigo,
    coverEmoji: '🌙',
    tracks: [
      const Track('Der Mond geht auf', Duration(minutes: 3, seconds: 12)),
      const Track('Kleiner Stern', Duration(minutes: 2, seconds: 48)),
      const Track('Wolkenbett', Duration(minutes: 3, seconds: 40)),
      const Track('Gute Nacht, Igel', Duration(minutes: 2, seconds: 55)),
      const Track('Leise Wellen', Duration(minutes: 4, seconds: 5)),
    ],
  ),
  Medium(
    uri: 'spotify:playlist:demo-tanzparty',
    title: 'Kinderzimmer-Tanzparty',
    artist: 'Playlist · Lauschbox',
    kind: MediumKind.playlist,
    coverColor: Colors.pink,
    coverEmoji: '🕺',
    tracks: [
      const Track('Hüpf wie ein Frosch', Duration(minutes: 2, seconds: 31)),
      const Track('Der Staubsauger-Boogie', Duration(minutes: 3, seconds: 2)),
      const Track('Zahnputz-Rock', Duration(minutes: 2, seconds: 14)),
      const Track('Regenstiefel-Stampf', Duration(minutes: 2, seconds: 50)),
    ],
  ),
  Medium(
    uri: 'spotify:show:demo-sternenwald',
    title: 'Geschichten aus dem Sternenwald',
    artist: 'Lina Morgentau',
    kind: MediumKind.audiobook,
    coverColor: Colors.green,
    coverEmoji: '🌲',
    tracks: _episodes('Kapitel', [12, 10, 14, 11, 13, 9, 12, 10]),
  ),
  Medium(
    uri: 'spotify:album:demo-tierlexikon',
    title: 'Ohren auf! Das Tierlexikon',
    artist: 'Ohren auf!',
    kind: MediumKind.album,
    coverColor: Colors.brown,
    coverEmoji: '🦔',
    tracks: _episodes('Tier', [3, 3, 4, 3, 2, 4, 3, 3, 4]),
  ),
  Medium(
    uri: 'spotify:album:demo-robo-rudi',
    title: 'Robo Rudi rettet den Rummel',
    artist: 'Robo Rudi',
    kind: MediumKind.album,
    coverColor: Colors.blueGrey,
    coverEmoji: '🤖',
    tracks: _episodes('Kapitel', [6, 5, 7, 5, 6]),
  ),
];
