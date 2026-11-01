import Storage from 'expo-sqlite/kv-store';

/** Kleine Merkhilfen (letzte Pi-Adresse). Fehler beim Speichern sind hier egal. */
export async function load(key: string): Promise<string | null> {
  try {
    return await Storage.getItem(key);
  } catch {
    return null;
  }
}

export async function save(key: string, value: string): Promise<void> {
  try {
    await Storage.setItem(key, value);
  } catch {
    // Ohne Speicher muss man die Adresse eben neu eintippen
  }
}
