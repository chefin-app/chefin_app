import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native'
import React, { useState } from 'react'
import { Ionicons } from '@expo/vector-icons';
import { images } from '@/src/constants/images';

const ReviewCard = () => {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = () => setExpanded(!expanded);
  const reviewText = "This meal was delicious but a bird ate a bit on the way! Not impressed. Super Scary Skibidies and I don't like it. I would not recommend this to anyone. I expected better service and quality from this restaurant. The portion sizes were also smaller than expected, leaving me still hungry after the meal. Overall, a disappointing experience that I won't be repeating. ";


  return (
    <View style={styles.card}>
      <View style={styles.infoContainer}>
        <Image source={images.templateAvatar} style={styles.avatar} />
        <Text style={styles.title}>Nathan Lim</Text>
      </View>
      <View style={styles.ratingContainer}>
        <View style={styles.ratingRow}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Ionicons
              key={i}
              name={i < 4 ? 'star' : 'star-outline'}
              size={16}
              color="#FFD700"
            />
          ))}
        </View>
        <Text style={styles.subtitle}>2 days ago</Text>
      </View>
      <Text style={styles.reviewText} numberOfLines={expanded ? undefined: 3}>{reviewText}</Text>

      {/* show more button, only shows when text is too long*/}
      {reviewText.length > 80 && (
        <TouchableOpacity onPress={toggleExpanded}>
          <Text style={styles.seeMore}>
            {expanded ? 'See Less' : 'See More'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 300,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    marginVertical: 5,
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
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 2,
    marginLeft: 8,
    gap: 4,
  },
  avatar: {
    width: 30,
    height: 30,
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
  reviewText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#444',
    marginTop: 10,
    marginRight: 8,
  },
  seeMore: {
    marginLeft: 8,
    marginTop: 4,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#007AFF', // iOS blue link style
    marginBottom: 8,
  },
});

export default ReviewCard