import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MALAYSIAN_BANKS } from '@/src/constants/banks';

type BankSelectProps = {
  value: string;
  onChange: (bank: string) => void;
  placeholder?: string;
};

/**
 * Bank Name picker constrained to the approved Malaysian bank list. Styled to
 * match the icon-prefixed payout fields (a tappable row that opens a full
 * searchable list), so it reads as one of the form inputs rather than a
 * separate control.
 */
export const BankSelect = ({
  value,
  onChange,
  placeholder = 'Select your bank',
}: BankSelectProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? MALAYSIAN_BANKS.filter(b => b.toLowerCase().includes(query.trim().toLowerCase()))
    : MALAYSIAN_BANKS;

  const select = (bank: string) => {
    onChange(bank);
    setQuery('');
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Ionicons name="business-outline" size={20} color="#666" style={styles.fieldIcon} />
        <Text style={[styles.fieldText, !value && styles.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={20} color="#666" />
      </TouchableOpacity>

      <Modal
        animationType="slide"
        visible={open}
        onRequestClose={() => setOpen(false)}
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer} edges={['top', 'left', 'right']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select your bank</Text>
            <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#1A1A1A" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrapper}>
            <Ionicons name="search" size={18} color="#888" style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Search banks"
              placeholderTextColor="#999"
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={item => item}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={<Text style={styles.emptyText}>No banks match “{query}”.</Text>}
            renderItem={({ item }) => {
              const selected = item === value;
              return (
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => select(item)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {item}
                  </Text>
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
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  fieldIcon: { marginRight: 10 },
  fieldText: { flex: 1, fontSize: 16, color: '#1A1A1A' },
  placeholder: { color: '#999' },

  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  closeButton: { padding: 4 },

  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1A1A1A' },

  separator: { height: 1, backgroundColor: '#F0F0F0', marginLeft: 20 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  optionText: { flex: 1, fontSize: 15, color: '#333' },
  optionTextSelected: { fontWeight: '700', color: '#1A1A1A' },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 32 },
});
