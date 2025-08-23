import { View, Text } from 'react-native';
import React from 'react';

const AvailabilityCard = () => {
  return (
    <View
      style={{
        padding: 16,
        backgroundColor: '#fff',
        borderRadius: 10,
        elevation: 4,
        marginBottom: 16,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: 'bold' }}>Available Dates</Text>
      <Text style={{ color: '#666', marginTop: 8 }}>18/07 - 25/07</Text>
      <Text style={{ color: '#666', marginTop: 4 }}>26/07 - 02/08</Text>
      <Text style={{ color: '#666', marginTop: 4 }}>03/08 - 10/08</Text>
    </View>
  );
};

export default AvailabilityCard;
