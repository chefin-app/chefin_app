import { Tabs, useRouter } from 'expo-router';
import TopNavBarHomeUser from '../../components/navigation/TopNavBarHomeUser';
import BottomTabBarUser from '../../components/navigation/BottomTabBarUser';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../utils/auth-context';

const NavBar = (props: any) => <TopNavBarHomeUser {...props} />;
const TabBar = (props: any) => <BottomTabBarUser {...props} />;

export default function TabLayout() {
  const { user, initializing } = useAuth();
  const router = useRouter();

  const handleLoginPress = useCallback(() => {
    console.log('Login tab pressed - navigating to auth');
    router.push('/(auth)/login');
  }, [router]);

  // Don't render tabs until auth state is determined
  if (initializing) {
    return null;
  }

  const isLoggedIn = !!user;

  return (
    <SafeAreaProvider>
      <Tabs
        tabBar={TabBar}
        screenOptions={{
          header: NavBar,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Search',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="search-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            title: isLoggedIn ? 'Account' : 'Log In',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
          }}
          listeners={{
            tabPress: e => {
              if (!isLoggedIn) {
                e.preventDefault();
                router.push('/(auth)/login');
              }
            },
          }}
        />
        {/* This is for the dish selection
        we are setting the href as null for a Tabs screen - to remove the bottom tab bar 
        */}
        {/* <Tabs.Screen
          name="DishSelectionScreen"
          options={{
            href: null, // This hides it from the tab bar
            // we are hiding that bottom bar component in the dish_selection page
            tabBarStyle: { display: 'none' },
          }}
        /> */}
        <Tabs.Screen
          name="index"
          options={{
            href: null,
          }}
        />
      </Tabs>
    </SafeAreaProvider>
  );
}
