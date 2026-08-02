import { View, Text, TouchableOpacity, StyleSheet, ImageBackground, Image } from 'react-native';
import { useRouter } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

import { images } from '@/src/constants/images';
import type { Listing, ListingReview, Profile } from '@/src/types/models';
import { useFavourites } from '@/src/context/FavouritesContext';
import { useAuth } from '@/src/services/auth-context';
import VerifiedBadge from '@/src/components/feedback/VerifiedBadge';
import { formatRating, getListingsRatingSummary, getRatingSummary } from '@/src/utils/ratings';
import { formatAvailabilityLabel, type AvailabilitySummary } from '@/src/utils/listingAvailability';

export interface MealCardProps extends Listing {
  cookName?: string;
  restaurantName?: string;
  isVerified?: boolean;
  cookImage?: string;
  profiles?: Profile;
  reviews?: ListingReview[];
  listings?: Listing[];
  /** Time-aware availability across this restaurant's dishes. */
  availability?: AvailabilitySummary;
}

/** Returns a complete, user-facing availability message. */
export function getAvailabilityLabel(availability?: AvailabilitySummary, now = new Date()): string {
  return formatAvailabilityLabel(availability, now);
}

const MealCard: React.FC<MealCardProps> = ({
  restaurantName,
  isVerified,
  cookImage,
  title,
  cuisine,
  description,
  image_url,
  created_at,
  cook_id,
  reviews = [], // Default to empty array if undefined
  restaurant_reviews,
  profiles, // Add profiles to destructured props
  listings = [],
  availability,
}) => {
  const router = useRouter();
  const { toggleFavourite, isFavourite } = useFavourites();
  const { session } = useAuth();

  // Handle both flattened props and nested profiles object
  const profileId = cook_id || profiles?.id || '';
  const displayName =
    restaurantName || profiles?.restaurant_name || profiles?.full_name || 'Unknown Restaurant';
  const displayImage = cookImage || profiles?.profile_image;
  const displayVerified = isVerified ?? profiles?.is_verified ?? false;

  // Prefer a cook-wide review set supplied by the API. The listings fallback
  // supports callers that already hold every dish for this cook, while the
  // final fallback keeps a standalone dish card useful.
  const chefListings = listings.filter(dish => dish.cook_id === profileId);
  const ratingSummary = Array.isArray(restaurant_reviews)
    ? getRatingSummary(restaurant_reviews)
    : chefListings.length > 0
      ? getListingsRatingSummary(chefListings)
      : getRatingSummary(reviews);
  const displayRestaurantRating = formatRating(ratingSummary.average);

  const handleToggleFavourite = () => {
    if (!session?.user) {
      router.push('/(auth)/login');
      return;
    }
    toggleFavourite({
      profileId: profileId,
      restaurantName: displayName,
      imageUrl: image_url,
      fullChefName: profiles?.full_name,
      rating: displayRestaurantRating,
      reviewCount: ratingSummary.count,
    });
  };

  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/restaurant/${profileId}`)}>
      <ImageBackground
        testID="meal-image"
        source={image_url ? { uri: image_url } : images.templateMeal}
        style={styles.image}
        imageStyle={styles.imageStyle}
      >
        <TouchableOpacity
          testID="favourite-button"
          style={styles.heartIcon}
          onPress={handleToggleFavourite}
        >
          <Ionicons
            name={isFavourite(profileId) ? 'heart' : 'heart-outline'}
            size={24}
            color={isFavourite(profileId) ? '#ff0000' : '#111111'}
          />
        </TouchableOpacity>
      </ImageBackground>

      <View style={styles.infoContainer}>
        <Image
          source={displayImage ? { uri: displayImage } : images.templateAvatar}
          style={styles.avatar}
        />

        <View style={styles.titleContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {displayName}
            </Text>
            <View style={styles.rating}>
              <Ionicons name="star" size={16} color="#FFD700" />
              <Text style={styles.ratingText}>{displayRestaurantRating}</Text>
            </View>
          </View>

          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle}>{cuisine || 'No description'}</Text>
            {displayVerified && <VerifiedBadge style={styles.verifiedIcon} size={16} />}
          </View>
        </View>
      </View>

      <View style={styles.availabilityRow}>
        <Text style={[styles.available, availability?.state !== 'available' && styles.unavailable]}>
          {getAvailabilityLabel(availability)}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 300,
    height: 220,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
  },
  image: {
    width: '100%',
    height: 120,
    borderRadius: 10,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    overflow: 'hidden',
    position: 'relative',
  },
  imageStyle: {
    resizeMode: 'cover',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  heartIcon: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 6,
    position: 'absolute',
    top: 6,
    right: 6,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
  },
  titleContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    color: '#333333',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
    flexShrink: 1,
    maxWidth: '70%',
  },
  subtitle: {
    color: '#666666',
    fontSize: 12,
    marginTop: 2,
    marginLeft: 8,
  },
  availabilityRow: {
    flex: 1,
  },
  available: {
    color: '#4CAF50',
    fontSize: 12,
    marginTop: 2,
    marginLeft: 14,
    fontWeight: 'bold',
  },
  unavailable: {
    color: '#666666',
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  ratingText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#444',
  },
  subtitleRow: {
    flexDirection: 'row',
  },
  verifiedIcon: {
    marginLeft: 4,
  },
});
export default MealCard;
