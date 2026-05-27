import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'expo-router';
import {
  StyleSheet,
  ScrollView,
  View,
  Image,
  FlatList,
  Text,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createShadowStyle } from '../../../src/utils/platform-utils';
import SearchBar from '@/src/components/filters/SearchBar';
import CuisineFilter from '@/src/components/filters/CuisineFilter';
import MainFilter from '@/src/components/filters/MainFilter';
import { HeadingText } from '@/src/components/typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import LoadingSpinner from '@/src/components/feedback/LoadingSpinner';
import { useAuth } from '@/src/services/auth-context';

import PromoImage from '@/src/assets/images/promo-food.webp';
import MealCard from '@/src/components/cards/MealCard';
import StickyCartBar from '@/src/components/navigation/StickyCartBar';

import { Listing, Profile, Review } from '@/src/types/models';

interface ListingWithProfile extends Listing {
  profiles: Profile;
  reviews?: Review[];
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [searchValue, setSearchValue] = useState('');
  const [popularChefins, setPopularChefins] = useState<ListingWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCuisine, setSelectedCuisine] = useState('all');
  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>({});
  const [selectedDietary, setSelectedDietary] = useState<string[]>([]);
  const [filteredChefins, setFilteredChefins] = useState<ListingWithProfile[]>([]);
  const [nextAvailableDates, setNextAvailableDates] = useState<Record<string, string>>({});

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const displayName =
    (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'there';

  const availableToday = useMemo(
    () => filteredChefins.filter(c => nextAvailableDates[c.id] === today),
    [filteredChefins, nextAvailableDates, today]
  );

  const topRated = useMemo(() => {
    const scored = filteredChefins.map(c => {
      const reviews = c.reviews ?? [];
      const avg =
        reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
      return { listing: c, avg, count: reviews.length };
    });
    return scored
      .filter(s => s.count > 0)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 8)
      .map(s => s.listing);
  }, [filteredChefins]);

  const handleCuisineSelect = (cuisine: string) => {
    setSelectedCuisine(cuisine);
  };

  const handleMainFilterToggle = (filterId: string, active: boolean) => {
    setActiveFilters(prev => ({ ...prev, [filterId]: active }));
  };

  const handleDietarySelect = (dietaryOptions: string[]) => {
    setSelectedDietary(dietaryOptions);
  };

  useEffect(() => {
    let result = [...popularChefins];

    // 1. Cuisine Filter
    if (selectedCuisine !== 'all') {
      result = result.filter(
        chefin => chefin.cuisine?.toLowerCase() === selectedCuisine.toLowerCase()
      );
    }

    // 2. Certified Filter (Must be verified)
    if (activeFilters.certified) {
      result = result.filter(chefin => chefin.profiles?.is_verified);
    }

    // 3. Dietary Filter (Must contain all selected dietary tags)
    if (selectedDietary.length > 0) {
      result = result.filter(chefin => {
        if (!chefin.dietary_tags || !Array.isArray(chefin.dietary_tags)) return false;

        // Ensure all selected dietary options are present in the dish's tags
        return selectedDietary.every(diet =>
          chefin.dietary_tags!.some(tag => tag.toLowerCase() === diet.toLowerCase())
        );
      });
    }

    // 4. Text search across title, cuisine, cook name, restaurant name
    const q = searchValue.trim().toLowerCase();
    if (q) {
      result = result.filter(chefin => {
        const haystacks = [
          chefin.title,
          chefin.cuisine,
          chefin.profiles?.full_name,
          chefin.profiles?.restaurant_name,
        ];
        return haystacks.some(s => s?.toLowerCase().includes(q));
      });
    }

    setFilteredChefins(result);
  }, [popularChefins, selectedCuisine, activeFilters, selectedDietary, searchValue]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/home/popular-chefin-listings`
      );
      const data = await response.json();
      const chefins: ListingWithProfile[] = data.popularChefins || [];
      setPopularChefins(chefins);

      const availabilityResults = await Promise.allSettled(
        chefins.map(listing =>
          fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/availability/${listing.id}`)
            .then(r => r.json())
            .then(d => ({ listingId: listing.id, availability: d.availability ?? [] }))
            .catch(() => ({ listingId: listing.id, availability: [] }))
        )
      );

      const dateMap: Record<string, string> = {};
      availabilityResults.forEach(result => {
        if (result.status !== 'fulfilled') return;
        const { listingId, availability } = result.value as {
          listingId: string;
          availability: any[];
        };
        const futureDates = availability
          .filter(
            r =>
              r.is_available &&
              r.max_orders - (r.orders_taken ?? 0) > 0 &&
              r.available_date >= today
          )
          .map(r => r.available_date.split('T')[0])
          .sort();
        if (futureDates.length > 0) dateMap[listingId] = futureDates[0];
      });
      setNextAvailableDates(dateMap);
    } catch (err) {
      console.error('Error fetching listings:', err);
      setError('Failed to load listings. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchSubmit = () => {
    const q = searchValue.trim();
    if (!q) return;
    router.push({ pathname: '/(user)/(tabs)/search', params: { q } });
  };

  const renderRail = (title: string, data: ListingWithProfile[]) => {
    if (data.length === 0) return null;
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <HeadingText level={4} style={styles.sectionTitle}>
            {title}
          </HeadingText>
          <TouchableOpacity>
            <Text style={styles.seeAllText}>See all</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={data}
          renderItem={({ item }) => (
            <MealCard
              {...item}
              cookName={item.profiles.full_name}
              restaurantName={item.profiles.restaurant_name}
              isVerified={item.profiles.is_verified}
              cookImage={item.profiles.profile_image}
              reviews={item.reviews || []}
              listings={data}
              nextAvailableDate={nextAvailableDates[item.id]}
            />
          )}
          keyExtractor={item => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 10 }}
          ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
        />
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.centerContainer}>
          <Ionicons name="cloud-offline-outline" size={64} color="#bbb" />
          <Text style={styles.stateTitle}>Something went wrong</Text>
          <Text style={styles.stateSubtitle}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const hasAnyResults = filteredChefins.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Search */}
        <View style={styles.searchBarContainer}>
          <SearchBar
            value={searchValue}
            onChangeText={setSearchValue}
            onSubmitEditing={handleSearchSubmit}
          />
        </View>

        {/* Promo banner */}
        <View style={styles.promoBanner}>
          <View style={styles.promoContent}>
            <Text style={styles.promoEyebrow}>FEATURED</Text>
            <HeadingText level={5} style={styles.promoTitle}>
              We think you'll love this dish
            </HeadingText>
            <TouchableOpacity style={styles.promoButton}>
              <Text style={styles.promoButtonText}>Explore</Text>
              <Ionicons name="arrow-forward" size={16} color="#2E7D32" />
            </TouchableOpacity>
          </View>
          <Image source={PromoImage} style={styles.promoImage} />
        </View>

        <CuisineFilter onCuisineSelect={handleCuisineSelect} />
        <MainFilter onFilterToggle={handleMainFilterToggle} onDietarySelect={handleDietarySelect} />

        {hasAnyResults ? (
          <>
            {renderRail('Popular Chefins Near You', filteredChefins)}
            {renderRail('Available Today', availableToday)}
            {renderRail('Top Rated', topRated)}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="restaurant-outline" size={56} color="#bbb" />
            <Text style={styles.stateTitle}>No chefins match your filters</Text>
            <Text style={styles.stateSubtitle}>
              Try clearing some filters or picking a different cuisine.
            </Text>
          </View>
        )}
      </ScrollView>
      <StickyCartBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
  },
  noDataText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    padding: 20,
  },
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa', // Slightly off-white background
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 10,
  },
  searchBarContainer: {
    marginTop: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
  },
  greeting: {
    fontSize: 16,
    color: '#666',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
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
  welcomeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  joinButton: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
    alignSelf: 'flex-start',
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 2,
    marginBottom: 2,
  },
  seeAllText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '500',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  promoBanner: {
    backgroundColor: '#90EE90',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    overflow: 'hidden',
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 10,
    }),
  },
  promoContent: {
    flex: 1,
    paddingRight: 12,
  },
  promoEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  promoTitle: {
    marginBottom: 12,
  },
  promoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  promoButtonText: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '600',
  },
  promoImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    textAlign: 'center',
  },
  stateSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 20,
    gap: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
});
