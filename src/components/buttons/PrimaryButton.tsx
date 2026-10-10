import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';

import theme from '@/src/styles/theme';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  title,
  onPress,
  isLoading = false,
  disabled = false,
  style,
}) => {
  return (
    <TouchableOpacity
      // The button is disabled if it's currently loading or if the disabled prop is true
      onPress={onPress}
      disabled={isLoading || disabled}
      style={[styles.button, style, (isLoading || disabled) && styles.disabledButton]}
    >
      {isLoading ? (
        <ActivityIndicator color={theme.colors.textOnAction} />
      ) : (
        <Text style={styles.buttonText}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: '100%',
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.radii.pill,
    // primaryAction, not primary: white on #4CAF50 is 2.78:1 and fails WCAG AA.
    backgroundColor: theme.colors.primaryAction,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  disabledButton: {
    backgroundColor: theme.colors.primaryDisabled,
  },
  buttonText: {
    fontFamily: theme.fonts.bold,
    fontSize: theme.fontSizes.subtitle,
    color: theme.colors.textOnAction,
  },
});

export default PrimaryButton;
