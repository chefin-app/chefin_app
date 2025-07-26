// import { Ionicons } from "@expo/vector-icons";
// import { router } from "expo-router";
// import React, { useState } from "react";
// import {
//   ActivityIndicator,
//   Alert,
//   KeyboardAvoidingView,
//   Platform,
//   SafeAreaView,
//   StyleSheet,
//   Text,
//   TextInput,
//   TouchableOpacity,
//   View,
// } from "react-native";
// import { supabase } from "../../utils/supabase";

// export default function PhoneLoginScreen() {
//   const [phoneNumber, setPhoneNumber] = useState("");
//   const [otp, setOtp] = useState("");
//   const [isLoading, setIsLoading] = useState(false);
//   const [otpSent, setOtpSent] = useState(false);
//   const [timer, setTimer] = useState(0);

//   const formatPhoneNumber = (text: string) => {
//     // Remove all non-numeric characters
//     const cleaned = text.replace(/\D/g, "");

//     // Format as +1 (XXX) XXX-XXXX for US numbers
//     if (cleaned.length >= 10) {
//       const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
//       if (match) {
//         return `+1 (${match[1]}) ${match[2]}-${match[3]}`;
//       }
//     }

//     return `+1 ${cleaned}`;
//   };

//   const sendOTP = async () => {
//     if (!phoneNumber) {
//       Alert.alert("Error", "Please enter your phone number");
//       return;
//     }

//     // Clean phone number to E.164 format
//     const cleanPhone = phoneNumber.replace(/\D/g, "");
//     const formattedPhone = `+1${cleanPhone}`;

//     setIsLoading(true);

//     try {
//       const { error } = await supabase.auth.signInWithOtp({
//         phone: formattedPhone,
//       });

//       if (error) throw error;

//       setOtpSent(true);
//       setTimer(60); // 60 second countdown

//       // Start countdown timer
//       const interval = setInterval(() => {
//         setTimer((prev) => {
//           if (prev <= 1) {
//             clearInterval(interval);
//             return 0;
//           }
//           return prev - 1;
//         });
//       }, 1000);

//       Alert.alert(
//         "SMS Sent",
//         "Please check your phone for the verification code"
//       );
//     } catch (error: any) {
//       Alert.alert("Error", error.message);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const verifyOTP = async () => {
//     if (!otp) {
//       Alert.alert("Error", "Please enter the verification code");
//       return;
//     }

//     if (otp.length !== 6) {
//       Alert.alert("Error", "Please enter a valid 6-digit code");
//       return;
//     }

//     const cleanPhone = phoneNumber.replace(/\D/g, "");
//     const formattedPhone = `+1${cleanPhone}`;

//     setIsLoading(true);

//     try {
//       const { error } = await supabase.auth.verifyOtp({
//         phone: formattedPhone,
//         token: otp,
//         type: "sms",
//       });

//       if (error) throw error;
//     } catch (error: any) {
//       Alert.alert("Error", error.message);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const handlePhoneNumberChange = (text: string) => {
//     const formatted = formatPhoneNumber(text);
//     setPhoneNumber(formatted);
//   };

//   const resendOTP = () => {
//     if (timer > 0) return;
//     sendOTP();
//   };

//   return (
//     <SafeAreaView style={styles.container}>
//       <KeyboardAvoidingView
//         behavior={Platform.OS === "ios" ? "padding" : "height"}
//         style={styles.keyboardView}
//       >
//         {/* Header */}
//         <View style={styles.header}>
//           <TouchableOpacity
//             style={styles.backButton}
//             onPress={() => router.back()}
//           >
//             <Ionicons name="arrow-back" size={24} color="#333" />
//           </TouchableOpacity>
//           <Text style={styles.headerTitle}>Phone Login</Text>
//           <View style={styles.placeholder} />
//         </View>

//         <View style={styles.content}>
//           {!otpSent ? (
//             // Phone Number Input Phase
//             <View style={styles.form}>
//               <Text style={styles.subtitle}>
//                 Enter your phone number to receive a verification code
//               </Text>

//               <View style={styles.inputContainer}>
//                 <Text style={styles.inputLabel}>Phone Number</Text>
//                 <TextInput
//                   style={styles.input}
//                   placeholder="+1 (555) 123-4567"
//                   value={phoneNumber}
//                   onChangeText={handlePhoneNumberChange}
//                   keyboardType="phone-pad"
//                   maxLength={18} // +1 (XXX) XXX-XXXX
//                 />
//               </View>

