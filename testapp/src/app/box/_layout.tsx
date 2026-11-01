import { router, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { NoticeToast } from '@/components/NoticeToast';
import { TabBar } from '@/components/TabBar';
import { useDemoBox } from '@/demo/demoBox';
import { useColors } from '@/theme';

export default function DemoLayout() {
  const c = useColors();
  const { learnedUid } = useDemoBox();

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
      </Tabs>
      <NoticeToast />
    </View>
  );
}
