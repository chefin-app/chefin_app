import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '@/src/services/auth-context';
import { supabase } from '@/src/utils/supabaseClient';
import { fetchAdminSession } from '@/src/admin/api';
import { useAdminAuth } from '@/src/admin/AdminAuthContext';
import PrimaryButton from '@/src/components/buttons/PrimaryButton';
import { TextInputField } from '@/src/components/inputs/TextInputField';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdminLoginScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { signIn, signOut, resetPassword, loading } = useAuth();
  const { status } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const wide = width >= 900;

  useEffect(() => {
    if (status === 'authenticated') router.replace('/admin/overview');
  }, [router, status]);

  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setError(null);
    setNotice(null);
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setError('Enter a valid admin email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await signIn(normalizedEmail, password);
      if (result.error) throw new Error(result.error);
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Your session could not be created.');
      await fetchAdminSession(data.session.access_token);
      router.replace('/admin/overview');
    } catch (caught: unknown) {
      await signOut();
      const message = caught instanceof Error ? caught.message : 'Sign-in failed.';
      setError(
        /invalid login credentials/i.test(message) ? 'The email or password is incorrect.' : message
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    setError(null);
    setNotice(null);
    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Enter your admin email before requesting a reset.');
      return;
    }
    const result = await resetPassword(email.trim());
    if (result.error) setError(result.error);
    else setNotice('Password reset instructions have been sent to your email.');
  };

  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.loginFrame, wide && styles.loginFrameWide]}>
            {wide && (
              <View style={styles.brandPanel}>
                <View style={styles.brandMark}>
                  <Ionicons name="restaurant" size={28} color="#FFFFFF" />
                </View>
                <Text style={styles.brandName}>Chefin</Text>
                <Text style={styles.brandHeadline}>
                  Keep the marketplace safe, trusted and moving.
                </Text>
                <Text style={styles.brandCopy}>
                  Review platform health, cook performance, orders and moderation activity from one
                  secure workspace.
                </Text>
                <View style={styles.securityPill}>
                  <Ionicons name="shield-checkmark" size={17} color="#DFF7E6" />
                  <Text style={styles.securityPillText}>Role-protected admin access</Text>
                </View>
              </View>
            )}

            <View style={styles.formPanel}>
              {!wide && (
                <View style={styles.mobileBrand}>
                  <View style={styles.mobileBrandMark}>
                    <Ionicons name="restaurant" size={22} color="#FFFFFF" />
                  </View>
                  <Text style={styles.mobileBrandText}>Chefin Admin</Text>
                </View>
              )}
              <View style={styles.formHeading}>
                <Text style={styles.eyebrow}>ADMIN PORTAL</Text>
                <Text style={styles.title}>Welcome back</Text>
                <Text style={styles.subtitle}>
                  Sign in with an authorised administrator account.
                </Text>
              </View>

              <TextInputField
                label="Email address"
                placeholder="admin@chefin.my"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                inputStyle={styles.input}
              />
              <View style={styles.passwordField}>
                <TextInputField
                  label="Password"
                  placeholder="Enter your password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  inputStyle={styles.inputWithIcon}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword(value => !value)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#6B7280"
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.forgotButton} onPress={handleResetPassword}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>

              {error && (
                <View style={styles.messageError}>
                  <Ionicons name="alert-circle" size={18} color="#B42318" />
                  <Text style={styles.messageErrorText}>{error}</Text>
                </View>
              )}
              {notice && (
                <View style={styles.messageSuccess}>
                  <Ionicons name="checkmark-circle" size={18} color="#237A3B" />
                  <Text style={styles.messageSuccessText}>{notice}</Text>
                </View>
              )}

              <PrimaryButton
                title="Sign in to dashboard"
                onPress={handleLogin}
                isLoading={submitting || loading}
                disabled={!email.trim() || !password}
                style={styles.submitButton}
              />

              <View style={styles.accessNote}>
                <Ionicons name="lock-closed-outline" size={16} color="#7B8494" />
                <Text style={styles.accessNoteText}>
                  Access is limited to accounts assigned the admin role.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F3F6F4' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  loginFrame: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E6ECE8',
  },
  loginFrameWide: { flexDirection: 'row', minHeight: 650 },
  brandPanel: {
    flex: 1.05,
    backgroundColor: '#1F9D55',
    paddingHorizontal: 56,
    paddingVertical: 54,
    justifyContent: 'center',
  },
  brandMark: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  brandName: { fontFamily: 'mon-b', fontSize: 22, color: '#FFFFFF', marginBottom: 42 },
  brandHeadline: {
    fontFamily: 'mon-b',
    fontSize: 36,
    lineHeight: 46,
    color: '#FFFFFF',
    marginBottom: 18,
  },
  brandCopy: { fontFamily: 'mon', fontSize: 15, lineHeight: 25, color: '#DDF5E5' },
  securityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(10,69,34,0.24)',
    marginTop: 40,
  },
  securityPillText: { fontFamily: 'mon-sb', fontSize: 12, color: '#E8F8ED' },
  formPanel: { flex: 0.95, paddingHorizontal: 44, paddingVertical: 54, justifyContent: 'center' },
  mobileBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 40 },
  mobileBrandMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileBrandText: { fontFamily: 'mon-b', fontSize: 18, color: '#1D2A22' },
  formHeading: { marginBottom: 32 },
  eyebrow: {
    fontFamily: 'mon-b',
    fontSize: 11,
    letterSpacing: 1.4,
    color: '#2C9C5B',
    marginBottom: 10,
  },
  title: { fontFamily: 'mon-b', fontSize: 32, color: '#1F2923', marginBottom: 9 },
  subtitle: { fontFamily: 'mon', fontSize: 14, lineHeight: 21, color: '#6B746E' },
  input: { fontFamily: 'mon', height: 52, borderRadius: 12, backgroundColor: '#FBFCFB' },
  passwordField: { position: 'relative' },
  inputWithIcon: {
    fontFamily: 'mon',
    height: 52,
    borderRadius: 12,
    paddingRight: 48,
    backgroundColor: '#FBFCFB',
  },
  passwordToggle: { position: 'absolute', right: 14, bottom: 31, padding: 6 },
  forgotButton: { alignSelf: 'flex-end', paddingVertical: 4, marginTop: -5, marginBottom: 18 },
  forgotText: { fontFamily: 'mon-sb', fontSize: 13, color: '#258B50' },
  messageError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEF3F2',
    marginBottom: 14,
  },
  messageErrorText: { flex: 1, fontFamily: 'mon', fontSize: 12, lineHeight: 18, color: '#8A241A' },
  messageSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#ECF8F0',
    marginBottom: 14,
  },
  messageSuccessText: {
    flex: 1,
    fontFamily: 'mon',
    fontSize: 12,
    lineHeight: 18,
    color: '#246238',
  },
  submitButton: { borderRadius: 12, paddingVertical: 15, backgroundColor: '#4CAF50', elevation: 0 },
  accessNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 22 },
  accessNoteText: { flex: 1, fontFamily: 'mon', fontSize: 11, lineHeight: 17, color: '#7B8494' },
});
