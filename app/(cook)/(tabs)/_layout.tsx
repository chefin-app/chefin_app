import { Tabs, usePathname, useRouter } from 'expo-router';
import { useAuth } from '@/src/services/auth-context';
import TopNavBarHomeCook from '../../../src/components/navigation/TopNavBarHomeCook';
import BottomTabBarCook from '../../../src/components/navigation/BottomTabBarCook';
import { Text, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AccountRestrictionBanner from '@/src/components/feedback/AccountRestrictionBanner';
import { useCookApplication } from '@/src/hooks/useCookApplication';
import { useEffect } from 'react';

const NavBar = (props: any) => <TopNavBarHomeCook {...props} />;
const TabBar = (props: any) => <BottomTabBarCook {...props} />;

export default function CookTabsLayout() {
  const router = useRouter();
  const { accountStatus, session } = useAuth();
  const isLoggedIn = !!session?.user;
  const pathname = usePathname();
  const application = useCookApplication();
  const reverificationRequired = application.status === 'reverification_required';
  const showApplicationBanner =
    !application.loading && (application.restrictedToDrafts || reverificationRequired);

  useEffect(() => {
    if (!application.loading && application.restrictedToDrafts && pathname.endsWith('/orders')) {
      router.replace('/(cook)/(tabs)/menu');
    }
  }, [application.loading, application.restrictedToDrafts, pathname, router]);

  return (
    <View style={styles.page}>
      <SafeAreaView
        edges={['top']}
        style={[
          styles.topSafeArea,
          accountStatus === 'suspended'
            ? styles.suspendedSafeArea
            : showApplicationBanner
              ? styles.applicationSafeArea
              : styles.navigationSafeArea,
        ]}
      >
        <AccountRestrictionBanner />
        {showApplicationBanner && (
          <View style={styles.applicationBanner}>
            <View style={styles.applicationIcon}>
              <Ionicons
                name={reverificationRequired ? 'shield-outline' : 'time-outline'}
                size={20}
                color="#8A6100"
              />
            </View>
            <View style={styles.applicationContent}>
              <Text style={styles.applicationTitle}>
                {reverificationRequired ? 'Reverification required' : 'Cook review in progress'}
              </Text>
              <Text style={styles.applicationBody}>
                {reverificationRequired
                  ? `Complete identity and compliance checks by ${
                      application.reverificationDueAt
                        ? new Date(application.reverificationDueAt).toLocaleDateString('en-MY')
                        : 'the deadline'
                    } to keep selling.`
                  : 'You can create and edit draft dishes. Discovery, availability and new orders unlock after final approval.'}
              </Text>
              <View style={styles.applicationActions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Review identity verification"
                  activeOpacity={0.7}
                  style={styles.applicationAction}
                  onPress={() => router.push('/(cook)/identity-verification')}
                >
                  <Text style={styles.applicationLink}>Identity</Text>
                  <Ionicons name="chevron-forward" size={14} color="#237A3B" />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Review food safety documents"
                  activeOpacity={0.7}
                  style={styles.applicationAction}
                  onPress={() => router.push('/(cook)/food-safety')}
                >
                  <Text style={styles.applicationLink}>Food documents</Text>
                  <Ionicons name="chevron-forward" size={14} color="#237A3B" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </SafeAreaView>
      <Tabs
        tabBar={TabBar}
        screenOptions={{
          header: NavBar,
        }}
      >
        <Tabs.Screen
          name="orders"
          options={{ title: 'Orders' }}
          listeners={{
            tabPress: event => {
              if (application.restrictedToDrafts) event.preventDefault();
            },
          }}
        />
        <Tabs.Screen name="menu" options={{ title: 'Menu' }} />
        <Tabs.Screen
          name="notifications"
          options={{
            title: 'Inbox',
            headerShown: false,
          }}
        />
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

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F8F9FA' },
  topSafeArea: { zIndex: 1 },
  suspendedSafeArea: { backgroundColor: '#FFF4D6' },
  applicationSafeArea: { backgroundColor: '#FFF8E1' },
  navigationSafeArea: { backgroundColor: '#F8F9FA' },
  applicationBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 12,
    backgroundColor: '#FFF8E1',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F4C95D',
  },
  applicationIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8E9B9',
  },
  applicationContent: { flex: 1, minWidth: 0 },
  applicationTitle: { fontSize: 14, lineHeight: 18, fontWeight: '800', color: '#6F4E00' },
  applicationBody: { fontSize: 12, color: '#7A641E', lineHeight: 17, marginTop: 2 },
  applicationLink: { color: '#237A3B', fontSize: 12, fontWeight: '800' },
  applicationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  applicationAction: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    backgroundColor: '#EDF7EF',
  },
});
