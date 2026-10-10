import React from 'react';
import {
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import SocialMediaButtons from '@/src/components/buttons/SocialMediaButtons';
import { useAuth } from '@/src/services/auth-context';
import theme from '@/src/styles/theme';

export default function LoginScreen() {
  const { signInWithFacebook, signInWithGoogle, signInWithApple } = useAuth();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const safeReturnTo =
    typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo
      : undefined;

  const handleEmailLogin = () => {
    router.push({
      pathname: '/(auth)/email-login',
      params: safeReturnTo ? { returnTo: safeReturnTo } : undefined,
    });
  };

  const handlePhoneLogin = () => {
    router.push({
      pathname: '/(auth)/phone-login',
      params: safeReturnTo ? { returnTo: safeReturnTo } : undefined,
    });
  };

  const handleSignUp = () => {
    // Same unified email flow — it detects whether the account exists.
    handleEmailLogin();
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.textStrong} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {/* Food Image */}
          <View style={styles.imageContainer}>
            <Image
              source={{
                uri: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=300&fit=crop',
              }}
              style={styles.foodImage}
              resizeMode="cover"
            />
          </View>

          {/* Login Header */}
          <View style={styles.headerContainer}>
            <Text style={styles.loginText}>
              <Text style={styles.loginGreen}>Login</Text>
              <Text style={styles.loginBlack}> to Continue</Text>
            </Text>
            <Text style={styles.subtitle}>Taste the World, One Home at a Time.</Text>
          </View>

          {/* Login Buttons */}
          <View style={styles.buttonContainer}>
            {/* Facebook Login */}
            <SocialMediaButtons buttonName={'facebook'} onPress={signInWithFacebook} disabled />
            <SocialMediaButtons buttonName={'apple'} onPress={signInWithApple} disabled />
            <SocialMediaButtons buttonName={'google'} onPress={signInWithGoogle} disabled />
            <SocialMediaButtons buttonName={'email'} onPress={handleEmailLogin} />
            {/* <TouchableOpacity style={styles.googleButton} onPress={signInWithGoogle}>
            <View style={styles.socialButtonContent}>
              <Ionicons name="logo-google" size={20} color="#DB4437" />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </View>
          </TouchableOpacity> */}

            {/* Apple Login */}
            {/* <TouchableOpacity style={styles.appleButton} onPress={signInWithApple}>
            <View style={styles.socialButtonContent}>
              <Ionicons name="logo-apple" size={20} color="#fff" />
              <Text style={styles.appleButtonText}>Continue with Apple</Text>
            </View>
          </TouchableOpacity> */}

            {/* Email Login */}
            {/* <TouchableOpacity style={styles.emailButton} onPress={handleEmailLogin}>
            <View style={styles.socialButtonContent}>
              <Ionicons name="mail" size={20} color="#fff" />
              <Text style={styles.emailButtonText}>Continue with email</Text>
            </View>
          </TouchableOpacity> */}

            {/* Phone Login */}
            <TouchableOpacity style={styles.phoneButton} onPress={handlePhoneLogin}>
              <Text style={styles.phoneButtonText}>Log in with phone number</Text>
            </TouchableOpacity>
          </View>

          {/* Sign Up */}
          {/* <View style={styles.signupContainer}>
            <Text style={styles.signupPrompt}>Don&apos;t have an account?</Text>
            <TouchableOpacity onPress={handleSignUp}>
              <Text style={styles.signupLink}> Sign Up</Text>
            </TouchableOpacity>
          </View> */}

          {/* Terms and Privacy */}
          <View style={styles.termsContainer}>
            <Text style={styles.termsText}>
              By signing up you agree to our{' '}
              <Text style={styles.linkText}>Terms and Conditions</Text> and{' '}
              <Text style={styles.linkText}>Privacy Policy</Text>
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  imageContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  foodImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  loginText: {
    fontFamily: theme.fonts.bold,
    fontSize: theme.fontSizes.display,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  loginGreen: {
    color: theme.colors.primary,
  },
  loginBlack: {
    color: theme.colors.textStrong,
  },
  subtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  buttonContainer: {
    gap: 16,
    marginBottom: 32,
  },
  socialButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  // Third-party brand colours — intentionally literal, not theme tokens.
  facebookButton: {
    backgroundColor: '#1877F2',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  facebookButtonText: {
    color: theme.colors.textOnAction,
    fontFamily: theme.fonts.semibold,
    fontSize: theme.fontSizes.base,
  },
  googleButton: {
    backgroundColor: theme.colors.surface,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  googleButtonText: {
    color: theme.colors.textStrong,
    fontFamily: theme.fonts.semibold,
    fontSize: theme.fontSizes.base,
  },
  appleButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  appleButtonText: {
    color: theme.colors.textOnAction,
    fontFamily: theme.fonts.semibold,
    fontSize: theme.fontSizes.base,
  },
  emailButton: {
    backgroundColor: theme.colors.primaryAction,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  emailButtonText: {
    color: theme.colors.textOnAction,
    fontFamily: theme.fonts.semibold,
    fontSize: theme.fontSizes.base,
  },
  phoneButton: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  phoneButtonText: {
    color: theme.colors.textStrong,
    fontFamily: theme.fonts.semibold,
    fontSize: theme.fontSizes.base,
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 16,
  },
  signupPrompt: {
    fontFamily: theme.fonts.regular,
    fontSize: theme.fontSizes.body,
    color: theme.colors.textSecondary,
  },
  signupLink: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.fontSizes.body,
    color: theme.colors.primaryAction,
  },
  termsContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  termsText: {
    fontFamily: theme.fonts.regular,
    fontSize: theme.fontSizes.small,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  linkText: {
    color: theme.colors.primaryAction,
    textDecorationLine: 'underline',
  },
});
