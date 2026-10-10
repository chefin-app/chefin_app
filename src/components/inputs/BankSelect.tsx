import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MALAYSIAN_BANKS } from '@/src/constants/banks';
import theme from '@/src/styles/theme';

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
        <Ionicons
          name="business-outline"
          size={20}
          color={theme.colors.textSecondary}
          style={styles.fieldIcon}
        />
        <Text style={[styles.fieldText, !value && styles.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={20} color={theme.colors.textSecondary} />
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
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrapper}>
            <Ionicons
              name="search"
              size={18}
              color={theme.colors.textMuted}
              style={{ marginRight: 8 }}
            />
            <TextInput
              placeholder="Search banks"
              placeholderTextColor={theme.colors.placeholder}
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
                  {selected && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />}
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
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  fieldIcon: { marginRight: 10 },
  fieldText: { flex: 1, fontSize: 16, color: theme.colors.text },
  placeholder: { color: theme.colors.placeholder },

  modalContainer: { flex: 1, backgroundColor: theme.colors.surface },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  closeButton: { padding: 4 },

  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.text },

  separator: { height: 1, backgroundColor: theme.colors.separator, marginLeft: 20 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  optionText: { flex: 1, fontSize: 15, color: theme.colors.textStrong },
  optionTextSelected: { fontWeight: '700', color: theme.colors.text },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginTop: 32 },
});
