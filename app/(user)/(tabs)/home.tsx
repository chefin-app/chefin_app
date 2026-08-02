import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
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
import CuisineFilter from '@/src/components/filters/CuisineFilter';
import MainFilter from '@/src/components/filters/MainFilter';
import { HeadingText } from '@/src/components/typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import LoadingSpinner from '@/src/components/feedback/LoadingSpinner';

import PromoImage from '@/src/assets/images/promo-food.webp';
import MealCard from '@/src/components/cards/MealCard';
import StickyCartBar from '@/src/components/navigation/StickyCartBar';

import { Listing, Profile, Review } from '@/src/types/models';
import {
  fetchAvailabilitySummaries,
  getLocalDateKey,
  isSummaryAvailableNow,
  type AvailabilitySummaryMap,
} from '@/src/utils/listingAvailability';
import { getListingsRatingSummary, getRatingSummary } from '@/src/utils/ratings';
import { fetchCooks } from '@/src/utils/fetchCooks';

interface ListingWithProfile extends Listing {
  profiles: Profile;
  reviews?: Review[];
}

type DiscoveryMode = 'all' | 'availableNow' | 'topRated';

function uniqueByCook(listings: ListingWithProfile[]): ListingWithProfile[] {
  const seenCookIds = new Set<string>();
  return listings.filter(listing => {
    if (seenCookIds.has(listing.cook_id)) return false;
    seenCookIds.add(listing.cook_id);
    return true;
  });
}

const RailSeparator = () => <View style={styles.railSeparator} />;

