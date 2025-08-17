import React from 'react';
import { StyleSheet } from 'react-native';
import BaseText from './BaseText';
import { BaseTextProps } from './types';

interface HeadingTextProps extends BaseTextProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

export default function HeadingText({
  level = 1,
  weight = 'bold',
  color = 'primary',
  ...props
}: HeadingTextProps) {
  return (
    <BaseText style={[styles[`h${level}`], props.style]} weight={weight} color={color} {...props} />
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 32, lineHeight: 40 },
  h2: { fontSize: 28, lineHeight: 36 },
  h3: { fontSize: 24, lineHeight: 32 },
  h4: { fontSize: 20, lineHeight: 28 },
  h5: { fontSize: 18, lineHeight: 24 },
  h6: { fontSize: 16, lineHeight: 20 },
});
