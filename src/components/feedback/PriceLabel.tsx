import React from 'react';
import { Text, StyleSheet } from 'react-native';

interface PriceLabelProps {
  amount: number;
  currency?: string;
  textStyle?: object;
}

const PriceLabel: React.FC<PriceLabelProps> = ({ amount, currency = 'RM', textStyle }) => {
  return (
    <Text style={[styles.price, textStyle]}>
      {currency} {amount.toFixed(2)}
    </Text>
  );
};

const styles = StyleSheet.create({
  price: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
});

export default PriceLabel;
