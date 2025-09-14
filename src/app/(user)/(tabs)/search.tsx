// src/app/(user)/search.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import SearchBar from '@/src/components/filters/SearchBar';
import useFetch from '@/src/hooks/useFetch';
import { fetchCooks } from '@/src/utils/fetchCooks';
import MealCard from '@/src/components/cards/MealCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SearchHistoryCard from '@/src/components/cards/SearchHistoryCard';


const SearchScreen = () => {

  const [searchQuery, setSearchQuery] = useState("");
  const { data: restaurantData, loading: restaurantLoading, error: restaurantError, refetch: loadCooks, reset } = useFetch(() => fetchCooks({ query: searchQuery }), false)
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  const clearHistory = async () => {
    try {
      await AsyncStorage.removeItem("searchHistory");
      setSearchHistory([]); // reset local state
    } catch (error) {
      console.error("Failed to clear history", error);
    }
  };

  useEffect(() => {
    const loadHistory = async () => {
      const saved = await AsyncStorage.getItem('searchHistory'); // This retrieves the saved search history from AsyncStorage when the component mounts.
      if (saved) {
        setSearchHistory(JSON.parse(saved));
      };
    };
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('searchHistory', JSON.stringify(searchHistory)); // This means that whenever the searchHistory state changes, the updated search history is saved to AsyncStorage.
  }, [searchHistory]);

  useEffect(() => {
    const timeoutFunc = setTimeout(async () => {
      if (searchQuery.trim()) {
        await loadCooks();

        setSearchHistory(prev => { // Update search history state with new search query
          const updatedHistory = [searchQuery, ...prev.filter(item => item !== searchQuery)];
          return updatedHistory.slice(0, 10); // Keep only the latest 10 entries
        });
      } else {
        reset();
      }
    }, 800);
    return () => clearTimeout(timeoutFunc);
  }, [searchQuery])

  console.log("Restaurant Data:", restaurantData);

  return (
    <FlatList
      data={restaurantData}
      renderItem={({ item }) => (
        <View style={{ alignItems: "center" }}>
          <MealCard
            {...item}
            cookName={item.profiles.full_name}
            restaurantName={item.profiles.restaurant_name}
            isVerified={item.profiles.is_verified}
            cookImage={item.profiles.profile_image}
          />
        </View>
      )}
      keyExtractor={item => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 10,
        paddingVertical: 10,
      }}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListHeaderComponent={
        <>
          <View style={{ width: '100%', paddingHorizontal: 0 }}>
            <SearchBar
              value={searchQuery}
              onChangeText={(text: string) => setSearchQuery(text)}
            />
          </View>
          {restaurantLoading && <Text style={{ textAlign: 'center', marginTop: 10 }}>Loading...</Text>}
          {restaurantError && <Text style={{ textAlign: 'center', marginTop: 10, color: 'red' }}>{restaurantError.message}</Text>}
          {!restaurantLoading && !restaurantError && restaurantData?.length > 0 && searchQuery.trim() && (
            <View style={styles.resultsView}>
              <Text>
                Search results for{' '}
                <Text style={styles.searchResults}>{searchQuery}</Text>
              </Text>
            </View>
          )}
        </>
      }
      ListEmptyComponent={
        !restaurantLoading && !restaurantError ? (
          searchQuery.trim() ? (
            <Text style={{ textAlign: 'center', marginTop: 20, color: '#555' }}>
              No results found.
            </Text>
          ) :
            (
              <View style={{ marginTop: 20 }}>
                <View style={styles.rowContainer}>
                  <Text style={{ textAlign: 'left', color: '#555' }}>Recent Searches:</Text>
                  {searchHistory.length > 0 && (
                    <Text
                      style={{ color: "black", fontWeight: "500", textAlign: "right", alignItems: "flex-end" }}
                      onPress={clearHistory}
                    >
                      Clear History
                    </Text>
                  )}
                </View>

                {searchHistory.map((item, index) => (
                  <View style={{ alignItems: "flex-start" }}>
                    <SearchHistoryCard query={item} onPress={() => setSearchQuery(item)} key={index} />
                  </View>
                ))}
              </View>
            )
        ) : null
      }
    />
  );
}
export default SearchScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 10,
    alignItems: 'center',
    backgroundColor: '#ffffffff',

  },
  text: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333'
  },
  searchResults: {
    fontWeight: 'bold',
    color: '#000f07f6',
  },
  resultsView: {
    marginTop: 10,
    marginBottom: 10,
  },
  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  }
});
