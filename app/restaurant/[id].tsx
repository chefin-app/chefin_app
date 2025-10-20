import { View, Text, ScrollView, Image, StyleSheet, TouchableOpacity } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import MenuItemCard from '@/src/components/cards/MenuItemCard';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import LoadingSpinner from '@/src/components/feedback/LoadingSpinner';

const dishes = [
  { id: '1', name: 'Spaghetti Carbonara', price: '$12.99' },
  { id: '2', name: 'Grilled Chicken Salad', price: '$10.99' },
  { id: '3', name: 'Margherita Pizza', price: '$14.99' },
  { id: '4', name: 'Beef Burger', price: '$11.99' },
  { id: '5', name: 'Fish Tacos', price: '$13.99' },
];

const popularDishes = [
  { id: '1', name: 'Spaghetti Carbonara', price: '$12.99' },
  { id: '3', name: 'Margherita Pizza', price: '$14.99' },
  { id: '5', name: 'Fish Tacos', price: '$13.99' },
];

const MenuScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      try {
        const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/id/${id}`);
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error('Error fetching restaurant data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  const { profile, listings = [] } = data;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header Section */}
        <View style={styles.headerContainer}>
          <Image source={{ uri: listings[0].image_url }} style={styles.bannerImage} />
          <Image source={profile.profile_image} style={styles.avatar} />
          <View style={styles.restaurantInfo}>
            <Text style={styles.restaurantName}>{profile.restaurant_name}</Text>
            <Text style={styles.chefName}>By {profile.full_name}</Text>
          </View>
        </View>

        {/* Pickup Info Card */}
        <View style={styles.pickupInfoCard}>
          <Text style={styles.pickupTitle}>Pickup Information</Text>
          <Text style={styles.pickupText}>Pickup Time: 12:00 PM - 8:00 PM</Text>
          <Text style={styles.pickupText}>Pickup Location: 123 Main St, Cityville</Text>
        </View>

        {/* Info Cards Section */}
        <View style={styles.infoCardsContainer}>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Rating</Text>
            <Text style={styles.infoCardText}>4.5 ⭐️ (223 reviews)</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Meals Prepared</Text>
            <Text style={styles.infoCardText}>100+</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Certified</Text>
            <Text style={styles.infoCardText}>Food Safe ✅</Text>
          </View>
        </View>

        {/* Popular Dishes Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Popular Dishes</Text>
          <View style={styles.dishesList}>
            {popularDishes.map(dish => (
              <MenuItemCard key={dish.id} />
            ))}
          </View>
        </View>

        {/* Menu Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Menu</Text>
          <View style={styles.dishesList}>
            {dishes.map(dish => (
              <MenuItemCard key={dish.id} />
            ))}
          </View>
        </View>

        {/* Report This Listing Button */}
        <TouchableOpacity style={styles.reportButton}>
          <Text style={styles.reportButtonText}>Report this listing</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Back Button */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back-outline" size={30} color="#34ec7bff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f2',
  },
  scrollContent: {
    paddingBottom: 30,
  },
  headerContainer: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginBottom: 20,
    position: 'relative',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  bannerImage: {
    width: '100%',
    height: 200,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#fff',
    position: 'absolute',
    bottom: 75,
    alignSelf: 'center',
    left: 160,
    right: 0,
    marginLeft: 'auto',
    marginRight: 'auto',
    zIndex: 2,
  },
  restaurantInfo: {
    marginTop: 60,
    marginBottom: 20,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  restaurantName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#222',
  },
  chefName: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  pickupInfoCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    borderRadius: 15,
    padding: 15,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  pickupTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  pickupText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 4,
  },
  infoCardsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: '#fff',
    flex: 1,
    marginHorizontal: 5,
    borderRadius: 15,
    paddingVertical: 15,
    paddingHorizontal: 10,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  infoCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
    color: '#333',
  },
  infoCardText: {
    fontSize: 14,
    color: '#555',
  },
  sectionContainer: {
    marginBottom: 25,
    marginHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    color: '#222',
  },
  dishesList: {
    flexDirection: 'column',
    gap: 10,
  },
  reportButton: {
    backgroundColor: '#ff4d4d',
    marginHorizontal: 20,
    borderRadius: 15,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 30,
    elevation: 3,
    shadowColor: '#ff4d4d',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  reportButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    backgroundColor: '#fff',
    borderRadius: 20,
    position: 'absolute',
    top: 50,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
});

export default MenuScreen;
