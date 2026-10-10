import React from 'react';
import { View, Text, TextInput, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { BaseText } from '@/src/components/typography';
import theme from '@/src/styles/theme';

type TextInputFieldProps = {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  secureTextEntry?: boolean;
  style?: ViewStyle;
  inputStyle?: TextStyle;
};

export const TextInputField = ({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType = 'default',
  secureTextEntry = false,
  style,
  inputStyle,
}: TextInputFieldProps) => {
  return (
    <View style={[styles.container, style]}>
      {label && <BaseText style={styles.label}>{label}</BaseText>}
      <TextInput
        style={[styles.input, inputStyle]}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        placeholderTextColor={theme.colors.placeholder}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.fontSizes.body,
    color: theme.colors.textStrong,
    marginBottom: theme.spacing.sm,
  },
  input: {
    height: 50,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.lg,
    fontFamily: theme.fonts.regular,
    fontSize: theme.fontSizes.base,
    color: theme.colors.textStrong,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
});
