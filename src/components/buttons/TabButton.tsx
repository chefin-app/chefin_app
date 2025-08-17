import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';

type TabButtonProps = {
  title: string;
  onPress: () => void;
  isSelected: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export const TabButton = ({ title, onPress, isSelected, style, textStyle }: TabButtonProps) => {
  return (
    <TouchableOpacity
      style={[styles.button, style, isSelected && styles.selectedButton]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.buttonText, textStyle, isSelected && styles.selectedButtonText]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20, // Rounded pill shape
    backgroundColor: '#fff', // Default background color
    borderColor: '#e0e0e0',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedButton: {
    backgroundColor: '#4CAF50', // Selected button background
    borderColor: '#4CAF50',
  },
  buttonText: {
    fontSize: 14,
    color: '#666', // Default text color
    fontWeight: '500',
  },
  selectedButtonText: {
    color: '#fff', // Selected text color
  },
});
