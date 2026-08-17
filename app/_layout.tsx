import { Stack } from 'expo-router';
import { AuthProvider } from '@/src/services/auth-context';
import { CartProvider } from '@/src/context/CartContext';
import { FavouritesProvider } from '@/src/context/FavouritesContext';
import { NotificationsProvider } from '@/src/context/NotificationsContext';
import { OnboardingProvider } from '@/src/context/OnboardingContext';
import { CustomerLocationProvider } from '@/src/context/CustomerLocationContext';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Keyboard, TextInput } from 'react-native';

// Keep Enter consistent across the app. Individual multiline fields explicitly
// opt back into newline behaviour.
const textInputDefaults = TextInput as typeof TextInput & {
  defaultProps?: Record<string, unknown>;
};
textInputDefaults.defaultProps = {
  ...textInputDefaults.defaultProps,
  returnKeyType: 'done',
  submitBehavior: 'blurAndSubmit',
  onSubmitEditing: Keyboard.dismiss,
};

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
      <CustomerLocationProvider>
        <CartProvider>
          <FavouritesProvider>
            <NotificationsProvider>
              <OnboardingProvider>
                <StatusBar style="dark" />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(user)/(tabs)" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(cook)" />
                  <Stack.Screen name="admin" />
                  <Stack.Screen name="+not-found" />
                </Stack>
              </OnboardingProvider>
            </NotificationsProvider>
          </FavouritesProvider>
        </CartProvider>
      </CustomerLocationProvider>
    </AuthProvider>
  );
}
