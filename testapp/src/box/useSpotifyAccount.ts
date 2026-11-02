import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useBox } from './BoxContext';
import type { SpotifyAccount } from './types';

/**
 * Spotify-Anmeldung der Box. Lädt beim Öffnen des Bildschirms neu; solange niemand angemeldet ist,
 * alle 5 s (dann ändert sich der Code für spotify.com/pair bzw. die Anmeldung kommt an).
 */
export function useSpotifyAccount() {
  const { api } = useBox();
  const [account, setAccount] = useState<SpotifyAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api.spotifyAccount) return;
    try {
      setAccount(await api.spotifyAccount());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const waiting = !!account && !account.username;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [waiting, load]);

  return { account, error, reload: load, supported: !!api.spotifyAccount };
}
