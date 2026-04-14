import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useCart } from '@/src/context/CartContext';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const StickyCartBar = () => {
  const router = useRouter();
  const { cartCount, cartTotal } = useCart();

  if (cartCount === 0) return null;

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <TouchableOpacity
        style={styles.container}
        activeOpacity={0.9}
        onPress={() => router.push('/cart')}
      >
        <View style={styles.content}>
          <View style={styles.leftSection}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{cartCount}</Text>
            </View>
            <Text style={styles.viewCartText}>View your cart</Text>
          </View>

          <View style={styles.rightSection}>
            <Text style={styles.totalText}>RM {cartTotal.toFixed(2)}</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </View>
        </View>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  container: {
    backgroundColor: '#4CAF50',
    marginHorizontal: 16,
    marginBottom: Platform.OS === 'ios' ? 0 : 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  viewCartText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
});

export default StickyCartBar;