export default function HomeScreen() {
  const router = useRouter();
  const [popularChefins, setPopularChefins] = useState<ListingWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCuisine, setSelectedCuisine] = useState('all');
  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>({});
  const [selectedDietary, setSelectedDietary] = useState<string[]>([]);
  const [filteredChefins, setFilteredChefins] = useState<ListingWithProfile[]>([]);
  const [availabilitySummaries, setAvailabilitySummaries] = useState<AvailabilitySummaryMap>({});

  const [today, setToday] = useState(getLocalDateKey);

  const availableToday = useMemo(
    () =>
      uniqueByCook(
        filteredChefins.filter(c => isSummaryAvailableNow(c.cook_id, availabilitySummaries, today))
      ),
    [availabilitySummaries, filteredChefins, today]
  );

  const popularRestaurants = useMemo(
    () => uniqueByCook(filteredChefins).slice(0, 10),
    [filteredChefins]
  );

  const featuredAvailableToday = useMemo(
    () =>
      popularChefins.filter(c => isSummaryAvailableNow(c.cook_id, availabilitySummaries, today)),
    [availabilitySummaries, popularChefins, today]
  );

  const topRated = useMemo(() => {
    const scored = uniqueByCook(filteredChefins).map(c => {
      const cookListings = popularChefins.filter(listing => listing.cook_id === c.cook_id);
      const rating = Array.isArray(c.restaurant_reviews)
        ? getRatingSummary(c.restaurant_reviews)
        : getListingsRatingSummary(cookListings);
      return { listing: c, average: rating.average, count: rating.count };
    });
    return scored
      .filter(s => s.average !== null)
      .sort((a, b) => b.average! - a.average! || b.count - a.count)
      .slice(0, 8)
      .map(s => s.listing);
  }, [filteredChefins, popularChefins]);

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

    // 4. Available Now — earliest valid slot is today and still has capacity.
    if (activeFilters.availableNow) {
      result = result.filter(chefin =>
        isSummaryAvailableNow(chefin.cook_id, availabilitySummaries, today)
      );
    }

    setFilteredChefins(result);
  }, [
    popularChefins,
    selectedCuisine,
    activeFilters,
    selectedDietary,
    availabilitySummaries,
    today,
  ]);

  const fetchData = useCallback(async () => {
    const currentDate = getLocalDateKey();
    setToday(currentDate);

    try {
      setLoading(true);
      setError(null);

      // Listings and availability must come from the same Supabase project;
      // otherwise a valid sibling-dish slot cannot be matched to this card.
      const chefins = (await fetchCooks({ query: '' })) as ListingWithProfile[];
      setPopularChefins(chefins);
      setAvailabilitySummaries(await fetchAvailabilitySummaries(chefins, currentDate));
    } catch (err) {
      console.error('Error fetching listings:', err);
      setError('Failed to load listings. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const openDiscovery = (discover: DiscoveryMode, title: string) => {
    router.push({
      pathname: '/(user)/(tabs)/search',
      params: { discover, title },
    });
  };

  const renderRail = (
    title: string,
    data: ListingWithProfile[],
    discover: DiscoveryMode,
    destinationTitle = title
  ) => {
    if (data.length === 0) return null;
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <HeadingText level={4} style={styles.sectionTitle}>
            {title}
          </HeadingText>
          <TouchableOpacity
            onPress={() => openDiscovery(discover, destinationTitle)}
            accessibilityRole="link"
            accessibilityLabel={`See all ${title}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
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
              listings={popularChefins}
              availability={availabilitySummaries[item.cook_id]}
            />
          )}
          keyExtractor={item => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.railContent}
          ItemSeparatorComponent={RailSeparator}
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
  const featuredKitchenCount = new Set(featuredAvailableToday.map(item => item.cook_id)).size;
  const hasFeaturedAvailability = featuredKitchenCount > 0;
  const promoTitle = hasFeaturedAvailability
    ? 'Home-cooked meals, available now'
    : 'Discover food made close to home';
  const promoDescription = hasFeaturedAvailability
    ? `${featuredKitchenCount} featured ${
        featuredKitchenCount === 1 ? 'kitchen has' : 'kitchens have'
      } order slots still open today.`
    : 'Explore local Chefins, fresh menus and the next available pickup times.';
  const promoCallToAction = hasFeaturedAvailability ? 'See available meals' : 'Explore kitchens';
  const promoDiscoveryMode: DiscoveryMode = hasFeaturedAvailability ? 'availableNow' : 'all';
  const promoDiscoveryTitle = hasFeaturedAvailability ? 'Available Now' : 'All Home Restaurants';
  const featuredPromoListing = featuredAvailableToday[0] ?? popularChefins[0];

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Interactive availability spotlight */}
        <TouchableOpacity
          style={styles.promoBanner}
          activeOpacity={0.9}
          onPress={() => openDiscovery(promoDiscoveryMode, promoDiscoveryTitle)}
          accessibilityRole="link"
          accessibilityLabel={`${promoTitle}. ${promoDescription} ${promoCallToAction}.`}
          accessibilityHint="Opens matching home restaurants"
        >
          <View style={styles.promoOrb} />
          <View style={styles.promoContent}>
            <View style={styles.promoBadge}>
              <Ionicons
                name={hasFeaturedAvailability ? 'flash' : 'sparkles'}
                size={13}
                color="#1B5E20"
              />
              <Text style={styles.promoEyebrow}>
                {hasFeaturedAvailability ? 'AVAILABLE NOW' : 'LOCAL PICKS'}
              </Text>
            </View>
            <HeadingText level={5} style={styles.promoTitle} numberOfLines={2}>
              {promoTitle}
            </HeadingText>
            <Text style={styles.promoDescription} numberOfLines={3}>
              {promoDescription}
            </Text>
            <View style={styles.promoButton}>
              <Text style={styles.promoButtonText}>{promoCallToAction}</Text>
              <Ionicons name="arrow-forward" size={16} color="#2E7D32" />
            </View>
          </View>
          <View style={styles.promoVisual}>
            <Image
              source={
                featuredPromoListing?.image_url
                  ? { uri: featuredPromoListing.image_url }
                  : PromoImage
              }
              style={styles.promoImage}
              accessible={false}
            />
            <View style={styles.promoImagePill}>
              <Ionicons name="time-outline" size={12} color="#1B5E20" />
              <Text style={styles.promoImagePillText}>
                {hasFeaturedAvailability ? 'Today' : 'Fresh'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <CuisineFilter onCuisineSelect={handleCuisineSelect} />
        <MainFilter onFilterToggle={handleMainFilterToggle} onDietarySelect={handleDietarySelect} />

        {hasAnyResults ? (
          <>
            {renderRail(
              'Popular Chefins Near You',
              popularRestaurants,
              'all',
              'All Home Restaurants'
            )}
            {renderRail('Available Now', availableToday, 'availableNow')}
            {renderRail('Top Rated', topRated, 'topRated')}
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
  scrollContent: {
    paddingBottom: 100,
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
  railContent: {
    paddingVertical: 10,
  },
  railSeparator: {
    width: 10,
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
    backgroundColor: '#E9F7EC',
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    minHeight: 190,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D3ECD7',
    ...createShadowStyle({
      shadowColor: '#1B5E20',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 5,
    }),
  },
  promoOrb: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: '#D4EFD9',
    right: -82,
    top: -74,
  },
  promoContent: {
    flex: 1,
    paddingRight: 14,
    zIndex: 1,
  },
  promoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 9,
  },
  promoEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1B5E20',
    letterSpacing: 0.8,
  },
  promoTitle: {
    color: '#153E1B',
    marginBottom: 5,
  },
  promoDescription: {
    color: '#426447',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  promoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    gap: 6,
  },
  promoButtonText: {
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: '700',
  },
  promoVisual: {
    width: 104,
    height: 142,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  promoImage: {
    width: 104,
    height: 132,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.85)',
  },
  promoImagePill: {
    position: 'absolute',
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 5,
    ...createShadowStyle({
      shadowColor: '#153E1B',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.14,
      shadowRadius: 5,
      elevation: 3,
    }),
  },
  promoImagePillText: {
    color: '#1B5E20',
    fontSize: 10,
    fontWeight: '700',
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
