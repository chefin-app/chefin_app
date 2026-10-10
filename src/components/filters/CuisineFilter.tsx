import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import theme from '@/src/styles/theme';

interface CuisineItem {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface CuisineFilterProps {
  onCuisineSelect?: (cuisineId: string) => void;
}

const cuisines: CuisineItem[] = [
  { id: 'all', name: 'All', icon: '🍽️', color: '#F4D8BE' },
  { id: 'malaysian', name: 'Malaysian', icon: '🍛', color: '#F8D872' },
  { id: 'chinese', name: 'Chinese', icon: '🥟', color: '#F2AAA0' },
  { id: 'indian', name: 'Indian', icon: '🍛', color: '#F0B36B' },
  { id: 'japanese', name: 'Japanese', icon: '🍣', color: '#B7D9C5' },
  { id: 'korean', name: 'Korean', icon: '🍲', color: '#B7D9E8' },
  { id: 'thai', name: 'Thai', icon: '🍜', color: '#AEE0C5' },
  { id: 'italian', name: 'Italian', icon: '🍕', color: '#F2B47F' },
  { id: 'western', name: 'Western', icon: '🍔', color: '#9FD8D3' },
  { id: 'middle eastern', name: 'Middle Eastern', icon: '🫓', color: '#F3CF65' },
];

export default function CuisineFilter({ onCuisineSelect }: CuisineFilterProps) {
  const [selectedCuisine, setSelectedCuisine] = useState('all');

  const handleCuisineSelect = (cuisineId: string) => {
    setSelectedCuisine(cuisineId);
    onCuisineSelect?.(cuisineId);
  };

  return (
    <View style={styles.container}>
      <View style={styles.cuisineGrid}>
        {cuisines.map(cuisine => (
          <TouchableOpacity
            key={cuisine.id}
            style={[
              styles.cuisineItem,
              selectedCuisine === cuisine.id && styles.selectedCuisineItem,
            ]}
            onPress={() => handleCuisineSelect(cuisine.id)}
          >
            <View
              style={[
                styles.cuisineIconContainer,
                { backgroundColor: cuisine.color },
                selectedCuisine === cuisine.id && styles.selectedCuisineIconContainer,
              ]}
            >
              <Text style={styles.cuisineIcon}>{cuisine.icon}</Text>
            </View>
            <Text
              style={[
                styles.cuisineText,
                selectedCuisine === cuisine.id && styles.selectedCuisineText,
              ]}
            >
              {cuisine.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
  },
  cuisineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
  },
  cuisineItem: {
    alignItems: 'center',
    width: '20%',
  },
  selectedCuisineItem: {
    opacity: 1,
  },
  cuisineIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  selectedCuisineIconContainer: {
    borderWidth: 3,
    borderColor: theme.colors.primaryOnLight,
  },
  cuisineIcon: { fontSize: 29 },
  cuisineText: {
    fontSize: 11,
    color: '#3D463F',
    textAlign: 'center',
    fontWeight: '600',
  },
  selectedCuisineText: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
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
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  activeFilterTag: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  activeFilterText: {
    color: theme.colors.textOnAction,
    fontWeight: '600',
  },
  dropdownIcon: {
    marginLeft: 4,
  },
});
