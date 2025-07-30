import React, { useState } from 'react';
import { View } from 'react-native';
import SearchBar from '../../components/filters/SearchBar';

const SearchScreen = () => {
  const [query, setQuery] = useState('');

  return (
    <View style={{ padding: 16 }}>
      <SearchBar value={query} onChangeText={setQuery} />
    </View>
  );
};

export default SearchScreen;