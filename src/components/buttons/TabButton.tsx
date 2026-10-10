import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import theme from '@/src/styles/theme';

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
    backgroundColor: theme.colors.surface, // Default background color
    borderColor: theme.colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedButton: {
    backgroundColor: theme.colors.primaryAction, // Selected button background
    borderColor: theme.colors.primary,
  },
  buttonText: {
    fontSize: 14,
    color: theme.colors.textSecondary, // Default text color
    fontWeight: '500',
  },
  selectedButtonText: {
    color: theme.colors.textOnAction, // Selected text color
  },
});
