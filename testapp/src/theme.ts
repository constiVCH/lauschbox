import { useColorScheme, type TextStyle } from 'react-native';

/**
 * Farben der Lauschbox: Koralle (Kiste) auf Nachtblau, wie im Logo (brand/logo.svg).
 * Dunkel ist der Normalfall (abends am Kinderbett); hell bleibt warm statt reinweiß.
 */
const dark = {
  bg: '#1B2333',
  surface: '#232D41',
  surfaceRaised: '#3A4762',
  fill: 'rgba(255,255,255,0.08)',
  fillStrong: 'rgba(255,255,255,0.14)',
  text: '#F4F1EC',
  textSecondary: 'rgba(244,241,236,0.66)',
  textTertiary: 'rgba(244,241,236,0.42)',
  accent: '#E8663D',
  accentText: '#FFB69C',
  onAccent: '#FFFFFF',
  boxBody: '#E8663D',
  boxShade: '#B04224',
  boxWell: '#141A27',
  glow: '#FFBE5C',
  success: '#4CC38A',
  warning: '#F2B33D',
  danger: '#FF7A6B',
  learn: '#5B9BFF',
  material: 'rgba(27,35,51,0.72)',
  materialSolid: '#1F283A',
  scrim: 'rgba(8,11,18,0.55)',
};

const light: typeof dark = {
  bg: '#F5F1EA',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  fill: 'rgba(27,35,51,0.06)',
  fillStrong: 'rgba(27,35,51,0.11)',
  text: '#1B2333',
  textSecondary: 'rgba(27,35,51,0.66)',
  textTertiary: 'rgba(27,35,51,0.42)',
  accent: '#D2552D',
  accentText: '#B5441F',
  onAccent: '#FFFFFF',
  boxBody: '#E8663D',
  boxShade: '#B04224',
  boxWell: '#1B2333',
  glow: '#FFBE5C',
  success: '#1F9D63',
  warning: '#B97B0B',
  danger: '#D33C2E',
  learn: '#2F74E0',
  material: 'rgba(245,241,234,0.78)',
  materialSolid: '#EEE8DF',
  scrim: 'rgba(27,35,51,0.35)',
};

export type Colors = typeof dark;

export function useColors(): Colors {
  return useColorScheme() === 'light' ? light : dark;
}

export function useIsDark(): boolean {
  return useColorScheme() !== 'light';
}

/**
 * Schriftskala auf der Systemschrift. Tracking hängt von der Größe ab:
 * große Titel enger, kleine Schrift leicht weiter. Zeilenhöhe wird mit wachsender Größe relativ enger.
 */
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.7 },
  title: { fontSize: 26, lineHeight: 31, fontWeight: '700', letterSpacing: -0.5 },
  title2: { fontSize: 21, lineHeight: 26, fontWeight: '600', letterSpacing: -0.3 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400', letterSpacing: 0 },
  callout: { fontSize: 16, lineHeight: 22, fontWeight: '400', letterSpacing: 0 },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: 0 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: 0.1 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.3 },
  mono: { fontSize: 15, lineHeight: 20, fontWeight: '500', letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

/** Abstände im 4er-Raster. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;

/**
 * Federn statt fester Dauer (Reanimated: duration = wahrgenommene Antwortzeit in ms).
 * Standard ohne Überschwingen; leichtes Nachfedern nur, wenn die Geste selbst Schwung hatte.
 */
export const springs = {
  press: { dampingRatio: 1, duration: 160 },
  ui: { dampingRatio: 1, duration: 380 },
  momentum: { dampingRatio: 0.8, duration: 420 },
} as const;

/** Farben, die ein Token haben kann. Sie erscheinen auch auf dem LED-Ring. */
export const tokenColors = [
  '#FF5A4E',
  '#FF8A3D',
  '#FFC23D',
  '#5BCB6E',
  '#2EC4B6',
  '#3DB8F5',
  '#4D7CFF',
  '#7B61FF',
  '#C263E8',
  '#FF5FA2',
];

export const tokenColorNames = ['Rot', 'Orange', 'Gelb', 'Grün', 'Türkis', 'Hellblau', 'Blau', 'Violett', 'Lila', 'Pink'];
