import React from 'react';
import { StyleSheet } from 'react-native';
import BaseText from './BaseText';
import { BaseTextProps } from './types';

interface BodyTextProps extends BaseTextProps {
  size?: 'small' | 'medium' | 'large';
}

export default function BodyText({
  size = 'medium',
  weight = 'regular',
  color = 'primary',
  ...props
}: BodyTextProps) {
  return <BaseText style={[styles[size], props.style]} weight={weight} color={color} {...props} />;
}

const styles = StyleSheet.create({
  small: { fontSize: 14, lineHeight: 20 },
  medium: { fontSize: 16, lineHeight: 24 },
  large: { fontSize: 18, lineHeight: 28 },
});
