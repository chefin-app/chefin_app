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
  ActivityIndicator,
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
import FloatingCartButton from '@/src/components/navigation/FloatingCartButton';
import LocationPromptModal from '@/src/components/location/LocationPromptModal';

import { Listing, Profile, Review } from '@/src/types/models';
import {
  fetchAvailabilitySummaries,
  getLocalDateKey,
  isSummaryAvailableNow,
  type AvailabilitySummaryMap,
} from '@/src/utils/listingAvailability';
import { getListingsRatingSummary, getRatingSummary } from '@/src/utils/ratings';
import { fetchCooks, fetchNearestCooks } from '@/src/utils/fetchCooks';
import { useCustomerLocation } from '@/src/context/CustomerLocationContext';
import { useAuth } from '@/src/services/auth-context';
import { listingMatchesDietaryPreferences } from '@/src/utils/dietary';

interface ListingWithProfile extends Listing {
  profiles: Profile;
  reviews?: Review[];
}

type DiscoveryMode = 'all' | 'availableNow' | 'topRated' | 'nearest';

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
  const { user } = useAuth();
  const { location, prompted: locationPrompted, loading: locationLoading } = useCustomerLocation();
  const [popularChefins, setPopularChefins] = useState<ListingWithProfile[]>([]);
  const [nearestChefins, setNearestChefins] = useState<ListingWithProfile[]>([]);
  const [nearestLoading, setNearestLoading] = useState(false);
  const [nearestError, setNearestError] = useState<string | null>(null);
  const [locationPromptVisible, setLocationPromptVisible] = useState(false);
  const [autoPromptedUserId, setAutoPromptedUserId] = useState<string | null>(null);
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

  const nearestRestaurants = useMemo(() => {
    const matchingCookIds = new Set(filteredChefins.map(listing => listing.cook_id));
    return uniqueByCook(
      nearestChefins.filter(listing => matchingCookIds.has(listing.cook_id))
    ).slice(0, 10);
  }, [filteredChefins, nearestChefins]);

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

    // 3. Dietary declarations are dish-level. Filtering the dish rows before
    // de-duplicating cooks means a restaurant appears if it has at least one
    // customer-visible dish that satisfies every selected preference.
    if (selectedDietary.length > 0) {
      result = result.filter(chefin => listingMatchesDietaryPreferences(chefin, selectedDietary));
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

  const fetchNearest = useCallback(async () => {
    if (!location) {
      setNearestChefins([]);
      setNearestError(null);
      setNearestLoading(false);
      return;
    }
    setNearestLoading(true);
    setNearestError(null);
    try {
      const nearby = (await fetchNearestCooks({
        latitude: location.latitude,
        longitude: location.longitude,
        limit: 20,
      })) as ListingWithProfile[];
      setNearestChefins(nearby);
    } catch (caught) {
      setNearestChefins([]);
      setNearestError(
        caught instanceof Error ? caught.message : 'Nearby home restaurants are unavailable.'
      );
    } finally {
      setNearestLoading(false);
    }
  }, [location]);

  useFocusEffect(
    useCallback(() => {
      fetchNearest();
    }, [fetchNearest])
  );

  useEffect(() => {
    if (!user) {
      setAutoPromptedUserId(null);
      setLocationPromptVisible(false);
      return;
    }
    if (!locationLoading && !locationPrompted && autoPromptedUserId !== user.id) {
      // New accounts land here immediately after the required name/phone step.
      // Existing accounts are offered the same one-time choice after rollout.
      setAutoPromptedUserId(user.id);
      setLocationPromptVisible(true);
    }
  }, [autoPromptedUserId, locationLoading, locationPrompted, user]);

  const openLocationPrompt = () => {
    if (!user) {
      router.push('/(auth)/login');
      return;
    }
    setLocationPromptVisible(true);
  };

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
            <Text style={styles.promoDescription} numberOfLines={2}>
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
            {location ? (
              nearestLoading ? (
                <View style={styles.nearestStatusCard}>
                  <ActivityIndicator size="small" color="#4CAF50" />
                  <Text style={styles.nearestStatusText}>Finding the closest kitchens…</Text>
                </View>
              ) : nearestRestaurants.length > 0 ? (
                renderRail('Nearest to You', nearestRestaurants, 'nearest')
              ) : (
                <View style={styles.nearestEmptyCard}>
                  <Ionicons
                    name={nearestError ? 'cloud-offline-outline' : 'location-outline'}
                    size={24}
                    color="#4C6651"
                  />
                  <View style={styles.nearestEmptyCopy}>
                    <Text style={styles.nearestEmptyTitle}>
                      {nearestError
                        ? 'Nearby restaurants could not load'
                        : 'No nearby kitchens yet'}
                    </Text>
                    <Text style={styles.nearestEmptyText} numberOfLines={2}>
                      {nearestError ||
                        'Try a different area or check again as new home restaurants join.'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={nearestError ? fetchNearest : openLocationPrompt}>
                    <Text style={styles.nearestActionText}>
                      {nearestError ? 'Retry' : 'Change'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )
            ) : (
              <TouchableOpacity style={styles.nearestCta} onPress={openLocationPrompt}>
                <View style={styles.nearestCtaIcon}>
                  <Ionicons name="navigate-outline" size={22} color="#2E7D32" />
                </View>
                <View style={styles.nearestCtaCopy}>
                  <Text style={styles.nearestCtaTitle}>See the nearest home restaurants</Text>
                  <Text style={styles.nearestCtaText}>
                    Set an area to receive privacy-friendly local recommendations.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#2E7D32" />
              </TouchableOpacity>
            )}
            {renderRail(
              'Popular Home Restaurants',
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
      <FloatingCartButton />
      <LocationPromptModal
        visible={locationPromptVisible}
        onClose={() => setLocationPromptVisible(false)}
      />
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
  locationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DFE8E1',
    padding: 12,
    marginBottom: 14,
  },
  locationSelectorIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E8F5EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  locationSelectorCopy: { flex: 1 },
  locationSelectorEyebrow: {
    color: '#758077',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  locationSelectorLabel: {
    color: '#243528',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  nearestStatusCard: {
    minHeight: 90,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  nearestStatusText: { color: '#5E6C61', fontSize: 12, marginTop: 8 },
  nearestEmptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F7F2',
    borderRadius: 16,
    padding: 14,
    gap: 10,
    marginBottom: 18,
  },
  nearestEmptyCopy: { flex: 1 },
  nearestEmptyTitle: { color: '#29432F', fontSize: 14, fontWeight: '700' },
  nearestEmptyText: { color: '#627065', fontSize: 11, lineHeight: 16, marginTop: 2 },
  nearestActionText: { color: '#2E7D32', fontSize: 12, fontWeight: '700', padding: 6 },
  nearestCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF8EF',
    borderWidth: 1,
    borderColor: '#D1E9D5',
    borderRadius: 18,
    padding: 14,
    marginBottom: 20,
  },
  nearestCtaIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  nearestCtaCopy: { flex: 1 },
  nearestCtaTitle: { color: '#214128', fontSize: 14, fontWeight: '700' },
  nearestCtaText: { color: '#5D6F61', fontSize: 11, lineHeight: 16, marginTop: 2 },
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
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    minHeight: 150,
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
    marginBottom: 6,
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
    marginBottom: 8,
  },
  promoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
  },
  promoButtonText: {
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: '700',
  },
  promoVisual: {
    width: 90,
    height: 116,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  promoImage: {
    width: 90,
    height: 108,
    borderRadius: 17,
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
