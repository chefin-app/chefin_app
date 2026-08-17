import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';

import MealCard from '@/src/components/cards/MealCard';
import SearchHistoryCard from '@/src/components/cards/SearchHistoryCard';
import LocationPromptModal from '@/src/components/location/LocationPromptModal';
import FloatingCartButton from '@/src/components/navigation/FloatingCartButton';
import useFetch from '@/src/hooks/useFetch';
import { fetchCooks, fetchNearestCooks } from '@/src/utils/fetchCooks';
import {
  fetchAvailabilitySummaries,
  getLocalDateKey,
  isSummaryAvailableNow,
  type AvailabilitySummaryMap,
} from '@/src/utils/listingAvailability';
import { getListingsRatingSummary, getRatingSummary } from '@/src/utils/ratings';
import type { Listing } from '@/src/types/models';
import { useCustomerLocation } from '@/src/context/CustomerLocationContext';
import { useAuth } from '@/src/services/auth-context';

type DiscoveryMode = 'all' | 'availableNow' | 'topRated' | 'nearest';

const discoveryContent: Record<
  DiscoveryMode,
  { title: string; description: string; icon: React.ComponentProps<typeof Ionicons>['name'] }
> = {
  all: {
    title: 'All Home Restaurants',
    description: 'Browse every approved home restaurant and find your next meal.',
    icon: 'restaurant-outline',
  },
  availableNow: {
    title: 'Available Now',
    description: 'Home restaurants with a bookable meal slot today.',
    icon: 'flash-outline',
  },
  topRated: {
    title: 'Top Rated',
    description: 'Home restaurants ordered by their verified customer ratings.',
    icon: 'star-outline',
  },
  nearest: {
    title: 'Nearest to You',
    description: 'Home restaurants ordered by proximity to your selected area.',
    icon: 'location-outline',
  },
};

function parseDiscoveryMode(value?: string): DiscoveryMode | null {
  return value === 'all' || value === 'availableNow' || value === 'topRated' || value === 'nearest'
    ? value
    : null;
}

function uniqueByCook<T extends Pick<Listing, 'cook_id'>>(listings: T[]): T[] {
  const seenCookIds = new Set<string>();
  return listings.filter(listing => {
    if (seenCookIds.has(listing.cook_id)) return false;
    seenCookIds.add(listing.cook_id);
    return true;
  });
}

const CardSeparator = () => <View style={styles.cardSeparator} />;

