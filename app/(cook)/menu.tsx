import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const Menu = ({ navigation }) => {
  const [menuItems, setMenuItems] = useState([
    {
      id: '1',
      name: 'The American Burger',
      price: 6.0,
      originalPrice: 12.0,
      availableDate: '18/07',
      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400',
    },
    {
      id: '2',
      name: 'The American Cookies',
      price: 2.0,
      originalPrice: 5.0,
      availableDate: '18/07',
      image: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400',
    },
    {
      id: '3',
      name: 'The American Burger',
      price: 6.0,
      originalPrice: 12.0,
      availableDate: '18/07',
      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400',
    },
    {
      id: '4',
      name: 'The American Cookies',
      price: 2.0,
      originalPrice: 5.0,
      availableDate: '18/07',
      image: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400',
    },
  ]);

  const renderMenuItem = ({ item }) => (
    <View style={styles.menuItem}>
      <View style={styles.menuInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={styles.priceContainer}>
          <Text style={styles.currentPrice}>RM {item.price.toFixed(2)}</Text>
          <Text style={styles.originalPrice}>RM {item.originalPrice.toFixed(2)}</Text>
        </View>
        <Text style={styles.availableText}>Available {item.availableDate}</Text>
      </View>
      <Image source={item.image} style={styles.itemImage} />
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Menu List */}
      <FlatList
        data={menuItems}
        renderItem={renderMenuItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#F5F5F5',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listContainer: {
    paddingHorizontal: 16,
  },
  menuItem: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingVertical: 16,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  currentPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginRight: 12,
  },
  originalPrice: {
    fontSize: 14,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  availableText: {
    fontSize: 12,
    color: '#666',
  },
  itemImage: {
    width: 120,
    height: 80,
    borderRadius: 8,
    marginLeft: 16,
  },
  separator: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 8,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingBottom: 20,
    paddingTop: 10,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  navItemActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#4CAF50',
  },
  navLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  navLabelActive: {
    color: '#4CAF50',
  },
});

export default Menu;
