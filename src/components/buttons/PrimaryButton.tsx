// src/components/common/PrimaryButton.tsx

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// we are setting our constansts for the colours
const PRIMARY_COLOR = '#4ADE80';
const DISABLED_COLOR = '#A5D6A7'; // A lighter shade for disabled state
const TEXT_COLOR = '#FFFFFF';

// our props definition
interface PrimaryButtonProps {
  onPress: () => void;
  title?: string; // Use title if just text, or children for more complex content
  children?: React.ReactNode; // Allows for icons, etc., inside
  disabled?: boolean;
  isLoading?: boolean;
  style?: ViewStyle; // For overriding container style
  textStyle?: TextStyle; // For overriding text style
  icon?: keyof typeof Ionicons.glyphMap; // Optional icon name
  iconPosition?: 'left' | 'right'; // Position of the icon relative to text
}

// our custom component, this is what we import if we need it
const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  onPress,
  title,
  children,
  disabled = false,
  isLoading = false,
  style,
  textStyle,
  icon,
  iconPosition = 'left',
}) => {
  // A helper function to render the text content, wrapping it if it's a string
  const renderContent = () => {
    if (children) {
      // If children are provided and they are a string, wrap them in <Text>
      if (typeof children === 'string') {
        return <Text style={[styles.buttonText, textStyle]}>{children}</Text>;
      }
      // Otherwise, render the children directly (assuming they are components)
      return children;
    }
    // Fallback to title if no children are provided
    if (title) {
      return <Text style={[styles.buttonText, textStyle]}>{title}</Text>;
    }
    return null;
  };

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: disabled ? DISABLED_COLOR : PRIMARY_COLOR }, style]}
      onPress={onPress}
      disabled={disabled || isLoading}
      activeOpacity={0.7} // giving the visual effect
    >
      {/* loading state */}
      {isLoading ? (
        <ActivityIndicator color={TEXT_COLOR} size="small" />
      ) : (
        <View style={styles.contentContainer}>
          {icon && iconPosition === 'left' && (
            <Ionicons name={icon} size={20} color={TEXT_COLOR} style={styles.icon} />
          )}
          {/* We now use the robust renderContent function */}
          {renderContent()}
          {icon && iconPosition === 'right' && (
            <Ionicons name={icon} size={20} color={TEXT_COLOR} style={styles.icon} />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50, // Ensure a minimum height for touchability
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: TEXT_COLOR,
    fontSize: 16,
    fontWeight: '600',
  },
  icon: {
    marginHorizontal: 5,
  },
});

export default PrimaryButton;
