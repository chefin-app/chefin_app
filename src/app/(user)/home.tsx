import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, ScrollView, View, Image } from 'react-native';
import { supabase } from '../../utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { createShadowStyle } from '../../utils/platform-utils';
import type { User } from '@supabase/supabase-js';
import SearchBar from '@/src/components/filters/SearchBar';
import CuisineFilter from '@/src/components/filters/CuisineFilter';
import MainFilter from '@/src/components/filters/MainFilter';
import { BaseText, HeadingText, BodyText, CaptionText } from '@/src/components/typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import PromoImage from '../../assets/images/promo-food.webp';

export default function HomeScreen() {
  const [searchValue, setSearchValue] = useState('');

  const handleSearchSubmit = () => {
    if (searchValue.trim()) {
      console.log('Search submitted:', searchValue);
    }
  };
  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <SearchBar
          value={searchValue}
          onChangeText={setSearchValue}
          onSubmitEditing={handleSearchSubmit}
        />
        {/* promo banner */}
        <View style={styles.promoBanner}>
          <View style={styles.promoContent}>
            <HeadingText level={5}>Welcome to Chefin! We think you'll love this dish</HeadingText>
          </View>
          <Image source={PromoImage} style={styles.promoImage} />
        </View>
        <CuisineFilter />
        <MainFilter />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa', // Slightly off-white background
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  promoBanner: {
    backgroundColor: '#90EE90',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    overflow: 'hidden',
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 10,
    }),
  },
  promoContent: {
    flex: 1,
  },
  promoImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
});
