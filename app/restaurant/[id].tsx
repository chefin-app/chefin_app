import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import React, { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import MenuItemCard from '@/src/components/cards/MenuItemCard';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import LoadingSpinner from '@/src/components/feedback/LoadingSpinner';
import StickyCartBar from '@/src/components/navigation/StickyCartBar';
import { useFavourites } from '@/src/context/FavouritesContext';
import { useAuth } from '@/src/services/auth-context';

const MenuScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { session } = useAuth();
  const { toggleFavourite, isFavourite } = useFavourites();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      try {
        const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/id/${id}`);
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error('Error fetching restaurant data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  const { profile, listings = [] } = data;

  // Determine if the restaurant is verified (adjust property name as needed)
  const displayVerified = profile?.verified ?? profile?.is_verified ?? false;

  // calculate average restaurant rating based only on dishes with reviews
  const ratedDishes = listings.filter((dish: any) => dish.reviews && dish.reviews.length > 0);

  const displayRestaurantRating =
    ratedDishes.length > 0
      ? (
          ratedDishes.reduce((total: any, dish: any) => {
            const reviews = dish.reviews || [];
            const dishAvg =
              reviews.reduce((sum: any, r: any) => sum + (r.rating ?? 0), 0) / reviews.length;
            return total + dishAvg;
          }, 0) / ratedDishes.length
        ).toFixed(1)
      : '-';

  const displayReviewCount = ratedDishes.reduce(
    (count: number, dish: any) => count + (dish.reviews.length || 0),
    0
  );

  const handleToggleFavourite = () => {
    if (!session?.user) {
      router.push('/(auth)/login');
      return;
    }
    toggleFavourite({
      profileId: profile.id,
      restaurantName: profile.restaurant_name,
      imageUrl: profile.profile_image,
      fullChefName: profile.full_name,
      rating: displayRestaurantRating,
      reviewCount: displayReviewCount,
    });
  };

  console.log(data.listings);
  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Section */}
        <View style={styles.bannerContainer}>
          <Image source={{ uri: listings[0]?.image_url }} style={styles.bannerImage} />
          <View style={styles.bannerOverlay} />
        </View>

        {/* Back Button (Absolute) */}
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.favouriteButton} onPress={handleToggleFavourite}>
          <Ionicons
            name={isFavourite(profile.id) ? 'heart' : 'heart-outline'}
            size={24}
            color={isFavourite(profile.id) ? '#FF5252' : '#333'}
          />
        </TouchableOpacity>

        {/* Modern Overlapping Info Card */}
        <View style={styles.infoCardWrapper}>
          <View style={styles.mainInfoCard}>
            <View style={styles.headerRow}>
              <Image source={{ uri: profile?.profile_image }} style={styles.avatar} />
              <View style={styles.titleContainer}>
                <View style={styles.nameRow}>
                  <Text style={styles.restaurantName} numberOfLines={1}>
                    {profile?.restaurant_name}
                  </Text>
                  {displayVerified && (
                    <MaterialIcons
                      name="verified"
                      size={20}
                      color="#0084ff"
                      style={styles.verifiedIconBadge}
                    />
                  )}
                </View>
                <Text style={styles.chefName}>By Chef {profile?.full_name}</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Ionicons name="star" size={18} color="#FFB800" />
                <Text style={styles.statTextBold}>{displayRestaurantRating}</Text>
                <Text style={styles.statText}>({displayReviewCount}+)</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.statItem}>
                <Ionicons name="time-outline" size={18} color="#666" />
                <Text style={[styles.statText, { marginLeft: 6 }]}>12:00 PM - 8:00 PM</Text>
              </View>
            </View>

            <View style={styles.locationContainer}>
              <Ionicons name="location-outline" size={18} color="#666" />
              <Text style={styles.locationText}>
                {listings[0]?.location || 'Location not provided'}
              </Text>
            </View>
          </View>
        </View>

        {/* Popular Dishes Section */}
        {listings.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Popular Dishes</Text>
            <View style={styles.dishesList}>
              {listings.slice(0, 3).map((dish: any) => (
                <MenuItemCard
                  key={dish.id}
                  {...dish}
                  image_url={dish.image_url ?? ''}
                  reviews={dish.reviews ?? []}
                  isActive={activeCardId === dish.id}
                  onSelect={() => setActiveCardId(dish.id)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Menu Section */}
        {listings.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Full Menu</Text>
            <View style={styles.dishesList}>
              {listings.map((dish: any) => (
                <MenuItemCard
                  key={dish.id}
                  {...dish}
                  image_url={dish.image_url ?? ''}
                  reviews={dish.reviews ?? []}
                  isActive={activeCardId === dish.id}
                  onSelect={() => setActiveCardId(dish.id)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Report This Listing Button */}
        <TouchableOpacity style={styles.reportButton}>
          <Ionicons name="flag-outline" size={18} color="#ff4d4d" style={{ marginRight: 8 }} />
          <Text style={styles.reportButtonText}>Report this listing</Text>
        </TouchableOpacity>
      </ScrollView>
      <StickyCartBar />
    </View>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC', // Modern soft background
  },
  scrollContent: {
    paddingBottom: 100,
  },
  bannerContainer: {
    width: '100%',
    height: 240,
    position: 'relative',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)', // Darken slightly for premium feel
  },
  backButton: {
    position: 'absolute',
    top: 55,
    left: 20,
    width: 42,
    height: 42,
    backgroundColor: '#fff',
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  favouriteButton: {
    position: 'absolute',
    top: 55,
    right: 20,
    width: 42,
    height: 42,
    backgroundColor: '#fff',
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  infoCardWrapper: {
    marginTop: -40, // Pull up over the banner
    paddingHorizontal: 20,
    zIndex: 5,
    marginBottom: 25,
  },
  mainInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#F7F9FC',
  },
  titleContainer: {
    marginLeft: 16,
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  restaurantName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1A1A',
    flexShrink: 1,
  },
  verifiedIconBadge: {
    marginLeft: 6,
  },
  chefName: {
    fontSize: 15,
    color: '#666',
    marginTop: 4,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statTextBold: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    marginLeft: 6,
    marginRight: 4,
  },
  statText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    marginLeft: 4,
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: '#E5E5E5',
    marginHorizontal: 16,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    flex: 1,
    fontWeight: '500',
  },
  sectionContainer: {
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  dishesList: {
    flexDirection: 'column',
    gap: 16,
  },
  reportButton: {
    flexDirection: 'row',
    backgroundColor: '#FFF1F1',
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFE4E4',
  },
  reportButtonText: {
    color: '#ff4d4d',
    fontWeight: '700',
    fontSize: 16,
  },
});

export default MenuScreen;
