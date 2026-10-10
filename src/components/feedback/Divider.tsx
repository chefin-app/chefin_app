import React from 'react';
import { View, StyleSheet } from 'react-native';
import theme from '@/src/styles/theme';

interface DividerProps {
  thickness?: number;
  color?: string;
  marginVertical?: number;
}

const Divider: React.FC<DividerProps> = ({
  thickness = StyleSheet.hairlineWidth,
  color = theme.colors.border,
  marginVertical = 12,
}) => {
  return (
    <View
      style={{
        height: thickness,
        backgroundColor: color,
        marginVertical,
      }}
    />
  );
};

export default Divider;
