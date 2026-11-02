import { Alert, Platform } from 'react-native';

/** Rückfrage vor folgenreichen Aktionen (Ausschalten, Konto abmelden …). Auf dem Handy als Dialog, im Browser per confirm. */
export function confirm(title: string, message: string, action: string, destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Abbrechen', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}
