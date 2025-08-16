import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  PanResponder,
  TouchableOpacity,
  Animated,
  Dimensions,
  StyleSheet,
} from 'react-native';

const RatingStars = ({
  maxStars = 5,
  initialRating = 0,
  onRatingChange = () => {},
  starSize = 40,
  activeColor = '#FFD700',
  inactiveColor = '#E0E0E0',
  spacing = 5,
  disabled = false,
}) => {
  const [rating, setRating] = useState(initialRating);
  const [tempRating, setTempRating] = useState(initialRating);
  const [isDragging, setIsDragging] = useState(false);
  const animatedValues = useRef(
    Array.from({ length: maxStars }, () => new Animated.Value(1))
  ).current;

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled && isDragging,

    onPanResponderGrant: evt => {
      if (disabled) return;
      setIsDragging(true);
      const newRating = calculateRating(evt.nativeEvent.locationX);
      setTempRating(newRating);
      animateStars(newRating);
    },

    onPanResponderMove: evt => {
      if (disabled) return;
      const newRating = calculateRating(evt.nativeEvent.locationX);
      setTempRating(newRating);
      animateStars(newRating);
    },

    onPanResponderRelease: () => {
      if (disabled) return;
      setIsDragging(false);
      setRating(tempRating);
      //   onRatingChange(tempRating);
    },

    onPanResponderTerminate: () => {
      setIsDragging(false);
      setTempRating(rating);
      animateStars(rating);
    },
  });

  const calculateRating = (touchX: number): number => {
    const starWidth = starSize + spacing;
    const newRating = Math.max(0, Math.min(maxStars, Math.ceil(touchX / starWidth)));
    return newRating;
  };

  const animateStars = (targetRating: number): void => {
    animatedValues.forEach((animatedValue, index) => {
      const shouldScale = index < targetRating;
      Animated.spring(animatedValue, {
        toValue: shouldScale ? 1.2 : 1,
        tension: 300,
        friction: 10,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleStarPress = (starIndex: number): void => {
    if (disabled || isDragging) return;

    const newRating = starIndex + 1;
    setRating(newRating);
    setTempRating(newRating);
    // onRatingChange(newRating);
    animateStars(newRating);

    // Reset animation after a short delay
    setTimeout(() => {
      animateStars(newRating);
    }, 150);
  };

  const renderStar = (index: number) => {
    const currentRating = isDragging ? tempRating : rating;
    const isFilled = index < currentRating;

    return (
      <TouchableOpacity
        key={index}
        onPress={() => handleStarPress(index)}
        disabled={disabled}
        activeOpacity={0.7}
        style={[
          styles.starContainer,
          {
            marginRight: index < maxStars - 1 ? spacing : 0,
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.star,
            {
              fontSize: starSize,
              color: isFilled ? activeColor : inactiveColor,
              transform: [{ scale: animatedValues[index] }],
            },
          ]}
        >
          ★
        </Animated.Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.starsContainer} {...panResponder.panHandlers}>
        {Array.from({ length: maxStars }, (_, index) => renderStar(index))}
      </View>
      {/* 
      <Text style={styles.ratingText}>
        Rating: {isDragging ? tempRating : rating} / {maxStars}
      </Text> */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  starsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  starContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: {
    textAlign: 'center',
  },
  ratingText: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  demoContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 40,
    color: '#333',
  },
  ratingSection: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 25,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: '#666',
    marginBottom: 15,
  },
  resultText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 10,
  },
  instructionsContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  instructionText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginVertical: 3,
  },
});

export default RatingStars;
