import { View, Text, StyleSheet, TouchableOpacity, ImageBackground } from 'react-native';
import React from 'react';

const MenuItemCard = () => {
  return (
    <TouchableOpacity style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ImageBackground
          source={require('../../assets/images/templateMeal.jpg')}
          style={{ width: 50, height: 50, borderRadius: 8, marginRight: 10 }}
          imageStyle={{ borderRadius: 8 }}
        />
        <View style={{ marginLeft: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold' }}>Menu Item Name</Text>
          <Text style={{ color: '#666' }}>Description of the menu item.</Text>
          <Text style={{ fontSize: 14, color: '#000', marginTop: 5 }}>RM10000</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '90%',
    height: 100,
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    padding: 16,
    marginBottom: 16,
  },
  image: {
    width: '100%',
    height: 120,
    borderRadius: 10,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    position: 'relative',
  },
  imageStyle: {
    resizeMode: 'cover',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
});

export default MenuItemCard;
