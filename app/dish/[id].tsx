import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AvailabilityPicker, {
  AvailabilityPickerHandle,
} from '@/src/components/inputs/AvailabilityPicker';
import { useCart } from '@/src/context/CartContext';
import { useFavourites } from '@/src/context/FavouritesContext';
import StickyCartBar from '@/src/components/navigation/StickyCartBar';
import VerifiedBadge from '@/src/components/feedback/VerifiedBadge';
import { formatRating, getRatingSummary, hasValidReviewRating } from '@/src/utils/ratings';
import MenuOptionSelector from '@/src/components/restaurant/MenuOptionSelector';
import {
  areOptionSelectionsValid,
  getOptionSurcharge,
  getSelectedOptions,
  type MenuOptionSelectionState,
} from '@/src/utils/menuOptions';

const DishDetailsScreen = () => {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { addToCart } = useCart();
  const { toggleFavourite, isFavourite } = useFavourites();

  const [dish, setDish] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<MenuOptionSelectionState>({});

  const [quantity, setQuantity] = useState(1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{
    id: string;
    startTime: string;
    endTime: string;
    remainingSlots: number;
    isFull: boolean;
  } | null>(null);
  const isSlotSelected = !!selectedDate && !!selectedSlot && !selectedSlot.isFull;

  // Cap quantity at whatever capacity the cook set for the selected slot.
  const maxQuantity = selectedSlot?.remainingSlots ?? 99;

  // Clamp down if a fuller slot gets picked after quantity was already raised.
  useEffect(() => {
    setQuantity(q => Math.min(q, Math.max(1, maxQuantity)));
  }, [maxQuantity]);

  const pickerRef = useRef<AvailabilityPickerHandle>(null);
  const [refreshing, setRefreshing] = useState(false);

  const optionGroups = useMemo(() => dish?.option_groups ?? [], [dish?.option_groups]);
  const selectedOptions = useMemo(
    () => getSelectedOptions(optionGroups, selectedOptionIds),
    [optionGroups, selectedOptionIds]
  );
  const optionSelectionsValid = areOptionSelectionsValid(optionGroups, selectedOptionIds);
  const unitPrice = Number(dish?.price ?? 0) + getOptionSurcharge(selectedOptions);

  const fetchDish = useCallback(
    async (showLoading = true) => {
      if (!id) return;
      try {
        if (showLoading) setLoading(true);
        const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/listings/${id}`);
        if (!res.ok) throw new Error('Failed to fetch dish details');
        const data = await res.json();
        setDish(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching dish:', err);
        setError('Could not load dish details.');
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    fetchDish();
  }, [fetchDish]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchDish(false), pickerRef.current?.refresh()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchDish]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1A1A1A" />
      </View>
    );
  }

  if (error || !dish) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error || 'Dish not found'}</Text>
        <TouchableOpacity style={styles.backButtonCenter} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { profiles, reviews = [] } = dish;
  const validReviews = reviews.filter(hasValidReviewRating);
  const ratingSummary = getRatingSummary(validReviews);
  const averageRating = formatRating(ratingSummary.average);
  const restaurantRatingSummary = getRatingSummary(dish.restaurant_reviews);
  const favouriteRatingSummary =
    restaurantRatingSummary.count > 0 ? restaurantRatingSummary : ratingSummary;

  const handleAddToCart = () => {
    if (dish && selectedDate) {
      addToCart({
        listingId: dish.id,
        cookId: dish.cook_id,
        title: dish.title,
        price: unitPrice,
        basePrice: Number(dish.price),
        selectedOptions,
        imageUrl: dish.image_url,
        cookName: profiles?.full_name,
        quantity,
        selectedDate: new Date(selectedDate),
        serviceDate: selectedDate,
        pickupSlotStart: selectedSlot?.startTime,
        maxQuantity: selectedSlot?.remainingSlots,
      });
    }
  };

  // The heart favourites the cook (restaurant), same as MealCard and the
  // restaurant page — that's what powers "new dish from a favourite"
  // notifications.
  const handleToggleFavourite = () => {
    toggleFavourite({
      profileId: dish.cook_id,
      restaurantName: profiles?.restaurant_name || profiles?.full_name || 'Restaurant',
      imageUrl: dish.image_url,
      fullChefName: profiles?.full_name,
      rating: formatRating(favouriteRatingSummary.average),
      reviewCount: favouriteRatingSummary.count,
    });
  };

  const handleReportListing = () => {
    router.push({
      pathname: '/report-listing',
      params: {
        targetType: 'listing',
        targetId: dish.id,
        targetName: dish.title || 'Dish listing',
      },
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#2E7D32"
            colors={['#2E7D32']}
            progressBackgroundColor="#fff"
            title="Refreshing…"
            titleColor="#2E7D32"
          />
        }
      >
        {/* Banner Section */}
        <View style={styles.bannerContainer}>
          <Image source={{ uri: dish.image_url }} style={styles.bannerImage} />
          <View style={styles.bannerOverlay} />
        </View>

        {/* Floating Buttons */}
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.favouriteButton} onPress={handleToggleFavourite}>
          <Ionicons
            name={isFavourite(dish.cook_id) ? 'heart' : 'heart-outline'}
            size={24}
            color={isFavourite(dish.cook_id) ? '#FF5252' : '#333'}
          />
        </TouchableOpacity>

        <View style={styles.contentWrapper}>
          {/* Header Row */}
          <View style={styles.headerRow}>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>{dish.title}</Text>
              <Text style={styles.price}>RM {dish.price.toFixed(2)}</Text>
            </View>
          </View>

          {/* Quick Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="star" size={18} color="#FFB800" />
              <Text style={styles.statTextBold}>{averageRating}</Text>
              <Text style={styles.statText}>
                ({ratingSummary.count} {ratingSummary.count === 1 ? 'review' : 'reviews'})
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statItem}>
              <Ionicons name="restaurant-outline" size={18} color="#666" />
              <Text style={[styles.statText, { marginLeft: 6 }]}>{dish.cuisine || 'Local'}</Text>
            </View>
          </View>

          {/* Description / Story */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>The Story</Text>
            <Text style={styles.bodyText}>{dish.description || 'No description provided.'}</Text>
          </View>

          <MenuOptionSelector
            groups={optionGroups}
            selected={selectedOptionIds}
            onChange={setSelectedOptionIds}
          />

          {/* Availability Picker */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Select Date & Time</Text>
            <AvailabilityPicker
              ref={pickerRef}
              listingId={dish.id}
              onSelect={(date, slot) => {
                setSelectedDate(date);
                setSelectedSlot(slot);
              }}
            />
          </View>

          {/* Quantity Picker & Add to Cart */}
          <View style={styles.addToCartSection}>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                onPress={() => setQuantity(q => Math.max(1, q - 1))}
                style={styles.qtyBtn}
              >
                <Text style={styles.qtyButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.qtyValue}>{quantity}</Text>
              <TouchableOpacity
                onPress={() => setQuantity(q => Math.min(maxQuantity, q + 1))}
                style={[styles.qtyBtn, quantity >= maxQuantity && styles.qtyBtnDisabled]}
                disabled={quantity >= maxQuantity}
              >
                <Text style={styles.qtyButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            {isSlotSelected && (
              <Text style={styles.maxQtyNote}>
                {maxQuantity} order{maxQuantity === 1 ? '' : 's'} left for this slot
              </Text>
            )}

            <TouchableOpacity
              style={[
                styles.addToCartButton,
                (!isSlotSelected || !optionSelectionsValid) && styles.disabledButton,
              ]}
              disabled={!isSlotSelected || !optionSelectionsValid}
              onPress={handleAddToCart}
            >
              <Text style={styles.addToCartButtonText}>
                {!optionSelectionsValid
                  ? 'Complete required selections'
                  : isSlotSelected
                    ? `Add ${quantity} to Cart (RM ${(unitPrice * quantity).toFixed(2)})`
                    : 'Select Date & Time'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Ingredients / Tags */}
          {dish.dietary_tags && dish.dietary_tags.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Dietary Tags</Text>
              <View style={styles.tagsContainer}>
                {(Array.isArray(dish.dietary_tags)
                  ? dish.dietary_tags
                  : dish.dietary_tags.split(',')
                ).map((tag: string, index: number) => (
                  <View key={index} style={styles.tag}>
                    <Text style={styles.tagText}>{typeof tag === 'string' ? tag.trim() : tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Chef Card */}
          <TouchableOpacity
            style={styles.chefCard}
            onPress={() => router.push(`/restaurant/${profiles?.id}`)}
          >
            <Image source={{ uri: profiles?.profile_image }} style={styles.chefAvatar} />
            <View style={styles.chefCardContent}>
              <Text style={styles.chefCardTitle}>Prepared by</Text>
              <View style={styles.chefNameRow}>
                <Text style={styles.chefName}>{profiles?.full_name}</Text>
                {profiles?.is_verified && <VerifiedBadge size={18} style={styles.verifiedBadge} />}
              </View>
              <Text style={styles.chefRestaurant}>{profiles?.restaurant_name}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#CCC" />
          </TouchableOpacity>

          {/* Reviews Section */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Reviews</Text>
              <Text style={styles.seeAllText}>See all</Text>
            </View>

            {validReviews.length === 0 ? (
              <Text style={styles.emptyText}>No reviews yet.</Text>
            ) : (
              <View style={styles.reviewsList}>
                {validReviews.slice(0, 3).map((review: any) => (
                  <View key={review.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Image
                        source={{ uri: review.profiles?.profile_image }}
                        style={styles.reviewAvatar}
                      />
                      <View style={styles.reviewAuthorInfo}>
                        <Text style={styles.reviewAuthorName}>{review.profiles?.full_name}</Text>
                        <Text style={styles.reviewDate}>
                          {new Date(review.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </Text>
                      </View>
                      <View style={styles.reviewRatingBadge}>
                        <Text style={styles.reviewRatingText}>★ {review.rating}</Text>
                      </View>
                    </View>
                    {review.comment && <Text style={styles.reviewComment}>{review.comment}</Text>}
                  </View>
                ))}
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.reportButton}
            onPress={handleReportListing}
            accessibilityRole="button"
            accessibilityLabel={`Report ${dish.title || 'this dish listing'}`}
          >
            <Ionicons name="flag-outline" size={18} color="#B42318" />
            <Text style={styles.reportButtonText}>Report this dish</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <StickyCartBar />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F9FC',
  },
  scrollContent: {
    paddingBottom: 100, // Extra padding for sticky bar
  },
  bannerContainer: {
    width: '100%',
    height: 320,
    position: 'relative',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
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
  contentWrapper: {
    marginTop: -40,
    backgroundColor: '#F7F9FC',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 30,
    zIndex: 5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  titleContainer: {
    flex: 1,
    paddingRight: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 8,
    lineHeight: 34,
  },
  price: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
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
  sectionContainer: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  bodyText: {
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
  },
  addToCartSection: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 24,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: {
    opacity: 0.4,
  },
  qtyButtonText: {
    fontSize: 24,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  qtyValue: {
    fontSize: 20,
    fontWeight: '600',
    width: 60,
    textAlign: 'center',
  },
  maxQtyNote: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: -12,
    marginBottom: 16,
  },
  addToCartButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#E5E5E5',
  },
  addToCartButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tag: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tagText: {
    color: '#2E7D32',
    fontWeight: '600',
    fontSize: 14,
  },
  chefCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 20,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  chefAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  chefCardContent: {
    flex: 1,
    marginLeft: 16,
  },
  chefCardTitle: {
    fontSize: 12,
    color: '#888',
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  chefNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chefName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  verifiedBadge: {
    marginLeft: 4,
  },
  chefRestaurant: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  seeAllText: {
    color: '#0066CC',
    fontWeight: '600',
    fontSize: 15,
  },
  reviewsList: {
    flexDirection: 'column',
    gap: 16,
  },
  reviewCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reviewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  reviewAuthorInfo: {
    flex: 1,
    marginLeft: 12,
  },
  reviewAuthorName: {
    fontWeight: '700',
    color: '#1A1A1A',
    fontSize: 15,
  },
  reviewDate: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  reviewRatingBadge: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  reviewRatingText: {
    fontWeight: '700',
    color: '#1A1A1A',
    fontSize: 13,
  },
  reviewComment: {
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
  },
  emptyText: {
    color: '#888',
    fontStyle: 'italic',
  },
  reportButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#F1C7C4',
    borderRadius: 14,
    backgroundColor: '#FFF5F4',
    marginBottom: 30,
    paddingHorizontal: 16,
  },
  reportButtonText: {
    color: '#B42318',
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 18,
    color: '#ff4d4d',
    marginBottom: 20,
  },
  backButtonCenter: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
});

export default DishDetailsScreen;
