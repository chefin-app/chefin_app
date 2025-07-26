// import { Ionicons } from '@expo/vector-icons';
// import { router, useLocalSearchParams } from 'expo-router';
// import React, { useEffect, useRef, useState } from 'react';
// import {
//   Alert,
//   Keyboard,
//   KeyboardAvoidingView,
//   Platform,
//   SafeAreaView,
//   StyleSheet,
//   Text,
//   TextInput,
//   TouchableOpacity,
//   View,
// } from 'react-native';
// import { supabase } from '../../utils/supabase';

// export default function EmailOTPScreen() {
//   const params = useLocalSearchParams();
//   const email = (params.email as string) || '';

//   // OTP STATE
//   const [otp, setOtp] = useState(['', '', '', '']);
//   const [isLoading, setIsLoading] = useState(false);

//   // REFS FOR INPUT FOCUS MANAGEMENT
//   const inputRefs = useRef<(TextInput | null)[]>([]);

//   // AUTO-FOCUS FIRST INPUT ON MOUNT
//   useEffect(() => {
//     inputRefs.current[0]?.focus();
//   }, []);

//   // HANDLE OTP INPUT CHANGE
//   const handleOtpChange = (value: string, index: number) => {
//     // Only allow numbers
//     if (value && !/^\d+$/.test(value)) return;

//     const newOtp = [...otp];
//     newOtp[index] = value;
//     setOtp(newOtp);

//     // Auto-focus next input
//     if (value && index < 3) {
//       inputRefs.current[index + 1]?.focus();
//     }

//     // Auto-submit when all digits are entered
//     if (value && index === 3 && newOtp.every(digit => digit)) {
//       handleVerifyOTP(newOtp.join(''));
//     }
//   };

//   // HANDLE BACKSPACE
//   const handleKeyPress = (e: any, index: number) => {
//     if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
//       inputRefs.current[index - 1]?.focus();
//     }
//   };

//   // VERIFY OTP
//   const handleVerifyOTP = async (otpCode?: string) => {
//     const code = otpCode || otp.join('');

//     if (code.length !== 4) {
//       Alert.alert('Error', 'Please enter the complete 4-digit code');
//       return;
//     }

//     setIsLoading(true);

//     try {
//       const { error } = await supabase.auth.verifyOtp({
//         email: email,
//         token: code,
//         type: 'email',
//       });

//       //   if (error) throw error;

//       // Success - navigate to explore
//       router.replace('/(tabs)/explore');
//     } catch (error: any) {
//       Alert.alert('Error', error.message || 'Invalid code. Please try again.');
//       // Clear OTP on error
//       setOtp(['', '', '', '']);
//       inputRefs.current[0]?.focus();
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   // RESEND OTP
//   const handleResendOTP = async () => {
//     try {
//       const { error } = await supabase.auth.signInWithOtp({
//         email: email,
//       });

//       if (error) throw error;

//       Alert.alert('Success', 'A new code has been sent to your email');

//       // Clear existing OTP
//       setOtp(['', '', '', '']);
//       inputRefs.current[0]?.focus();
//     } catch (error: any) {
//       Alert.alert('Error', error.message);
//     }
//   };

//   return (
//     <SafeAreaView style={styles.container}>
//       <KeyboardAvoidingView
//         behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
//         style={styles.keyboardView}
//       >
//         <View style={styles.content}>
//           {/* BACK BUTTON */}
//           <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
//             <Ionicons name="arrow-back" size={24} color="#333" />
//           </TouchableOpacity>

//           {/* TITLE */}
//           <Text style={styles.title}>
//             Enter the 4-digit code sent to you{'\n'}
//             at: {email}
//           </Text>

