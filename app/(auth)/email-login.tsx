import { useAuth } from '@/src/services/auth-context';
import theme from '@/src/styles/theme';
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
    { label: 'At least one uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'At least one number', ok: /\d/.test(password) },
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
  const [passwordSubmitAttempted, setPasswordSubmitAttempted] = useState(false);
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
    setPasswordSubmitAttempted(false);
    setTimeout(() => passwordRef.current?.focus(), 100);
  };

  const handleChangeEmail = () => {
    setStep('email');
    setMode('unknown');
    setPassword('');
    setPasswordTouched(false);
    setPasswordSubmitAttempted(false);
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
    if (isSignUp) setPasswordSubmitAttempted(true);
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
  const showPasswordErrors = isSignUp && passwordSubmitAttempted && !passwordValidForSignUp;

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
              <Ionicons name="arrow-back" size={24} color={theme.colors.textStrong} />
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
                      placeholderTextColor={theme.colors.placeholder}
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
                      <ActivityIndicator color={theme.colors.textOnAction} />
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
                    <Ionicons name="mail-outline" size={16} color={theme.colors.textSecondary} />
                    <Text style={styles.emailChipText}>{email.trim()}</Text>
                    <Text style={styles.emailChipChange}>Change</Text>
                  </TouchableOpacity>

                  {/* Password Input */}
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Password</Text>
                    <View
                      style={[
                        styles.passwordContainer,
                        showPasswordErrors && styles.passwordContainerError,
                      ]}
                    >
                      <TextInput
                        ref={passwordRef}
                        testID="password-input"
                        style={styles.passwordInput}
                        placeholder={isSignUp ? 'Create a password' : 'Enter your password'}
                        placeholderTextColor={theme.colors.placeholder}
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
                        <Ionicons
                          name={showPassword ? 'eye' : 'eye-off'}
                          size={20}
                          color={theme.colors.textSecondary}
                        />
                      </TouchableOpacity>
                    </View>

                    {showPasswordErrors && (
                      <View
                        style={styles.passwordErrorSummary}
                        accessibilityRole="alert"
                        accessibilityLiveRegion="assertive"
                        testID="password-validation-error"
                      >
                        <Ionicons name="alert-circle" size={20} color={theme.colors.error} />
                        <View style={styles.passwordErrorCopy}>
                          <Text style={styles.passwordErrorTitle}>
                            Password requirements not met
                          </Text>
                          {checks
                            .filter(check => !check.ok)
                            .map(check => (
                              <Text key={check.label} style={styles.passwordErrorText}>
                                • {check.label}
                              </Text>
                            ))}
                        </View>
                      </View>
                    )}

                    {/* Inline password requirements (sign-up only) */}
                    {isSignUp && (passwordTouched || password.length > 0) && (
                      <View style={styles.checksContainer}>
                        {checks.map(check => (
                          <View key={check.label} style={styles.checkRow}>
                            <Ionicons
                              name={
                                check.ok
                                  ? 'checkmark-circle'
                                  : passwordSubmitAttempted
                                    ? 'close-circle'
                                    : 'ellipse-outline'
                              }
                              size={16}
                              color={
                                check.ok
                                  ? theme.colors.primary
                                  : passwordSubmitAttempted
                                    ? theme.colors.error
                                    : theme.colors.placeholder
                              }
                            />
                            <Text
                              style={[
                                styles.checkText,
                                check.ok && styles.checkTextOk,
                                passwordSubmitAttempted && !check.ok && styles.checkTextError,
                              ]}
                            >
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
                    style={[styles.submitButton, busy && styles.submitButtonDisabled]}
                    onPress={handleSubmit}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator color={theme.colors.textOnAction} />
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
    backgroundColor: theme.colors.background,
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
    borderBottomColor: theme.colors.separator,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textStrong,
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
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  emailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 24,
  },
  emailChipText: {
    fontSize: 14,
    color: theme.colors.textStrong,
    fontWeight: '500',
  },
  emailChipChange: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textStrong,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    backgroundColor: theme.colors.surfaceAlt,
  },
  inputError: {
    borderColor: theme.colors.errorBorder,
  },
  errorText: {
    color: theme.colors.error,
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
    color: theme.colors.placeholder,
  },
  checkTextOk: {
    color: theme.colors.primary,
  },
  checkTextError: {
    color: theme.colors.error,
    fontWeight: '600',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceAlt,
  },
  passwordContainerError: {
    borderWidth: 2,
    borderColor: theme.colors.errorBorder,
    backgroundColor: theme.colors.errorSoft,
  },
  passwordErrorSummary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.errorBorder,
    borderRadius: 10,
    backgroundColor: theme.colors.errorSoft,
  },
  passwordErrorCopy: {
    flex: 1,
  },
  passwordErrorTitle: {
    color: theme.colors.error,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  passwordErrorText: {
    color: theme.colors.error,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
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
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: theme.colors.primaryAction,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: theme.colors.textOnAction,
    fontFamily: theme.fonts.semibold,
    fontSize: theme.fontSizes.base,
  },
});
