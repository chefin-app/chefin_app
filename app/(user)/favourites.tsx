import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFavourites } from '@/src/context/FavouritesContext';

const FavouritesScreen = () => {
  const router = useRouter();
  const { favourites, toggleFavourite } = useFavourites();

  if (favourites.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Favourites</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No favourites saved</Text>
          <Text style={styles.emptySubtitle}>
            To make ordering even faster, you'll find all your faves here. Just look for the heart
            icon!
          </Text>
          <TouchableOpacity
            style={styles.findButton}
            onPress={() => router.push('/(user)/(tabs)/home')}
          >
            <Text style={styles.findButtonText}>Let's find some favourites</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Favourites</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={favourites}
        keyExtractor={item => item.profileId}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/restaurant/${item.profileId}`)}
          >
            <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
            <TouchableOpacity style={styles.heartIcon} onPress={() => toggleFavourite(item)}>
              <Ionicons name="heart" size={24} color="#FF5252" />
            </TouchableOpacity>
            <View style={styles.cardFooter}>
              <Text style={styles.rating}>
                ★ {item.rating} ({item.reviewCount})
              </Text>
              <Text style={styles.cardTitle}>{item.restaurantName}</Text>
              <Text style={styles.cardSub}>By {item.fullChefName}</Text>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ padding: 20 }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  backButton: { padding: 5 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 22, fontWeight: '700', marginBottom: 10 },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  findButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  findButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  card: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  cardImage: { width: '100%', height: 200 },
  heartIcon: {
    position: 'absolute',
    top: 15,
    right: 15,
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 20,
  },
  cardFooter: { padding: 15 },
  rating: { fontWeight: '600', color: '#FFB800', marginBottom: 5 },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 5 },
  cardSub: { color: '#666' },
});

export default FavouritesScreen;