//           {/* OTP INPUT BOXES */}
//           <View style={styles.otpContainer}>
//             {otp.map((digit, index) => (
//               <TextInput
//                 key={index}
//                 ref={ref => {
//                   inputRefs.current[index] = ref;
//                 }}
//                 style={[
//                   styles.otpInput,
//                   digit ? styles.otpInputFilled : styles.otpInputEmpty,
//                   index === 0 && !digit ? styles.otpInputActive : null,
//                 ]}
//                 value={digit}
//                 onChangeText={value => handleOtpChange(value, index)}
//                 onKeyPress={e => handleKeyPress(e, index)}
//                 keyboardType="number-pad"
//                 maxLength={1}
//                 selectTextOnFocus
//                 textAlign="center"
//               />
//             ))}
//           </View>

//           {/* HELPER TEXT */}
//           <Text style={styles.helperText}>Tip: Make sure to check your inbox and spam folders</Text>

//           {/* RESEND LINK */}
//           <TouchableOpacity style={styles.resendButton} onPress={handleResendOTP}>
//             <Text style={styles.resendText}>Didn't receive a code? </Text>
//             <Text style={styles.resendLink}>Resend</Text>
//           </TouchableOpacity>

//           {/* SPACER */}
//           <View style={styles.spacer} />

//           {/* NEXT BUTTON */}
//           <TouchableOpacity
//             style={[
//               styles.nextButton,
//               otp.join('').length === 4 ? styles.nextButtonActive : styles.nextButtonDisabled,
//             ]}
//             onPress={() => handleVerifyOTP()}
//             disabled={otp.join('').length !== 4 || isLoading}
//           >
//             <Text style={styles.nextButtonText}>Next</Text>
//             <Ionicons name="arrow-forward" size={20} color="#666" />
//           </TouchableOpacity>
//         </View>
//       </KeyboardAvoidingView>
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: '#fff',
//   },
//   keyboardView: {
//     flex: 1,
//   },
//   content: {
//     flex: 1,
//     paddingHorizontal: 24,
//     paddingTop: 20,
//   },
//   backButton: {
//     alignSelf: 'flex-start',
//     marginBottom: 32,
//     padding: 4,
//   },
//   title: {
//     fontSize: 16,
//     lineHeight: 24,
//     color: '#333',
//     marginBottom: 32,
//   },
//   otpContainer: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     marginBottom: 24,
//     gap: 12,
//   },
//   otpInput: {
//     flex: 1,
//     height: 56,
//     borderRadius: 12,
//     fontSize: 24,
//     fontWeight: '600',
//     color: '#333',
//   },
//   otpInputEmpty: {
//     backgroundColor: '#F5F5F5',
//     borderWidth: 1,
//     borderColor: '#F5F5F5',
//   },
//   otpInputFilled: {
//     backgroundColor: '#E8F5E9',
//     borderWidth: 1,
//     borderColor: '#4CAF50',
//   },
//   otpInputActive: {
//     borderWidth: 1,
//     borderColor: '#4CAF50',
//     backgroundColor: '#F5FFF5',
//   },
//   helperText: {
//     fontSize: 13,
//     color: '#999',
//     marginBottom: 16,
//   },
//   resendButton: {
//     flexDirection: 'row',
//     alignSelf: 'flex-start',
//     marginBottom: 'auto',
//   },
//   resendText: {
//     fontSize: 14,
//     color: '#666',
//   },
//   resendLink: {
//     fontSize: 14,
//     color: '#4CAF50',
//     fontWeight: '500',
//   },
//   spacer: {
//     flex: 1,
//   },
//   nextButton: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'center',
//     paddingVertical: 16,
//     paddingHorizontal: 32,
//     borderRadius: 30,
//     alignSelf: 'center',
//     marginBottom: 40,
//     gap: 8,
//   },
//   nextButtonDisabled: {
//     backgroundColor: '#F5F5F5',
//   },
//   nextButtonActive: {
//     backgroundColor: '#E8E8E8',
//   },
//   nextButtonText: {
//     fontSize: 16,
//     color: '#666',
//     fontWeight: '500',
//   },
// });
