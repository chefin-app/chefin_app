import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CuisineItem {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface CuisineFilterProps {
  onCuisineSelect?: (cuisineId: string) => void;
}

const cuisines: CuisineItem[] = [
  { id: 'all', name: 'All cuisines', icon: 'restaurant' },
  { id: 'indian', name: 'Indian', icon: 'umbrella' },
  { id: 'chinese', name: 'Chinese', icon: 'restaurant-outline' },
  { id: 'korean', name: 'Korean', icon: 'leaf' },
  { id: 'thai', name: 'Thai', icon: 'flower' },
  { id: 'italian', name: 'Italian', icon: 'pizza' },
  { id: 'japanese', name: 'Japanese', icon: 'fish' },
  { id: 'mexican', name: 'Mexican', icon: 'sunny' },
];

export default function CuisineFilter({ onCuisineSelect }: CuisineFilterProps) {
  const [selectedCuisine, setSelectedCuisine] = useState('all');

  const handleCuisineSelect = (cuisineId: string) => {
    setSelectedCuisine(cuisineId);
    onCuisineSelect?.(cuisineId);
  };

  return (
    <View style={styles.container}>
      {/* Cuisine Selection */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.cuisineScrollView}
        contentContainerStyle={styles.cuisineContent}
      >
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
                selectedCuisine === cuisine.id && styles.selectedCuisineIconContainer,
              ]}
            >
              <Ionicons
                name={cuisine.icon}
                size={24}
                color={selectedCuisine === cuisine.id ? '#4CAF50' : '#666'}
              />
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
  },
  cuisineScrollView: {
    marginBottom: 16,
  },
  cuisineContent: {
    paddingHorizontal: 20,
    gap: 16,
  },
  cuisineItem: {
    alignItems: 'center',
    minWidth: 70,
  },
  selectedCuisineItem: {
    marginBottom: 8,
  },
  cuisineIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectedCuisineIconContainer: {
    backgroundColor: '#e8f5e8',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  cuisineText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    fontWeight: '500',
  },
  selectedCuisineText: {
    color: '#4CAF50',
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
});
