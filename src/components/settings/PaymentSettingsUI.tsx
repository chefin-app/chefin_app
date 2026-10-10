import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '@/src/styles/theme';

// Shared by payout details and customer payment options to keep both sections consistent.
export function PaymentSettingsHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={paymentSettingsStyles.header}>
      <TouchableOpacity
        onPress={onBack}
        style={paymentSettingsStyles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
      </TouchableOpacity>
      <Text style={paymentSettingsStyles.headerTitle}>{title}</Text>
      <View style={paymentSettingsStyles.headerSpacer} />
    </View>
  );
}

export function PaymentSettingsButton({
  title,
  onPress,
  loading = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        paymentSettingsStyles.primaryButton,
        (disabled || loading) && paymentSettingsStyles.primaryButtonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.textOnAction} />
      ) : (
        <Text style={paymentSettingsStyles.primaryButtonText}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

export const paymentSettingsStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  backButton: { width: 40, padding: 5 },
  headerSpacer: { width: 40 },
  formContainer: { padding: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#222', marginBottom: 12 },
  body: { fontSize: 14, lineHeight: 21, color: theme.colors.textSecondary },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  input: { flex: 1, fontSize: 16, color: '#222' },
  primaryButton: {
    backgroundColor: theme.colors.primaryAction,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 15,
  },
  primaryButtonDisabled: { backgroundColor: theme.colors.primaryDisabled },
  primaryButtonText: { color: theme.colors.textOnAction, fontSize: 16, fontWeight: '600' },
});
