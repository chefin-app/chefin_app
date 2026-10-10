import { TextStyle, StyleProp } from 'react-native';
import React from 'react';

export type TextColor =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'white'
  | 'success'
  | 'error'
  | 'accent';
/**
 * Only weights with a font registered in app/_layout.tsx are allowed. Adding
 * one here means registering its .ttf there and adding a `weight_*` entry to
 * ./styles.ts — otherwise it silently renders as the system font.
 */
export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';
export type TextAlign = 'left' | 'center' | 'right';

export interface BaseTextProps {
  children: React.ReactNode;
  color?: TextColor;
  weight?: TextWeight;
  align?: TextAlign;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  onPress?: () => void;
}
