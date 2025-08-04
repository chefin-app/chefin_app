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
export type TextWeight =
  | 'thin'
  | 'light'
  | 'regular'
  | 'medium'
  | 'semibold'
  | 'bold'
  | 'extrabold'
  | 'black';
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
