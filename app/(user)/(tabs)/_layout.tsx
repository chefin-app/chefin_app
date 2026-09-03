import { Tabs, useRouter } from 'expo-router';
import TopNavBarHomeUser from '@/src/components/navigation/TopNavBarHomeUser';
import BottomTabBarUser from '@/src/components/navigation/BottomTabBarUser';
import { useCallback, useRef } from 'react';
import { useAuth } from '@/src/services/auth-context';
import { TextInput, View } from 'react-native';
import AccountRestrictionBanner from '@/src/components/feedback/AccountRestrictionBanner';
import ActiveOrderBanner from '@/src/components/navigation/ActiveOrderBanner';

export default function TabLayout() {
  const { user, initializing } = useAuth();
  const router = useRouter();
  const searchInputRef = useRef<TextInput>(null);

  const focusSearchInput = useCallback(() => {
    const focus = (attempt = 0) => {
      const input = searchInputRef.current;
      if (!input) {
        // The second tap can arrive while the Search header is still mounting.
        if (attempt < 2) setTimeout(() => focus(attempt + 1), 50);
        return;
      }

      // Android may leave the input focused after its keyboard is dismissed.
      // Briefly resetting focus guarantees that the software keyboard reopens.
      if (input.isFocused()) {
        input.blur();
        requestAnimationFrame(() => input.focus());
      } else {
        input.focus();
      }
    };

    focus();
  }, []);

  const renderHeader = useCallback(
    (props: any) => <TopNavBarHomeUser {...props} searchInputRef={searchInputRef} />,
    []
  );

  const renderTabBar = useCallback(
    (props: any) => (
      <>
        <ActiveOrderBanner />
        <BottomTabBarUser {...props} onSearchDoubleTap={focusSearchInput} />
      </>
    ),
    [focusSearchInput]
  );

  if (initializing) return null;

  const isLoggedIn = !!user;

  return (
    <View style={{ flex: 1 }}>
      <AccountRestrictionBanner />
      <Tabs
        tabBar={renderTabBar}
        screenOptions={{
          header: renderHeader,
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
