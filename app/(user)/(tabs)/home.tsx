import React, { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, ScrollView, View, Image, FlatList, Text } from 'react-native';
import { createShadowStyle } from '../../../src/utils/platform-utils';
import SearchBar from '@/src/components/filters/SearchBar';
import CuisineFilter from '@/src/components/filters/CuisineFilter';
import MainFilter from '@/src/components/filters/MainFilter';
import { HeadingText } from '@/src/components/typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import LoadingSpinner from '@/src/components/feedback/LoadingSpinner';

import PromoImage from '@/src/assets/images/promo-food.webp';
import MealCard from '@/src/components/cards/MealCard';

import { Listing, Profile, Review } from '@/src/types/models';

interface ListingWithProfile extends Listing {
  profiles: Profile;
  reviews?: Review[];
}

export default function HomeScreen() {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const [popularChefins, setPopularChefins] = useState<ListingWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCuisine, setSelectedCuisine] = useState('all');
  const [filteredChefins, setFilteredChefins] = useState<ListingWithProfile[]>([]);

  const handleCuisineSelect = (cuisine: string) => {
    setSelectedCuisine(cuisine);

    if (cuisine === 'all') {
      setFilteredChefins(popularChefins);
    } else {
      const filtered = popularChefins.filter(
        chefin => chefin.cuisine?.toLowerCase() === cuisine.toLowerCase()
      );
      setFilteredChefins(filtered);
    }
  };

  useEffect(() => {
    setFilteredChefins(popularChefins);
  }, [popularChefins]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // // Test connection
        // const { data: testData, error: testError } = await supabase
        //   .from('listings')
        //   .select('count', { count: 'exact', head: true });

        // if (testError) {
        //   console.error('Error fetching test data:', testError);
        //   setError(`Database connection error: ${testError.message}`);
        //   return;
        // }

        // console.log('Supabase successful connection, total listings:', testData);

        // call Node backend instead of Supabase directly
        const response = await fetch(
          `${process.env.EXPO_PUBLIC_API_URL}/api/home/popular-chefin-listings`
        );
        const data = await response.json();
        setPopularChefins(data.popularChefins || []);
      } catch (err) {
        console.error('Error fetching listings:', err);
        setError('Failed to load listings. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    console.log('Data fetched.');
    fetchData();
  }, []);

  const handleSearchSubmit = () => {
    if (searchValue.trim()) {
      console.log('Search submitted:', searchValue);
    }
  };

  // Add loading and error states to render
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
          <Text style={styles.errorText}>Error: {error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    // changed from 'top', re-add if needed
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        <SearchBar
          value={searchValue}
          onChangeText={setSearchValue}
          onSubmitEditing={() => router.push('/search')}
        />

        {/* Promo banner */}
        <View style={styles.promoBanner}>
          <View style={styles.promoContent}>
            <HeadingText level={5}>Welcome to Chefin! We think you'll love this dish</HeadingText>
          </View>
          <Image source={PromoImage} style={styles.promoImage} />
        </View>

        <CuisineFilter onCuisineSelect={handleCuisineSelect} />
        <MainFilter />

        {/* Popular Chefins Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <HeadingText level={4} style={styles.sectionTitle}>
              Popular Chefins Near You
            </HeadingText>
          </View>

          {filteredChefins.length > 0 ? (
            <FlatList
              data={filteredChefins}
              renderItem={({ item }) => {
                return (
                  <MealCard
                    {...item}
                    cookName={item.profiles.full_name}
                    restaurantName={item.profiles.restaurant_name}
                    isVerified={item.profiles.is_verified}
                    cookImage={item.profiles.profile_image}
                    reviews={item.reviews || []}
                  />
                );
              }}
              keyExtractor={item => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 10 }}
              ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
            />
          ) : (
            <Text style={styles.noDataText}>No popular chefins found</Text>
          )}
        </View>
      </ScrollView>
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
  },
  promoImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
});
