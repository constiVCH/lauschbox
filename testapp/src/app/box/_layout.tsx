import { router, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { RequireBox, useBox } from '@/box/BoxContext';
import { NoticeToast } from '@/components/NoticeToast';
import { TabBar } from '@/components/TabBar';
import { useColors } from '@/theme';

/** Tabs für eine Box: Demo oder echte Box, je nachdem, was auf dem Startbildschirm gewählt wurde. */
export default function BoxLayout() {
  return (
    <RequireBox>
      <BoxTabs />
    </RequireBox>
  );
}

function BoxTabs() {
  const c = useColors();
  const { view } = useBox();
  const learnedUid = view.learnedUid;

  // Leerer Token im Lernmodus erkannt → direkt den Inhalt auswählen (egal, in welchem Tab man gerade ist)
  useEffect(() => {
    if (learnedUid) router.push({ pathname: '/token-edit', params: { uid: learnedUid, isNew: '1' } });
  }, [learnedUid]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}>
        <Tabs.Screen name="index" options={{ title: 'Box' }} />
        <Tabs.Screen name="tokens" options={{ title: 'Token' }} />
        <Tabs.Screen name="rules" options={{ title: 'Kindermodus' }} />
        <Tabs.Screen name="settings" options={{ title: 'Einstellungen' }} />
      </Tabs>
      <NoticeToast />
    </View>
  );
}
