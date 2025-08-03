import React, { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
  FlatList,
} from 'react-native';
import { supabase } from '../../utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { createShadowStyle } from '../../utils/platform-utils';
import type { User } from '@supabase/supabase-js';
import SearchBar from '../../components/filters/SearchBar';

// Sample data for food categories
const FOOD_CATEGORIES = [
  { id: '1', name: 'Asian', icon: '🍜', color: '#FF6B6B' },
  { id: '2', name: 'Italian', icon: '🍝', color: '#4ECDC4' },
  { id: '3', name: 'Mexican', icon: '🌮', color: '#45B7D1' },
  { id: '4', name: 'Indian', icon: '🍛', color: '#96CEB4' },
  { id: '5', name: 'American', icon: '🍔', color: '#FECA57' },
  { id: '6', name: 'Mediterranean', icon: '🥗', color: '#FF9FF3' },
];

// Sample featured recipes
const FEATURED_RECIPES = [
  {
    id: '1',
    title: 'Spicy Thai Basil Fried Rice',
    chef: 'Chef Maria',
    rating: 4.8,
    time: '25 min',
    image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=300&h=200&fit=crop',
    category: 'Asian',
  },
];

export default function ExploreScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    getUserInfo();
  }, []);

  const getUserInfo = async () => {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      // Only log error if it's not the expected "session missing" error
      if (error && error.message !== 'Auth session missing!') {
        console.error('Unexpected auth error:', error);
      }

      // Set user (will be null if not logged in, which is fine)
      setUser(user);
    } catch (error) {
      // Silently handle auth errors - user simply isn't logged in
      // console.log('User not authenticated (this is normal if not logged in)');
      setUser(null);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const getUserName = () => {
    if (!user) return 'Food Explorer';

    return (
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'Food Explorer'
    );
  };

  const [query, setQuery] = useState(''); // for search bar querying

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{user ? `${getGreeting()}!` : 'Welcome!'}</Text>
            <Text style={styles.userName}>{getUserName()}</Text>
          </View>
          <TouchableOpacity style={styles.notificationButton}>
            <Ionicons name="notifications" size={24} color="#333" />
            {user && <View style={styles.notificationDot} />}
          </TouchableOpacity>
        </View>

        {/* Search Bar*/}
        <SafeAreaView style={styles.container}>
          <View style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
            <SearchBar value={query} onChangeText={setQuery} />
          </View>
        </SafeAreaView>

        {/* Welcome Card */}
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeTitle}>
            {user
              ? 'Ready to treat your taste buds to something extraordinary? 👨‍🍳'
              : 'Discover our Meals 🍽️'}
          </Text>
          <Text style={styles.welcomeSubtitle}>
            {user
              ? 'Explore thousands of recipes from home chefs around the world.'
              : "Join our community to share your favorite Chefin's Homemade, share your thoughts, and connect with fellow food lovers."}
          </Text>
          {!user && (
            <TouchableOpacity
              style={styles.joinButton}
              onPress={() => router.push('/(auth)/login')}
            >
              <Text style={styles.joinButtonText}>Join the Community</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
  },
  greeting: {
    fontSize: 16,
    color: '#666',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5252',
  },
  welcomeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  joinButton: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
    alignSelf: 'flex-start',
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  seeAllText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '500',
  },
});