//               <TouchableOpacity
//                 style={[
//                   styles.submitButton,
//                   isLoading && styles.submitButtonDisabled,
//                 ]}
//                 onPress={sendOTP}
//                 disabled={isLoading}
//               >
//                 {isLoading ? (
//                   <ActivityIndicator color="#fff" />
//                 ) : (
//                   <Text style={styles.submitButtonText}>Send Code</Text>
//                 )}
//               </TouchableOpacity>

//               <Text style={styles.disclaimer}>
//                 By continuing, you agree to receive SMS messages from us.
//                 Message and data rates may apply.
//               </Text>
//             </View>
//           ) : (
//             // OTP Verification Phase
//             <View style={styles.form}>
//               <Text style={styles.subtitle}>
//                 Enter the 6-digit code sent to {phoneNumber}
//               </Text>

//               <View style={styles.inputContainer}>
//                 <Text style={styles.inputLabel}>Verification Code</Text>
//                 <TextInput
//                   style={styles.otpInput}
//                   placeholder="123456"
//                   value={otp}
//                   onChangeText={setOtp}
//                   keyboardType="number-pad"
//                   maxLength={6}
//                   textAlign="center"
//                   //   fontSize={24}
//                 />
//               </View>

//               <TouchableOpacity
//                 style={[
//                   styles.submitButton,
//                   isLoading && styles.submitButtonDisabled,
//                 ]}
//                 onPress={verifyOTP}
//                 disabled={isLoading}
//               >
//                 {isLoading ? (
//                   <ActivityIndicator color="#fff" />
//                 ) : (
//                   <Text style={styles.submitButtonText}>Verify Code</Text>
//                 )}
//               </TouchableOpacity>

//               {/* Resend Code */}
//               <View style={styles.resendContainer}>
//                 <Text style={styles.resendText}>Didn't receive the code?</Text>
//                 <TouchableOpacity onPress={resendOTP} disabled={timer > 0}>
//                   <Text
//                     style={[
//                       styles.resendLink,
//                       timer > 0 && styles.resendLinkDisabled,
//                     ]}
//                   >
//                     {timer > 0 ? `Resend in ${timer}s` : "Resend"}
//                   </Text>
//                 </TouchableOpacity>
//               </View>

//               {/* Change Phone Number */}
//               <TouchableOpacity
//                 style={styles.changeNumberButton}
//                 onPress={() => {
//                   setOtpSent(false);
//                   setOtp("");
//                   setTimer(0);
//                 }}
//               >
//                 <Text style={styles.changeNumberText}>Change Phone Number</Text>
//               </TouchableOpacity>
//             </View>
//           )}
//         </View>
//       </KeyboardAvoidingView>
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: "#fff",
//   },
//   keyboardView: {
//     flex: 1,
//   },
//   header: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     paddingHorizontal: 20,
//     paddingVertical: 16,
//     borderBottomWidth: 1,
//     borderBottomColor: "#F0F0F0",
//   },
//   backButton: {
//     padding: 8,
//   },
//   headerTitle: {
//     fontSize: 18,
//     fontWeight: "600",
//     color: "#333",
//   },
//   placeholder: {
//     width: 40,
//   },
//   content: {
//     flex: 1,
//     paddingHorizontal: 24,
//     paddingTop: 32,
//   },
//   form: {
//     flex: 1,
//   },
//   subtitle: {
//     fontSize: 16,
//     color: "#666",
//     textAlign: "center",
//     marginBottom: 32,
//     lineHeight: 24,
//   },
//   inputContainer: {
//     marginBottom: 32,
//   },
//   inputLabel: {
//     fontSize: 14,
//     fontWeight: "500",
//     color: "#333",
//     marginBottom: 8,
//   },
//   input: {
//     borderWidth: 1,
//     borderColor: "#E0E0E0",
//     borderRadius: 12,
//     paddingHorizontal: 16,
//     paddingVertical: 16,
//     fontSize: 16,
//     backgroundColor: "#F9F9F9",
//   },
//   otpInput: {
//     borderWidth: 1,
//     borderColor: "#E0E0E0",
//     borderRadius: 12,
//     paddingHorizontal: 16,
//     paddingVertical: 20,
//     backgroundColor: "#F9F9F9",
//     letterSpacing: 8,
//   },
//   submitButton: {
//     backgroundColor: "#4CAF50",
//     paddingVertical: 16,
//     borderRadius: 12,
//     alignItems: "center",
//     marginBottom: 24,
//   },
//   submitButtonDisabled: {
//     opacity: 0.7,
//   },
//   submitButtonText: {
//     color: "#fff",
//     fontSize: 16,
//     fontWeight: "600",
//   },
//   disclaimer: {
//     fontSize: 12,
//     color: "#666",
//     textAlign: "center",
//     lineHeight: 18,
//   },
//   resendContainer: {
//     flexDirection: "row",
//     justifyContent: "center",
//     alignItems: "center",
//     gap: 4,
//     marginBottom: 16,
//   },
//   resendText: {
//     color: "#666",
//     fontSize: 14,
//   },
//   resendLink: {
//     color: "#4CAF50",
//     fontSize: 14,
//     fontWeight: "500",
//   },
//   resendLinkDisabled: {
//     color: "#999",
//   },
//   changeNumberButton: {
//     alignSelf: "center",
//     padding: 8,
//   },
//   changeNumberText: {
//     color: "#4CAF50",
//     fontSize: 14,
//     fontWeight: "500",
//   },
// });
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../utils/supabase';

