import { Tabs, useRouter } from 'expo-router';

import TopNavBarHomeCook from '../../components/navigation/TopNavBarHomeCook';
import BottomTabBarCook from '../../components/navigation/BottomTabBarCook';
import { useAuth } from '@/src/services/auth-context';

const NavBar = (props: any) => <TopNavBarHomeCook {...props} />;
const TabBar = (props: any) => <BottomTabBarCook {...props} />;

export default function TabLayout() {
  const router = useRouter();
  const { session } = useAuth();
  const isLoggedIn = !!session?.user;

  return (
    <Tabs
      tabBar={TabBar}
      screenOptions={{
        header: NavBar,
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="menu" options={{ title: 'Menu' }} />
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
