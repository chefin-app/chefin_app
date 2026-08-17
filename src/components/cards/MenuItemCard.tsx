import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Listing } from '@/src/types/models';
import { formatRating, getRatingSummary, type RatedReview } from '@/src/utils/ratings';

export interface MenuItemCardProps extends Omit<Listing, 'reviews'> {
  reviews?: RatedReview[];
  isAvailable: boolean;
  availabilityLabel: string;
  cartQuantity?: number;
  onPress: () => void;
}

const MenuItemCard: React.FC<MenuItemCardProps> = ({
  title,
  description,
  image_url,
  price,
  reviews = [],
  isAvailable,
  availabilityLabel,
  cartQuantity = 0,
  onPress,
}) => {
  const displayName = title || 'Unknown dish';
  const ratingSummary = getRatingSummary(reviews);
  const displayRating = formatRating(ratingSummary.average);

  return (
    <TouchableOpacity
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}, RM ${price.toFixed(2)}. ${availabilityLabel}`}
      accessibilityHint={isAvailable ? 'Opens dish details and ordering options' : undefined}
      accessibilityState={{ disabled: !isAvailable }}
      disabled={!isAvailable}
      onPress={onPress}
      style={[styles.card, !isAvailable && styles.cardUnavailable]}
    >
      <View style={styles.imageContainer}>
        {image_url ? (
          <Image
            source={{ uri: image_url }}
            resizeMode="cover"
            style={[styles.image, !isAvailable && styles.imageUnavailable]}
          />
        ) : (
          <View
            style={[styles.image, styles.placeholderImage, !isAvailable && styles.imageUnavailable]}
          >
            <Text style={styles.placeholderText}>Chefin</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <Text style={[styles.title, !isAvailable && styles.textUnavailable]} numberOfLines={2}>
          {displayName}
        </Text>

        {description ? (
          <Text
            style={[styles.description, !isAvailable && styles.descriptionUnavailable]}
            numberOfLines={2}
          >
            {description}
          </Text>
        ) : null}

        <View style={styles.priceRatingRow}>
          <Text style={[styles.price, !isAvailable && styles.textUnavailable]}>
            RM {price.toFixed(2)}
          </Text>
          {ratingSummary.count > 0 ? (
            <View style={[styles.ratingBadge, !isAvailable && styles.ratingBadgeUnavailable]}>
              <Text style={[styles.ratingText, !isAvailable && styles.textUnavailable]}>
                ★ {displayRating}
              </Text>
            </View>
          ) : null}
        </View>

        <Text
          style={[styles.availabilityText, !isAvailable && styles.availabilityTextUnavailable]}
          numberOfLines={1}
        >
          {availabilityLabel}
        </Text>
      </View>

      <View style={styles.trailingControl} pointerEvents="none">
        {isAvailable ? (
          <View style={styles.addButton}>
            <Text style={styles.addButtonText}>{cartQuantity > 0 ? cartQuantity : '+'}</Text>
          </View>
        ) : (
          <View style={styles.unavailableBadge}>
            <Text style={styles.unavailableBadgeText}>Unavailable</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    minHeight: 126,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EBE9',
  },
  cardUnavailable: {
    backgroundColor: '#F7F8F7',
  },
  imageContainer: {
    width: 98,
    height: 98,
    marginRight: 14,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageUnavailable: {
    opacity: 0.38,
  },
  placeholderImage: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF2EE',
  },
  placeholderText: {
    color: '#9AA39C',
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingRight: 48,
  },
  title: {
    color: '#171A18',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  description: {
    marginTop: 4,
    color: '#6B746E',
    fontSize: 13,
    lineHeight: 18,
  },
  descriptionUnavailable: {
    color: '#A5ABA7',
  },
  textUnavailable: {
    color: '#959C97',
  },
  priceRatingRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  price: {
    color: '#171A18',
    fontSize: 15,
    fontWeight: '700',
  },
  ratingBadge: {
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#FFF6D9',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  ratingBadgeUnavailable: {
    backgroundColor: '#ECEEEC',
  },
  ratingText: {
    color: '#805E00',
    fontSize: 11,
    fontWeight: '700',
  },
  availabilityText: {
    marginTop: 6,
    color: '#18884B',
    fontSize: 12,
    fontWeight: '600',
  },
  availabilityTextUnavailable: {
    color: '#8F9691',
  },
  trailingControl: {
    position: 'absolute',
    right: 16,
    bottom: 17,
    alignItems: 'flex-end',
  },
  addButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#19B85A',
    shadowColor: '#0C6533',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: {
    marginTop: -2,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
  unavailableBadge: {
    borderRadius: 10,
    backgroundColor: '#E5E8E6',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  unavailableBadgeText: {
    color: '#707873',
    fontSize: 10,
    fontWeight: '700',
  },
});

export default MenuItemCard;