// Country codes data
const COUNTRY_CODES = [
  { code: '+1', country: 'US', flag: '🇺🇸', name: 'United States' },
  { code: '+1', country: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: '+44', country: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+33', country: 'FR', flag: '🇫🇷', name: 'France' },
  { code: '+49', country: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: '+39', country: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: '+34', country: 'ES', flag: '🇪🇸', name: 'Spain' },
  { code: '+31', country: 'NL', flag: '🇳🇱', name: 'Netherlands' },
  { code: '+46', country: 'SE', flag: '🇸🇪', name: 'Sweden' },
  { code: '+47', country: 'NO', flag: '🇳🇴', name: 'Norway' },
  { code: '+45', country: 'DK', flag: '🇩🇰', name: 'Denmark' },
  { code: '+358', country: 'FI', flag: '🇫🇮', name: 'Finland' },
  { code: '+41', country: 'CH', flag: '🇨🇭', name: 'Switzerland' },
  { code: '+43', country: 'AT', flag: '🇦🇹', name: 'Austria' },
  { code: '+32', country: 'BE', flag: '🇧🇪', name: 'Belgium' },
  { code: '+351', country: 'PT', flag: '🇵🇹', name: 'Portugal' },
  { code: '+30', country: 'GR', flag: '🇬🇷', name: 'Greece' },
  { code: '+48', country: 'PL', flag: '🇵🇱', name: 'Poland' },
  { code: '+420', country: 'CZ', flag: '🇨🇿', name: 'Czech Republic' },
  { code: '+36', country: 'HU', flag: '🇭🇺', name: 'Hungary' },
  { code: '+7', country: 'RU', flag: '🇷🇺', name: 'Russia' },
  { code: '+86', country: 'CN', flag: '🇨🇳', name: 'China' },
  { code: '+81', country: 'JP', flag: '🇯🇵', name: 'Japan' },
  { code: '+82', country: 'KR', flag: '🇰🇷', name: 'South Korea' },
  { code: '+91', country: 'IN', flag: '🇮🇳', name: 'India' },
  { code: '+61', country: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: '+64', country: 'NZ', flag: '🇳🇿', name: 'New Zealand' },
  { code: '+55', country: 'BR', flag: '🇧🇷', name: 'Brazil' },
  { code: '+52', country: 'MX', flag: '🇲🇽', name: 'Mexico' },
  { code: '+54', country: 'AR', flag: '🇦🇷', name: 'Argentina' },
  { code: '+56', country: 'CL', flag: '🇨🇱', name: 'Chile' },
  { code: '+57', country: 'CO', flag: '🇨🇴', name: 'Colombia' },
  { code: '+51', country: 'PE', flag: '🇵🇪', name: 'Peru' },
  { code: '+27', country: 'ZA', flag: '🇿🇦', name: 'South Africa' },
  { code: '+20', country: 'EG', flag: '🇪🇬', name: 'Egypt' },
  { code: '+971', country: 'AE', flag: '🇦🇪', name: 'UAE' },
  { code: '+966', country: 'SA', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: '+90', country: 'TR', flag: '🇹🇷', name: 'Turkey' },
  { code: '+66', country: 'TH', flag: '🇹🇭', name: 'Thailand' },
  { code: '+65', country: 'SG', flag: '🇸🇬', name: 'Singapore' },
  { code: '+60', country: 'MY', flag: '🇲🇾', name: 'Malaysia' },
  { code: '+62', country: 'ID', flag: '🇮🇩', name: 'Indonesia' },
  { code: '+63', country: 'PH', flag: '🇵🇭', name: 'Philippines' },
  { code: '+84', country: 'VN', flag: '🇻🇳', name: 'Vietnam' },
];

export default function PhoneSignupStep1() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]); // Default to US
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCountries = COUNTRY_CODES.filter(
    country =>
      country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      country.code.includes(searchQuery)
  );

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

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: fullPhoneNumber,
        options: {
          shouldCreateUser: true, // This allows signup with phone
        },
      });

      //   if (error) throw error;

      // Navigate to OTP verification screen
      router.push({
        pathname: '/(auth)/phone-verify',
        params: {
          phoneNumber: fullPhoneNumber,
          displayNumber: `${selectedCountry.flag} ${selectedCountry.code} ${phoneNumber}`,
        },
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('OTP send error:', error);
        Alert.alert('Error', error.message || 'Failed to send verification code');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const selectCountry = (country: (typeof COUNTRY_CODES)[0]) => {
    setSelectedCountry(country);
    setShowCountryPicker(false);
    setSearchQuery('');
  };

  const renderCountryItem = ({ item }: { item: (typeof COUNTRY_CODES)[0] }) => (
    <TouchableOpacity style={styles.countryItem} onPress={() => selectCountry(item)}>
      <Text style={styles.countryFlag}>{item.flag}</Text>
      <View style={styles.countryInfo}>
        <Text style={styles.countryName}>{item.name}</Text>
        <Text style={styles.countryCode}>{item.code}</Text>
      </View>
    </TouchableOpacity>
  );

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
        <Text style={styles.title}>Enter your mobile number</Text>

        {/* Phone Input Container */}
        <View style={styles.phoneContainer}>
          {/* Country Code Selector */}
          <TouchableOpacity
            style={styles.countrySelector}
            onPress={() => setShowCountryPicker(true)}
          >
            <Text style={styles.selectedFlag}>{selectedCountry.flag}</Text>
            <Ionicons name="chevron-down" size={16} color="#666" />
          </TouchableOpacity>

          {/* Country Code Display */}
          <View style={styles.countryCodeContainer}>
            <Text style={styles.countryCodeText}>{selectedCountry.code}</Text>
          </View>

          {/* Phone Number Input */}
          <TextInput
            style={styles.phoneInput}
            placeholder="Mobile number"
            placeholderTextColor="#999"
            value={phoneNumber}
            onChangeText={handlePhoneNumberChange}
            keyboardType="phone-pad"
            maxLength={selectedCountry.code === '+1' ? 14 : 15}
          />
        </View>

        {/* Next Button */}
        <TouchableOpacity
          style={[styles.nextButton, isLoading && styles.nextButtonDisabled]}
          onPress={sendOTP}
          disabled={isLoading || !phoneNumber.trim()}
        >
          {isLoading ? (
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
          By proceeding, you consent to get calls, WhatsApp or SMS messages, including by automated
          means, from Uber and its affiliates to the number provided.
        </Text>
      </View>

      {/* Country Picker Modal */}
      <Modal visible={showCountryPicker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowCountryPicker(false)}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Country</Text>
            <View style={styles.modalPlaceholder} />
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#666" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search countries..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#999"
            />
          </View>

          {/* Country List */}
          <FlatList
            data={filteredCountries}
            renderItem={renderCountryItem}
            keyExtractor={(item, index) => `${item.country}-${index}`}
            style={styles.countryList}
            showsVerticalScrollIndicator={false}
          />
        </SafeAreaView>
      </Modal>
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
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    gap: 4,
  },
  selectedFlag: {
    fontSize: 24,
  },
  countryCodeContainer: {
    paddingRight: 12,
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
    marginRight: 12,
  },
  countryCodeText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 4,
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

  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalCloseText: {
    color: '#4CAF50',
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalPlaceholder: {
    width: 60,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    margin: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  countryList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 16,
  },
  countryFlag: {
    fontSize: 24,
  },
  countryInfo: {
    flex: 1,
  },
  countryName: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  countryCode: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
});
