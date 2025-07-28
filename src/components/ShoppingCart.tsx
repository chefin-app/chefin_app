import React from 'react';
import { TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

const ShoppingCart = () => {
  const router = useRouter();

  return (
    <TouchableOpacity
      onPress={() => router.push('/payment')}
      style={styles.shoppingCart}
    >
      <Image
        source={require('../assets/images/cart.png')}
        style={styles.cartImage}
        resizeMode="contain"
      />
    </TouchableOpacity>
  );
};

export default ShoppingCart;

const styles = StyleSheet.create({
  shoppingCart: {
    padding: 8,
  },
  cartImage: {
    width: 24,
    height: 24,
  },
});