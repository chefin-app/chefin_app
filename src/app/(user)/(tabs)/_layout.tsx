import { Tabs, useRouter } from 'expo-router';
import TopNavBarHomeUser from '../../../components/navigation/TopNavBarHomeUser';
import BottomTabBarUser from '../../../components/navigation/BottomTabBarUser';
import { useCallback } from 'react';
import { useAuth } from '@/src/services/auth-context';

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
    <Tabs
      tabBar={TabBar}
      screenOptions={{
        header: NavBar,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen
        name="account"
        options={{
          title: isLoggedIn ? 'Account' : 'Log In',
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
    </Tabs>
  );
}
