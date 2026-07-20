import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COUNTRY_CODES, Country } from '@/src/constants/countryCodes';

type CountryCodeSelectorProps = {
  value: Country;
  onChange: (country: Country) => void;
};

/**
 * Flag + dialling-code button that opens a searchable country list. Sits
 * inline at the front of a phone-number field.
 */
export const CountryCodeSelector = ({ value, onChange }: CountryCodeSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? COUNTRY_CODES.filter(
        c =>
          c.name.toLowerCase().includes(query.trim().toLowerCase()) || c.code.includes(query.trim())
      )
    : COUNTRY_CODES;

  const select = (country: Country) => {
    onChange(country);
    setQuery('');
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.selector} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={styles.flag}>{value.flag}</Text>
        <Text style={styles.code}>{value.code}</Text>
        <Ionicons name="chevron-down" size={16} color="#666" />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setOpen(false)} style={styles.modalCloseButton}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Country</Text>
            <View style={styles.modalPlaceholder} />
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#666" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search countries..."
              value={query}
              onChangeText={setQuery}
              placeholderTextColor="#999"
              autoCorrect={false}
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item, index) => `${item.country}-${index}`}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            renderItem={({ item }) => {
              const selected = item.country === value.country && item.code === value.code;
              return (
                <TouchableOpacity style={styles.countryItem} onPress={() => select(item)}>
                  <Text style={styles.countryFlag}>{item.flag}</Text>
                  <View style={styles.countryInfo}>
                    <Text style={styles.countryName}>{item.name}</Text>
                    <Text style={styles.countryCode}>{item.code}</Text>
                  </View>
                  {selected && <Ionicons name="checkmark" size={20} color="#4CAF50" />}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 10,
    marginRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
  },
  flag: { fontSize: 22 },
  code: { fontSize: 16, color: '#333', fontWeight: '500' },

  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalCloseButton: { padding: 4 },
  modalCloseText: { color: '#4CAF50', fontSize: 16 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  modalPlaceholder: { width: 60 },
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
  searchInput: { flex: 1, fontSize: 16, color: '#333' },
  list: { flex: 1, paddingHorizontal: 20 },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 16,
  },
  countryFlag: { fontSize: 24 },
  countryInfo: { flex: 1 },
  countryName: { fontSize: 16, color: '#333', fontWeight: '500' },
  countryCode: { fontSize: 14, color: '#666', marginTop: 2 },
});
