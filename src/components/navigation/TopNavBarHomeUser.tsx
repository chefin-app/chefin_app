import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/services/auth-context';
import { useCart } from '@/src/context/CartContext';
import { useNotifications } from '@/src/context/NotificationsContext';
import SearchBar from '@/src/components/filters/SearchBar';

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
  const { unreadCounts } = useNotifications();
  const user = session?.user;
  const segments = useSegments();
  const currentTab = options?.headerProps?.currentTab || segments[segments.length - 1];
  const params = useLocalSearchParams<{ q?: string }>();
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    if (currentTab === 'search') {
      setSearchValue(typeof params.q === 'string' ? params.q : '');
    }
  }, [currentTab, params.q]);

  const handleSearchChange = (text: string) => {
    setSearchValue(text);
    if (currentTab === 'search') {
      router.setParams({ q: text, discover: '', title: '' });
    }
  };

  const handleSearchSubmit = () => {
    const q = searchValue.trim();
    if (!q) return;
    if (currentTab === 'search') {
      router.setParams({ q, discover: '', title: '' });
    } else {
      router.push({ pathname: '/(user)/(tabs)/search', params: { q } });
    }
  };

  const handleNotifPress = () => {
    router.push({ pathname: '/notifications', params: { role: 'customer' } });
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
          {user && unreadCounts.customer > 0 && <View style={styles.notificationDot} />}
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
      <View style={styles.header}>
        {(currentTab === 'home' || currentTab === 'search') && (
          <SearchBar
            value={searchValue}
            onChangeText={handleSearchChange}
            onSubmitEditing={handleSearchSubmit}
            containerStyle={styles.searchBar}
          />
        )}
        {renderRightButtons()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    width: 'auto',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
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
