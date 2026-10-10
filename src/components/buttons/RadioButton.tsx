import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BaseText } from '@/src/components/typography';
import theme from '@/src/styles/theme';

type RadioButtonProps = {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  style?: ViewStyle;
};

export const RadioButton = ({ label, isSelected, onPress, style }: RadioButtonProps) => {
  return (
    <TouchableOpacity style={[styles.container, style]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.outerCircle, isSelected && styles.selectedOuterCircle]}>
        {isSelected && <View style={styles.innerCircle} />}
      </View>
      <BaseText style={styles.labelText}>{label}</BaseText>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
  },
  outerCircle: {
    height: 24,
    width: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  selectedOuterCircle: {
    borderColor: theme.colors.primary,
  },
  innerCircle: {
    height: 12,
    width: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
  },
  labelText: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.fontSizes.base,
    color: theme.colors.textStrong,
  },
});
