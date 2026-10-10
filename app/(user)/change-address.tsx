import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import theme from '@/src/styles/theme';

const ChangeAddressScreen = () => {
  const router = useRouter();
  const [address, setAddress] = useState('');

  const recentAddresses = [
    {
      id: '1',
      name: 'Current location',
      address:
        'Laurel Residence, Jalan Kerinchi Kanan, Bangsar South, Kuala Lumpur, 59200, WP Kuala Lumpur, WP Kuala Lu...',
      icon: 'locate-outline',
    },
    {
      id: '2',
      name: 'Halab Restaurant KL - Bukit Bintang',
      address:
        '6.47km • 35, Jalan Berangan, Bukit Bintang, Kuala Lumpur, Bandar Kuala Lumpur, 50200, WP Kuala Lump...',
      icon: 'time-outline',
    },
    {
      id: '3',
      name: 'Pavilion KL - Bukit Bintang Entrance',
      address:
        '6.91km • 168, Jalan Bukit Bintang, Kuala Lumpur, Bandar Kuala Lumpur, 55100, WP Kuala Lumpur, WP Kuala Lu...',
      icon: 'time-outline',
    },
    {
      id: '4',
      name: 'MRT Kajang - Park & Ride',
      address:
        '20km • Jalan Bukit, Taman Taman, Bukit Mewah, Kajang, 43000, Hulu Langat, Selangor, Malaysia',
      icon: 'time-outline',
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.textStrong} />
          </TouchableOpacity>
          <View style={styles.searchContainer}>
            <Ionicons
              name="location"
              size={20}
              color={theme.colors.destructive}
              style={styles.locationIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Deliver now"
              value={address}
              onChangeText={setAddress}
              autoFocus
            />
            <TouchableOpacity style={styles.cameraButton}>
              <Ionicons name="camera-outline" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.countryBadge}>
            <Text style={styles.flag}>🇲🇾</Text>
          </View>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tab, styles.activeTab]}>
            <Text style={[styles.tabText, styles.activeTabText]}>Recent</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab}>
            <Text style={styles.tabText}>Suggested</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab}>
            <Text style={styles.tabText}>Saved</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.infoBanner}>
            <Ionicons name="help-circle" size={24} color={theme.colors.textSecondary} />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>Can't find the place?</Text>
              <TouchableOpacity>
                <Text style={styles.infoLink}>Search using an image</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.closeBanner}>
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {recentAddresses.map(item => (
            <TouchableOpacity key={item.id} style={styles.addressItem}>
              <View style={styles.addressIconContainer}>
                <Ionicons name={item.icon as any} size={20} color={theme.colors.textStrong} />
              </View>
              <View style={styles.addressTextContainer}>
                <Text style={styles.addressName}>{item.name}</Text>
                <Text style={styles.addressDetail} numberOfLines={2}>
                  {item.address}
                </Text>
              </View>
              <TouchableOpacity style={styles.moreButton}>
                <Ionicons name="ellipsis-vertical" size={16} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.mapButton}>
            <Ionicons name="map-outline" size={20} color={theme.colors.textStrong} />
            <Text style={styles.mapButtonText}>Choose on GrabMaps</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingHorizontal: 12,
    height: 44,
  },
  locationIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.textStrong,
  },
  cameraButton: {
    padding: 4,
  },
  countryBadge: {
    padding: 4,
  },
  flag: {
    fontSize: 24,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.separator,
    paddingBottom: 12,
  },
  tab: {
    paddingVertical: 4,
  },
  activeTab: {
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  tabText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  activeTabText: {
    color: theme.colors.primary,
  },
  content: {
    flex: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceAlt,
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'flex-start',
    gap: 12,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textStrong,
    marginBottom: 4,
  },
  infoLink: {
    fontSize: 15,
    color: '#007AFF',
    fontWeight: '500',
  },
  closeBanner: {
    padding: 2,
  },
  addressItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 16,
  },
  addressIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.separator,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addressTextContainer: {
    flex: 1,
  },
  addressName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textStrong,
    marginBottom: 2,
  },
  addressDetail: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  moreButton: {
    padding: 8,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceAlt,
    gap: 8,
  },
  mapButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textStrong,
  },
});

export default ChangeAddressScreen;
