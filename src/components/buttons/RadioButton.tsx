import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BaseText } from '@/src/components/typography';

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
    paddingVertical: 12,
  },
  outerCircle: {
    height: 24,
    width: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  selectedOuterCircle: {
    borderColor: '#4CAF50',
  },
  innerCircle: {
    height: 12,
    width: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
  },
  labelText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
});
