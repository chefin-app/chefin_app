import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/src/services/auth-context';
import { supabase } from '@/src/utils/supabaseClient';

type RoleStatus = 'checking' | 'cook' | 'not-cook' | 'unauthenticated';

export default function CookLayout() {
  const router = useRouter();
  const { session, initializing } = useAuth();
  const [roleStatus, setRoleStatus] = useState<RoleStatus>('checking');

  useEffect(() => {
    if (initializing) return;
    if (!session?.user) {
      setRoleStatus('unauthenticated');
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id);
      if (cancelled) return;
      if (error) {
        console.warn('Failed to check cook role', error.message);
        setRoleStatus('not-cook');
        return;
      }
      const isCook = (data ?? []).some(r => r.role === 'cook');
      setRoleStatus(isCook ? 'cook' : 'not-cook');
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally key on user.id (stable) rather than session.user (new
    // object on every auth refresh, which would re-fetch the role unnecessarily).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, initializing]);

  if (roleStatus === 'checking' || initializing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  if (roleStatus !== 'cook') {
    const msg =
      roleStatus === 'unauthenticated'
        ? 'Sign in to access the cook dashboard.'
        : 'This area is for approved cooks only. Apply via support to start a home restaurant.';
    return (
      <View style={styles.centered}>
        <Text style={styles.gateTitle}>Cook access required</Text>
        <Text style={styles.gateBody}>{msg}</Text>
        <TouchableOpacity
          style={styles.gateBtn}
          onPress={() => router.replace('/(user)/(tabs)/home')}
        >
          <Text style={styles.gateBtnText}>Back to home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="add-dish"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="address"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="profile-information" />
      <Stack.Screen name="edit-dish" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 32,
  },
  gateTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', marginBottom: 8 },
  gateBody: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  gateBtn: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  gateBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
