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

interface CuisineFilterProps {
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
  selected: boolean;
}

const initialFilters: FilterItem[] = [
  { id: 'certified', name: 'Certified', active: false },
  { id: 'dietary', name: 'Dietary', active: false },
  { id: 'promotion', name: 'Promotion', active: false },
];

const dietaryOptions: DietaryOption[] = [
  { id: 'vegan', name: 'Vegan', selected: false },
  { id: 'vegetarian', name: 'Vegetarian', selected: false },
  { id: 'glutenFree', name: 'Gluten Free', selected: false },
  { id: 'halal', name: 'Halal', selected: false },
  { id: 'kosher', name: 'Kosher', selected: false },
  { id: 'paleo', name: 'Paleo', selected: false },
  { id: 'keto', name: 'Keto', selected: false },
];

export default function CuisineFilter({ onFilterToggle, onDietarySelect }: CuisineFilterProps) {
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
          >
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
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDietaryDropdownVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setDietaryDropdownVisible(false)}>
          <View style={styles.dropdownContainer}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Dietary Preferences</Text>
              <TouchableOpacity
                onPress={() => setDietaryDropdownVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.optionsContainer}>
              {selectedDietaryOptions.map(option => (
                <TouchableOpacity
                  key={option.id}
                  style={styles.optionItem}
                  onPress={() => handleDietaryOptionToggle(option.id)}
                >
                  <Text style={styles.optionText}>{option.name}</Text>
                  <View style={[styles.checkbox, option.selected && styles.checkedBox]}>
                    {option.selected && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.dropdownFooter}>
              <TouchableOpacity style={styles.clearButton} onPress={clearDietaryFilters}>
                <Text style={styles.clearButtonText}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyButton} onPress={applyDietaryFilters}>
                <Text style={styles.applyButtonText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  dropdownContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 350,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dropdownTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  optionsContainer: {
    maxHeight: 300,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f8f8',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
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
  dropdownFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  clearButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  applyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
