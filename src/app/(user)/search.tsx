import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import SearchBar from '@/src/components/filters/SearchBar';

export default function SearchScreen() {
  const [query, setQuery] = useState(''); // adding search bar
  return (
    <>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffffff' }}>
        <View style={{ marginTop: 30, paddingVertical: 10, paddingHorizontal: 16 }}>
          <SearchBar value={query} onChangeText={setQuery} />
        </View>
        <View style={styles.container}>
          <Text style={styles.text}>This is the Search Screen</Text>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffffff',
  },
  text: { fontSize: 20, fontWeight: '600', color: '#333' },
});
