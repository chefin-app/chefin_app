import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { PhoneNumberInput } from '@/src/components/inputs/PhoneNumberInput';
import { CountryCodeSelector } from '@/src/components/inputs/CountryCodeSelector';
import { DEFAULT_COUNTRY } from '@/src/constants/countryCodes';
import {
  ActivityIndicator,
  Keyboard,
  TouchableWithoutFeedback,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../src/services/auth-context';

export default function PhoneLoginScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);

  const { signInWithPhone, loading } = useAuth();

  const formatPhoneNumber = (text: string) => {
    // Remove all non-numeric characters
    const cleaned = text.replace(/\D/g, '');

    // Format based on country
    if (selectedCountry.code === '+1') {
      // US/Canada format: (XXX) XXX-XXXX
      if (cleaned.length >= 6) {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
      } else if (cleaned.length >= 3) {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
      }
    } else if (selectedCountry.code === '+44') {
      // UK format: XXXX XXX XXXX
      if (cleaned.length >= 7) {
        return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7, 11)}`;
      } else if (cleaned.length >= 4) {
        return `${cleaned.slice(0, 4)} ${cleaned.slice(4)}`;
      }
    }
    // Default format for other countries
    return cleaned;
  };

  const handlePhoneNumberChange = (text: string) => {
    const formatted = formatPhoneNumber(text);
    setPhoneNumber(formatted);
  };

  const sendOTP = async () => {
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter your mobile number');
      return;
    }

    // Clean and format phone number to E.164 format
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const fullPhoneNumber = `${selectedCountry.code}${cleanPhone}`;

    try {
      const { error } = await signInWithPhone(fullPhoneNumber);

      if (error) throw error;

      // Navigate to OTP verification screen
      router.push({
        pathname: '/(auth)/phone-verify',
        params: {
          phoneNumber: fullPhoneNumber,
          displayNumber: `${selectedCountry.flag} ${selectedCountry.code} ${phoneNumber}`,
        },
      });
    } catch (error: any) {
      console.error('OTP send error:', error);
      Alert.alert('Error', error.message || 'Failed to send verification code');
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          {/* Title */}
          <Text style={styles.title}>Enter your mobile number</Text>

          {/* Phone Input Container */}
          <View style={styles.phoneContainer}>
            <CountryCodeSelector value={selectedCountry} onChange={setSelectedCountry} />
            <PhoneNumberInput
              value={phoneNumber}
              onChangeText={handlePhoneNumberChange}
              selectedCountry={selectedCountry}
            />
          </View>

          {/* Next Button */}
          <TouchableOpacity
            style={[
              styles.nextButton,
              (loading || !phoneNumber.trim()) && styles.nextButtonDisabled,
            ]}
            onPress={sendOTP}
            disabled={loading || !phoneNumber.trim()}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.nextButtonText}>Next</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>

          {/* Disclaimer */}
          <Text style={styles.disclaimer}>
            By proceeding, you consent to get calls, WhatsApp or SMS messages, including by
            automated means, from our app and its affiliates to the number provided.
          </Text>
        </View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
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
    marginBottom: 32,
    marginTop: 20,
  },
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingBottom: 12,
    marginBottom: 32,
  },
  nextButton: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 24,
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
    textAlign: 'left',
  },
});
