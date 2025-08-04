import React from 'react';
import { StyleSheet } from 'react-native';
import BaseText from './BaseText';
import { BaseTextProps } from './types';

export default function CaptionText({
  weight = 'medium',
  color = 'secondary',
  ...props
}: BaseTextProps) {
  return (
    <BaseText style={[styles.caption, props.style]} weight={weight} color={color} {...props} />
  );
}

const styles = StyleSheet.create({
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
});
