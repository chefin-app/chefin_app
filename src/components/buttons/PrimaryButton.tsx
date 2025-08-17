import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';

// mocking up he props for our reusable button
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
        //  a loading indicator if the button is in a loading state
        <ActivityIndicator color="#ffffff" />
      ) : (
        // Otherwise, show the button's title
        <Text style={styles.buttonText}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 9999, // A large value to ensure a fully rounded shape
    backgroundColor: '#4CAF50', // A vibrant green color
    alignItems: 'center',
    justifyContent: 'center',
    // Optional shadow for a more modern, elevated look
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8, // Android shadow
  },
  disabledButton: {
    backgroundColor: '#a5d6a7', // Lighter green color when disabled
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff', // White text
  },
});

export default PrimaryButton;
