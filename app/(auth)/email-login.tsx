import { useAuth } from '@/src/services/auth-context';
import { supabase } from '@/src/utils/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  TouchableWithoutFeedback,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD_LENGTH = 8;

// Single-identifier flow: ask for the email first, look up whether an account
// exists, then show the right password step (sign in vs. create account).
// The user never has to pick between "Sign Up" and "Sign In" themselves.
type Step = 'email' | 'password';
type Mode = 'signIn' | 'signUp' | 'unknown';

function passwordChecks(password: string) {
  return [
    {
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      ok: password.length >= MIN_PASSWORD_LENGTH,
    },
    { label: 'Contains a letter', ok: /[a-zA-Z]/.test(password) },
    { label: 'Contains a number', ok: /\d/.test(password) },
  ];
}

export default function EmailLoginScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const safeReturnTo =
    typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo
      : null;
  const [step, setStep] = useState<Step>('email');
  const [mode, setMode] = useState<Mode>('unknown');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  // Covers the WHOLE submit journey (auth call + post-auth routing queries),
  // unlike the context's `loading`, which only spans the auth call itself.
  // Without this the button re-enables while routing is still in flight and
  // users press it again, firing duplicate sign-ins with no visible feedback.
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const { signUp, signIn, resetPassword, loading } = useAuth();

  // After a session exists, send brand-new users through onboarding (name +
  // phone) and everyone else home. We query Supabase directly with the same
  // client that just authenticated — not the backend API, which may be
  // unreachable from the device — and read the flag fresh rather than from the
  // context (whose value may not have refreshed yet in this tick).
  //
  // Default on the SAFE side: if we truly can't determine status, send to
  // onboarding. A returning user who lands there once can complete it again
  // harmlessly; a new user wrongly sent home would be stuck with a broken
  // profile, which is worse.
  const routeAfterAuth = async (userId: string | undefined) => {
    if (!userId) {
      router.replace({
        pathname: '/(auth)/onboarding',
        params: safeReturnTo ? { returnTo: safeReturnTo } : undefined,
      });
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('user_id', userId)
      .maybeSingle();
    const completed = !error && data?.onboarding_completed === true;
    if (!completed) {
      router.replace({
        pathname: '/(auth)/onboarding',
        params: safeReturnTo ? { returnTo: safeReturnTo } : undefined,
      });
      return;
    }
    if (safeReturnTo) {
      router.dismissTo(safeReturnTo as Href);
    } else {
      router.replace('/(user)/(tabs)/home');
    }
  };

  const emailValid = EMAIL_REGEX.test(email.trim());
  const checks = passwordChecks(password);
  const passwordValidForSignUp = checks.every(c => c.ok);
  const isSignUp = mode === 'signUp';

  const handleContinue = async () => {
    setEmailTouched(true);
    if (!emailValid) return;
    Keyboard.dismiss();

    setCheckingEmail(true);
    let nextMode: Mode = 'unknown';
    // Time-boxed: an unreachable backend must not leave the Continue button
    // spinning for the OS-level fetch timeout (30s+ on some devices).
    const abort = new AbortController();
    const abortTimer = setTimeout(() => abort.abort(), 5000);
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
        signal: abort.signal,
      });
      if (res.ok) {
        const { exists } = await res.json();
        nextMode = exists ? 'signIn' : 'signUp';
      }
    } catch {
      // Backend unreachable — fall through with mode 'unknown'; the submit
      // handler still resolves the right path via a sign-in-first fallback.
    } finally {
      clearTimeout(abortTimer);
      setCheckingEmail(false);
    }

    setMode(nextMode);
    setStep('password');
    setPassword('');
    setPasswordTouched(false);
    setTimeout(() => passwordRef.current?.focus(), 100);
  };

  const handleChangeEmail = () => {
    setStep('email');
    setMode('unknown');
    setPassword('');
    setPasswordTouched(false);
  };

  const doSignIn = async () => {
    const { error } = await signIn(email.trim(), password);
    if (error) {
      const friendly = /invalid login credentials/i.test(error)
        ? 'Incorrect password. Please try again or reset your password.'
        : error;
      throw new Error(friendly);
    }
    // getSession reads locally — no extra network round-trip like getUser.
    const { data } = await supabase.auth.getSession();
    await routeAfterAuth(data.session?.user?.id);
  };

  const doSignUp = async () => {
    const { error, userExists } = await signUp(email.trim(), password);

    if (userExists) {
      // Account already exists — see if the entered password is theirs
      // before bothering them with an error.
      const { error: signInError } = await signIn(email.trim(), password);
      if (!signInError) {
        const { data } = await supabase.auth.getSession();
        await routeAfterAuth(data.session?.user?.id);
        return;
      }
      setMode('signIn');
      Alert.alert(
        'Account already exists',
        'This email is already registered. Please enter your password to sign in.'
      );
      return;
    }

    if (error) {
      // If it's just an email confirmation error, the account was created.
      if (error.includes('email') || error.includes('confirmation')) {
        Alert.alert(
          'Account created',
          'Your account was created successfully. Please log in with your credentials.',
          [{ text: 'OK', onPress: () => setMode('signIn') }]
        );
        return;
      }
      throw new Error(error);
    }

    // With email confirmation OFF, a clean sign-up auto-signs the user in —
    // there's a session immediately, so send them into onboarding. With
    // confirmation ON there's no session yet; ask them to confirm first.
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await routeAfterAuth(data.session.user.id);
      return;
    }
    Alert.alert(
      'Check your email',
      'We sent you a confirmation link to complete your registration',
      [{ text: 'OK', onPress: () => setMode('signIn') }]
    );
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setPasswordTouched(true);
    if (!password) return;
    if (isSignUp && !passwordValidForSignUp) return;
    Keyboard.dismiss();

    setSubmitting(true);
    try {
      if (mode === 'signIn') {
        await doSignIn();
      } else if (mode === 'signUp') {
        await doSignUp();
      } else {
        // Existence check was unavailable — try signing in first, and fall
        // back to creating an account if that fails on credentials.
        try {
          await doSignIn();
        } catch (signInErr: any) {
          if (/incorrect password/i.test(signInErr.message)) {
            await doSignUp();
          } else {
            throw signInErr;
          }
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    try {
      const { error } = await resetPassword(email.trim());
      if (error) throw new Error(error);
      Alert.alert('Password Reset', 'Check your email for password reset instructions');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const onEmailStep = step === 'email';
  const headerTitle = onEmailStep
    ? 'Continue with Email'
    : isSignUp
      ? 'Create Account'
      : 'Welcome Back';
  const busy = submitting || loading;
  const submitDisabled = busy || (isSignUp && passwordTouched && !passwordValidForSignUp);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => (onEmailStep ? router.back() : handleChangeEmail())}
            >
              <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.content}>
            <View style={styles.form}>
              {onEmailStep ? (
                <>
                  <Text style={styles.subtitle}>
                    Enter your email — we&apos;ll sign you in or create your account
                  </Text>

                  {/* Email Input */}
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Email</Text>
                    <TextInput
                      style={[
                        styles.input,
                        emailTouched && !emailValid && email.length > 0 && styles.inputError,
                      ]}
                      placeholder="Enter your email"
                      placeholderTextColor="#c3c3c3ff"
                      value={email}
                      onChangeText={setEmail}
                      onBlur={() => setEmailTouched(true)}
                      onSubmitEditing={handleContinue}
                      returnKeyType="next"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="username"
                      autoFocus
                    />
                    {emailTouched && !emailValid && email.length > 0 && (
                      <Text style={styles.errorText}>Please enter a valid email address</Text>
                    )}
                  </View>

                  {/* Continue Button */}
                  <TouchableOpacity
                    testID="continue-button"
                    style={[
                      styles.submitButton,
                      (checkingEmail || !emailValid) && styles.submitButtonDisabled,
                    ]}
                    onPress={handleContinue}
                    disabled={checkingEmail}
                  >
                    {checkingEmail ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.submitButtonText}>Continue</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.subtitle}>
                    {isSignUp
                      ? 'Choose a password to create your account'
                      : 'Enter your password to sign in'}
                  </Text>

                  {/* Locked-in email with change affordance */}
                  <TouchableOpacity style={styles.emailChip} onPress={handleChangeEmail}>
                    <Ionicons name="mail-outline" size={16} color="#666" />
                    <Text style={styles.emailChipText}>{email.trim()}</Text>
                    <Text style={styles.emailChipChange}>Change</Text>
                  </TouchableOpacity>

                  {/* Password Input */}
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Password</Text>
                    <View style={styles.passwordContainer}>
                      <TextInput
                        ref={passwordRef}
                        testID="password-input"
                        style={styles.passwordInput}
                        placeholder={isSignUp ? 'Create a password' : 'Enter your password'}
                        placeholderTextColor="#c3c3c3ff"
                        value={password}
                        onChangeText={setPassword}
                        onBlur={() => setPasswordTouched(true)}
                        onSubmitEditing={handleSubmit}
                        returnKeyType="go"
                        secureTextEntry={!showPassword}
                        autoComplete={isSignUp ? 'new-password' : 'current-password'}
                        textContentType={isSignUp ? 'newPassword' : 'password'}
                      />
                      <TouchableOpacity
                        style={styles.eyeButton}
                        onPress={() => setShowPassword(!showPassword)}
                      >
                        <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={20} color="#666" />
                      </TouchableOpacity>
                    </View>

                    {/* Inline password requirements (sign-up only) */}
                    {isSignUp && (passwordTouched || password.length > 0) && (
                      <View style={styles.checksContainer}>
                        {checks.map(check => (
                          <View key={check.label} style={styles.checkRow}>
                            <Ionicons
                              name={check.ok ? 'checkmark-circle' : 'ellipse-outline'}
                              size={16}
                              color={check.ok ? '#4CAF50' : '#999'}
                            />
                            <Text style={[styles.checkText, check.ok && styles.checkTextOk]}>
                              {check.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Forgot Password */}
                  {!isSignUp && (
                    <TouchableOpacity style={styles.forgotPassword} onPress={handleForgotPassword}>
                      <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                    </TouchableOpacity>
                  )}

                  {/* Submit Button */}
                  <TouchableOpacity
                    testID="create-account-button"
                    style={[styles.submitButton, submitDisabled && styles.submitButtonDisabled]}
                    onPress={handleSubmit}
                    disabled={submitDisabled}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.submitButtonText}>
                        {isSignUp ? 'Create Account' : 'Sign In'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  form: {
    flex: 1,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  emailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 24,
  },
  emailChipText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  emailChipChange: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    backgroundColor: '#F9F9F9',
  },
  inputError: {
    borderColor: '#E53935',
  },
  errorText: {
    color: '#E53935',
    fontSize: 13,
    marginTop: 6,
  },
  checksContainer: {
    marginTop: 12,
    gap: 6,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkText: {
    fontSize: 13,
    color: '#999',
  },
  checkTextOk: {
    color: '#4CAF50',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: '#F9F9F9',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
  },
  eyeButton: {
    padding: 16,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 32,
  },
  forgotPasswordText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
