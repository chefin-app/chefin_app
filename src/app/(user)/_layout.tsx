import { Tabs, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import TopNavBarHomeUser from '../../components/navigation/TopNavBarHomeUser';
import BottomTabBarUser from '../../components/navigation/BottomTabBarUser';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const NavBar = (props: any) => <TopNavBarHomeUser {...props} />;
const TabBar = (props: any) => <BottomTabBarUser {...props} />;

export default function TabLayout() {
  const router = useRouter();
  const { session } = useAuth();
  const isLoggedIn = !!session?.user;

  return (
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}
