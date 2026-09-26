import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFavourites } from '@/src/context/FavouritesContext';
import { useCustomerLocation } from '@/src/context/CustomerLocationContext';
import { isRestaurantAvailableInRegion } from '@/src/constants/serviceRegions';

const FavouritesScreen = () => {
  const router = useRouter();
  const { favourites, toggleFavourite } = useFavourites();
  const { region } = useCustomerLocation();
  const prioritisedFavourites = useMemo(() => {
    const available: typeof favourites = [];
    const unavailable: typeof favourites = [];

    favourites.forEach(favourite => {
      if (isRestaurantAvailableInRegion(favourite.regionId, region.id)) {
        available.push(favourite);
      } else {
        unavailable.push(favourite);
      }
    });

    return [...available, ...unavailable];
  }, [favourites, region.id]);

  if (favourites.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Favourites</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No favourites saved</Text>
          <Text style={styles.emptySubtitle}>
            To make ordering even faster, you'll find all your faves here. Just look for the heart
            icon!
          </Text>
          <TouchableOpacity
            style={styles.findButton}
            onPress={() => router.push('/(user)/(tabs)/home')}
          >
            <Text style={styles.findButtonText}>Let's find some favourites</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Favourites</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={prioritisedFavourites}
        keyExtractor={item => item.profileId}
        renderItem={({ item }) => {
          const available = isRestaurantAvailableInRegion(item.regionId, region.id);
          return (
            <View style={[styles.card, !available && styles.cardUnavailable]}>
              <TouchableOpacity
                disabled={!available}
                onPress={() => router.push(`/restaurant/${item.profileId}`)}
                accessibilityState={{ disabled: !available }}
                accessibilityLabel={`${item.restaurantName}${available ? '' : `, unavailable in ${region.name}`}`}
              >
                <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
                {!available ? (
                  <View style={styles.unavailableOverlay}>
                    <Ionicons name="location-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.unavailableText}>Unavailable in {region.name}</Text>
                  </View>
                ) : null}
                <View style={styles.cardFooter}>
                  <Text style={styles.rating}>
                    ★ {item.rating} ({item.reviewCount})
                  </Text>
                  <Text style={styles.cardTitle}>{item.restaurantName}</Text>
                  <Text style={styles.cardSub}>By {item.fullChefName}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heartIcon} onPress={() => toggleFavourite(item)}>
                <Ionicons name="heart" size={24} color="#FF5252" />
              </TouchableOpacity>
            </View>
          );
        }}
        contentContainerStyle={{ padding: 20 }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  backButton: { padding: 5 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 22, fontWeight: '700', marginBottom: 10 },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  findButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  findButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  card: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  cardUnavailable: { opacity: 0.68 },
  cardImage: { width: '100%', height: 200 },
  heartIcon: {
    position: 'absolute',
    top: 15,
    right: 15,
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 20,
    zIndex: 2,
  },
  unavailableOverlay: {
    position: 'absolute',
    left: 14,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(35, 45, 39, 0.88)',
  },
  unavailableText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  cardFooter: { padding: 15 },
  rating: { fontWeight: '600', color: '#FFB800', marginBottom: 5 },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 5 },
  cardSub: { color: '#666' },
});

export default FavouritesScreen;
