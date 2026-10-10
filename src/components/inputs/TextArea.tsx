import React from 'react';
import { View, Text, TextInput, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { BaseText } from '@/src/components/typography';
import theme from '@/src/styles/theme';

type TextAreaProps = {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  style?: ViewStyle;
  inputStyle?: TextStyle;
};

export const TextArea = ({
  label,
  placeholder,
  value,
  onChangeText,
  style,
  inputStyle,
}: TextAreaProps) => {
  return (
    <View style={[styles.container, style]}>
      {label && <BaseText style={styles.label}>{label}</BaseText>}
      <TextInput
        style={[styles.input, inputStyle]}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={theme.colors.placeholder}
        multiline={true}
        submitBehavior="newline"
        textAlignVertical="top" // Ensures text starts at the top on Android
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: theme.colors.textStrong,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    minHeight: 120, // Set a minimum height for multi-line input
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12, // Add vertical padding for better spacing
    fontSize: 16,
    color: theme.colors.textStrong,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
});
