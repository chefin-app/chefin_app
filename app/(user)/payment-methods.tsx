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
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/services/auth-context';
import {
  createSavedPaymentCard,
  emptyPaymentMethods,
  loadPaymentMethods,
  savePaymentMethods,
  type SavedPaymentCard,
  type StoredPaymentMethods,
} from '@/src/utils/payment-method-storage';

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

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const ScreenHeader = ({ title, onBack }: { title: string; onBack: () => void }) => (
  <View style={styles.header}>
    <TouchableOpacity
      onPress={onBack}
      style={styles.backButton}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Ionicons name="chevron-back" size={24} color="#000" />
    </TouchableOpacity>
    <Text style={styles.headerTitle}>{title}</Text>
    <View style={styles.headerSpacer} />
  </View>
);

export default function PaymentMethodScreen() {
  const router = useRouter();
  // When opened from checkout (cart has no saved card yet), come back to the
  // cart afterwards instead of leaving the user stranded on this screen.
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { user, canMutate } = useAuth();
  const [paymentMethods, setPaymentMethods] = useState<StoredPaymentMethods>(() =>
    emptyPaymentMethods()
  );
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
    let cancelled = false;
    (async () => {
      try {
        const storedMethods = await loadPaymentMethods(user?.id);
        if (!cancelled) setPaymentMethods(storedMethods);
      } catch (e) {
        console.warn('Failed to load saved cards', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const resetForm = () => {
    setCardDigits('');
    setExpDigits('');
    setCvcDigits('');
  };

  const onCardChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 19);
    setCardDigits(digits);
  };

  const onExpChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 4);
    setExpDigits(digits);
    if (digits.length === 4) cvcRef.current?.focus();
  };

  const onCvcChange = (text: string) => {
    const expectedLength = detectBrand(cardDigits) === 'Amex' ? 4 : 3;
    const digits = text.replace(/\D/g, '').slice(0, expectedLength);
    setCvcDigits(digits);
    if (digits.length === expectedLength) cvcRef.current?.blur();
  };

  const validate = (): string | null => {
    if (cardDigits.length < 13 || cardDigits.length > 19) {
      return 'Card number must be between 13 and 19 digits.';
    }
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
    const expectedCvcLength = detectBrand(cardDigits) === 'Amex' ? 4 : 3;
    if (cvcDigits.length !== expectedCvcLength) {
      return `CVC must be ${expectedCvcLength} digits.`;
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!canMutate) {
      Alert.alert(
        'Payment methods are read-only',
        'You cannot add or change payment methods while your account is restricted.'
      );
      return;
    }
    const err = validate();
    if (err) {
      Alert.alert('Check your card details', err);
      return;
    }
    setSaving(true);
    try {
      const metadata = {
        brand: detectBrand(cardDigits),
        last4: cardDigits.slice(-4),
        expMonth: expDigits.slice(0, 2),
        expYear: expDigits.slice(2),
      };
      const duplicate = paymentMethods.cards.find(
        card =>
          card.brand === metadata.brand &&
          card.last4 === metadata.last4 &&
          card.expMonth === metadata.expMonth &&
          card.expYear === metadata.expYear
      );
      const card = duplicate ?? createSavedPaymentCard(metadata);
      const nextMethods: StoredPaymentMethods = {
        version: 2,
        cards: duplicate ? paymentMethods.cards : [...paymentMethods.cards, card],
        defaultCardId: card.id,
      };

      await savePaymentMethods(user?.id, nextMethods);
      setPaymentMethods(nextMethods);
      setShowForm(false);
      resetForm();

      if (returnTo) {
        // Came from checkout — go straight back instead of leaving the user
        // stranded on the payment method screen.
        Alert.alert(
          duplicate ? 'Card selected' : 'Card added',
          `${card.brand} ending in ${card.last4} is now your default.`,
          [{ text: 'OK', onPress: () => router.replace(returnTo as Href) }]
        );
      } else {
        Alert.alert(
          duplicate ? 'Card already saved' : 'Card added',
          `${card.brand} ending in ${card.last4} is now your default.`
        );
      }
    } catch (error: unknown) {
      Alert.alert('Could not save card', errorMessage(error, 'Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (card: SavedPaymentCard) => {
    if (!canMutate) {
      Alert.alert(
        'Payment methods are read-only',
        'You cannot remove payment methods while your account is restricted.'
      );
      return;
    }
    Alert.alert('Remove card?', `${card.brand} ending in ${card.last4} will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const remainingCards = paymentMethods.cards.filter(item => item.id !== card.id);
          const nextMethods: StoredPaymentMethods = {
            version: 2,
            cards: remainingCards,
            defaultCardId:
              paymentMethods.defaultCardId === card.id
                ? (remainingCards[0]?.id ?? null)
                : paymentMethods.defaultCardId,
          };
          try {
            await savePaymentMethods(user?.id, nextMethods);
            setPaymentMethods(nextMethods);
          } catch (error: unknown) {
            Alert.alert('Could not remove card', errorMessage(error, 'Please try again.'));
          }
        },
      },
    ]);
  };

  const handleSetDefault = async (card: SavedPaymentCard) => {
    if (!canMutate) {
      Alert.alert(
        'Payment methods are read-only',
        'You cannot change your default card while your account is restricted.'
      );
      return;
    }
    if (paymentMethods.defaultCardId === card.id) return;
    const nextMethods: StoredPaymentMethods = {
      ...paymentMethods,
      defaultCardId: card.id,
    };
    try {
      await savePaymentMethods(user?.id, nextMethods);
      setPaymentMethods(nextMethods);
    } catch (error: unknown) {
      Alert.alert('Could not update card', errorMessage(error, 'Please try again.'));
    }
  };

  const beginAddFlow = () => {
    if (!canMutate) {
      Alert.alert(
        'Payment methods are read-only',
        'You cannot add payment methods while your account is restricted.'
      );
      return;
    }
    resetForm();
    setShowForm(true);
    // Defer to allow render, then focus
    setTimeout(() => cardRef.current?.focus(), 50);
  };

  const handleBack = () => {
    if (showForm) {
      resetForm();
      setShowForm(false);
    } else {
      router.back();
    }
  };

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
    const expectedCvcLength = brand === 'Amex' ? 4 : 3;
    const isComplete =
      cardDigits.length >= 13 && expDigits.length === 4 && cvcDigits.length === expectedCvcLength;

    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader
          title={paymentMethods.cards.length > 0 ? 'Add another card' : 'Add a card'}
          onBack={handleBack}
        />
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.formContainer}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.demoNotice}>
              <Ionicons name="information-circle-outline" size={22} color="#8A5A00" />
              <Text style={styles.demoNoticeText}>
                Demo payment flow. No real payment is processed. Only the card brand, last four
                digits and expiry are saved on this device; the card number and CVC are discarded.
              </Text>
            </View>

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
                maxLength={23}
                autoComplete="cc-number"
                textContentType="creditCardNumber"
                returnKeyType="next"
                placeholderTextColor="#a3a3a3ff"
                onSubmitEditing={() => expRef.current?.focus()}
              />
              {brand && <Text style={styles.brandTag}>{brand}</Text>}
            </View>

            <View style={styles.row}>
              <View style={styles.expiryColumn}>
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
                  placeholderTextColor="#a3a3a3ff"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.formColumn}>
                <Text style={styles.fieldLabel}>CVC</Text>
                <TextInput
                  ref={cvcRef}
                  placeholder={expectedCvcLength === 4 ? '1234' : '123'}
                  style={styles.halfInput}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  value={cvcDigits}
                  onChangeText={onCvcChange}
                  maxLength={expectedCvcLength}
                  secureTextEntry
                  placeholderTextColor="#a3a3a3ff"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!isComplete || saving || !canMutate) && styles.primaryButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!isComplete || saving || !canMutate}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Add Card</Text>
              )}
            </TouchableOpacity>

            <View style={styles.providerNote}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#5F6368" />
              <Text style={styles.providerNoteText}>
                A PCI-compliant payment provider must replace this local demo before launch.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ---- Saved cards view ----
  if (paymentMethods.cards.length > 0) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Payment Methods" onBack={handleBack} />
        <ScrollView contentContainerStyle={styles.savedContainer}>
          <Text style={styles.savedTitle}>Saved cards</Text>
          <Text style={styles.savedSubtitle}>Select the card to use by default at checkout.</Text>

          <View style={styles.cardsList}>
            {paymentMethods.cards.map(card => {
              const isDefault = card.id === paymentMethods.defaultCardId;
              return (
                <View key={card.id} style={[styles.savedCard, isDefault && styles.defaultCard]}>
                  <TouchableOpacity
                    style={styles.cardSelection}
                    onPress={() => handleSetDefault(card)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isDefault }}
                    accessibilityLabel={`${card.brand} ending in ${card.last4}`}
                  >
                    <View style={styles.savedCardIcon}>
                      <Ionicons name="card" size={25} color="#2E7D32" />
                    </View>
                    <View style={styles.savedCardDetails}>
                      <View style={styles.savedCardTitleRow}>
                        <Text style={styles.savedCardTitle}>{card.brand}</Text>
                        {isDefault && <Text style={styles.defaultPill}>DEFAULT</Text>}
                      </View>
                      <Text style={styles.savedCardNumber}>•••• {card.last4}</Text>
                      <Text style={styles.savedCardExpiry}>
                        Expires {card.expMonth}/{card.expYear}
                      </Text>
                    </View>
                    <Ionicons
                      name={isDefault ? 'radio-button-on' : 'radio-button-off'}
                      size={23}
                      color={isDefault ? '#4CAF50' : '#BDBDBD'}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cardRemoveButton}
                    onPress={() => handleRemove(card)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${card.brand} ending in ${card.last4}`}
                  >
                    <Ionicons name="trash-outline" size={19} color="#C62828" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.addAnotherButton, !canMutate && styles.restrictedAction]}
            onPress={beginAddFlow}
          >
            <Ionicons name="add-circle-outline" size={22} color="#2E7D32" />
            <Text style={styles.addAnotherButtonText}>Add another card</Text>
          </TouchableOpacity>

          <View style={styles.localStorageNotice}>
            <Ionicons name="phone-portrait-outline" size={18} color="#616161" />
            <Text style={styles.localStorageNoticeText}>
              These demo payment methods are available only on this device and do not process real
              charges.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- Empty state ----
  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Payment Methods" onBack={handleBack} />
      <View style={styles.emptyContainer}>
        <View style={styles.iconContainer}>
          <Ionicons name="card" size={60} color="#4CAF50" />
        </View>
        <Text style={styles.emptyTitle}>No payment method added</Text>
        <Text style={styles.emptySubtitle}>
          Add a demo card to choose a default payment method for checkout.
        </Text>
        <TouchableOpacity
          style={[styles.addButton, !canMutate && styles.restrictedAction]}
          onPress={beginAddFlow}
        >
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
  headerSpacer: { width: 40 },
  keyboardView: { flex: 1 },
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
  restrictedAction: { opacity: 0.45 },
  formContainer: { padding: 20 },
  demoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 12,
    backgroundColor: '#FFF8E1',
    padding: 14,
    marginBottom: 24,
  },
  demoNoticeText: {
    flex: 1,
    color: '#6D4C00',
    fontSize: 13,
    lineHeight: 19,
  },
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
  expiryColumn: { flex: 1, marginRight: 10 },
  formColumn: { flex: 1 },
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
  providerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  providerNoteText: {
    flex: 1,
    color: '#757575',
    fontSize: 12,
    lineHeight: 17,
  },
  savedContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  savedTitle: {
    color: '#1F2937',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 5,
  },
  savedSubtitle: {
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  cardsList: {
    gap: 12,
    marginBottom: 18,
  },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  defaultCard: {
    borderColor: '#66BB6A',
    backgroundColor: '#F4FBF4',
  },
  cardSelection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingLeft: 16,
    paddingRight: 12,
  },
  savedCardIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  savedCardDetails: {
    flex: 1,
  },
  savedCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  savedCardTitle: {
    color: '#1F2937',
    fontSize: 15,
    fontWeight: '700',
  },
  defaultPill: {
    color: '#2E7D32',
    backgroundColor: '#DFF3E1',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  savedCardNumber: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  savedCardExpiry: {
    color: '#7A7A7A',
    fontSize: 12,
  },
  cardRemoveButton: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderLeftWidth: 1,
    borderLeftColor: '#ECECEC',
  },
  addAnotherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#4CAF50',
    borderRadius: 14,
    paddingVertical: 15,
    marginBottom: 18,
  },
  addAnotherButtonText: {
    color: '#2E7D32',
    fontSize: 16,
    fontWeight: '700',
  },
  localStorageNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    padding: 13,
  },
  localStorageNoticeText: {
    flex: 1,
    color: '#616161',
    fontSize: 12,
    lineHeight: 17,
  },
});
