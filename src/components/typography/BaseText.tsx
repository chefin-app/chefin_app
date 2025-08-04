import React from 'react';
import { Text } from 'react-native';
import { BaseTextProps } from './types';
import { typography } from './styles';

export default function BaseText({
  children,
  color = 'primary',
  weight = 'regular',
  align = 'left',
  numberOfLines,
  style,
  onPress,
}: BaseTextProps) {
  const textStyle = [
    typography.fontFamily,
    typography[`color_${color}`],
    typography[`weight_${weight}`],
    typography[`align_${align}`],
    style,
  ];

  return (
    <Text style={textStyle} numberOfLines={numberOfLines} onPress={onPress} ellipsizeMode="tail">
      {children}
    </Text>
  );
}
