//import FontAwesome from '@expo/vector-icons/FontAwesome';
//import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Session } from '@supabase/supabase-js';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';
import { AuthProvider, useAuth } from '../src/utils/auth-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../src/utils/supabaseClient';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(user)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Separate component to handle navigation logic that needs auth context
function NavigationHandler({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();
  const segments = useSegments() as string[];
  const router = useRouter();

  useEffect(() => {
    // Don't navigate if still initializing auth
    if (initializing) return;

    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return;
    }
    // Check if user is currently on an auth page (login, register, etc.)
    const inAuthGroup = segments[0] === '(auth)';

    // Define which pages require authentication
    const protectedPages = ['account', 'profile', 'settings'];
    const currentPage = segments[2]; // For (user)/(tabs)/[page] structure
    const isOnProtectedPage = currentPage ? protectedPages.includes(currentPage) : false;

    if (user && inAuthGroup) {
      // USER IS LOGGED IN + ON AUTH PAGE
      // Redirect logged-in users away from auth pages to home
      router.replace('/(user)/(tabs)/home');
    } else if (!user && !inAuthGroup && isOnProtectedPage) {
      // USER IS NOT LOGGED IN + ON PROTECTED PAGE
      // Only redirect to auth when they try to access protected features
      // Allow access to home, search, and other public pages
      router.replace('/(auth)/login');
    }
  }, [user, segments, initializing, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  // FONT LOADING
  const [loaded, error] = useFonts({
    mon: require('@/src/assets/fonts/Montserrat-Regular.ttf'),
    'mon-sb': require('@/src/assets/fonts/Montserrat-SemiBold.ttf'),
    'mon-b': require('@/src/assets/fonts/Montserrat-Bold.ttf'),
  });

  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    let mounted = true;
    const initializeAuth = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (mounted) {
          setSession(data.session);
          setIsLoading(false);
          setIsInitialized(true);
        }
      } catch (err) {
        console.error('Failed to initialize auth:', err);
        if (mounted) {
          setSession(null);
          setIsLoading(false);
          setIsInitialized(true);
        }
      }
    };
    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  if (!loaded || isLoading || !isInitialized) {
    return null;
  }

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <NavigationHandler>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(user)/(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(cook)" options={{ headerShown: false }} />
          <Stack.Screen name="restaurant/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ headerShown: false }} />
        </Stack>
      </NavigationHandler>
    </AuthProvider>
  );
}
