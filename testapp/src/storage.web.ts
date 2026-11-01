/** Browser-Variante von storage.ts: localStorage statt SQLite (das bräuchte im Web eine WASM-Einrichtung). */
export async function load(key: string): Promise<string | null> {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function save(key: string, value: string): Promise<void> {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Privates Fenster o. Ä.: dann eben ohne Merken
  }
}
