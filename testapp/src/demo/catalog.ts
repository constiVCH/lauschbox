/** Ausgedachte Titel für die Demo (keine echten Spotify-Inhalte). Entspricht app/lib/box/demo_catalog.dart. */

export type MediumKind = 'Album' | 'Playlist' | 'Hörbuch';

export type Track = { title: string; seconds: number };

export type Medium = {
  uri: string;
  title: string;
  artist: string;
  kind: MediumKind;
  tracks: Track[];
  /** Platzhalter fürs Cover, solange es keine echten Bilder gibt. */
  cover: string;
  emoji: string;
};

const episodes = (prefix: string, minutes: number[]): Track[] =>
  minutes.map((m, i) => ({ title: `${prefix} ${i + 1}`, seconds: m * 60 + ((17 * i) % 60) }));

export const catalog: Medium[] = [
  {
    uri: 'spotify:album:demo-drache-funkel-1',
    title: 'Drache Funkel – Folge 1: Das verlorene Feuer',
    artist: 'Drache Funkel',
    kind: 'Album',
    cover: '#E8663D',
    emoji: '🐉',
    tracks: episodes('Kapitel', [4, 5, 3, 6, 4, 5, 3]),
  },
  {
    uri: 'spotify:album:demo-drache-funkel-2',
    title: 'Drache Funkel – Folge 2: Funkel lernt fliegen',
    artist: 'Drache Funkel',
    kind: 'Album',
    cover: '#F29A3A',
    emoji: '🐲',
    tracks: episodes('Kapitel', [5, 4, 4, 6, 5, 3]),
  },
  {
    uri: 'spotify:album:demo-kapitaen-kraut',
    title: 'Kapitän Kraut und die Gurkeninsel',
    artist: 'Kapitän Kraut',
    kind: 'Album',
    cover: '#2A9D8F',
    emoji: '🏴‍☠️',
    tracks: episodes('Teil', [8, 7, 9, 6]),
  },
  {
    uri: 'spotify:playlist:demo-schlaflieder',
    title: 'Sanfte Schlaflieder',
    artist: 'Playlist · Lauschbox',
    kind: 'Playlist',
    cover: '#4F5BD5',
    emoji: '🌙',
    tracks: [
      { title: 'Der Mond geht auf', seconds: 192 },
      { title: 'Kleiner Stern', seconds: 168 },
      { title: 'Wolkenbett', seconds: 220 },
      { title: 'Gute Nacht, Igel', seconds: 175 },
      { title: 'Leise Wellen', seconds: 245 },
    ],
  },
  {
    uri: 'spotify:playlist:demo-tanzparty',
    title: 'Kinderzimmer-Tanzparty',
    artist: 'Playlist · Lauschbox',
    kind: 'Playlist',
    cover: '#E84D8A',
    emoji: '🕺',
    tracks: [
      { title: 'Hüpf wie ein Frosch', seconds: 151 },
      { title: 'Der Staubsauger-Boogie', seconds: 182 },
      { title: 'Zahnputz-Rock', seconds: 134 },
      { title: 'Regenstiefel-Stampf', seconds: 170 },
    ],
  },
  {
    uri: 'spotify:show:demo-sternenwald',
    title: 'Geschichten aus dem Sternenwald',
    artist: 'Lina Morgentau',
    kind: 'Hörbuch',
    cover: '#3F9D5A',
    emoji: '🌲',
    tracks: episodes('Kapitel', [12, 10, 14, 11, 13, 9, 12, 10]),
  },
  {
    uri: 'spotify:album:demo-tierlexikon',
    title: 'Ohren auf! Das Tierlexikon',
    artist: 'Ohren auf!',
    kind: 'Album',
    cover: '#8C6A4F',
    emoji: '🦔',
    tracks: episodes('Tier', [3, 3, 4, 3, 2, 4, 3, 3, 4]),
  },
  {
    uri: 'spotify:album:demo-robo-rudi',
    title: 'Robo Rudi rettet den Rummel',
    artist: 'Robo Rudi',
    kind: 'Album',
    cover: '#5E7690',
    emoji: '🤖',
    tracks: episodes('Kapitel', [6, 5, 7, 5, 6]),
  },
];

export const mediumByUri = (uri: string) => catalog.find((m) => m.uri === uri);

export const totalSeconds = (m: Medium) => m.tracks.reduce((s, t) => s + t.seconds, 0);

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
