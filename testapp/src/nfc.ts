type Mod = typeof import('react-native-nfc-manager');

/**
 * Token-UID mit dem NFC des Handys lesen. Das Modul erst bei Bedarf laden: In Expo Go fehlt es, und ein Import
 * beim Start würde die ganze App abstürzen lassen.
 */
function manager(): { nfc: Mod['default']; NfcTech: Mod['NfcTech'] } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-nfc-manager') as Mod;
    return { nfc: mod.default, NfcTech: mod.NfcTech };
  } catch {
    return null;
  }
}

export async function nfcSupported(): Promise<boolean> {
  try {
    const m = manager();
    return !!m && (await m.nfc.isSupported());
  } catch {
    return false;
  }
}

/** Wartet, bis ein Token ans Handy gehalten wird. UID in Kleinbuchstaben wie beim PN532 der Box, null bei Abbruch. */
export async function readTokenUid(): Promise<string | null> {
  const m = manager();
  if (!m) throw new Error('NFC ist in dieser App-Version nicht verfügbar.');
  await m.nfc.start();
  if (!(await m.nfc.isEnabled())) throw new Error('NFC ist am Handy ausgeschaltet. In den Einstellungen einschalten.');
  try {
    await m.nfc.requestTechnology(m.NfcTech.NfcA);
    const tag = await m.nfc.getTag();
    return tag?.id ? tag.id.toLowerCase() : null;
  } catch {
    return null; // abgebrochen (cancelTokenRead) oder Token zu kurz gehalten
  } finally {
    m.nfc.cancelTechnologyRequest().catch(() => {});
  }
}

export function cancelTokenRead() {
  manager()
    ?.nfc.cancelTechnologyRequest()
    .catch(() => {});
}
