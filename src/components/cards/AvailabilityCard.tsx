import { View, Text } from 'react-native';
import React from 'react';
import theme from '@/src/styles/theme';

const AvailabilityCard = () => {
  return (
    <View
      style={{
        padding: 16,
        backgroundColor: theme.colors.surface,
        borderRadius: 10,
        elevation: 4,
        marginBottom: 16,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: 'bold' }}>Available Dates</Text>
      <Text style={{ color: theme.colors.textSecondary, marginTop: 8 }}>18/07 - 25/07</Text>
      <Text style={{ color: theme.colors.textSecondary, marginTop: 4 }}>26/07 - 02/08</Text>
      <Text style={{ color: theme.colors.textSecondary, marginTop: 4 }}>03/08 - 10/08</Text>
    </View>
  );
};

export default AvailabilityCard;
