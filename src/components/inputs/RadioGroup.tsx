import React from 'react';
import { View, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { BaseText } from '@/src/components/typography';
import { RadioButton } from '../buttons/RadioButton';

type RadioOption = {
  label: string;
  value: string;
};

type RadioGroupProps = {
  label?: string;
  options: RadioOption[];
  selectedValue: string;
  onValueChange: (value: string) => void;
  style?: ViewStyle;
  labelStyle?: TextStyle;
  optionStyle?: ViewStyle;
};

export const RadioGroup = ({
  label,
  options,
  selectedValue,
  onValueChange,
  style,
  labelStyle,
  optionStyle,
}: RadioGroupProps) => {
  return (
    <View style={[styles.container, style]}>
      {label && <BaseText style={[styles.label, labelStyle]}>{label}</BaseText>}
      <View style={styles.optionsContainer}>
        {options.map(option => (
          <RadioButton
            key={option.value}
            label={option.label}
            isSelected={selectedValue === option.value}
            onPress={() => onValueChange(option.value)}
            style={optionStyle}
          />
        ))}
      </View>
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
    color: '#333',
    marginBottom: 8,
    fontWeight: '500',
  },
  optionsContainer: {
    // This can be a flex container to lay out the radio buttons
  },
});