const SearchScreen = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { location } = useCustomerLocation();
  const params = useLocalSearchParams<{ q?: string; discover?: string; title?: string }>();
  const discoveryMode = parseDiscoveryMode(params.discover);
  const [searchQuery, setSearchQuery] = useState(params.q ?? '');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchHistoryLoaded, setSearchHistoryLoaded] = useState(false);
  const [availabilitySummaries, setAvailabilitySummaries] = useState<AvailabilitySummaryMap>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [queryPending, setQueryPending] = useState(
    Boolean((params.q ?? '').trim() || discoveryMode)
  );
  const [today, setToday] = useState(getLocalDateKey);
  const [locationPromptVisible, setLocationPromptVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setToday(getLocalDateKey());
    }, [])
  );

  const {
    data: restaurantData,
    loading: restaurantLoading,
    error: restaurantError,
    refetch: loadCooks,
    reset,
  } = useFetch(
    () =>
      discoveryMode === 'nearest' && location
        ? fetchNearestCooks({
            latitude: location.latitude,
            longitude: location.longitude,
            limit: 50,
          })
        : fetchCooks({ query: searchQuery }),
    false
  );

  useEffect(() => {
    setSearchQuery(typeof params.q === 'string' ? params.q : '');
  }, [params.q, params.discover]);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const saved = await AsyncStorage.getItem('searchHistory');
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setSearchHistory(
              parsed.filter((item): item is string => typeof item === 'string').slice(0, 10)
            );
          }
        }
      } catch (error) {
        console.error('Failed to load search history', error);
      } finally {
        setSearchHistoryLoaded(true);
      }
    };
    loadHistory();
  }, []);

  useEffect(() => {
    if (!searchHistoryLoaded) return;
    AsyncStorage.setItem('searchHistory', JSON.stringify(searchHistory)).catch(error =>
      console.error('Failed to save search history', error)
    );
  }, [searchHistory, searchHistoryLoaded]);

  useEffect(() => {
    let isCurrent = true;
    const trimmedQuery = searchQuery.trim();

    if (!trimmedQuery && !discoveryMode) {
      setQueryPending(false);
      reset();
      return () => {
        isCurrent = false;
      };
    }

    if (discoveryMode === 'nearest' && !location) {
      setQueryPending(false);
      reset();
      return () => {
        isCurrent = false;
      };
    }

    setQueryPending(true);
    if (discoveryMode === 'availableNow') setAvailabilityLoading(true);

    const timeout = setTimeout(async () => {
      try {
        await loadCooks();

        if (trimmedQuery) {
          setSearchHistory(previous => {
            const updatedHistory = [
              trimmedQuery,
              ...previous.filter(item => item !== trimmedQuery),
            ];
            return updatedHistory.slice(0, 10);
          });
        }
      } finally {
        if (isCurrent) setQueryPending(false);
      }
    }, 500);

    return () => {
      isCurrent = false;
      clearTimeout(timeout);
    };
    // loadCooks and reset intentionally track the latest searchQuery closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, discoveryMode, location]);

  useEffect(() => {
    let isCurrent = true;

    if (restaurantData === null) {
      setAvailabilitySummaries({});
      setAvailabilityLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    if (restaurantData.length === 0) {
      setAvailabilitySummaries({});
      setAvailabilityLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    setAvailabilitySummaries({});
    setAvailabilityLoading(true);
    fetchAvailabilitySummaries(restaurantData, today)
      .then(summaries => {
        if (isCurrent) setAvailabilitySummaries(summaries);
      })
      .catch(error => {
        if (isCurrent) {
          console.error('Failed to load restaurant availability', error);
          setAvailabilitySummaries({});
        }
      })
      .finally(() => {
        if (isCurrent) setAvailabilityLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [restaurantData, today]);

  const visibleRestaurants = useMemo(() => {
    const allListings = restaurantData ?? [];

    if (discoveryMode === 'availableNow') {
      return uniqueByCook(
        allListings.filter(listing =>
          isSummaryAvailableNow(listing.cook_id, availabilitySummaries, today)
        )
      );
    }

    if (discoveryMode === 'topRated') {
      const scored = uniqueByCook(allListings).map(listing => {
        const cookListings = allListings.filter(candidate => candidate.cook_id === listing.cook_id);
        const rating = Array.isArray(listing.restaurant_reviews)
          ? getRatingSummary(listing.restaurant_reviews)
          : getListingsRatingSummary(cookListings);
        return { listing, rating };
      });

      return scored
        .filter(item => item.rating.average !== null)
        .sort((a, b) => b.rating.average! - a.rating.average! || b.rating.count - a.rating.count)
        .map(item => item.listing);
    }

    if (discoveryMode === 'nearest') {
      // The backend already returned restaurants in proximity order.
      return uniqueByCook(allListings);
    }

    // Search responses contain dishes, so several matching dishes can belong
    // to the same home restaurant. Every result mode should render one card
    // per cook while preserving the first matching dish as its representative.
    return uniqueByCook(allListings);
  }, [availabilitySummaries, discoveryMode, restaurantData, today]);

  const clearHistory = async () => {
    try {
      await AsyncStorage.removeItem('searchHistory');
      setSearchHistory([]);
    } catch (error) {
      console.error('Failed to clear history', error);
    }
  };

  const clearDiscovery = () => {
    setSearchQuery('');
    reset();
    router.replace('/(user)/(tabs)/search');
  };

  const chooseLocation = () => {
    if (!user) {
      router.push('/(auth)/login');
      return;
    }
    setLocationPromptVisible(true);
  };

  const isLoading = queryPending || restaurantLoading || availabilityLoading;
  const configuredDiscovery = discoveryMode ? discoveryContent[discoveryMode] : null;
  const discoveryTitle =
    typeof params.title === 'string' && params.title.trim()
      ? params.title
      : configuredDiscovery?.title;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={isLoading ? [] : visibleRestaurants}
        renderItem={({ item }) => (
          <View style={styles.cardContainer}>
            <MealCard
              {...item}
              image_url={item.image_url ?? ''}
              cookName={item.profiles.full_name}
              restaurantName={item.profiles.restaurant_name}
              isVerified={item.profiles.is_verified}
              cookImage={item.profiles.profile_image}
              reviews={item.reviews ?? []}
              listings={restaurantData ?? []}
              availability={availabilitySummaries[item.cook_id]}
            />
          </View>
        )}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={CardSeparator}
        ListHeaderComponent={
          <>
            {configuredDiscovery && (
              <View style={styles.discoveryHeader}>
                <View style={styles.discoveryIcon}>
                  <Ionicons name={configuredDiscovery.icon} size={22} color="#2E7D32" />
                </View>
                <View style={styles.discoveryCopy}>
                  <Text style={styles.discoveryEyebrow}>DISCOVER</Text>
                  <Text style={styles.discoveryTitle}>{discoveryTitle}</Text>
                  <Text style={styles.discoveryDescription}>{configuredDiscovery.description}</Text>
                  {!isLoading && !restaurantError && (
                    <Text style={styles.discoveryCount}>
                      {visibleRestaurants.length}{' '}
                      {visibleRestaurants.length === 1 ? 'restaurant' : 'restaurants'}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.clearDiscoveryButton}
                  onPress={clearDiscovery}
                  accessibilityRole="button"
                  accessibilityLabel="Close discovery results"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={20} color="#456249" />
                </TouchableOpacity>
              </View>
            )}

            {isLoading && (
              <View style={styles.statusRow}>
                <Text style={styles.statusText}>Finding home restaurants...</Text>
              </View>
            )}

            {restaurantError && (
              <View style={styles.statusRow}>
                <Ionicons name="alert-circle-outline" size={18} color="#B3261E" />
                <Text style={styles.errorText}>{restaurantError.message}</Text>
              </View>
            )}

            {!isLoading &&
              !restaurantError &&
              visibleRestaurants.length > 0 &&
              searchQuery.trim() && (
                <View style={styles.resultsView}>
                  <Text style={styles.resultsText}>
                    Results for <Text style={styles.searchResults}>{searchQuery.trim()}</Text>
                  </Text>
                </View>
              )}
          </>
        }
        ListEmptyComponent={
          !isLoading && !restaurantError ? (
            searchQuery.trim() || discoveryMode ? (
              <View style={styles.emptyState}>
                <Ionicons name="restaurant-outline" size={46} color="#A7B0A8" />
                <Text style={styles.emptyTitle}>No matching restaurants</Text>
                <Text style={styles.emptyDescription}>
                  {discoveryMode === 'availableNow'
                    ? 'There are no remaining meal slots today. Check back soon for new availability.'
                    : discoveryMode === 'nearest' && !location
                      ? 'Choose a location to sort home restaurants near you.'
                      : 'Try a different search or explore all home restaurants.'}
                </Text>
                {discoveryMode === 'nearest' && !location && (
                  <TouchableOpacity style={styles.locationButton} onPress={chooseLocation}>
                    <Ionicons name="location" size={18} color="#fff" />
                    <Text style={styles.locationButtonText}>Choose location</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.historyContainer}>
                <View style={styles.rowContainer}>
                  <Text style={styles.historyTitle}>Recent searches</Text>
                  {searchHistory.length > 0 && (
                    <TouchableOpacity onPress={clearHistory} accessibilityRole="button">
                      <Text style={styles.clearHistoryText}>Clear history</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {searchHistory.map(item => (
                  <View key={item} style={styles.historyItem}>
                    <SearchHistoryCard
                      query={item}
                      onPress={() => router.setParams({ q: item, discover: '', title: '' })}
                    />
                  </View>
                ))}
              </View>
            )
          ) : null
        }
      />
      <FloatingCartButton />
      <LocationPromptModal
        visible={locationPromptVisible}
        onClose={() => setLocationPromptVisible(false)}
      />
    </SafeAreaView>
  );
};

export default SearchScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    paddingBottom: 100,
  },
  cardContainer: {
    alignItems: 'center',
  },
  cardSeparator: {
    height: 12,
  },
  discoveryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF8F0',
    borderWidth: 1,
    borderColor: '#D7ECDD',
    borderRadius: 18,
    padding: 14,
    marginTop: 14,
    marginBottom: 4,
  },
  discoveryIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  discoveryCopy: {
    flex: 1,
  },
  discoveryEyebrow: {
    color: '#2E7D32',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
  },
  discoveryTitle: {
    color: '#1F3523',
    fontSize: 18,
    fontWeight: '700',
  },
  discoveryDescription: {
    color: '#5E7061',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  discoveryCount: {
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 7,
  },
  clearDiscoveryButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginVertical: 18,
    paddingHorizontal: 16,
  },
  statusText: {
    color: '#5E6B60',
    fontSize: 13,
  },
  errorText: {
    color: '#B3261E',
    fontSize: 13,
    flexShrink: 1,
  },
  resultsView: {
    marginTop: 14,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  resultsText: {
    color: '#555',
    fontSize: 13,
  },
  searchResults: {
    fontWeight: '700',
    color: '#18351F',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 28,
  },
  emptyTitle: {
    color: '#2E3830',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyDescription: {
    color: '#6A746C',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 22,
    marginTop: 15,
  },
  locationButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  historyContainer: {
    marginTop: 22,
  },
  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  historyTitle: {
    color: '#555',
    fontSize: 14,
    fontWeight: '600',
  },
  clearHistoryText: {
    color: '#2E7D32',
    fontSize: 13,
    fontWeight: '600',
  },
  historyItem: {
    alignItems: 'flex-start',
  },
});
