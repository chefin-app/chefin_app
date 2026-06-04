import React, { useState, useEffect, useRef } from 'react';
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@chefin:payment-method';

type SavedCard = {
  brand: string;
  last4: string;
  expMonth: string; // "01"-"12"
  expYear: string; // "YY"
};

const detectBrand = (digits: string): string => {
  if (/^4/.test(digits)) return 'Visa';
  if (/^3[47]/.test(digits)) return 'Amex';
  if (/^5[1-5]/.test(digits) || /^2(2[2-9]|[3-6]|7[01]|720)/.test(digits)) return 'Mastercard';
  if (/^6(011|5|4[4-9])/.test(digits)) return 'Discover';
  return digits.length > 0 ? 'Card' : '';
};

// Luhn checksum
const luhnValid = (digits: string): boolean => {
  if (digits.length < 13) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits.charAt(i), 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
};

const formatCardNumber = (digits: string): string => digits.replace(/(.{4})/g, '$1 ').trim();

const formatExpiry = (digits: string): string =>
  digits.length >= 3 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;

export default function PaymentMethodScreen() {
  const router = useRouter();
  const [savedCard, setSavedCard] = useState<SavedCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [cardDigits, setCardDigits] = useState('');
  const [expDigits, setExpDigits] = useState('');
  const [cvcDigits, setCvcDigits] = useState('');
  const [saving, setSaving] = useState(false);

  const cardRef = useRef<TextInput>(null);
  const expRef = useRef<TextInput>(null);
  const cvcRef = useRef<TextInput>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setSavedCard(JSON.parse(raw));
      } catch (e) {
        console.warn('Failed to load saved card', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const resetForm = () => {
    setCardDigits('');
    setExpDigits('');
    setCvcDigits('');
  };

  const onCardChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 16);
    setCardDigits(digits);
    if (digits.length === 16) expRef.current?.focus();
  };

  const onExpChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 4);
    setExpDigits(digits);
    if (digits.length === 4) cvcRef.current?.focus();
  };

  const onCvcChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 3);
    setCvcDigits(digits);
    if (digits.length === 3) cvcRef.current?.blur();
  };

  const validate = (): string | null => {
    if (cardDigits.length !== 16) return 'Card number must be 16 digits.';
    if (!luhnValid(cardDigits)) return 'That card number doesn’t look right.';
    if (expDigits.length !== 4) return 'Expiry must be MM/YY.';
    const mm = parseInt(expDigits.slice(0, 2), 10);
    const yy = parseInt(expDigits.slice(2), 10);
    if (mm < 1 || mm > 12) return 'Expiry month must be 01–12.';
    const now = new Date();
    // Card valid through end of expiry month; compare against first of current month.
    const expEndOfMonth = new Date(2000 + yy, mm, 0); // last day of MM/20YY
    if (expEndOfMonth < new Date(now.getFullYear(), now.getMonth(), 1)) {
      return 'This card has expired.';
    }
    if (cvcDigits.length !== 3) return 'CVC must be 3 digits.';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      Alert.alert('Check your card details', err);
      return;
    }
    setSaving(true);
    try {
      const card: SavedCard = {
        brand: detectBrand(cardDigits),
        last4: cardDigits.slice(-4),
        expMonth: expDigits.slice(0, 2),
        expYear: expDigits.slice(2),
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(card));
      setSavedCard(card);
      setShowForm(false);
      resetForm();
      Alert.alert('Card added', `${card.brand} ending in ${card.last4} is now your default.`);
    } catch (e: any) {
      Alert.alert('Could not save card', e.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    Alert.alert('Remove card?', 'You can add it again any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(STORAGE_KEY);
          setSavedCard(null);
        },
      },
    ]);
  };

  const beginAddFlow = () => {
    resetForm();
    setShowForm(true);
    // Defer to allow render, then focus
    setTimeout(() => cardRef.current?.focus(), 50);
  };

  const Header = ({ title }: { title: string }) => (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => (showForm ? setShowForm(false) : router.back())}
        style={styles.backButton}
      >
        <Ionicons name="chevron-back" size={24} color="#000" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  // ---- Add Card form ----
  if (showForm) {
    const brand = detectBrand(cardDigits);
    const isComplete = cardDigits.length === 16 && expDigits.length === 4 && cvcDigits.length === 3;

    return (
      <SafeAreaView style={styles.container}>
        <Header title="Add payment method" />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.formContainer}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.instruction}>
              This card will only be charged when you place an order.
            </Text>

            <Text style={styles.fieldLabel}>CARD NUMBER</Text>
            <View style={styles.cardInputWrapper}>
              <Ionicons name="card" size={22} color="#666" style={styles.cardIcon} />
              <TextInput
                ref={cardRef}
                placeholder="1234 5678 9012 3456"
                style={styles.cardInput}
                keyboardType="number-pad"
                inputMode="numeric"
                value={formatCardNumber(cardDigits)}
                onChangeText={onCardChange}
                maxLength={19}
                autoComplete="cc-number"
                textContentType="creditCardNumber"
                returnKeyType="next"
              />
              {brand && <Text style={styles.brandTag}>{brand}</Text>}
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.fieldLabel}>EXPIRY</Text>
                <TextInput
                  ref={expRef}
                  placeholder="MM/YY"
                  style={styles.halfInput}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  value={formatExpiry(expDigits)}
                  onChangeText={onExpChange}
                  maxLength={5}
                  returnKeyType="next"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>CVC</Text>
                <TextInput
                  ref={cvcRef}
                  placeholder="123"
                  style={styles.halfInput}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  value={cvcDigits}
                  onChangeText={onCvcChange}
                  maxLength={3}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!isComplete || saving) && styles.primaryButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!isComplete || saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Add Card</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              For testing only — card data is stored locally on this device. Production payments
              should be tokenised via Stripe, Apple Pay, or similar.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ---- Saved card view ----
  if (savedCard) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Payment Method" />
        <View style={styles.savedContainer}>
          <View style={styles.cardChip}>
            <View style={styles.cardChipTop}>
              <Text style={styles.cardChipBrand}>{savedCard.brand}</Text>
              <Ionicons name="card" size={28} color="#fff" />
            </View>
            <Text style={styles.cardChipNumber}>
              {'•••• •••• •••• '}
              {savedCard.last4}
            </Text>
            <View style={styles.cardChipBottom}>
              <Text style={styles.cardChipLabel}>EXPIRES</Text>
              <Text style={styles.cardChipValue}>
                {savedCard.expMonth}/{savedCard.expYear}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.secondaryButton} onPress={beginAddFlow}>
            <Ionicons name="add" size={20} color="#000" />
            <Text style={styles.secondaryButtonText}> Replace card</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.removeButton} onPress={handleRemove}>
            <Ionicons name="trash-outline" size={18} color="#FF5252" />
            <Text style={styles.removeButtonText}> Remove card</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ---- Empty state ----
  return (
    <SafeAreaView style={styles.container}>
      <Header title="Payment Method" />
      <View style={styles.emptyContainer}>
        <View style={styles.iconContainer}>
          <Ionicons name="card" size={60} color="#4CAF50" />
        </View>
        <Text style={styles.emptyTitle}>No payment method added</Text>
        <Text style={styles.emptySubtitle}>
          You have not added any payment methods yet. Tap below to add one.
        </Text>
        <TouchableOpacity style={styles.addButton} onPress={beginAddFlow}>
          <Ionicons name="add" size={20} color="#4CAF50" />
          <Text style={styles.addButtonText}> Add a card</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  backButton: { padding: 5 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', marginBottom: 10 },
  emptySubtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 30 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  addButtonText: { color: '#4CAF50', fontWeight: '600', fontSize: 16 },
  formContainer: { padding: 20 },
  instruction: { fontSize: 14, color: '#666', marginBottom: 20, textAlign: 'center' },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  cardInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  cardIcon: { marginRight: 10 },
  cardInput: { flex: 1, fontSize: 16 },
  brandTag: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
    marginLeft: 8,
  },
  row: { flexDirection: 'row', marginBottom: 30 },
  halfInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 15,
  },
  primaryButtonDisabled: { backgroundColor: '#a5d6a7' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 12,
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '600', marginLeft: 4 },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  removeButtonText: { fontSize: 15, fontWeight: '600', color: '#FF5252', marginLeft: 4 },
  disclaimer: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  savedContainer: { padding: 20 },
  cardChip: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 22,
    marginBottom: 24,
    minHeight: 180,
    justifyContent: 'space-between',
  },
  cardChipTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardChipBrand: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardChipNumber: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '500',
    letterSpacing: 2,
    marginVertical: 16,
  },
  cardChipBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardChipLabel: {
    color: '#9ca3af',
    fontSize: 11,
    letterSpacing: 0.8,
  },
  cardChipValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});
