import { supabase } from '@/src/utils/supabaseClient';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

// Supabase returns the session in the URL *fragment* (after #), not the query
// string, so expo-router's useLocalSearchParams can't see it. We read the raw
// initial URL and parse the fragment ourselves, then set the session on the
// device's Supabase client — which fires onAuthStateChange in auth-context and
// logs the user in locally. (The old backend POST set the session server-side,
// so the phone never actually became authenticated.)
function parseFragment(url: string): Record<string, string> {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return {};
  const fragment = url.slice(hashIndex + 1);
  const out: Record<string, string> = {};
  for (const pair of fragment.split('&')) {
    const [k, v] = pair.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  return out;
}

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        const params = initialUrl ? parseFragment(initialUrl) : {};
        const access_token = params.access_token;
        const refresh_token = params.refresh_token;

        if (params.error_description) {
          console.error('Auth callback error:', params.error_description);
          router.replace('/(auth)/login');
          return;
        }

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) {
            console.error('Session error:', error.message);
            router.replace('/(auth)/login');
            return;
          }
          // Session is now set on-device; onAuthStateChange has fired.
          // New users (OAuth included) still need the name + phone step.
          // Query Supabase directly; default to onboarding when unknown.
          const userId = (await supabase.auth.getUser()).data.user?.id;
          let completed = false;
          if (userId) {
            const { data: profile, error } = await supabase
              .from('profiles')
              .select('onboarding_completed')
              .eq('user_id', userId)
              .maybeSingle();
            completed = !error && profile?.onboarding_completed === true;
          }
          router.replace(completed ? '/(user)/(tabs)/home' : '/(auth)/onboarding');
        } else {
          router.replace('/(auth)/login');
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        router.replace('/(auth)/login');
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4CAF50" />
      <Text style={styles.text}>Completing sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    gap: 16,
  },
  text: {
    fontSize: 16,
    color: '#666',
  },
});
