import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Animated,
  Image,
} from 'react-native';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import AvailabilityPicker from '@/src/components/inputs/AvailabilityPicker';
import { useCart } from '@/src/context/CartContext';
import type { Listing, Profile, Review } from '@/src/types/models';

/** Returns 'today', 'tomorrow', or a short formatted date */
function getAvailabilityLabel(dateStr?: string): string {
  if (!dateStr) return 'Unknown';
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(dateStr + 'T00:00:00');
  const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diff = Math.round((targetMidnight.getTime() - todayMidnight.getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export interface MenuItemCardProps extends Listing {
  title: string;
  profiles?: Profile;
  reviews?: Review[];
  rating?: number;
  isActive: boolean;
  onSelect: () => void;
}

const MenuItemCard: React.FC<MenuItemCardProps> = ({
  id, // <-- ensure we have the listing id
  title,
  cuisine,
  description,
  image_url,
  created_at,
  cook_id,
  price,
  reviews = [], // Default to empty array if undefined
  profiles, // Add profiles to destructured props
  location,
  isActive,
  onSelect,
}) => {
  const router = useRouter(); // <-- ADD ROUTER HOOK HERE
  const { addToCart } = useCart();
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [selectedDish, setSelectedDish] = useState<Listing | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
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
  const [nextAvailableDate, setNextAvailableDate] = useState<string | undefined>(undefined);

  // Fetch earliest available date for this listing on mount
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/availability/${id}`)
      .then(r => r.json())
      .then(d => {
        const avail: any[] = d.availability ?? [];
        const earliest = avail
          .filter(
            r =>
              r.is_available &&
              r.max_orders - (r.orders_taken ?? 0) > 0 &&
              r.available_date >= today
          )
          .map(r => (r.available_date as string).split('T')[0])
          .sort()[0];
        setNextAvailableDate(earliest);
      })
      .catch(() => {
        /* silent */
      });
  }, [id]);

  const handlePressDish = (dish: Listing) => {
    onSelect();
    setSelectedDish(dish);
    setModalVisible(true);
    setSelectedDate(null);
    setSelectedSlot(null);
  };

  // Handle both flattened props and nested profiles object
  const displayName = title || 'Unknown Dish';
  const displayDishImage = image_url;
  const displayDishRating =
    reviews && reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / reviews.length).toFixed(1)
      : '-';

  useEffect(() => {
    if (!isActive) setModalVisible(false);
  }, [isActive]);

  return (
    <>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() =>
          handlePressDish({
            id: id,
            title,
            cuisine,
            description,
            image_url,
            created_at,
            cook_id,
            price,
            location,
          })
        }
      >
        <View style={styles.cardContent}>
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={2}>
              {displayName}
            </Text>
            {description ? (
              <Text style={styles.description} numberOfLines={2}>
                {description}
              </Text>
            ) : null}
            <View style={styles.footerRow}>
              <Text style={styles.price}>RM {price.toFixed(2)}</Text>
              {displayDishRating !== '-' && (
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingText}>★ {displayDishRating}</Text>
                </View>
              )}
            </View>
            <Text style={styles.availabilityText}>
              Earliest availability:{' '}
              <Text style={styles.availabilityText}>{getAvailabilityLabel(nextAvailableDate)}</Text>
            </Text>
          </View>
          <View style={styles.imageContainer}>
            {displayDishImage ? (
              <Image source={{ uri: displayDishImage }} style={styles.image} />
            ) : (
              <View style={[styles.image, styles.placeholderImage]} />
            )}
            <View style={styles.addButtonIcon}>
              <Text style={styles.addButtonIconText}>+</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
      {modalVisible && selectedDish ? (
        <Animated.View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedDish?.title}</Text>

            {/* Availability Calendar + Time Slots */}
            <View style={{ marginVertical: 10, width: '100%' }}>
              <Text style={{ fontWeight: '700', marginBottom: 10, fontSize: 15, color: '#1A1A1A' }}>
                Choose a date & time:
              </Text>
              {selectedDish?.id && (
                <AvailabilityPicker
                  listingId={selectedDish.id}
                  onSelect={(date, slot) => {
                    setSelectedDate(date);
                    setSelectedSlot(slot);
                  }}
                />
              )}
            </View>

            {/* Quantity Picker */}
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

            {/* Add to Cart Button */}
            <TouchableOpacity
              style={[styles.addButton, !isSlotSelected && { backgroundColor: '#E5E5E5' }]}
              disabled={!isSlotSelected}
              onPress={() => {
                if (selectedDish?.id && selectedDate) {
                  addToCart({
                    listingId: selectedDish.id,
                    title: selectedDish.title,
                    price: selectedDish.price,
                    imageUrl: selectedDish.image_url,
                    cookName: profiles?.full_name,
                    quantity,
                    selectedDate: new Date(selectedDate),
                  });
                  setAddedFeedback(true);
                  setTimeout(() => {
                    setAddedFeedback(false);
                    setModalVisible(false);
                  }, 800);
                }
              }}
            >
              <Text style={[styles.addButtonText, !isSlotSelected && { color: '#A0A0A0' }]}>
                {isSlotSelected
                  ? `Add ${quantity} to Cart (RM ${((selectedDish?.price ?? 0) * quantity).toFixed(2)})`
                  : 'Select a date & time'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.viewMoreBtn}
              onPress={() => {
                setModalVisible(false);
                router.push(`/dish/${selectedDish?.id}`);
              }}
            >
              <Text style={styles.viewMoreText}>View full dish details</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
              <Text style={styles.closeText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      ) : null}
    </>
  );
};

// ...styles unchanged (copy your existing styles)...
const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    marginBottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  textContainer: {
    flex: 1,
    paddingRight: 16,
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 6,
    lineHeight: 22,
  },
  description: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
    marginBottom: 10,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 'auto',
  },
  price: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  ratingBadge: {
    backgroundColor: '#F7F7F7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 10,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
  },
  imageContainer: {
    position: 'relative',
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  placeholderImage: {
    backgroundColor: '#F0F0F0',
  },
  addButtonIcon: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    backgroundColor: '#fff',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  addButtonIconText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: -2,
  },
  modalContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    zIndex: 1000,
  },
  modalContent: { alignItems: 'flex-start' },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A1A', marginBottom: 6 },
  availabilityText: { marginVertical: 12, color: '#4CAF50', fontWeight: '600' },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    alignSelf: 'center',
  },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: { fontSize: 24, fontWeight: '500', color: '#1A1A1A', marginTop: -2 },
  qtyValue: { fontSize: 20, fontWeight: '600', width: 40, textAlign: 'center' },
  addButton: {
    backgroundColor: '#4CAF50',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  closeBtn: {
    width: '100%',
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  closeText: { color: '#666', fontSize: 16, fontWeight: '600' },
  viewMoreBtn: {
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#FAFAFA',
  },
  viewMoreText: {
    color: '#1A1A1A',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default MenuItemCard;
