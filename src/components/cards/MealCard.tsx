import { View, Text, TouchableOpacity, StyleSheet, ImageBackground, Image } from 'react-native';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { images } from '@/src/constants/images';

interface Profile {
  user_id: string;
  full_name: string;
  profile_image?: string;
  is_verified: boolean;
  restaurant_name: string;
}

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

export interface MealCardProps extends Listing {
  cookName: string;
  restaurantName: string;
  isVerified: boolean;
  cookImage?: string;
  profiles: Profile;
}

const MealCard: React.FC<MealCardProps> = ({
  cookName,
  restaurantName,
  isVerified,
  cookImage,
  title,
  price,
  cuisine,
  description,
  image_url,
  created_at,
  id,
}) => {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(false);
  return (
    <TouchableOpacity
      testID="meal-restaurant-push"
      style={styles.card}
      onPress={() => router.push('/restaurant/[id]')}
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
          onPress={() => setIsFavorite(prev => !prev)}
        >
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={24}
            color={isFavorite ? '#ff0000' : '#111111'}
          />
        </TouchableOpacity>
      </ImageBackground>

      <View style={styles.infoContainer}>
        <Image
          testID="meal-avatar"
          source={cookImage ? { uri: cookImage } : images.templateAvatar}
          style={styles.avatar}
        />

        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.rating}>
              <Ionicons name="star" size={16} color="#FFD700" />
              <Text style={styles.ratingText}>{price ? `RM ${price}` : 'N/A'}</Text>
            </View>
          </View>

          <Text style={styles.subtitle}>{cuisine || description || 'No description'}</Text>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.available}>
          Available{' '}
          <Text style={{ fontWeight: 'bold' }}>
            {created_at ? new Date(created_at).toLocaleDateString() : 'Unknown'}
          </Text>
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
  available: {
    color: '#4CAF50',
    fontSize: 12,
    marginTop: 2,
    marginLeft: 14,
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
});
export default MealCard;
