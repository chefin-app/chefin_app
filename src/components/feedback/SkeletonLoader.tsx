import React from 'react';
import { View, StyleSheet, DimensionValue } from 'react-native';
import theme from '@/src/styles/theme';

interface SkeletonProps {
  width?: DimensionValue; // ✅ fixes type error
  height?: DimensionValue;
  borderRadius?: number;
}

const SkeletonLoader: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 100,
  borderRadius = 8,
}) => {
  return <View style={[styles.skeleton, { width, height, borderRadius }]} />;
};

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },
});

export default SkeletonLoader;
