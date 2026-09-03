import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/services/auth-context';
import { useNotifications } from '@/src/context/NotificationsContext';
import SearchBar from '@/src/components/filters/SearchBar';
import LocationPromptModal from '@/src/components/location/LocationPromptModal';
import { useCustomerLocation } from '@/src/context/CustomerLocationContext';

interface NavBarProps {
  options?: {
    headerProps?: {
      currentTab?: string;
    };
  };
  searchInputRef?: React.RefObject<TextInput | null>;
}

export default function TopNavBarHomeUser({
  options,
  searchInputRef: providedSearchInputRef,
}: NavBarProps) {
  const router = useRouter();
  const { session } = useAuth();
  const { location, loading: locationLoading } = useCustomerLocation();
  const { unreadCounts } = useNotifications();
  const user = session?.user;
  const segments = useSegments();
  const currentTab = options?.headerProps?.currentTab || segments[segments.length - 1];
  const params = useLocalSearchParams<{ q?: string }>();
  const [searchValue, setSearchValue] = useState('');
  const [locationPromptVisible, setLocationPromptVisible] = useState(false);
  const localSearchInputRef = useRef<TextInput>(null);
  const searchInputRef = providedSearchInputRef ?? localSearchInputRef;

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
    router.push('/(user)/notifications');
  };

  const handleFoodOrdersPress = () => {
    router.push('/(user)/food-orders'); // Navigate to past food orders
  };

  const handleFavouritesPress = () => {
    router.push('/(user)/favourites'); // Navigate to favourites screen
  };

  const handleLocationPress = () => {
    if (!user) {
      router.push('/(auth)/login');
      return;
    }
    setLocationPromptVisible(true);
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
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleFoodOrdersPress}
            accessibilityRole="button"
            accessibilityLabel="Past food orders"
          >
            <Ionicons name="receipt-outline" size={24} color="#333" />
          </TouchableOpacity>
        </View>
      );
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      {currentTab === 'home' ? (
        <TouchableOpacity
          style={styles.locationRow}
          onPress={handleLocationPress}
          accessibilityRole="button"
          accessibilityLabel={
            location
              ? `Delivery and pickup area: ${location.label}`
              : 'Choose delivery and pickup area'
          }
        >
          <View style={styles.locationIcon}>
            <Ionicons name="location-outline" size={24} color="#216E39" />
          </View>
          <View style={styles.locationCopy}>
            <View style={styles.locationLabelRow}>
              <Text style={styles.locationEyebrow}>DELIVERY &amp; PICKUP AREA</Text>
              <Ionicons name="chevron-down" size={14} color="#526359" />
            </View>
            <Text style={styles.locationValue} numberOfLines={1}>
              {locationLoading ? 'Finding your area…' : location?.label || 'Choose your location'}
            </Text>
          </View>
        </TouchableOpacity>
      ) : null}
      <View style={styles.header}>
        {(currentTab === 'home' || currentTab === 'search') && (
          <SearchBar
            inputRef={searchInputRef}
            value={searchValue}
            onChangeText={handleSearchChange}
            onSubmitEditing={handleSearchSubmit}
            containerStyle={styles.searchBar}
          />
        )}
        {renderRightButtons()}
      </View>
      <LocationPromptModal
        visible={locationPromptVisible}
        onClose={() => setLocationPromptVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#fff',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
  },
  locationIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EAF5EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  locationCopy: { flex: 1 },
  locationLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  locationEyebrow: { color: '#637068', fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  locationValue: { color: '#17251B', fontSize: 16, fontWeight: '800', marginTop: 1 },
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
