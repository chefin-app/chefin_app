import { AuthContext } from '../context/AuthContext';
//import FontAwesome from '@expo/vector-icons/FontAwesome';
//import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Session } from '@supabase/supabase-js';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';
import { supabase } from '../utils/supabase';
import { StatusBar } from 'expo-status-bar';

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

export default function RootLayout() {
  // FONT LOADING
  // ============
  const [loaded, error] = useFonts({
    mon: require('../assets/fonts/Montserrat-Regular.ttf'),
    'mon-sb': require('../assets/fonts/Montserrat-SemiBold.ttf'),
    'mon-b': require('../assets/fonts/Montserrat-Bold.ttf'),
  });

  const [session, setSession] = useState<Session | null>(null); // Stores user authentication session
  const [isLoading, setIsLoading] = useState(true); // Tracks if we're still checking auth status
  const [isInitialized, setIsInitialized] = useState(false); // Ensures auth is fully set up before navigation

  const segments = useSegments(); // Gets current route segments (e.g., ['(user)', 'home'])
  const router = useRouter(); // For programmatic navigation

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // This effect runs once when the app starts to set up authentication
  useEffect(() => {
    let mounted = true; // Prevents state updates after component unmounts

    const initializeAuth = async () => {
      try {
        // Get the current user session from Supabase
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.warn('Session error:', error.message);
        }

        if (mounted) {
          setSession(data.session); // Ensure 'data.session' is used, which is correct
          setIsLoading(false); // Auth check is complete
          setIsInitialized(true); // Mark as fully initialized
          // console.log('RUNNNN');
        }
      } catch (error) {
        console.warn('Failed to get session:', error);
        if (mounted) {
          setSession(null); // No session available
          setIsLoading(false);
          setIsInitialized(true);
          // console.log('FAILLL');
        }
      }
    };

    initializeAuth();

    // This listener fires when user logs in/out anywhere in the app
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session); // Update session when auth state changes
        setIsLoading(false);
      }
    });

    // Clean up when component unmounts to prevent memory leaks
    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // This effect handles where to navigate based on authentication state
  useEffect(() => {
    // Don't navigate if still loading or not initialized
    if (!isInitialized || isLoading || !loaded) return;

    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return;
    }

    // Check if user is currently on an auth page (login, register, etc.)
    const inAuthGroup = segments[0] === '(auth)';

    if (session && inAuthGroup) {
      // USER IS LOGGED IN + ON AUTH PAGE
      // Redirect logged-in users away from auth pages to home
      router.replace('/(user)/home');
    } else if (!session && !inAuthGroup && segments[1] === 'account') {
      // USER IS NOT LOGGED IN + ON PROTECTED PAGE
      // Allow users to browse home and search without logging in
      // Only redirect to auth when they try to access account features
      router.replace('/(auth)/login');
    }
  }, [session, segments, isLoading, isInitialized, router, loaded]);

  // Don't render anything until fonts are loaded and auth is initialized
  if (!loaded || isLoading || !isInitialized) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ session, isLoading }}>
      <RootLayoutNav />
    </AuthContext.Provider>
  );
}

function RootLayoutNav() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(user)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
