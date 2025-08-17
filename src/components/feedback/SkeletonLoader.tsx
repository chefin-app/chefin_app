import React from 'react';
import { View, StyleSheet, DimensionValue } from 'react-native';

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
    backgroundColor: '#E0E0E0',
    overflow: 'hidden',
  },
});

export default SkeletonLoader;
