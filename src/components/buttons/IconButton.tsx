import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type IconProps } from '@expo/vector-icons/build/createIconSet';

type IconButtonProps = {
  iconName: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
  onPress: () => void;
  style?: ViewStyle;
};

export const IconButton = ({
  iconName,
  size = 24, // Default size
  color = '#333', // Default color
  onPress,
  style,
}: IconButtonProps) => {
  return (
    <TouchableOpacity style={[styles.button, style]} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={iconName} size={size} color={color} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: 8, // A bit of padding for easier tapping
    justifyContent: 'center',
    alignItems: 'center',
  },
});
