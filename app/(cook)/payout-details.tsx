import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';
import { useOnboarding } from '@/src/context/OnboardingContext';
import { VERIFICATION_BUCKET, VerificationDocType } from '@/src/constants/verification';
import { BankSelect } from '@/src/components/inputs/BankSelect';

const DISH_IMAGES_BUCKET = 'dish-images';

/**
 * Cook payout details — Bank Name, Bank Account Name, Bank Account Number.
 * Earnings are transferred to this account, so no card is collected.
 *
 * Two modes:
 *  - Default: edit screen reached from Account → Payment Settings.
 *  - `onboarding=cook`: final step of the legacy multi-screen onboarding
 *    chain; saving here commits the whole application (dish, address,
 *    food-safety docs, bank details) in one go.
 */
export default function PayoutDetailsScreen() {
  const router = useRouter();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const isCookOnboarding = onboarding === 'cook';
  const { user } = useAuth();
  const {
    dish: onboardingDish,
    address: onboardingAddress,
    foodSafety: onboardingFoodSafety,
    reset: resetOnboarding,
  } = useOnboarding();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  const accountNameRef = useRef<TextInput>(null);
  const accountNumberRef = useRef<TextInput>(null);

  // Load existing payout details (edit mode; harmless during onboarding).
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('bank_name, bank_account_name, bank_account_number')
          .eq('user_id', user.id)
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        if (data) {
          setBankName(data.bank_name ?? '');
          setAccountName(data.bank_account_name ?? '');
          setAccountNumber(data.bank_account_number ?? '');
        }
      } catch (e: any) {
        console.warn('Could not load payout details', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const onAccountNumberChange = (text: string) => {
    setAccountNumber(text.replace(/\D/g, '').slice(0, 20));
  };

  const validate = (): string | null => {
    if (!bankName.trim()) return 'Please enter your bank name.';
    if (!accountName.trim()) return 'Please enter the account holder name.';
    if (accountNumber.length < 8) return 'Bank account number must be at least 8 digits.';
    return null;
  };

  const isComplete =
    bankName.trim().length > 0 && accountName.trim().length > 0 && accountNumber.length >= 8;

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      Alert.alert('Check your bank details', err);
      return;
    }
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to save your payout details.');
      return;
    }
    setSaving(true);
    try {
      const bankFields = {
        bank_name: bankName.trim(),
        bank_account_name: accountName.trim(),
        bank_account_number: accountNumber,
      };

      // ── Onboarding commit: write the dish + food safety + bank details to
      // the DB now that the cook has reached the final step. If any step fails
      // the whole submission is aborted so we don't leave half-application
      // rows behind.
      if (isCookOnboarding) {
        if (!onboardingDish || !onboardingAddress || !onboardingFoodSafety) {
          Alert.alert(
            'Missing details',
            'Some onboarding details are missing. Please go back and complete each step.'
          );
          return;
        }

        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .single();
        if (profileErr || !profile) throw new Error('Profile not found for your account.');

        // 1. Upload dish photo (if any) → public URL.
        let dishImageUrl: string | null = null;
        if (onboardingDish.photoUri) {
          const ext = (onboardingDish.photoUri.split('.').pop() || 'jpg').toLowerCase();
          const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          const path = `${profile.id}/${Date.now()}.${ext}`;
          const response = await fetch(onboardingDish.photoUri);
          const arrayBuffer = await response.arrayBuffer();
          const { error: uploadErr } = await supabase.storage
            .from(DISH_IMAGES_BUCKET)
            .upload(path, arrayBuffer, { contentType, upsert: false });
          if (uploadErr) throw uploadErr;
          const { data: pub } = supabase.storage.from(DISH_IMAGES_BUCKET).getPublicUrl(path);
          dishImageUrl = pub.publicUrl;
        }

        // 2. Insert listing row. The rough public-facing location comes from
        // the onboarding address the cook just entered.
        const { error: insertErr } = await supabase.from('listings').insert({
          cook_id: profile.id,
          title: onboardingDish.title,
          description: onboardingDish.description,
          price: onboardingDish.price,
          image_url: dishImageUrl,
          cuisine: onboardingDish.cuisine,
          dietary_tags: onboardingDish.dietaryTags,
          ingredients: onboardingDish.ingredients,
          location: onboardingAddress.locality || null,
          is_active: true,
        });
        if (insertErr) throw insertErr;

        // 3. Upload optional verification documents → queue for admin review.
        // Approval of either doc grants the Tier 1 "Verified" badge.
        let certificatePath: string | null = null;
        for (const doc of onboardingFoodSafety.documents) {
          const fallbackExt = doc.fileName.split('.').pop()?.toLowerCase() ?? 'pdf';
          const path = `${user.id}/${doc.docType}-${Date.now()}.${fallbackExt}`;
          const response = await fetch(doc.uri);
          const arrayBuffer = await response.arrayBuffer();
          const { error: uploadErr } = await supabase.storage
            .from(VERIFICATION_BUCKET)
            .upload(path, arrayBuffer, {
              contentType: doc.mimeType ?? 'application/pdf',
              upsert: false,
            });
          if (uploadErr) throw uploadErr;

          const { error: docErr } = await supabase.from('verification_documents').insert({
            user_id: user.id,
            doc_type: doc.docType as VerificationDocType,
            storage_path: path,
            status: 'pending',
          });
          if (docErr) throw docErr;
          if (doc.docType === 'food_handler_certificate') certificatePath = path;
        }

        // 4. Update profile with address + food safety + bank details in one
        // go. The legacy license columns stay populated so older read paths
        // keep working.
        const { error: profileUpdateErr } = await supabase
          .from('profiles')
          .update({
            address_country: onboardingAddress.country,
            address_flat: onboardingAddress.flat || null,
            address_property_name: onboardingAddress.property_name || null,
            address_street: onboardingAddress.street,
            address_locality: onboardingAddress.locality || null,
            address_town: onboardingAddress.town,
            address_postcode: onboardingAddress.postcode,
            hosting_type: onboardingFoodSafety.hostingType,
            has_food_safety_license: certificatePath != null,
            food_safety_license_url: certificatePath,
            ...bankFields,
          })
          .eq('user_id', user.id);
        if (profileUpdateErr) throw profileUpdateErr;

        resetOnboarding();

        Alert.alert(
          'Application submitted!',
          "Thanks! Your dishes and food-safety details are under admin review. We'll notify you once you're approved to start cooking.",
          [
            {
              text: 'OK',
              onPress: () => router.replace('/(user)/(tabs)/home'),
            },
          ]
        );
        return;
      }

      // ── Normal "edit from account" path: write straight to DB.
      const { error } = await supabase.from('profiles').update(bankFields).eq('user_id', user.id);
      if (error) throw error;
      Alert.alert('Payout details saved', 'Your earnings will be transferred to this account.');
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save payout details', e.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isCookOnboarding ? 'Add payout details' : 'Payment Settings'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.formContainer}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.instruction}>
            Earnings from your completed orders are transferred to this bank account.
          </Text>

          <Text style={styles.fieldLabel}>BANK NAME</Text>
          <BankSelect value={bankName} onChange={setBankName} />

          <Text style={styles.fieldLabel}>BANK ACCOUNT NAME</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              ref={accountNameRef}
              placeholder="Full name as registered with your bank"
              style={styles.input}
              value={accountName}
              onChangeText={setAccountName}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => accountNumberRef.current?.focus()}
            />
          </View>

          <Text style={styles.fieldLabel}>BANK ACCOUNT NUMBER</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="keypad-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              ref={accountNumberRef}
              placeholder="e.g. 1122334455"
              style={styles.input}
              keyboardType="number-pad"
              inputMode="numeric"
              value={accountNumber}
              onChangeText={onAccountNumberChange}
              maxLength={20}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, (!isComplete || saving) && styles.primaryButtonDisabled]}
            onPress={handleSubmit}
            disabled={!isComplete || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isCookOnboarding ? 'Submit application' : 'Save payout details'}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            Double-check your account number — payouts to a wrong account can't be recalled.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  backButton: { padding: 5 },
  formContainer: { padding: 20 },
  instruction: { fontSize: 14, color: '#666', marginBottom: 20, textAlign: 'center' },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16 },
  primaryButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 15,
  },
  primaryButtonDisabled: { backgroundColor: '#a5d6a7' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disclaimer: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
