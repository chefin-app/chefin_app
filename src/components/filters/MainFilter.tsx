import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MainFilterProps {
  onFilterToggle?: (filterId: string, active: boolean) => void;
  onDietarySelect?: (dietaryOptions: string[]) => void;
}

interface FilterItem {
  id: string;
  name: string;
  active: boolean;
}

interface DietaryOption {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  selected: boolean;
}

const initialFilters: FilterItem[] = [
  { id: 'availableNow', name: 'Available Now', active: false },
  { id: 'certified', name: 'Certified', active: false },
  { id: 'dietary', name: 'Dietary', active: false },
];

const dietaryOptions: DietaryOption[] = [
  {
    id: 'non-pork',
    name: 'Non-pork',
    description: 'Does not mean halal-certified',
    icon: 'ban-outline',
    selected: false,
  },
  {
    id: 'vegetarian',
    name: 'Vegetarian',
    description: 'May contain dairy, egg or alliums',
    icon: 'leaf-outline',
    selected: false,
  },
];

export default function MainFilter({ onFilterToggle, onDietarySelect }: MainFilterProps) {
  const insets = useSafeAreaInsets();
  const [filters, setFilters] = useState<FilterItem[]>(initialFilters);
  const [dietaryDropdownVisible, setDietaryDropdownVisible] = useState(false);
  const [selectedDietaryOptions, setSelectedDietaryOptions] =
    useState<DietaryOption[]>(dietaryOptions);

  const handleFilterToggle = (filterId: string) => {
    if (filterId === 'dietary') {
      setDietaryDropdownVisible(true);
      return;
    }

    setFilters(prev =>
      prev.map(filter => {
        if (filter.id === filterId) {
          const newActive = !filter.active;
          onFilterToggle?.(filterId, newActive);
          return { ...filter, active: newActive };
        }
        return filter;
      })
    );
  };

  const handleDietaryOptionToggle = (optionId: string) => {
    setSelectedDietaryOptions(prev =>
      prev.map(option =>
        option.id === optionId ? { ...option, selected: !option.selected } : option
      )
    );
  };

  const applyDietaryFilters = () => {
    const selectedOptions = selectedDietaryOptions.filter(option => option.selected);
    const hasDietaryFiters = selectedOptions.length > 0;

    // update dietary filter state
    setFilters(prev =>
      prev.map(filter =>
        filter.id === 'dietary' ? { ...filter, active: hasDietaryFiters } : filter
      )
    );

    // notify parent component
    onDietarySelect?.(selectedOptions.map(option => option.id));
    onFilterToggle?.('dietary', hasDietaryFiters);

    setDietaryDropdownVisible(false);
  };

  const clearDietaryFilters = () => {
    setSelectedDietaryOptions(prev => prev.map(option => ({ ...option, selected: false })));

    setFilters(prev =>
      prev.map(filter => (filter.id === 'dietary' ? { ...filter, active: false } : filter))
    );

    onDietarySelect?.([]);
    onFilterToggle?.('dietary', false);
    setDietaryDropdownVisible(false);
  };

  const getSelectedDietaryCount = () => {
    return selectedDietaryOptions.filter(option => option.selected).length;
  };

  const getdietaryDisplayText = () => {
    const count = getSelectedDietaryCount();
    if (count === 0) return 'Dietary';
    if (count === 1) {
      const selected = selectedDietaryOptions.find(option => option.selected);
      return selected?.name || 'Dietary';
    }
    return `Dietary (${count})`;
  };

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScrollView}
        contentContainerStyle={styles.filterContent}
      >
        {filters.map(filter => (
          <TouchableOpacity
            key={filter.id}
            style={[styles.filterTag, filter.active && styles.activeFilterTag]}
            onPress={() => handleFilterToggle(filter.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter.active }}
            accessibilityLabel={`${filter.name} filter`}
          >
            {filter.id === 'availableNow' && (
              <Ionicons
                name="flash"
                size={15}
                color={filter.active ? '#fff' : '#2E7D32'}
                style={styles.leadingIcon}
              />
            )}
            <Text style={[styles.filterText, filter.active && styles.activeFilterText]}>
              {filter.id === 'dietary' ? getdietaryDisplayText() : filter.name}
            </Text>
            {filter.id === 'dietary' && (
              <Ionicons
                name={dietaryDropdownVisible ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={filter.active ? '#fff' : '#666'}
                style={styles.dropdownIcon}
              />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal
        visible={dietaryDropdownVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDietaryDropdownVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setDietaryDropdownVisible(false)}>
          <Pressable
            style={[styles.dropdownContainer, { paddingBottom: Math.max(insets.bottom, 24) }]}
            onPress={event => event.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.dropdownHeader}>
              <View style={styles.headerCopy}>
                <Text style={styles.dropdownTitle}>Dietary preferences</Text>
                <Text style={styles.dropdownSubtitle}>
                  Show home restaurants with at least one matching dish.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setDietaryDropdownVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <View style={styles.optionsContainer}>
              {selectedDietaryOptions.map(option => (
                <TouchableOpacity
                  key={option.id}
                  style={styles.optionItem}
                  onPress={() => handleDietaryOptionToggle(option.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: option.selected }}
                  accessibilityLabel={`${option.name}. ${option.description}`}
                >
                  <View style={styles.optionIcon}>
                    <Ionicons name={option.icon} size={22} color="#25312A" />
                  </View>
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionText}>{option.name}</Text>
                    <Text style={styles.optionDescription}>{option.description}</Text>
                  </View>
                  <View style={[styles.checkbox, option.selected && styles.checkedBox]}>
                    {option.selected && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.disclaimerCard}>
              <Ionicons name="alert-circle-outline" size={22} color="#69736D" />
              <Text style={styles.disclaimerText}>
                Home-restaurant dietary declarations may not be 100% accurate. Non-pork does not
                mean halal, and vegetarian dishes may be prepared in a shared kitchen.
              </Text>
            </View>

            <View style={styles.dropdownFooter}>
              <TouchableOpacity style={styles.clearButton} onPress={clearDietaryFilters}>
                <Text style={styles.clearButtonText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyButton} onPress={applyDietaryFilters}>
                <Text style={styles.applyButtonText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  filterScrollView: {
    marginBottom: 8,
  },
  filterContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  activeFilterTag: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  filterText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  activeFilterText: {
    color: '#fff',
    fontWeight: '600',
  },
  dropdownIcon: {
    marginLeft: 4,
  },
  leadingIcon: {
    marginRight: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  dropdownContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    width: '100%',
    maxHeight: '88%',
    paddingTop: 10,
    paddingHorizontal: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    alignSelf: 'center',
    borderRadius: 2,
    backgroundColor: '#DDE2DF',
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 22,
    paddingBottom: 14,
  },
  headerCopy: { flex: 1, paddingRight: 12 },
  dropdownTitle: {
    fontSize: 25,
    fontWeight: '900',
    color: '#1F2521',
  },
  dropdownSubtitle: { marginTop: 7, color: '#747D77', fontSize: 13, lineHeight: 19 },
  closeButton: {
    padding: 4,
  },
  optionsContainer: {
    paddingVertical: 4,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 76,
    gap: 12,
  },
  optionIcon: { width: 34, alignItems: 'center' },
  optionCopy: { flex: 1 },
  optionText: {
    fontSize: 16,
    color: '#242B27',
    fontWeight: '700',
  },
  optionDescription: { marginTop: 3, color: '#747D77', fontSize: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkedBox: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  disclaimerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 10,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#F4F5F4',
  },
  disclaimerText: { flex: 1, color: '#4F5852', fontSize: 13, lineHeight: 20 },
  dropdownFooter: {
    flexDirection: 'row',
    paddingTop: 22,
    gap: 12,
  },
  clearButton: {
    flex: 1,
    minHeight: 54,
    justifyContent: 'center',
    borderRadius: 27,
    backgroundColor: '#EAF8F9',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    color: '#174E49',
    fontWeight: '800',
  },
  applyButton: {
    flex: 1,
    minHeight: 54,
    justifyContent: 'center',
    borderRadius: 27,
    backgroundColor: '#00B85A',
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
