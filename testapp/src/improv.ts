import { PermissionsAndroid, Platform } from 'react-native';

/**
 * WLAN-Einrichtung der Box per Bluetooth nach dem Protokoll „Improv Wi-Fi“ (Gegenstück: box/lauschbox/wifi_setup.py).
 * Das Bluetooth-Modul erst bei Bedarf laden: In Expo Go fehlt es, ein Import beim Start würde die App abstürzen lassen.
 */
type Mod = typeof import('react-native-ble-plx');
type Manager = InstanceType<Mod['BleManager']>;
type Device = Awaited<ReturnType<Manager['connectToDevice']>>;

const SERVICE = '00467768-6228-2272-4663-277478268000';
const STATE = '00467768-6228-2272-4663-277478268001';
const ERROR = '00467768-6228-2272-4663-277478268002';
const RPC = '00467768-6228-2272-4663-277478268003';
const RESULT = '00467768-6228-2272-4663-277478268004';

export const AUTH_REQUIRED = 1;
export const AUTHORIZED = 2;
export const PROVISIONING = 3;
export const PROVISIONED = 4;

let manager: Manager | null = null;
function ble(): Manager | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-ble-plx') as Mod;
    manager ??= new mod.BleManager();
    return manager;
  } catch {
    return null;
  }
}

/** Fehlertext, wenn Bluetooth nicht geht, sonst null. Fragt unter Android die Berechtigungen ab. */
export async function bluetoothProblem(): Promise<string | null> {
  const m = ble();
  if (!m) return 'Bluetooth ist in dieser App-Version nicht verfügbar.';
  if (Platform.OS === 'android') {
    const P = PermissionsAndroid.PERMISSIONS;
    const wanted = Platform.Version >= 31 ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT] : [P.ACCESS_FINE_LOCATION];
    const granted = await PermissionsAndroid.requestMultiple(wanted);
    if (wanted.some((p) => granted[p] !== PermissionsAndroid.RESULTS.GRANTED)) return 'Ohne Bluetooth-Berechtigung findet die App die Box nicht.';
  }
  if ((await m.state()) !== 'PoweredOn') return 'Bluetooth ist am Handy ausgeschaltet.';
  return null;
}

/** Sucht Boxen, die auf die WLAN-Einrichtung warten. Gibt die Funktion zum Beenden zurück. */
export function scan(onFound: (box: { id: string; name: string }) => void): () => void {
  const m = ble();
  if (!m) return () => {};
  const seen = new Set<string>();
  // Ohne Filter suchen: Der lange Dienstname passt nicht immer zusammen mit dem Gerätenamen in die Werbung
  m.startDeviceScan(null, null, (error, device) => {
    if (error || !device || seen.has(device.id)) return;
    const name = device.localName ?? device.name ?? '';
    if (!device.serviceUUIDs?.includes(SERVICE) && name !== 'Lauschbox') return;
    seen.add(device.id);
    onFound({ id: device.id, name: name || 'Lauschbox' });
  });
  return () => m.stopDeviceScan();
}

const toBase64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (b64: string | null | undefined) => Array.from(atob(b64 ?? ''), (ch) => ch.charCodeAt(0));

function utf8(text: string): number[] {
  const encoded = encodeURIComponent(text);
  const out: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '%') {
      out.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(encoded.charCodeAt(i));
  }
  return out;
}

/** [Befehl, Länge, (Länge, Text)…, Prüfsumme] */
function packet(command: number, texts: string[]): number[] {
  const body = texts.flatMap((t) => {
    const bytes = utf8(t);
    return [bytes.length, ...bytes];
  });
  const head = [command, body.length, ...body];
  return [...head, head.reduce((a, b) => a + b, 0) & 0xff];
}

export type BoxLink = {
  /** Netzname und Passwort schicken; liefert die Adresse der Box im WLAN (http://IP:8080) */
  sendWifi(ssid: string, password: string): Promise<string>;
  close(): void;
};

/** Mit der Box verbinden. onState meldet jede Änderung (z. B. wenn an der Box Play gedrückt wurde). */
export async function connect(id: string, onState: (state: number) => void): Promise<BoxLink> {
  const m = ble();
  if (!m) throw new Error('Bluetooth ist in dieser App-Version nicht verfügbar.');
  // Größere Pakete aushandeln: Netzname und Passwort passen sonst nicht in eine Nachricht
  const device: Device = await m.connectToDevice(id, { requestMTU: 185 });
  await device.discoverAllServicesAndCharacteristics();
  let pending: { resolve: (url: string) => void; reject: (e: Error) => void } | null = null;

  const subs = [
    device.monitorCharacteristicForService(SERVICE, STATE, (_e, ch) => ch && onState(fromBase64(ch.value)[0])),
    device.monitorCharacteristicForService(SERVICE, ERROR, (_e, ch) => {
      const code = ch ? fromBase64(ch.value)[0] : 0;
      if (!code || !pending) return;
      const text =
        code === 3
          ? 'Die Box kommt nicht ins WLAN. Netzname und Passwort prüfen (nur 2,4 GHz).'
          : code === 4
            ? 'Die Box wartet noch auf den Druck auf Play.'
            : `Die Box meldet Fehler ${code}.`;
      pending.reject(new Error(text));
      pending = null;
    }),
    device.monitorCharacteristicForService(SERVICE, RESULT, (_e, ch) => {
      const bytes = ch ? fromBase64(ch.value) : [];
      if (bytes.length < 4 || !pending) return;
      // [Befehl, Länge, Länge der Adresse, Adresse…, Prüfsumme]
      pending.resolve(String.fromCharCode(...bytes.slice(3, 3 + bytes[2])));
      pending = null;
    }),
  ];
  const first = await device.readCharacteristicForService(SERVICE, STATE);
  onState(fromBase64(first.value)[0]);

  return {
    sendWifi: (ssid, password) =>
      new Promise<string>((resolve, reject) => {
        pending = { resolve, reject };
        device.writeCharacteristicWithResponseForService(SERVICE, RPC, toBase64(packet(1, [ssid, password]))).catch((e: Error) => {
          pending = null;
          reject(e);
        });
      }),
    close: () => {
      subs.forEach((s) => s.remove());
      device.cancelConnection().catch(() => {});
    },
  };
}
