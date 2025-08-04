/* Search bar component, styling and size etc. are here*/

import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
};

const SearchBar = ({
  value,
  onChangeText,
  placeholder = 'Search for cuisines, dishes, locations, home restaurants...',
}: Props) => {
  return (
    <SafeAreaView>
      <View style={styles.wrapper}>
        <Ionicons name="search" size={20} color="#888" style={styles.icon} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor="#888"
        />
      </View>
    </SafeAreaView>
  );
};

export default SearchBar;

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    backgroundColor: '#ffffffff',
    borderRadius: 50,
    paddingHorizontal: 16,
    paddingVertical: 20,
    shadowColor: '#0d9b4df6',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
    width: '90%',
    alignSelf: 'center',
  },
  icon: {
    marginRight: 8,
    alignSelf: 'center',
  },
  input: {
    flex: 1,
    fontSize: 17,
    color: '#333',
    height: 30,
  },
});
