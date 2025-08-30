import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '@/src/services/supabase';

export default function PhoneVerifyStep2() {
  const { phoneNumber, displayNumber } = useLocalSearchParams<{
    phoneNumber: string;
    displayNumber: string;
  }>();

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [timer, setTimer] = useState(60);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const inputRefs = useRef<TextInput[]>([]);

  useEffect(() => {
    // Start countdown timer
    const interval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Focus first input
    inputRefs.current[0]?.focus();

    return () => clearInterval(interval);
  }, []);

  const handleOtpChange = (value: string, index: number) => {
    // Only allow numbers
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-move to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
      setFocusedIndex(index + 1);
    }

    // Auto-verify when all digits entered
    if (value && index === 5) {
      const completeOtp = newOtp.join('');
      if (completeOtp.length === 6) {
        verifyOTP(completeOtp);
      }
    }
  };

  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setFocusedIndex(index - 1);
    }
  };

  const verifyOTP = async (otpCode?: string) => {
    const code = otpCode || otp.join('');

    if (code.length !== 6) {
      Alert.alert('Error', 'Please enter the complete 6-digit code');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: phoneNumber,
        token: code,
        type: 'sms',
      });

      //   if (error) throw error;

      // Success! User is now authenticated
      // Check if this is a new user who needs to set up their profile
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.user_metadata?.is_new_user !== false) {
        // New user - redirect to password setup or profile setup
        router.replace('/(user)/(tabs)/home');
      } else {
        // Existing user - go to main app
        router.replace('/(user)/(tabs)/home');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('OTP verification error:', error);
        Alert.alert('Verification Failed', error.message || 'Invalid verification code');
        // Clear OTP inputs on error
        setOtp(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        setFocusedIndex(0);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resendOTP = async () => {
    if (timer > 0) return;

    setIsResending(true);

    try {
      const { error } = await supabase.auth.resend({
        type: 'sms',
        phone: phoneNumber,
      });

      if (error) throw error;

      // Reset timer
      setTimer(60);

      // Clear current OTP
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      setFocusedIndex(0);

      Alert.alert('Code Sent', 'A new verification code has been sent to your phone');
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Resend OTP error:', error);
        Alert.alert('Error', error.message || 'Failed to resend code');
      }
    } finally {
      setIsResending(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Title */}
        <Text style={styles.title}>Enter the 4-digit code sent to you at</Text>
        <Text style={styles.phoneNumber}>{displayNumber}</Text>

        {/* OTP Input Container */}
        <View style={styles.otpContainer}>
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={ref => {
                if (ref) inputRefs.current[index] = ref;
              }}
              style={[
                styles.otpInput,
                focusedIndex === index && styles.otpInputFocused,
                digit && styles.otpInputFilled,
              ]}
              value={digit}
              onChangeText={value => handleOtpChange(value, index)}
              onKeyPress={e => handleKeyPress(e, index)}
              onFocus={() => setFocusedIndex(index)}
              keyboardType="number-pad"
              maxLength={1}
              textAlign="center"
              selectTextOnFocus
            />
          ))}
        </View>

        {/* Resend Section */}
        <View style={styles.resendContainer}>
          <TouchableOpacity
            onPress={resendOTP}
            disabled={timer > 0 || isResending}
            style={styles.resendButton}
          >
            {isResending ? (
              <ActivityIndicator size="small" color="#666" />
            ) : (
              <Text
                style={[
                  styles.resendText,
                  timer > 0 ? styles.resendTextDisabled : styles.resendTextEnabled,
                ]}
              >
                {timer > 0 ? `I haven't received a code (${formatTimer(timer)})` : 'Resend Code'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* Bottom Navigation */}
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.nextButton,
              (isLoading || otp.join('').length !== 6) && styles.nextButtonDisabled,
            ]}
            onPress={() => verifyOTP()}
            disabled={isLoading || otp.join('').length !== 6}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.nextButtonText}>Next</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
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
  phoneNumber: {
    fontSize: 18,
    color: '#4CAF50',
    fontWeight: '500',
    marginBottom: 40,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  otpInput: {
    width: 45,
    height: 55,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    backgroundColor: '#F9F9F9',
  },
  otpInputFocused: {
    borderColor: '#4CAF50',
    backgroundColor: '#fff',
  },
  otpInputFilled: {
    borderColor: '#4CAF50',
    backgroundColor: '#F0F8FF',
  },
  resendContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  resendButton: {
    padding: 8,
  },
  resendText: {
    fontSize: 14,
    textAlign: 'center',
  },
  resendTextDisabled: {
    color: '#999',
  },
  resendTextEnabled: {
    color: '#4CAF50',
    fontWeight: '500',
  },
  spacer: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 34, // Safe area for home indicator
  },
  navButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextButton: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 25,
    gap: 8,
  },
  nextButtonDisabled: {
    backgroundColor: '#E0E0E0',
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
