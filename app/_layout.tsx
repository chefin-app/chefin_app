import { Stack } from 'expo-router';
import { AuthProvider } from '@/src/services/auth-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useFonts } from 'expo-font';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    mon: require('@/src/assets/fonts/Montserrat-Regular.ttf'),
    'mon-sb': require('@/src/assets/fonts/Montserrat-SemiBold.ttf'),
    'mon-b': require('@/src/assets/fonts/Montserrat-Bold.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(user)/(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(cook)" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </AuthProvider>
  );
}
