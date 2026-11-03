import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ActiveBoxProvider } from '@/box/BoxContext';
import { useColors, useIsDark } from '@/theme';

export default function RootLayout() {
  const c = useColors();
  const dark = useIsDark();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ActiveBoxProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="box" />
          <Stack.Screen name="hardware" />
          <Stack.Screen name="anleitung" />
          <Stack.Screen name="impressum" />
          <Stack.Screen name="token-edit" options={{ presentation: 'modal', contentStyle: { backgroundColor: c.bg } }} />
          <Stack.Screen name="spotify-setup" options={{ presentation: 'modal', contentStyle: { backgroundColor: c.bg } }} />
          <Stack.Screen name="log" options={{ presentation: 'modal', contentStyle: { backgroundColor: c.bg } }} />
        </Stack>
      </ActiveBoxProvider>
    </GestureHandlerRootView>
  );
}
