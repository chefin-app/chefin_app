import { Tabs, useRouter } from 'expo-router';
import TopNavBarHomeUser from '@/src/components/navigation/TopNavBarHomeUser';
import BottomTabBarUser from '@/src/components/navigation/BottomTabBarUser';
import { useCallback } from 'react';
import { useAuth } from '@/src/services/auth-context';
import { View } from 'react-native';
import AccountRestrictionBanner from '@/src/components/feedback/AccountRestrictionBanner';
import ActiveOrderBanner from '@/src/components/navigation/ActiveOrderBanner';

const NavBar = (props: any) => <TopNavBarHomeUser {...props} />;
const TabBar = (props: any) => (
  <>
    <ActiveOrderBanner />
    <BottomTabBarUser {...props} />
  </>
);

export default function TabLayout() {
  const { user, initializing } = useAuth();
  const router = useRouter();

  const handleLoginPress = useCallback(() => {
    console.log('Login tab pressed - navigating to auth');
    router.push('/(auth)/login');
  }, [router]);

  if (initializing) return null;

  const isLoggedIn = !!user;

  return (
    <View style={{ flex: 1 }}>
      <AccountRestrictionBanner />
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
    </View>
  );
}
