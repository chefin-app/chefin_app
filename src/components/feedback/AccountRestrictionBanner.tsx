import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/services/auth-context';

export default function AccountRestrictionBanner() {
  const { accountStatus, suspensionEndsAt } = useAuth();
  if (accountStatus !== 'suspended') return null;
  const endLabel = suspensionEndsAt
    ? ` until ${new Date(suspensionEndsAt).toLocaleDateString('en-MY', { dateStyle: 'medium' })}`
    : '';
  return (
    <View style={styles.banner}>
      <Ionicons name="lock-closed-outline" size={17} color="#8A5B00" />
      <Text style={styles.text}>
        Your account is in read-only mode{endLabel}. You can browse and manage existing orders, but
        other actions are unavailable.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF4D6',
    borderBottomWidth: 1,
    borderBottomColor: '#F0D58B',
  },
  text: { flex: 1, fontFamily: 'mon-sb', fontSize: 11, lineHeight: 17, color: '#704B00' },
});
