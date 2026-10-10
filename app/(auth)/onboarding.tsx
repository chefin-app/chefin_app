import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/services/auth-context';
import { supabase } from '@/src/utils/supabaseClient';
import { CountryCodeSelector } from '@/src/components/inputs/CountryCodeSelector';
import { DEFAULT_COUNTRY, Country } from '@/src/constants/countryCodes';
import theme from '@/src/styles/theme';

/**
 * First-run onboarding shown right after sign-up. Collects the user's name and
 * phone number and marks their profile onboarding-complete, so the rest of the
 * app (orders, favourites, notifications) has the identity fields it needs.
 *
 * There's no back button and no skip — a user without these can't be routed
 * anywhere useful, so completing this is the way forward.
 */
export default function OnboardingScreen() {
  const { user, refreshOnboardingStatus } = useAuth();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const safeReturnTo =
    typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo
      : null;

  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const onPhoneChange = (text: string) => {
    // The country code carries the "+"; the field is national digits only.
    setPhone(text.replace(/\D/g, '').slice(0, 15));
  };

  // Stored/validated as E.164: dialling code + national number, no spaces.
  const e164Phone = `${country.code}${phone}`;
  const canSubmit = fullName.trim().length >= 2 && phone.length >= 7;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in again to continue.');
      return;
    }
    setSaving(true);
    try {
      // Write straight to Supabase with the authenticated client (same pattern
      // as the rest of the app, e.g. payout details) rather than the backend
      // API, which may be unreachable from the device. The auth trigger already
      // created the profile row, so this is a plain update.
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone_number: e164Phone,
          onboarding_completed: true,
        })
        .eq('user_id', user.id);
      if (error) throw new Error(error.message);

      // Refresh the flag so the app stops routing back here, then land home.
      await refreshOnboardingStatus();
      if (safeReturnTo) {
        router.dismissTo(safeReturnTo as Href);
      } else {
        router.replace('/(user)/(tabs)/home');
      }
    } catch (e: any) {
      Alert.alert('Something went wrong', e.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrap}>
            <Ionicons name="person-circle-outline" size={56} color="#4CAF50" />
          </View>

          <Text style={styles.title}>Welcome to Chefin</Text>
          <Text style={styles.subtitle}>
            Let&apos;s set up your account. Tell us a bit about you so cooks and customers know who
            they&apos;re dealing with.
          </Text>

          <Text style={styles.label}>YOUR NAME</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              placeholder="e.g. Sarah Tan"
              placeholderTextColor="#999"
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
            />
          </View>

          <Text style={styles.label}>PHONE NUMBER</Text>
          <View style={styles.inputWrapper}>
            <CountryCodeSelector value={country} onChange={setCountry} />
            <TextInput
              placeholder="12 345 6789"
              placeholderTextColor="#999"
              style={styles.input}
              value={phone}
              onChangeText={onPhoneChange}
              keyboardType="phone-pad"
              autoComplete="tel"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>
          <Text style={styles.hint}>
            We use your phone number to coordinate pickups and order updates.
          </Text>

          <TouchableOpacity
            style={[styles.button, (!canSubmit || saving) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing['2xl'], paddingTop: 40 },
  iconWrap: { alignItems: 'center', marginBottom: theme.spacing.md },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: theme.spacing['3xl'],
  },
  label: {
    fontFamily: theme.fonts.semibold,
    fontSize: 11,
    color: theme.colors.textMuted,
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: 14,
    paddingVertical: theme.spacing.md,
    marginBottom: 18,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: theme.fontSizes.base,
    color: theme.colors.text,
  },
  hint: {
    fontFamily: theme.fonts.regular,
    fontSize: theme.fontSizes.small,
    color: theme.colors.placeholder,
    marginTop: -8,
    marginBottom: 28,
    lineHeight: 17,
  },
  button: {
    backgroundColor: theme.colors.primaryAction,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: theme.colors.primaryDisabled },
  buttonText: {
    fontFamily: theme.fonts.semibold,
    color: theme.colors.textOnAction,
    fontSize: theme.fontSizes.base,
  },
});
