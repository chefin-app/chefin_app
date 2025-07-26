import React from 'react';
import { Tabs } from 'expo-router';
import BottomTabBar from '../../navigation/BottomTabBar';

export default function TabLayout() {
  return (
    <Tabs tabBar={props => <BottomTabBar {...props} />}>
      {/* Home Tab */}
      <Tabs.Screen
        name="index" // This links to src/app/(tabs)/home.tsx
        options={{
          title: 'Home',
          headerShown: false,
        }}
      />
      {/* Search Tab */}
      <Tabs.Screen
        name="search" // This links to src/app/(tabs)/search.tsx
        options={{
          title: 'Search', // Label for the tab (used by BottomTabBar)
          // headerShown: false,
        }}
      />
      {/* Account Tab */}

      <Tabs.Screen
        name="account" // This links to src/app/(tabs)/account.tsx
        options={{
          title: 'Account', // Label for the tab (used by BottomTabBar)
          // headerShown: false,
        }}
      />
      {/* Make sure you have src/app/(tabs)/search.tsx and src/app/(tabs)/account.tsx
          files with simple placeholder components, just like your index.tsx now has HomeScreen. */}
    </Tabs>
  );
}
