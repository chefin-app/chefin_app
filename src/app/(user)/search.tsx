// src/app/(user)/search.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const SearchScreenPage = () => {
  // You can name it whatever, as long as it's the default export
  return (
    <View style={styles.container}>
      <Text style={styles.text}>This is the Search Screen</Text>
    </View>
  );
};

export default SearchScreenPage;

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  text: { fontSize: 20, fontWeight: '600', color: '#333' },
});
