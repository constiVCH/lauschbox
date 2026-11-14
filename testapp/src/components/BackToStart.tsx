import { router } from 'expo-router';

import { Button } from './ui';

/** Zurück zum Startbildschirm (Box verlassen). */
export function BackToStart() {
  return (
    <Button
      label="Start"
      icon="chevron-back"
      kind="plain"
      compact
      onPress={() => (router.canDismiss() ? router.dismissTo('/') : router.replace('/'))}
    />
  );
}
