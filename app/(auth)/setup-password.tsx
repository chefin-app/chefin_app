import React, { useState } from 'react';
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
    if (password.length < 6) return { strength: 'Weak', color: '#FF5252' };
    if (password.length < 8) return { strength: 'Fair', color: '#FF9800' };
    if (password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)) {
      return { strength: 'Strong', color: '#4CAF50' };
    }
    return { strength: 'Good', color: '#2196F3' };
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

  const matchTextColor = isPasswordMatching ? '#4CAF50' : '#FF5252';
  const minLengthColor = hasMinLength ? '#4CAF50' : '#999';
  const uppercaseColor = hasUppercase ? '#4CAF50' : '#999';
  const numberColor = hasNumber ? '#4CAF50' : '#999';

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
            <Ionicons name="arrow-back" size={24} color="#333" />
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
            <Ionicons name="alert-circle" size={24} color="#B42318" />
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
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={20} color="#666" />
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
              placeholderTextColor="#999"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoComplete="new-password"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              <Ionicons name={showConfirmPassword ? 'eye' : 'eye-off'} size={20} color="#666" />
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
              color={submitted && !hasMinLength ? '#C62828' : minLengthColor}
            />
            <Text
              style={[
                styles.requirementText,
                { color: submitted && !hasMinLength ? '#C62828' : minLengthColor },
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
              color={submitted && !hasUppercase ? '#C62828' : uppercaseColor}
            />
            <Text
              style={[
                styles.requirementText,
                { color: submitted && !hasUppercase ? '#C62828' : uppercaseColor },
              ]}
            >
              One uppercase letter
            </Text>
          </View>
          <View style={styles.requirementItem}>
            <Ionicons
              name={hasNumber ? 'checkmark-circle' : submitted ? 'close-circle' : 'ellipse-outline'}
              size={18}
              color={submitted && !hasNumber ? '#C62828' : numberColor}
            />
            <Text
              style={[
                styles.requirementText,
                { color: submitted && !hasNumber ? '#C62828' : numberColor },
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
            <ActivityIndicator color="#fff" />
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
    backgroundColor: '#fff',
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
    color: '#333',
    marginBottom: 8,
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: '#F9F9F9',
  },
  inputError: {
    borderColor: '#C62828',
    backgroundColor: '#FFF8F7',
  },
  submitError: {
    marginTop: 7,
    color: '#C62828',
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
    borderColor: '#D92D20',
    borderRadius: 12,
    backgroundColor: '#FEF3F2',
  },
  validationSummaryCopy: {
    flex: 1,
  },
  validationSummaryTitle: {
    color: '#B42318',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 5,
  },
  validationSummaryText: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#333',
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
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
  },
  requirementsError: {
    borderWidth: 2,
    borderColor: '#D92D20',
    backgroundColor: '#FEF3F2',
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
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
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  createButtonDisabled: {
    backgroundColor: '#E0E0E0',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  linkText: {
    color: '#4CAF50',
    fontWeight: '500',
  },
});
