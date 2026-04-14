import { View, Text, TouchableOpacity, StyleSheet, ImageBackground, Image } from 'react-native';
import { useRouter } from 'expo-router';
import React from 'react';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

import { images } from '@/src/constants/images';
import type { Listing, Profile, Review } from '@/src/types/models';
import { useFavourites } from '@/src/context/FavouritesContext';
import { useAuth } from '@/src/services/auth-context';

export interface MealCardProps extends Listing {
  cookName?: string;
  restaurantName?: string;
  isVerified?: boolean;
  cookImage?: string;
  profiles?: Profile;
  reviews?: Review[];
  averageRating?: number;
  listings?: Listing[];
  /** ISO date string (YYYY-MM-DD) of the earliest available slot for this chef's dishes */
  nextAvailableDate?: string;
}

/** Returns 'Today', 'Tomorrow', or a locale-formatted date string */
function getAvailabilityLabel(dateStr?: string): string {
  if (!dateStr) return 'Unknown';
  const today = new Date();
  const target = new Date(dateStr + 'T00:00:00'); // force local midnight to avoid UTC offset issues

  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffDays = Math.round(
    (targetMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
  profiles, // Add profiles to destructured props
  listings = [],
  nextAvailableDate,
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

  // Gather all rated dishes belonging to this cook
  const chefDishes = (listings || []).filter(
    dish =>
      dish.cook_id &&
      dish.cook_id === profileId &&
      Array.isArray(dish.reviews) &&
      (dish.reviews?.length ?? 0) > 0
  );

  // Compute weighted average: sum of all ratings across all dishes / total number of ratings
  const { totalRatingsSum, totalRatingsCount } = chefDishes.reduce(
    (acc, dish) => {
      const validReviews = (dish.reviews ?? []).filter(r => typeof r.rating === 'number');
      const sum = validReviews.reduce((s, r) => s + r.rating, 0);
      return {
        totalRatingsSum: acc.totalRatingsSum + sum,
        totalRatingsCount: acc.totalRatingsCount + validReviews.length,
      };
    },
    { totalRatingsSum: 0, totalRatingsCount: 0 }
  );

  const displayRestaurantRating =
    totalRatingsCount > 0 ? (totalRatingsSum / totalRatingsCount).toFixed(1) : '-';

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
      reviewCount: totalRatingsCount,
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
            {displayVerified && (
              <MaterialIcons
                style={styles.verifiedIcon}
                name="verified"
                size={16}
                color="#0084ff"
              />
            )}
          </View>
        </View>
      </View>

      <View style={styles.availabilityRow}>
        <Text style={styles.available}>
          Available{' '}
          <Text style={styles.availableDate}>{getAvailabilityLabel(nextAvailableDate)}</Text>
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
  availableDate: {
    fontWeight: 'bold',
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
