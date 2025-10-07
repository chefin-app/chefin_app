import {
  View,
  Text,
  ScrollView,
  Image,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import React from 'react';
import MenuItemCard from '@/src/components/cards/MenuItemCard';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { images } from '@/src/constants/images';

const MenuScreen = () => {
  const router = useRouter();
  return (
    <View>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={{ marginBottom: 50 }}>
          <Image source={images.templateMeal} style={{ width: '100%', height: 200 }} />
          <Image source={images.templateAvatar} style={styles.avatar} />
        </View>

        <View style={{ padding: 20, flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Sigma Eats</Text>
          <Text style={{ fontSize: 16, color: '#666' }}>By Gordon Ramsey</Text>
        </View>

        <View style={styles.infoContainer}>
          <Text style={{ fontSize: 16, color: '#666' }}>Certified Food Safe ✅</Text>
          <Text style={{ fontSize: 16, color: '#666' }}>Availability: 24/7</Text>
          <Text style={{ fontSize: 16, color: '#666' }}>Reviews: 4.5 (223)</Text>
          <Text style={{ fontSize: 16, color: '#666' }}>Allergens and Information</Text>
          <Text style={{ fontSize: 16, color: '#666' }}>100 Meals Prepped</Text>
        </View>

        <FlatList
          data={[1, 2, 3, 4, 5]} // Placeholder data
          renderItem={({ item }) => <MenuItemCard />}
          keyExtractor={item => item.toString()}
          contentContainerStyle={{ paddingVertical: 10 }}
          ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
          scrollEnabled={false}
        />
      </ScrollView>

      <TouchableOpacity style={styles.backButton} onPress={() => router.push('/home')}>
        <Ionicons name="close-outline" size={30} color="#34ec7bff" />
      </TouchableOpacity>
    </View>
  );
};
const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: 120,
    borderRadius: 10,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    overflow: 'hidden',
    position: 'relative',
  },
  imageStyle: {
    resizeMode: 'cover',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  infoContainer: {
    width: '90%',
    height: 150,
    alignSelf: 'center',
    paddingVertical: 20,
    paddingHorizontal: 10,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    elevation: 1,
  },
  backButton: {
    width: 30,
    height: 30,
    backgroundColor: '#fff',
    borderRadius: 20,
    position: 'absolute',
    top: 40,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10, // make sure it's above everything
  },
  arrowImage: {
    width: 40,
    height: 40,
    marginRight: 6,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#fff',
    position: 'absolute', // take it out of normal flow
    bottom: -50, // half its height so it overlaps halfway
    alignSelf: 'center', // centers it horizontally in the parent
    zIndex: 2, // make sure it’s above the meal image
  },
});
export default MenuScreen;
