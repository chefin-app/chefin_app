import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const PaymentMethodScreen = () => {
  const router = useRouter();
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false); // Toggle this to test both states

  if (!hasPaymentMethod) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payment Method</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.emptyContainer}>
          <View style={styles.iconContainer}>
            <Ionicons name="card" size={60} color="#4CAF50" />
          </View>
          <Text style={styles.emptyTitle}>No payment method added</Text>
          <Text style={styles.emptySubtitle}>
            It seems like you have not added any payment methods. Click on the button below to add
            one.
          </Text>
          <TouchableOpacity style={styles.addButton} onPress={() => setHasPaymentMethod(true)}>
            <Ionicons name="camera" size={20} color="#4CAF50" />
            <Text style={styles.addButtonText}> Add your Cards</Text>
          </TouchableOpacity>
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
        <Text style={styles.headerTitle}>Add payment methods</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.formContainer}>
        <Text style={styles.instruction}>
          This card will only be charged when you place an order.
        </Text>

        <View style={styles.cardInputWrapper}>
          <Ionicons name="card" size={24} color="#666" style={styles.cardIcon} />
          <TextInput
            placeholder="4343 4343 4343 4343"
            style={styles.cardInput}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.row}>
          <TextInput
            placeholder="MM/YY"
            style={[styles.halfInput, { marginRight: 10 }]}
            keyboardType="numeric"
          />
          <TextInput placeholder="CVC" style={styles.halfInput} keyboardType="numeric" />
        </View>

        <TouchableOpacity style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Add Card</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton}>
          <Ionicons name="camera" size={20} color="#000" />
          <Text style={styles.secondaryButtonText}> Scan Card</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

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
  instruction: { fontSize: 16, color: '#666', marginBottom: 20, textAlign: 'center' },
  cardInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  cardIcon: { marginRight: 10 },
  cardInput: { flex: 1, fontSize: 16 },
  row: { flexDirection: 'row', marginBottom: 30 },
  halfInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 15,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingVertical: 16,
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '600', marginLeft: 8 },
});

export default PaymentMethodScreen;
