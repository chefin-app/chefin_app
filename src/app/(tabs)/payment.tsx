import React, { useLayoutEffect } from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from 'expo-router';
import ShoppingCart from '../../components/ShoppingCart';

const ShoppingScreen = () => {
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <ShoppingCart />,
    });
  }, [navigation]);

  return (
    <View>
      <Text>Payment Screen Content</Text>
    </View>
  );
};

export default ShoppingScreen;