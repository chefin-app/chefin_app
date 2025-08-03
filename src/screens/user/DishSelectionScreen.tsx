// src/screens/user/DishSelectionScreen.tsx

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
// The Ionicons import is no longer needed since we are using custom images for the stepper
// import { Ionicons } from "@expo/vector-icons";
// Importing my primary button. The path is relative to this file.
import PrimaryButton from '../../components/buttons/PrimaryButton';

// Importing the local image assets using require()
const AmericanBurger = require('../../assets/images/american_burger.png');
const MinusCircle = require('../../assets/images/minus-circle.png');
const PlusCircle = require('../../assets/images/plus-circle.png');

// Mock data to match the Figma design
const SAUCES = [
  { id: '1', name: 'Buffalo Sauce', price: 0.0 },
  { id: '2', name: 'Ketchup', price: 0.0 },
  { id: '3', name: 'Chicken Fajita', price: 0.0 },
  { id: '4', name: 'BBQ', price: 0.0 },
];

const FREQUENTLY_BOUGHT = [
  { id: '1', name: 'French fries', price: 2.0 },
  { id: '2', name: 'Chicken wings', price: 5.0 },
  { id: '3', name: 'Coke zero', price: 1.0 },
  { id: '4', name: 'Sprite', price: 1.0 },
];

// --- Define Prop Types for Helper Components ---

interface RadioOptionProps {
  label: string;
  price: number;
  isSelected: boolean;
  onPress: () => void; // A function that takes no arguments and returns void
}

const RadioOption: React.FC<RadioOptionProps> = ({ label, price, isSelected, onPress }) => (
  <TouchableOpacity onPress={onPress} style={styles.optionItem}>
    <View style={[styles.radio, isSelected && styles.radioSelected]}>
      {isSelected && <View style={styles.radioInner} />}
    </View>
    <Text style={styles.optionLabel}>{label}</Text>
    {price > 0 && <Text style={styles.optionPrice}>RM {price.toFixed(2)}</Text>}
  </TouchableOpacity>
);

interface QuantityStepperProps {
  quantity: number;
  // setQuantity is a state setter function, its type is React.Dispatch<React.SetStateAction<number>>
  setQuantity: React.Dispatch<React.SetStateAction<number>>;
}

const QuantityStepper: React.FC<QuantityStepperProps> = ({ quantity, setQuantity }) => (
  <View style={styles.stepperContainer}>
    <TouchableOpacity
      onPress={() => setQuantity(Math.max(1, quantity - 1))}
      style={styles.stepperButton}
    >
      <Image source={MinusCircle} style={styles.stepperButtonImage} />
    </TouchableOpacity>
    <Text style={styles.stepperText}>{quantity}</Text>
    <TouchableOpacity onPress={() => setQuantity(quantity + 1)} style={styles.stepperButton}>
      <Image source={PlusCircle} style={styles.stepperButtonImage} />
    </TouchableOpacity>
  </View>
);

// --- Main DishSelectionScreen Component ---

export default function DishSelectionScreen() {
  const [addingToCart, setAddingToCart] = useState(false);
  const [selectedSauceId, setSelectedSauceId] = useState<string | null>('1');
  const [selectedAddons, setSelectedAddons] = useState<string[]>(['1']);
  const [quantity, setQuantity] = useState(1);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleAddToCart = async () => {
    setAddingToCart(true);

    // Simulate adding to cart with a delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Show a confirmation message instead of an alert (as alerts don't render in canvas)
    setShowConfirmation(true);
    setTimeout(() => setShowConfirmation(false), 3000); // Hide after 3 seconds

    setAddingToCart(false);
  };

  const handleToggleAddon = (id: string) => {
    if (selectedAddons.includes(id)) {
      setSelectedAddons(selectedAddons.filter(addonId => addonId !== id));
    } else {
      setSelectedAddons([...selectedAddons, id]);
    }
  };

  return (
    <View style={styles.container}>
      {/* ScrollView now contains both the image and the content */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Main Image Section - now inside the ScrollView */}
        <View style={styles.imageContainer}>
          <Image source={AmericanBurger} style={styles.dishImage} resizeMode="cover" />
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.headerTitle}>The American Burger</Text>
          <Text style={styles.price}>RM 25.00</Text>
          <Text style={styles.description}>
            Smashed American burger, served with potato chips and coleslaw
          </Text>
        </View>

        {/* Choose Your Sauce Section */}
        <View style={styles.optionsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.optionsTitle}>Choose Your Sauce</Text>
            <Text style={styles.requiredTag}>1 Required</Text>
          </View>
          <View style={styles.optionsList}>
            {SAUCES.map(sauce => (
              <RadioOption
                key={sauce.id}
                label={sauce.name}
                price={sauce.price}
                isSelected={selectedSauceId === sauce.id}
                onPress={() => setSelectedSauceId(sauce.id)}
              />
            ))}
          </View>
        </View>

        {/* Frequently Bought Together Section */}
        <View style={styles.optionsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.optionsTitle}>Frequently bought together</Text>
            <Text style={styles.optionalTag}>Optional</Text>
          </View>
          <View style={styles.optionsList}>
            {FREQUENTLY_BOUGHT.map(item => (
              <RadioOption
                key={item.id}
                label={item.name}
                price={item.price}
                isSelected={selectedAddons.includes(item.id)}
                onPress={() => handleToggleAddon(item.id)}
              />
            ))}
          </View>
        </View>
        {/* Persistent Footer with Stepper and Add to Cart Button */}
        {/* This footer will now be a fixed component at the bottom */}
        <View style={styles.footerContainer}>
          <QuantityStepper quantity={quantity} setQuantity={setQuantity} />
          <PrimaryButton
            title="Add to cart"
            onPress={handleAddToCart}
            isLoading={addingToCart}
            disabled={addingToCart}
            style={styles.addToCartButton}
          />
        </View>
      </ScrollView>

      {/* Confirmation message */}
      {showConfirmation && (
        <View style={styles.confirmationMessage}>
          <Text style={styles.confirmationText}>Added to cart!</Text>
        </View>
      )}
    </View>
  );
}

// --- Updated Stylesheet ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  imageContainer: {
    width: '100%',
    backgroundColor: '#ddd', // Placeholder background
  },
  dishImage: {
    width: '100%',
    height: undefined, // Let the aspectRatio define the height
    aspectRatio: 1.5, // Maintain a 3:2 aspect ratio for the image
  },
  scrollContent: {
    paddingBottom: 100, // Make space for the fixed footer
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  price: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  optionsSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  requiredTag: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#E53935',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  optionalTag: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4CAF50',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  optionsList: {
    gap: 12,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radio: {
    height: 20,
    width: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#999',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioSelected: {
    borderColor: '#4CAF50',
  },
  radioInner: {
    height: 10,
    width: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  optionPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  footerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperButton: {
    padding: 8,
  },
  stepperButtonImage: {
    width: 32, // Set width for the new image buttons
    height: 32, // Set height for the new image buttons
  },
  stepperText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 12,
  },
  addToCartButton: {
    flex: 1, // Allow the button to take up remaining space
    marginLeft: 16,
  },
  confirmationMessage: {
    position: 'absolute',
    bottom: 100,
    left: '50%',
    transform: [{ translateX: -100 }], // Center horizontally
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  confirmationText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
