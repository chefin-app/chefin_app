import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AvailabilityPicker from '@/src/components/inputs/AvailabilityPicker';
import { useCart } from '@/src/context/CartContext';
import { useFavourites } from '@/src/context/FavouritesContext';
import StickyCartBar from '@/src/components/navigation/StickyCartBar';

const DishDetailsScreen = () => {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { addToCart } = useCart();
  const { toggleFavourite, isFavourite } = useFavourites();

  const [dish, setDish] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!id) return;

    const fetchDish = async () => {
      try {
        const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/listings/${id}`);
        if (!res.ok) throw new Error('Failed to fetch dish details');
        const data = await res.json();
        setDish(data);
      } catch (err) {
        console.error('Error fetching dish:', err);
        setError('Could not load dish details.');
      } finally {
        setLoading(false);
      }
    };

    fetchDish();
  }, [id]);

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
  const averageRating =
    reviews.length > 0
      ? (reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : 'New';

  const handleAddToCart = () => {
    if (dish && selectedDate) {
      addToCart({
        listingId: dish.id,
        cookId: dish.cook_id,
        title: dish.title,
        price: dish.price,
        imageUrl: dish.image_url,
        cookName: profiles?.full_name,
        quantity,
        selectedDate: new Date(selectedDate),
      });
    }
  };

  const handleToggleFavourite = () => {
    toggleFavourite({
      listingId: dish.id,
      title: dish.title,
      price: dish.price,
      imageUrl: dish.image_url,
      cookName: profiles?.full_name,
      rating: parseFloat(averageRating),
      reviewCount: reviews.length,
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
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
            name={isFavourite(dish.id) ? 'heart' : 'heart-outline'}
            size={24}
            color={isFavourite(dish.id) ? '#FF5252' : '#333'}
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
              <Text style={styles.statText}>({reviews.length} reviews)</Text>
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

          {/* Availability Picker */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Select Date & Time</Text>
            <AvailabilityPicker
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
              <TouchableOpacity onPress={() => setQuantity(q => q + 1)} style={styles.qtyBtn}>
                <Text style={styles.qtyButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.addToCartButton, !isSlotSelected && styles.disabledButton]}
              disabled={!isSlotSelected}
              onPress={handleAddToCart}
            >
              <Text style={styles.addToCartButtonText}>
                {isSlotSelected
                  ? `Add ${quantity} to Cart (RM ${(dish.price * quantity).toFixed(2)})`
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
                {profiles?.is_verified && (
                  <MaterialIcons
                    name="verified"
                    size={18}
                    color="#0084ff"
                    style={{ marginLeft: 4 }}
                  />
                )}
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

            {reviews.length === 0 ? (
              <Text style={styles.emptyText}>No reviews yet.</Text>
            ) : (
              <View style={styles.reviewsList}>
                {reviews.slice(0, 3).map((review: any) => (
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
