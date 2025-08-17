import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import PrimaryButton from '../../components/buttons/PrimaryButton';
import { Ionicons } from '@expo/vector-icons';

// Using a high-quality placeholder image for a better visual experience
// This can be replaced with a dynamic image URL fetched from your database
const DEFAULT_DISH_IMAGE =
  'https://images.unsplash.com/photo-1571091718767-18b5b1457add?q=80&w=2072&auto=format&fit=crop';
const MinusCircle = require('../../assets/images/minus-circle.png');
const PlusCircle = require('../../assets/images/plus-circle.png');

// --- Define Prop Types for Helper Components and Data Models ---

// Define the types for the shadow style props to fix the TypeScript error
interface ShadowStyleProps {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

// A utility function to create platform-specific shadow styles
const createShadowStyle = ({
  shadowColor,
  shadowOffset,
  shadowOpacity,
  shadowRadius,
  elevation,
}: ShadowStyleProps) => {
  return Platform.select({
    ios: {
      shadowColor,
      shadowOffset,
      shadowOpacity,
      shadowRadius,
    },
    android: {
      elevation,
    },
  });
};

interface Option {
  id: string;
  name: string;
  price: number;
}

interface DishData {
  id: string;
  name: string;
  price: number;
  description: string;
  imageUrl: string;
  options: {
    sauces: Option[];
    frequentlyBought: Option[];
  };
}

interface RadioOptionProps {
  label: string;
  price: number;
  isSelected: boolean;
  onPress: () => void;
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
  const [dish, setDish] = useState<DishData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingToCart, setAddingToCart] = useState(false);
  const [selectedSauceId, setSelectedSauceId] = useState<string | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false); // New state for the favorite button

  // Simulating a fetch from a database (e.g., Supabase 'listings' table)
  // In a real app, you would replace this with a real fetch call using a dish ID
  useEffect(() => {
    const fetchDishData = async () => {
      try {
        setLoading(true);
        // Simulate a network delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Mock data to replace hardcoded values, reflecting a potential database structure
        const mockDishData: DishData = {
          id: 'dish-1',
          name: 'The American Burger',
          price: 25.0,
          description: 'Smashed American burger, served with potato chips and coleslaw',
          imageUrl: DEFAULT_DISH_IMAGE,
          options: {
            sauces: [
              { id: 'sauce-1', name: 'Buffalo Sauce', price: 0.0 },
              { id: 'sauce-2', name: 'Ketchup', price: 0.0 },
              { id: 'sauce-3', name: 'Chicken Fajita', price: 0.0 },
              { id: 'sauce-4', name: 'BBQ', price: 0.0 },
            ],
            frequentlyBought: [
              { id: 'addon-1', name: 'French fries', price: 2.0 },
              { id: 'addon-2', name: 'Chicken wings', price: 5.0 },
              { id: 'addon-3', name: 'Coke zero', price: 1.0 },
              { id: 'addon-4', name: 'Sprite', price: 1.0 },
            ],
          },
        };

        setDish(mockDishData);
        // Set initial selected values based on the fetched data
        if (mockDishData.options.sauces.length > 0) {
          setSelectedSauceId(mockDishData.options.sauces[0].id);
        }
        if (mockDishData.options.frequentlyBought.length > 0) {
          setSelectedAddons([mockDishData.options.frequentlyBought[0].id]);
        }
      } catch (e) {
        setError('Failed to fetch dish data.');
      } finally {
        setLoading(false);
      }
    };

    fetchDishData();
  }, []);

  const handleAddToCart = async () => {
    setAddingToCart(true);

    // Simulate adding to cart with a delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Show a confirmation message instead of an alert
    setShowConfirmation(true);
    setTimeout(() => setShowConfirmation(false), 3000); // Hide after 3 seconds

    setAddingToCart(false);
  };

  const handleToggleAddon = (id: string) => {
    setSelectedAddons(prevAddons => {
      if (prevAddons.includes(id)) {
        return prevAddons.filter(addonId => addonId !== id);
      } else {
        return [...prevAddons, id];
      }
    });
  };

  const handleToggleFavorite = () => {
    setIsFavorite(prev => !prev);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  if (error || !dish) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>{error || 'Dish not found.'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.contentContainer}>
          {/* The image is now a card within the main content container */}
          <View style={styles.imageCard}>
            <Image source={{ uri: dish.imageUrl }} style={styles.dishImage} resizeMode="cover" />
            <TouchableOpacity style={styles.heartIcon} onPress={handleToggleFavorite}>
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={24}
                color={isFavorite ? '#ff0000' : '#111111'}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.detailsCard}>
            <Text style={styles.headerTitle}>{dish.name}</Text>
            <Text style={styles.price}>RM {dish.price.toFixed(2)}</Text>
            <Text style={styles.description}>{dish.description}</Text>
          </View>

          {/* Choose Your Sauce Section */}
          <View style={styles.optionsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.optionsTitle}>Choose Your Sauce</Text>
              <Text style={styles.requiredTag}>1 Required</Text>
            </View>
            <View style={styles.optionsList}>
              {dish.options.sauces.map(sauce => (
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
              {dish.options.frequentlyBought.map(item => (
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
        </View>
      </ScrollView>

      {/* Persistent Footer with Stepper and Add to Cart Button */}
      <View style={styles.footerContainer}>
        <View style={styles.contentContainer}>
          <View style={styles.footerInner}>
            <QuantityStepper quantity={quantity} setQuantity={setQuantity} />
            <PrimaryButton
              title="Add to cart"
              onPress={handleAddToCart}
              isLoading={addingToCart}
              disabled={addingToCart}
              style={styles.addToCartButton}
            />
          </View>
        </View>
      </View>

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
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#E53935',
  },
  scrollContent: {
    paddingBottom: 100, // Make space for the fixed footer
  },
  contentContainer: {
    maxWidth: 700, // Sets a max width for desktop view
    width: '100%', // Ensures it takes full width on mobile
    alignSelf: 'center', // Centers the container itself
    paddingHorizontal: 16, // Adds padding on the sides
  },
  // Reverted to a card-style image, now inside the content container
  imageCard: {
    width: '100%', // Takes up the full width of its parent (contentContainer)
    marginTop: 20,
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden', // Ensures the image respects the border radius
    backgroundColor: '#fff',
    position: 'relative', // Needed for absolute positioning of the heart icon
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 8,
    }),
  },
  dishImage: {
    width: '100%',
    height: undefined, // Allows the image to scale with the aspect ratio
    aspectRatio: 1.5, // A wider aspect ratio for a more professional look
    resizeMode: 'cover',
  },
  heartIcon: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 6,
    position: 'absolute',
    top: 10,
    right: 10,
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
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
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingVertical: 16,
  },
  footerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperButton: {
    padding: 8,
  },
  stepperButtonImage: {
    width: 32,
    height: 32,
  },
  stepperText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 12,
  },
  addToCartButton: {
    flex: 1,
    marginLeft: 16,
  },
  confirmationMessage: {
    position: 'absolute',
    bottom: 100,
    left: '50%',
    transform: [{ translateX: -100 }],
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
