import { catalog, mediumByUri, totalSeconds, type Medium as DemoMedium } from '@/demo/catalog';
import { demoBox, type BoxState } from '@/demo/demoBox';

import type { BoxApi, BoxView, Medium } from './types';

const DEMO_PIN = '1234';

export function demoMedium(m: DemoMedium): Medium {
  return {
    uri: m.uri,
    title: m.title,
    kind: m.kind,
    kindLabel: m.kind,
    color: m.cover,
    emoji: m.emoji,
    trackCount: m.tracks.length,
    durationS: totalSeconds(m),
  };
}

/** Zustand der simulierten Box → gemeinsame Sicht. */
export function demoView(s: BoxState): BoxView {
  const tokens = s.tokens.map((t) => {
    const m = mediumByUri(t.mediumUri) ?? catalog[0];
    const done = m.tracks.slice(0, t.progress.track).reduce((a, tr) => a + tr.seconds, 0) + t.progress.position;
    const total = totalSeconds(m);
    return {
      uid: t.uid,
      name: t.name,
      color: t.color,
      medium: demoMedium(m),
      progress: {
        trackNumber: t.progress.track + 1,
        trackName: m.tracks[t.progress.track]?.title,
        positionS: t.progress.position,
        finished: t.progress.finished,
        fraction: t.progress.finished ? 1 : total ? done / total : 0,
      },
    };
  });
  const placedToken = s.tokens.find((t) => t.uid === s.placed);
  const medium = placedToken ? mediumByUri(placedToken.mediumUri) : undefined;
  const track = medium?.tracks[s.track];
  return {
    kind: 'demo',
    name: 'Demo-Box',
    connection: 'online',
    tokens,
    placed: s.placed,
    loadedUid: placedToken?.uid ?? null,
    now:
      medium && track
        ? {
            trackTitle: track.title,
            trackNumber: s.track + 1,
            trackCount: medium.tracks.length,
            positionS: s.position,
            durationS: track.seconds,
            playing: s.playing,
          }
        : null,
    playerAvailable: true,
    volume: s.volume,
    volumeCap: demoBox.volumeCap(s),
    locked: s.locked,
    bedtimeActive: s.kid.enabled && s.bedtime,
    sleep: s.sleep.kind === 'minutes' ? { kind: 'minutes', remainingS: s.sleep.remaining, totalS: s.sleep.total } : s.sleep,
    learning: s.learning,
    learnedUid: s.learnedUid,
    kid: {
      enabled: s.kid.enabled,
      maxVolume: s.kid.maxVolume,
      noAutoplay: s.kid.noAutoplay,
      bedtimeEnabled: true,
      bedtimeFrom: '19:30',
      bedtimeTo: '07:00',
      bedtimeMaxVolume: s.kid.bedtimeMaxVolume,
      knownTokensOnly: s.kid.knownTokensOnly,
    },
    led: s.led,
    notice: s.notice,
    sim: { tray: s.tray },
    demo: { speed: s.speed, bedtime: s.bedtime },
  };
}

export const demoApi: BoxApi = {
  togglePlay: demoBox.togglePlay,
  restart: demoBox.restart,
  skip: demoBox.skip,
  seek: demoBox.seek,
  setVolume: (v) => demoBox.setVolume(v),
  boxButton: (b) => {
    demoBox.boxButton(b);
  },
  setLock: (locked) => {
    if (locked !== demoBox.get().locked) demoBox.toggleLock();
  },
  setSleep: (sleep) =>
    demoBox.setSleep(sleep.kind === 'minutes' ? { kind: 'minutes', remaining: sleep.minutes * 60, total: sleep.minutes * 60 } : sleep),
  startLearn: demoBox.startLearn,
  cancelLearn: demoBox.cancelLearn,
  saveToken: async ({ uid, name, color, medium }) => demoBox.saveToken({ uid, name, color, mediumUri: medium.uri }),
  deleteToken: async (uid) => demoBox.deleteToken(uid),
  dismissNotice: demoBox.dismissNotice,
  verifyPin: async (pin) => pin === DEMO_PIN,
  setKid: async (patch) => {
    const { enabled, maxVolume, noAutoplay, bedtimeMaxVolume, knownTokensOnly } = patch;
    demoBox.setKid(
      Object.fromEntries(
        Object.entries({ enabled, maxVolume, noAutoplay, bedtimeMaxVolume, knownTokensOnly }).filter(([, v]) => v !== undefined),
      ),
    );
  },
  place: (uid) => demoBox.place(uid),
  remove: demoBox.remove,
  catalog: catalog.map(demoMedium),
  demo: { setSpeed: demoBox.setSpeed, setBedtime: demoBox.setBedtime },
};

