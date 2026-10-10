import React, { useState } from 'react';

import theme from '@/src/styles/theme';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/services/auth-context';

export default function SetupPasswordStep3() {
  const { updatePassword, onboardingCompleted } = useAuth();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const safeReturnTo =
    typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo
      : null;
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validatePassword = () => {
    setSubmitted(true);
    return (
      password.length >= 6 &&
      /[A-Z]/.test(password) &&
      /[0-9]/.test(password) &&
      confirmPassword.length > 0 &&
      password === confirmPassword
    );
  };

  const setupPassword = async () => {
    if (!validatePassword()) return;

    setIsLoading(true);

    try {
      const { error } = await updatePassword(password);
      if (error) throw new Error(error);
      Alert.alert('Success', 'Your account has been created successfully!', [
        {
          text: 'OK',
          onPress: () => {
            if (onboardingCompleted !== true) {
              router.replace(
                safeReturnTo
                  ? (`/(auth)/onboarding?returnTo=${encodeURIComponent(safeReturnTo)}` as Href)
                  : '/(auth)/onboarding'
              );
            } else if (safeReturnTo) {
              router.replace(safeReturnTo as Href);
            } else {
              router.replace('/(user)/(tabs)/home');
            }
          },
        },
      ]);
    } catch (error) {
      const err = error as Error;
      Alert.alert('Error', err.message || 'An error occurred while setting up your password');
    } finally {
      setIsLoading(false);
    }
  };

  const getPasswordStrength = () => {
    if (password.length === 0) return null;
    if (password.length < 6) return { strength: 'Weak', color: theme.colors.strength.weak };
    if (password.length < 8) return { strength: 'Fair', color: theme.colors.strength.fair };
    if (password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)) {
      return { strength: 'Strong', color: theme.colors.primary };
    }
    return { strength: 'Good', color: theme.colors.strength.good };
  };

  const passwordStrength = getPasswordStrength();
  const isPasswordMatching = password === confirmPassword;
  const hasMinLength = password.length >= 6;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const meetsRequirements = hasMinLength && hasUppercase && hasNumber;
  const showPasswordError = submitted && !meetsRequirements;
  const showConfirmError = submitted && (!confirmPassword || !isPasswordMatching);
  const validationErrors = [
    !hasMinLength ? 'Use at least 6 characters.' : null,
    !hasUppercase ? 'Add at least one uppercase letter.' : null,
    !hasNumber ? 'Add at least one number.' : null,
    !confirmPassword
      ? 'Confirm your password.'
      : !isPasswordMatching
        ? 'Make sure both passwords match.'
        : null,
  ].filter((message): message is string => Boolean(message));
  const showValidationSummary = submitted && validationErrors.length > 0;

  const matchTextColor = isPasswordMatching ? theme.colors.primary : theme.colors.strength.weak;
  const minLengthColor = hasMinLength ? theme.colors.primary : theme.colors.placeholder;
  const uppercaseColor = hasUppercase ? theme.colors.primary : theme.colors.placeholder;
  const numberColor = hasNumber ? theme.colors.primary : theme.colors.placeholder;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.textStrong} />
          </TouchableOpacity>
        </View>

        {/* Title */}
        <Text style={styles.title}>Create a secure password</Text>
        <Text style={styles.subtitle}>
          Your password will be used to secure your account and sign in to the app.
        </Text>

        {showValidationSummary && (
          <View
            style={styles.validationSummary}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            testID="password-validation-error"
          >
            <Ionicons name="alert-circle" size={24} color={theme.colors.error} />
            <View style={styles.validationSummaryCopy}>
              <Text style={styles.validationSummaryTitle}>Password requirements not met</Text>
              {validationErrors.map(message => (
                <Text key={message} style={styles.validationSummaryText}>
                  • {message}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* Password Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Password</Text>
          <View style={[styles.passwordContainer, showPasswordError && styles.inputError]}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter your password"
              placeholderTextColor={theme.colors.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
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
          {showPasswordError && (
            <Text style={styles.submitError} accessibilityLiveRegion="polite">
              Your password must meet every requirement below.
            </Text>
          )}

          {/* Password Strength Indicator */}
          {passwordStrength && (
            <View style={styles.strengthContainer}>
              <View style={[styles.strengthBar, { backgroundColor: passwordStrength.color }]} />
              <Text style={[styles.strengthText, { color: passwordStrength.color }]}>
                {passwordStrength.strength}
              </Text>
            </View>
          )}
        </View>

        {/* Confirm Password Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Confirm Password</Text>
          <View style={[styles.passwordContainer, showConfirmError && styles.inputError]}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Confirm your password"
              placeholderTextColor={theme.colors.placeholder}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoComplete="new-password"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              <Ionicons
                name={showConfirmPassword ? 'eye' : 'eye-off'}
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
          {showConfirmError && (
            <Text style={styles.submitError} accessibilityLiveRegion="polite">
              {confirmPassword.length === 0
                ? 'Confirm your password.'
                : 'Passwords do not match. Try again.'}
            </Text>
          )}

          {/* Password Match Indicator */}
          {confirmPassword.length > 0 && (
            <View style={styles.matchContainer}>
              <Ionicons
                name={isPasswordMatching ? 'checkmark-circle' : 'close-circle'}
                size={16}
                color={matchTextColor}
              />
              <Text style={[styles.matchText, { color: matchTextColor }]}>
                {isPasswordMatching ? 'Passwords match' : 'Passwords do not match'}
              </Text>
            </View>
          )}
        </View>

        {/* Password Requirements */}
        <View style={[styles.requirementsContainer, showPasswordError && styles.requirementsError]}>
          <Text style={styles.requirementsTitle}>Password must contain:</Text>
          <View style={styles.requirementItem}>
            <Ionicons
              name={
                hasMinLength ? 'checkmark-circle' : submitted ? 'close-circle' : 'ellipse-outline'
              }
              size={18}
              color={submitted && !hasMinLength ? theme.colors.error : minLengthColor}
            />
            <Text
              style={[
                styles.requirementText,
                { color: submitted && !hasMinLength ? theme.colors.error : minLengthColor },
              ]}
            >
              At least 6 characters
            </Text>
          </View>
          <View style={styles.requirementItem}>
            <Ionicons
              name={
                hasUppercase ? 'checkmark-circle' : submitted ? 'close-circle' : 'ellipse-outline'
              }
              size={18}
              color={submitted && !hasUppercase ? theme.colors.error : uppercaseColor}
            />
            <Text
              style={[
                styles.requirementText,
                { color: submitted && !hasUppercase ? theme.colors.error : uppercaseColor },
              ]}
            >
              One uppercase letter
            </Text>
          </View>
          <View style={styles.requirementItem}>
            <Ionicons
              name={hasNumber ? 'checkmark-circle' : submitted ? 'close-circle' : 'ellipse-outline'}
              size={18}
              color={submitted && !hasNumber ? theme.colors.error : numberColor}
            />
            <Text
              style={[
                styles.requirementText,
                { color: submitted && !hasNumber ? theme.colors.error : numberColor },
              ]}
            >
              One number
            </Text>
          </View>
        </View>

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* Create Account Button */}
        <TouchableOpacity
          style={[
            styles.createButton,
            (isLoading || !meetsRequirements || !confirmPassword || !isPasswordMatching) &&
              styles.createButtonDisabled,
          ]}
          onPress={setupPassword}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={theme.colors.textOnAction} />
          ) : (
            <Text style={styles.createButtonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        {/* Terms */}
        <Text style={styles.termsText}>
          By creating an account, you agree to our{' '}
          <Text style={styles.linkText}>Terms of Service</Text> and{' '}
          <Text style={styles.linkText}>Privacy Policy</Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  header: {
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.textStrong,
    marginBottom: 8,
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    lineHeight: 22,
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textStrong,
    marginBottom: 8,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceAlt,
  },
  inputError: {
    borderColor: theme.colors.errorBorder,
    backgroundColor: theme.colors.errorSoft,
  },
  submitError: {
    marginTop: 7,
    color: theme.colors.error,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  validationSummary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: theme.colors.errorBorder,
    borderRadius: 12,
    backgroundColor: theme.colors.errorSoft,
  },
  validationSummaryCopy: {
    flex: 1,
  },
  validationSummaryTitle: {
    color: theme.colors.error,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 5,
  },
  validationSummaryText: {
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
    color: theme.colors.textStrong,
  },
  eyeButton: {
    padding: 16,
  },
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  strengthBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  strengthText: {
    fontSize: 12,
    fontWeight: '500',
  },
  matchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  matchText: {
    fontSize: 12,
    fontWeight: '500',
  },
  requirementsContainer: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
  },
  requirementsError: {
    borderWidth: 2,
    borderColor: theme.colors.errorBorder,
    backgroundColor: theme.colors.errorSoft,
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textStrong,
    marginBottom: 12,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  requirementText: {
    fontSize: 13,
    fontWeight: '600',
  },
  spacer: {
    flex: 1,
  },
  createButton: {
    backgroundColor: theme.colors.primaryAction,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  createButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  createButtonText: {
    color: theme.colors.textOnAction,
    fontFamily: theme.fonts.semibold,
    fontSize: theme.fontSizes.base,
  },
  termsText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  linkText: {
    color: theme.colors.primary,
    fontWeight: '500',
  },
});
