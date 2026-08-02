import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Slot, useRouter } from 'expo-router';

import { useAdminAuth } from '@/src/admin/AdminAuthContext';
import { useAuth } from '@/src/services/auth-context';
import AdminShell from '@/src/components/admin/AdminShell';

export default function ProtectedAdminLayout() {
  const router = useRouter();
  const { status, error, refresh } = useAdminAuth();
  const { signOut } = useAuth();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/admin/login');
  }, [router, status]);

  if (status === 'checking' || status === 'unauthenticated') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.checkingText}>Verifying admin access...</Text>
      </View>
    );
  }

  if (status === 'forbidden') {
    return (
      <View style={styles.centered}>
        <View style={styles.iconWrapError}>
          <Ionicons name="shield-outline" size={36} color="#B42318" />
        </View>
        <Text style={styles.title}>Admin access required</Text>
        <Text style={styles.body}>
          This account is signed in, but it has not been assigned the administrator role.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={async () => {
            await signOut();
            router.replace('/admin/login');
          }}
        >
          <Text style={styles.primaryButtonText}>Use another account</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.centered}>
        <View style={styles.iconWrapWarning}>
          <Ionicons name="cloud-offline-outline" size={36} color="#9A6700" />
        </View>
        <Text style={styles.title}>Couldn&apos;t verify access</Text>
        <Text style={styles.body}>{error ?? 'The admin service is temporarily unavailable.'}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={refresh}>
          <Text style={styles.primaryButtonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <AdminShell>
      <Slot />
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: '#F4F7F5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  checkingText: { fontFamily: 'mon-sb', fontSize: 12, color: '#67726B', marginTop: 14 },
  iconWrapError: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: '#FEE4E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  iconWrapWarning: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: '#FFF1C2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: 'mon-b',
    fontSize: 22,
    color: '#1E2922',
    marginBottom: 9,
    textAlign: 'center',
  },
  body: {
    maxWidth: 470,
    fontFamily: 'mon',
    fontSize: 13,
    lineHeight: 21,
    color: '#69736D',
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
  },
  primaryButtonText: { fontFamily: 'mon-b', fontSize: 12, color: '#FFFFFF' },
});
