import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createShadowStyle } from '../../utils/platform-utils';

type QuantityStepperProps = {
  initialQuantity?: number;
  onQuantityChange?: (newQuantity: number) => void;
};

export const QuantityStepper = ({
  initialQuantity = 1,
  onQuantityChange,
}: QuantityStepperProps) => {
  const [quantity, setQuantity] = useState(initialQuantity);

  const handleDecrement = () => {
    if (quantity > 1) {
      setQuantity(prev => prev - 1);
      onQuantityChange?.(quantity - 1);
    }
  };

  const handleIncrement = () => {
    setQuantity(prev => prev + 1);
    onQuantityChange?.(quantity + 1);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handleDecrement} style={styles.button}>
        <Ionicons name="remove" size={24} color="#666" />
      </TouchableOpacity>
      <Text style={styles.quantityText}>{quantity}</Text>
      <TouchableOpacity onPress={handleIncrement} style={styles.button}>
        <Ionicons name="add" size={24} color="#4CAF50" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingHorizontal: 8,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    }),
  },
  button: {
    padding: 10,
  },
  quantityText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    minWidth: 30,
    textAlign: 'center',
  },
});
