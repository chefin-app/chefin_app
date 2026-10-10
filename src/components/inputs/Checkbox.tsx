import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BaseText } from '@/src/components/typography';
import theme from '@/src/styles/theme';

type CheckboxProps = {
  label: string;
  isChecked: boolean;
  onPress: () => void;
  style?: ViewStyle;
};

export const Checkbox = ({ label, isChecked, onPress, style }: CheckboxProps) => {
  return (
    <TouchableOpacity style={[styles.container, style]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.outerBox, isChecked && styles.checkedBox]}>
        {isChecked && (
          <Ionicons name="checkmark-sharp" size={16} color={theme.colors.textOnAction} />
        )}
      </View>
      <BaseText style={styles.labelText}>{label}</BaseText>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  outerBox: {
    height: 24,
    width: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkedBox: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  labelText: {
    fontSize: 16,
    color: theme.colors.textStrong,
    fontWeight: '500',
  },
});
