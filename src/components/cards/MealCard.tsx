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
  layout?: 'rail' | 'feed';
  scheduledLabel?: string;
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
  layout = 'rail',
  scheduledLabel,
  restaurantName,
  isVerified,
  title,
  cuisine,
  description,
  image_url,
  created_at,
  cook_id,
  reviews = [], // Default to empty array if undefined
  restaurant_reviews,
  distance_label,
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

  if (layout === 'feed') {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`View ${displayName}`}
        style={styles.feedCard}
        activeOpacity={0.86}
        onPress={() => router.push(`/restaurant/${profileId}`)}
      >
        <Image
          source={image_url ? { uri: image_url } : images.templateMeal}
          style={styles.feedImage}
        />
        <View style={styles.feedCopy}>
          <View style={styles.feedTitleRow}>
            <Text style={styles.feedTitle} numberOfLines={2}>
              {displayName}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={
                isFavourite(profileId)
                  ? `Remove ${displayName} from favourites`
                  : `Save ${displayName} to favourites`
              }
              onPress={event => {
                event?.stopPropagation?.();
                handleToggleFavourite();
              }}
              style={styles.feedFavourite}
            >
              <Ionicons
                name={isFavourite(profileId) ? 'heart' : 'heart-outline'}
                size={21}
                color={isFavourite(profileId) ? '#E55252' : '#64748B'}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.feedMetadata}>
            <Ionicons name="star" size={17} color="#F5BE18" />
            <Text style={styles.ratingTextStrong}>
              {ratingSummary.count ? displayRestaurantRating : 'New'}
            </Text>
            {ratingSummary.count > 0 ? (
              <Text style={styles.feedMetaText}>({ratingSummary.count})</Text>
            ) : null}
            <Text style={styles.metadataDivider}>·</Text>
            <Text style={styles.feedCuisine} numberOfLines={1}>
              {cuisine || 'Home-cooked meals'}
            </Text>
            {displayVerified ? (
              <View style={styles.verifiedLabel}>
                <VerifiedBadge size={13} />
              </View>
            ) : null}
          </View>
          <View style={styles.feedDetailRow}>
            <Ionicons
              name={scheduledLabel ? 'calendar-outline' : 'time-outline'}
              size={15}
              color={!scheduledLabel && availability?.state !== 'available' ? '#747B77' : '#EB6B2A'}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.feedAvailability,
                !scheduledLabel && availability?.state !== 'available' && styles.unavailable,
              ]}
            >
              {scheduledLabel || getAvailabilityLabel(availability)}
            </Text>
          </View>
          {distance_label ? (
            <View style={styles.feedDetailRow}>
              <Ionicons name="navigate-outline" size={15} color="#64706A" />
              <Text style={styles.distanceText}>{distance_label} away</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      testID="meal-restaurant-push"
      style={styles.card}
      activeOpacity={0.88}
      onPress={() => router.push(`/restaurant/${profileId}`)}
    >
      <ImageBackground
        testID="meal-image"
        source={image_url ? { uri: image_url } : images.templateMeal}
        style={styles.image}
        imageStyle={styles.imageStyle}
      >
        <TouchableOpacity
          testID="favourite-button"
          style={styles.heartIcon}
          accessibilityRole="button"
          accessibilityLabel={
            isFavourite(profileId) ? 'Remove from favourites' : 'Add to favourites'
          }
          onPress={event => {
            event?.stopPropagation?.();
            handleToggleFavourite();
          }}
        >
          <Ionicons
            name={isFavourite(profileId) ? 'heart' : 'heart-outline'}
            size={24}
            color={isFavourite(profileId) ? '#ff0000' : '#111111'}
          />
        </TouchableOpacity>
      </ImageBackground>

      <View style={styles.infoContainer}>
        <View style={styles.titleContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {displayName}
            </Text>
            <View style={styles.rating}>
              <Ionicons name="star" size={13} color="#E4A11B" />
              <Text style={styles.ratingText}>{displayRestaurantRating}</Text>
            </View>
          </View>

          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle} numberOfLines={1}>
              {cuisine || 'Home-cooked meals'}
            </Text>
            {displayVerified && <VerifiedBadge style={styles.verifiedIcon} size={16} />}
          </View>
        </View>
      </View>

      <View style={styles.availabilityRow}>
        <Text
          style={[
            styles.available,
            !scheduledLabel && availability?.state !== 'available' && styles.unavailable,
          ]}
        >
          {scheduledLabel || getAvailabilityLabel(availability)}
        </Text>
        {distance_label && (
          <View style={styles.distanceRow}>
            <Ionicons name="location-outline" size={13} color="#526B56" />
            <Text style={styles.distanceText}>{distance_label}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  feedCard: {
    flexDirection: 'row',
    width: '100%',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDE2DF',
    backgroundColor: '#FFFFFF',
  },
  feedImage: { width: 124, height: 124, borderRadius: 16, backgroundColor: '#EDF0EE' },
  feedCopy: { flex: 1, justifyContent: 'flex-start', paddingTop: 2, gap: 7 },
  feedTitleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  feedTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#171A18', lineHeight: 23 },
  feedFavourite: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -10,
    marginRight: -10,
  },
  feedCuisine: { flexShrink: 1, fontSize: 14, color: '#525A55' },
  feedMetadata: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ratingTextStrong: { fontSize: 14, color: '#303532', fontWeight: '700' },
  feedMetaText: { fontSize: 14, color: '#6D746F' },
  metadataDivider: { color: '#9BA19D', fontSize: 14 },
  verifiedLabel: { flexDirection: 'row', alignItems: 'center', marginLeft: 1 },
  feedDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedAvailability: { flex: 1, fontSize: 13, lineHeight: 18, color: '#EB6B2A', fontWeight: '600' },
  card: {
    width: 252,
    minHeight: 230,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8EDE9',
    elevation: 2,
    shadowColor: '#183C25',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  image: {
    width: '100%',
    height: 140,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    overflow: 'hidden',
    position: 'relative',
  },
  imageStyle: {
    resizeMode: 'cover',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  heartIcon: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 20,
    padding: 6,
    position: 'absolute',
    top: 9,
    right: 9,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 7,
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
    color: '#17251B',
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
    maxWidth: '76%',
  },
  subtitle: {
    color: '#6B756F',
    fontSize: 12,
    marginTop: 2,
  },
  availabilityRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  available: {
    color: '#267A42',
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  unavailable: {
    color: '#666666',
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  distanceText: {
    color: '#526B56',
    fontSize: 11,
    fontWeight: '600',
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
