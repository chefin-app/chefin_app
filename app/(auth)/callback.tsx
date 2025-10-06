import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { access_token, refresh_token } = params;

        if (access_token && refresh_token) {
          const res = await fetch('http://localhost:8000/auth/callback', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              access_token: access_token as string,
              refresh_token: refresh_token as string,
            }),
          });

          if (!res.ok) {
            const errorData = await res.json();
            console.error('Session error:', errorData.error);
            router.replace('/(auth)/login');
            return;
          }
          // Successfully authenticated, redirect to main app
          router.replace('/(user)/(tabs)/home');
        } else {
          // No tokens received, redirect back to login
          router.replace('/(auth)/login');
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        router.replace('/(auth)/login');
      }
    };

    // Small delay to ensure params are loaded
    const timer = setTimeout(handleAuthCallback, 100);
    return () => clearTimeout(timer);
  }, [params, router]);

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
