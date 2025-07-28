import { View, Text } from 'react-native';
import React, { useLayoutEffect } from 'react';
import { useNavigation } from 'expo-router';
import ShoppingCart from '../../components/ShoppingCart';

const Page = () => {
    const navigation = useNavigation();

    useLayoutEffect(() => {
      navigation.setOptions({
        headerRight: () => <ShoppingCart />,
      });
    }, [navigation]);
  
  return (
    <View>
      <Text>Page</Text>
    </View>
  );
};

export default Page;
