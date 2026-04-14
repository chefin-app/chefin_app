import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useRouter, useSegments } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createShadowStyle } from '../../utils/platform-utils';
import { useAuth } from '@/src/services/auth-context';
import { useCart } from '@/src/context/CartContext';

interface NavBarProps {
  options?: {
    headerProps?: {
      currentTab?: string;
    };
  };
}

export default function TopNavBarHomeUser({ options }: NavBarProps) {
  const router = useRouter();
  const { session } = useAuth();
  const { cartCount } = useCart();
  const user = session?.user;
  const segments = useSegments();
  const currentTab = options?.headerProps?.currentTab || segments[segments.length - 1];

  const handleNotifPress = () => {
    router.push('/'); // Navigate to cart screen
  };

  const handleCartPress = () => {
    router.push('/(user)/cart'); // Navigate to cart screen
  };

  const handleFavouritesPress = () => {
    router.push('/(user)/favourites'); // Navigate to favourites screen
  };

  const renderRightButtons = () => {
    if (currentTab === 'account') {
      return (
        <TouchableOpacity style={styles.iconButton} onPress={handleNotifPress}>
          <Ionicons name="notifications" size={24} color="#333" />
          {user && cartCount > 0 && <View style={styles.notificationDot} />}
        </TouchableOpacity>
      );
    } else {
      return (
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.iconButton} onPress={handleFavouritesPress}>
            <Ionicons name="heart-outline" size={24} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={handleCartPress}>
            <Ionicons name="cart-outline" size={24} color="#333" />
            {user && cartCount > 0 && <View style={styles.notificationDot} />}
          </TouchableOpacity>
        </View>
      );
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>{renderRightButtons()}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5252',
  },
});
