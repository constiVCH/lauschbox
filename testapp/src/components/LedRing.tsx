import { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import type { LedMode } from '@/demo/demoBox';

const N = 12;

type Props = {
  mode: LedMode;
  color: string;
  /** 0..1, z. B. Hörfortschritt oder Lautstärke */
  fill: number;
  size: number;
  /** Farbe der Mulde, in der der Ring sitzt */
  well: string;
  /** Echte Helligkeit am Pi (0..1); die Vorschau bleibt ab 0,15 gut sichtbar */
  brightness?: number;
};

const ANIMATED: LedMode[] = ['idle', 'paused', 'learn', 'unknown', 'denied', 'locked'];

/** Zeichnet den WS2812-Ring (12 LEDs) so, wie ihn die Box ansteuert. */
export function LedRing({ mode, color, fill, size, well, brightness = 1 }: Props) {
  const reduceMotion = useReducedMotion();
  const t = useClock(ANIMATED.includes(mode) && !reduceMotion);
  const leds = ledColors(mode, color, fill, reduceMotion ? 0.25 : t);
  const r = size * 0.4;
  const ledR = size * 0.052;
  const gain = 0.35 + 0.65 * Math.min(1, brightness / 0.6);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#fff" stopOpacity="1" />
          <Stop offset="1" stopColor="#fff" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size * 0.49} fill={well} />
      {leds.map((led, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / N;
        const x = size / 2 + Math.cos(a) * r;
        const y = size / 2 + Math.sin(a) * r;
        const on = led && led.alpha > 0.02;
        return (
          <GroupLed key={i} x={x} y={y} r={ledR} color={on ? led.color : null} alpha={on ? led.alpha * gain : 0} />
        );
      })}
    </Svg>
  );
}

function GroupLed({ x, y, r, color, alpha }: { x: number; y: number; r: number; color: string | null; alpha: number }) {
  return (
    <>
      <Circle cx={x} cy={y} r={r} fill="#000" opacity={0.4} />
      {color && <Circle cx={x} cy={y} r={r * 2.4} fill={color} opacity={alpha * 0.32} />}
      {color && <Circle cx={x} cy={y} r={r} fill={color} opacity={Math.min(1, alpha + 0.1)} />}
      {color && <Circle cx={x - r * 0.25} cy={y - r * 0.25} r={r * 0.45} fill="url(#glow)" opacity={alpha * 0.5} />}
    </>
  );
}

type Led = { color: string; alpha: number } | null;

/** Farbe jeder LED zum Zeitpunkt t (Sekunden). Entspricht app/lib/ui/led_ring.dart. */
function ledColors(mode: LedMode, color: string, fill: number, t: number): Led[] {
  // 0,5 Hz: deutlich schneller als die unangenehmen ~0,2 Hz langsamer Pendelbewegungen
  const pulse = 0.55 + 0.45 * Math.sin(t * Math.PI);
  const blink = Math.floor(t * 4) % 2 === 0;
  const lit = Math.ceil(Math.max(0, Math.min(1, fill)) * N);
  const all = (c: string, a: number): Led[] => Array.from({ length: N }, () => ({ color: c, alpha: a }));
  const filled = (c: string, rest: number, a = 1): Led[] =>
    Array.from({ length: N }, (_, i) => ({ color: c, alpha: i < lit ? a : rest }));

  switch (mode) {
    case 'off':
      return Array(N).fill(null);
    case 'idle': {
      const head = Math.floor(t * 4) % N;
      return Array.from({ length: N }, (_, i) => (i === head ? { color: '#FFFFFF', alpha: 0.5 } : null));
    }
    case 'playing':
      return filled(color, 0.08);
    case 'paused':
      return filled(color, 0.06, pulse);
    case 'volume':
      return filled('#FFFFFF', 0.05);
    case 'learn':
      return all(color, pulse);
    case 'unknown':
    case 'locked':
      return all(color, blink ? 1 : 0);
    case 'denied':
      return all(color, pulse);
  }
}

/** Läuft nur, solange der Ring wirklich animiert. */
function useClock(active: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = 0;
    const start = Date.now();
    const loop = () => {
      const now = Date.now();
      // ~30 Bilder pro Sekunde reichen für 12 LEDs und schonen den Akku
      if (now - last > 33) {
        last = now;
        setT((now - start) / 1000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return t;
}
