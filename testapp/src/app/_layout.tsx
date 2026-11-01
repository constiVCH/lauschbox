import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColors, useIsDark } from '@/theme';

export default function RootLayout() {
  const c = useColors();
  const dark = useIsDark();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="demo" />
        <Stack.Screen name="hardware" />
        <Stack.Screen
          name="token-edit"
          options={{ presentation: 'modal', headerShown: false, contentStyle: { backgroundColor: c.bg } }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
