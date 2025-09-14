import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, ScrollView, View, Image, FlatList, Text } from 'react-native';
//import { supabase } from '../../../utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { createShadowStyle } from '../../../utils/platform-utils';
import type { User } from '@supabase/supabase-js';
import SearchBar from '@/src/components/filters/SearchBar';
import CuisineFilter from '@/src/components/filters/CuisineFilter';
import MainFilter from '@/src/components/filters/MainFilter';
import { BaseText, HeadingText, BodyText, CaptionText } from '@/src/components/typography';
import { SafeAreaView } from 'react-native-safe-area-context';

import PromoImage from '../../../assets/images/promo-food.webp';
import MealCard from '@/src/components/cards/MealCard';
import MenuItemCard from '@/src/components/cards/MenuItemCard';
import ReviewCard from '@/src/components/cards/ReviewCard';

import useFetch from '@/src/hooks/useFetch';
import { fetchListings } from '@/src/utils/fetchListings';
import { fetchRestaurantName } from '@/src/utils/fetchRestaurantName';
import { supabase } from '@/src/services/supabase';
import { fetchTestData } from '@/src/utils/fetchTestData';
import { fetchPopularData } from '@/src/utils/fetchPopularData';
import { fetchDealsData } from '@/src/utils/fetchDealsData';

interface Listing {
  id: string;
  cook_id: string;
  title: string;
  description?: string;
  cuisine?: string;
  price: number;
  image_url?: string;
  created_at: string;
  dietary_tags?: string[];
  pickup_location: string;
}

interface Profile {
  user_id: string;
  full_name: string;
  profile_image?: string;
  is_verified: boolean;
  restaurant_name: string;
}

interface ListingWithProfile extends Listing {
  profiles: Profile;
}

export default function HomeScreen() {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const [popularChefins, setPopularChefins] = useState<ListingWithProfile[]>([]);
  const [deliciousDeals, setDeliciousDeals] = useState<ListingWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: testData, error: testError } = await supabase
          .from('listings')
          .select('count', { count: 'exact', head: true });
        if (testError) {
          console.error('Error fetching test data:', testError);
          setError(`Database connection error: ${testError.message}`);
          return;
        }

        console.log('supabase successful connection, total listings:', testData);

        const { data: popularData, error: popularError } = await supabase
          .from('listings')
          .select(`*, profiles ( user_id, full_name, profile_image, is_verified, restaurant_name )`)
          .limit(10);
        if (popularError) {
          console.log('Error fetching popular listings:', popularError);
        }
        if (popularData) {
          setPopularChefins(popularData);
          console.log('Fetched popular chefins:', popularData);
        }

        const { data: dealsData, error: dealsError } = await supabase
          .from('listings')
          .select(`*, profiles ( user_id, full_name, profile_image, is_verified, restaurant_name )`)
          .limit(10);
        if (!dealsError && dealsData) {
          setDeliciousDeals(dealsData); // why do we need to use the set function here?
          // because useState is asynchronous and we need to update the state with the fetched data
        }
      } catch (error) {
        console.error('Error fetching listings:', error);
        setError('Failed to load listings. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    console.log('Data fetched.');
    fetchData();
  }, []);

  // const { data: listings } = useFetch(() => fetchListings({ query: '' }), true);
  // const { data: listings2 } = useFetch(() => fetchListings({ query: 'Special Galbi' }), true);
  // //console.log('Listings data:', listings);
  // const { data: restaurants } = useFetch(() => fetchRestaurantName({}), true);
  // console.log('Restaurants data:', restaurants);
  // const { data: restaurant } = useFetch(() => fetchRestaurantName({ query: 'Mango' }), true);
  // console.log('Restaurant data:', restaurant);

  // const fetchTest = useCallback(() => fetchPopularData(), []);
  // const {data: testData} = useFetch(fetchTest, true);
  // console.log('Test data count, total listings:', testData);

  // const fetchPopular = useCallback(() => fetchPopularData(), []);
  // const {data: popularData} = useFetch(fetchPopular, true);
  // // const {data: popularData} = useFetch(() => fetchPopularData(), true);
  // console.log('Popular data:', popularData);
  // //console.log('Popular chefins state:', popularChefins);
  // const fetchDeals = useCallback(() => fetchDealsData(), []);
  // const {data: dealsData} = useFetch(fetchDeals, true);
  // console.log('Deals data:', dealsData);

  // console.log('Popular chefins state:', popularChefins);
  // console.log('Delicious deals state:', deliciousDeals);

  const handleSearchSubmit = () => {
    if (searchValue.trim()) {
      console.log('Search submitted:', searchValue);
    }
  }; // Alex: added contentContainerStyle to ScrollView with paddingBottom
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
        {/* promo banner */}
        <View style={styles.promoBanner}>
          <View style={styles.promoContent}>
            <HeadingText level={5}>Welcome to Chefin! We think you'll love this dish</HeadingText>
          </View>
          <Image source={PromoImage} style={styles.promoImage} />
        </View>
        <CuisineFilter />
        <MainFilter />
        {/* Displaying Meal Cards */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <HeadingText level={4} style={styles.sectionTitle}>
              Popular Chefins Near You
            </HeadingText>
          </View>
          <FlatList
            data={popularChefins}
            // data={popularData}
            renderItem={({ item }) => (
              <MealCard
                {...item}
                cookName={item.profiles.full_name}
                restaurantName={item.profiles.restaurant_name}
                isVerified={item.profiles.is_verified}
                cookImage={item.profiles.profile_image}
              />
            )}
            keyExtractor={item => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 10 }}
            ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
          />
        </View>

        {/* Displaying Delicious Deals Meal Cards */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <HeadingText level={4} style={styles.sectionTitle}>
              Delicious Deals
            </HeadingText>
          </View>
          <FlatList
            data={deliciousDeals}
            // data={dealsData}
            renderItem={({ item }) => (
              <MealCard
                {...item}
                cookName={item.profiles.full_name}
                restaurantName={item.profiles.restaurant_name}
                isVerified={item.profiles.is_verified}
                cookImage={item.profiles.profile_image}
              />
            )}
            keyExtractor={item => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 10 }}
            ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
          />
        </View>
        {/*         <Text>
          {listings2?.length} listings found with "Special Galbi"
        </Text> */}

        {/*<MealCard />*/}
        {/*         <ReviewCard/>
        <ReviewCard/>
        <ReviewCard/> */}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
