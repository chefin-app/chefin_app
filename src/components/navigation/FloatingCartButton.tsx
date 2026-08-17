import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useCart } from '@/src/context/CartContext';

/**
 * Sticky bottom-right cart entry (bag with an item-count badge). Hidden while
 * the cart is empty — the badge, not the button, is the "you have items" cue.
 */
const FloatingCartButton = () => {
  const router = useRouter();
  const { cartCount } = useCart();

  if (cartCount === 0) return null;

  return (
    <TouchableOpacity
      style={styles.button}
      activeOpacity={0.85}
      onPress={() => router.push('/(user)/cart')}
      accessibilityRole="button"
      accessibilityLabel={`Open cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
    >
      <Ionicons name="bag-outline" size={28} color="#333B36" />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    width: 62,
    height: 62,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 9,
  },
  badge: {
    position: 'absolute',
    top: 9,
    right: 9,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: '#E5484D',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
});

export default FloatingCartButton;
