import React from 'react';
import { Image, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import SocialMediaButtons from '@/src/components/buttons/SocialMediaButtons';
import { useAuth } from '@/src/services/auth-context';

export default function LoginScreen() {
  const { signInWithFacebook, signInWithGoogle, signInWithApple } = useAuth();

  const handleEmailLogin = () => {
    router.push('/(auth)/email-login');
  };

  const handlePhoneLogin = () => {
    router.push('/(auth)/phone-login');
  };

  return (
    <SafeAreaView style={styles.container}>
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
          <SocialMediaButtons buttonName={'facebook'} onPress={signInWithFacebook} />
          <SocialMediaButtons buttonName={'apple'} onPress={signInWithApple} />
          <SocialMediaButtons buttonName={'google'} onPress={signInWithGoogle} />
          <SocialMediaButtons buttonName={'email'} onPress={handleEmailLogin} />

          {/* <TouchableOpacity style={styles.facebookButton} onPress={signInWithFacebook}>
            <View style={styles.socialButtonContent}>
              <Ionicons name="logo-facebook" size={20} color="#fff" />
              <Text style={styles.facebookButtonText}>Continue with Facebook</Text>
            </View>
          </TouchableOpacity>

          {/* Google Login */}
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

        {/* Terms and Privacy */}
        <View style={styles.termsContainer}>
          <Text style={styles.termsText}>
            By signing up you agree to our <Text style={styles.linkText}>Terms and Conditions</Text>{' '}
            and <Text style={styles.linkText}>Privacy Policy</Text>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  loginGreen: {
    color: '#4CAF50',
  },
  loginBlack: {
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
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
  facebookButton: {
    backgroundColor: '#1877F2',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  facebookButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  googleButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  appleButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  appleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emailButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  emailButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  phoneButton: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  phoneButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  termsContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  termsText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  linkText: {
    color: '#4CAF50',
    textDecorationLine: 'underline',
  },
});
