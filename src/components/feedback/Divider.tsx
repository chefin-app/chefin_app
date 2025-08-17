import React from 'react';
import { View, StyleSheet } from 'react-native';

interface DividerProps {
  thickness?: number;
  color?: string;
  marginVertical?: number;
}

const Divider: React.FC<DividerProps> = ({
  thickness = StyleSheet.hairlineWidth,
  color = '#E0E0E0',
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
