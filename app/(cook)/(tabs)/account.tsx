import React from 'react';
import {
  Alert,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';
import { createShadowStyle } from '@/src/utils/platform-utils';

interface MenuItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: Href | 'SignOut';
  section?: 'main' | 'more';
}

interface CookOverview {
  profile: {
    fullName: string | null;
    restaurantName: string | null;
    imageUrl: string | null;
  };
  performance: {
    totalEarned: number;
    grossFoodEarnings: number;
    deliveryChargesCovered: number;
    ordersFulfilled: number;
    averageRating: number | null;
    ratingCount: number;
    completionRate: number | null;
    averageEarningsPerOrder: number;
    last30DaysEarned: number;
    last30DaysOrders: number;
  };
}

const formatMoney = (value: number): string =>
  `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatStat = (value: number): string =>
  value < 1000 ? String(value) : `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;

const Account: React.FC = () => {
  const router = useRouter();
  const { session } = useAuth();
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [overview, setOverview] = React.useState<CookOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = React.useState(true);
  const [overviewError, setOverviewError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const loadOverview = React.useCallback(
    async (manual = false) => {
      if (!session?.access_token) {
        setOverviewLoading(false);
        return;
      }
      if (manual) setRefreshing(true);
      else setOverviewLoading(true);
      setOverviewError(null);
      try {
        const response = await fetch(
          `${process.env.EXPO_PUBLIC_API_URL}/api/account/cook-performance`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        const payload = (await response.json().catch(() => ({}))) as CookOverview & {
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? 'Performance overview is unavailable.');
        setOverview(payload);
      } catch (error: unknown) {
        setOverviewError(
          error instanceof Error ? error.message : 'Performance overview is unavailable.'
        );
      } finally {
        setOverviewLoading(false);
        setRefreshing(false);
      }
    },
    [session?.access_token]
  );

  useFocusEffect(
    React.useCallback(() => {
      loadOverview();
    }, [loadOverview])
  );

  const menuItems: MenuItem[] = [
    {
      id: '1',
      title: 'Profile Information',
      icon: 'person-outline',
      route: '/(cook)/profile-information',
      section: 'main',
    },
    {
      id: '2',
      title: 'Payment Settings',
      icon: 'wallet-outline',
      route: '/(cook)/payout-details',
      section: 'main',
    },
    {
      id: '3',
      title: 'Address',
      icon: 'location-outline',
      route: '/(cook)/address',
      section: 'main',
    },
    {
      id: '4',
      title: 'Business Hours',
      subtitle: 'Set regular and special opening hours',
      icon: 'time-outline',
      route: '/(cook)/business-hours',
      section: 'main',
    },
    // {
    //   id: '4',
    //   title: 'Invite Friends',
    //   icon: 'share-outline',
    //   route: 'InviteFriends',
    //   section: 'main',
    // },
    // {
    //   id: '5',
    //   title: 'Rate Us',
    //   subtitle: 'Rate us playstore, appstore',
    //   icon: 'star-outline',
    //   route: 'RateUs',
    //   section: 'more',
    // },
    // {
    //   id: '6',
    //   title: 'FAQ',
    //   subtitle: 'Frequently asked questions',
    //   icon: 'help-circle-outline',
    //   route: 'FAQ',
    //   section: 'more',
    // },
    {
      id: '6',
      title: 'Help & Support',
      subtitle: 'Cook FAQs and contact support',
      icon: 'help-circle-outline',
      route: '/(cook)/help-support',
      section: 'main',
    },
    {
      id: '7',
      title: 'Switch to customer mode',
      subtitle: 'Explore Chefins near you',
      icon: 'swap-horizontal-outline',
      route: '/(user)/(tabs)/home',
      section: 'main',
    },
    {
      id: '8',
      title: 'Sign Out',
      icon: 'log-out-outline',
      route: 'SignOut',
      section: 'main',
    },
  ];

  const handleNavigation = (route: Href | 'SignOut', title: string) => {
    if (route === 'SignOut') {
      // Handle signout logic
      handleSignOut();
      return;
    }

    // Navigate to the specific route
    try {
      router.push(route);
    } catch {
      console.log(`Navigation to ${route} not configured yet`);
      // For development - you can remove this alert in production
      console.log(`Would navigate to: ${title}`);
    }
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: confirmSignOut },
    ]);
  };

  const confirmSignOut = async () => {
    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      router.replace('/(user)/(tabs)/home');
    }
    setIsSigningOut(false);
  };

  const renderMenuItem = (item: MenuItem) => {
    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.menuItem,
          item.route === 'SignOut' && isSigningOut && styles.menuItemDisabled,
        ]}
        disabled={item.route === 'SignOut' && isSigningOut}
        onPress={() => handleNavigation(item.route, item.title)}
        activeOpacity={0.7}
      >
        <View style={styles.menuItemLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name={item.icon} size={24} color="#666666" />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.menuItemTitle}>{item.title}</Text>
            {item.subtitle && <Text style={styles.menuItemSubtitle}>{item.subtitle}</Text>}
          </View>
        </View>
        <View style={styles.menuItemRight}>
          <Ionicons name="chevron-forward" size={20} color="#CCCCCC" />
        </View>
      </TouchableOpacity>
    );
  };

  const mainItems = menuItems.filter(item => item.section === 'main');
  // const moreItems = menuItems.filter(item => item.section === 'more');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadOverview(true)}
            tintColor="#258B50"
            colors={['#258B50']}
          />
        }
      >
        <View style={styles.performanceCard}>
          {overviewLoading ? (
            <View style={styles.performanceLoading}>
              <ActivityIndicator color="#258B50" />
              <Text style={styles.performanceLoadingText}>Loading your performance…</Text>
            </View>
          ) : overviewError && !overview ? (
            <View style={styles.performanceLoading}>
              <Ionicons name="analytics-outline" size={30} color="#7B877F" />
              <Text style={styles.performanceError}>{overviewError}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => loadOverview()}>
                <Text style={styles.retryButtonText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : overview ? (
            <>
              <View style={styles.performanceHeader}>
                <TouchableOpacity
                  style={styles.restaurantAvatar}
                  activeOpacity={0.8}
                  onPress={() => router.push('/(cook)/profile-information')}
                >
                  {overview.profile.imageUrl ? (
                    <Image
                      source={{ uri: overview.profile.imageUrl }}
                      style={styles.restaurantAvatarImage}
                    />
                  ) : (
                    <Text style={styles.restaurantAvatarText}>
                      {(overview.profile.restaurantName || overview.profile.fullName || 'C')
                        .charAt(0)
                        .toUpperCase()}
                    </Text>
                  )}
                </TouchableOpacity>
                <View style={styles.performanceHeaderCopy}>
                  <Text style={styles.performanceEyebrow}>PERFORMANCE OVERVIEW</Text>
                  <Text style={styles.restaurantName} numberOfLines={1}>
                    {overview.profile.restaurantName ||
                      overview.profile.fullName ||
                      'Your restaurant'}
                  </Text>
                </View>
                <Ionicons name="analytics" size={22} color="#258B50" />
              </View>

              <View style={styles.earningsBlock}>
                <Text style={styles.earningsLabel}>Total earned</Text>
                <Text
                  style={styles.earningsValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {formatMoney(overview.performance.totalEarned)}
                </Text>
                <Text style={styles.earningsHint}>Net of applied delivery charges</Text>
              </View>

              <View style={styles.metricsGrid}>
                <View style={styles.metricItem}>
                  <Text
                    style={styles.metricValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {overview.performance.averageRating == null
                      ? '—'
                      : `${overview.performance.averageRating.toFixed(1)} ★`}
                  </Text>
                  <Text style={styles.metricLabel}>Restaurant rating</Text>
                  <Text style={styles.metricHint}>
                    {formatStat(overview.performance.ratingCount)} public review
                    {overview.performance.ratingCount === 1 ? '' : 's'}
                  </Text>
                </View>
                <View style={styles.metricItem}>
                  <Text
                    style={styles.metricValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {formatStat(overview.performance.ordersFulfilled)}
                  </Text>
                  <Text style={styles.metricLabel}>Orders fulfilled</Text>
                  <Text style={styles.metricHint}>Completed checkouts</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text
                    style={styles.metricValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {overview.performance.completionRate == null
                      ? '—'
                      : `${overview.performance.completionRate.toFixed(0)}%`}
                  </Text>
                  <Text style={styles.metricLabel}>Completion rate</Text>
                  <Text style={styles.metricHint}>Completed vs cancelled</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text
                    style={styles.metricValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                  >
                    {formatMoney(overview.performance.averageEarningsPerOrder)}
                  </Text>
                  <Text style={styles.metricLabel}>Average per order</Text>
                  <Text style={styles.metricHint}>Net earnings</Text>
                </View>
              </View>

              <View style={styles.recentSummary}>
                <View style={styles.recentIcon}>
                  <Ionicons name="trending-up" size={18} color="#258B50" />
                </View>
                <View style={styles.recentCopy}>
                  <Text style={styles.recentLabel}>Last 30 days</Text>
                  <Text style={styles.recentValue}>
                    {formatMoney(overview.performance.last30DaysEarned)} from{' '}
                    {overview.performance.last30DaysOrders} fulfilled order
                    {overview.performance.last30DaysOrders === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>

              {overview.performance.deliveryChargesCovered > 0 ? (
                <Text style={styles.breakdownText}>
                  Gross food sales {formatMoney(overview.performance.grossFoodEarnings)} · Delivery
                  charges covered {formatMoney(overview.performance.deliveryChargesCovered)}
                </Text>
              ) : null}
              {overviewError ? <Text style={styles.staleText}>{overviewError}</Text> : null}
            </>
          ) : null}
        </View>

        <View style={styles.section}>{mainItems.map(renderMenuItem)}</View>

        {/* <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>MORE</Text>
        </View> */}

        {/* <View style={styles.section}>{moreItems.map(renderMenuItem)}</View> */}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000000',
  },
  notificationButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  contentContainer: { paddingTop: 16, paddingBottom: 16 },
  performanceCard: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 22,
    ...createShadowStyle({
      shadowColor: '#17251C',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    }),
  },
  performanceLoading: {
    minHeight: 210,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  performanceLoadingText: { fontSize: 14, color: '#707A73' },
  performanceError: { textAlign: 'center', fontSize: 13, lineHeight: 19, color: '#707A73' },
  retryButton: {
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F6EC',
  },
  retryButtonText: { color: '#237A3B', fontSize: 13, fontWeight: '700' },
  performanceHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  restaurantAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#258B50',
  },
  restaurantAvatarImage: { width: '100%', height: '100%' },
  restaurantAvatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  performanceHeaderCopy: { flex: 1 },
  performanceEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: '#258B50' },
  restaurantName: { marginTop: 3, fontSize: 18, fontWeight: '700', color: '#26332B' },
  earningsBlock: { alignItems: 'center', paddingVertical: 24 },
  earningsLabel: { fontSize: 12, color: '#758078' },
  earningsValue: { marginTop: 3, fontSize: 31, fontWeight: '800', color: '#1E2C23' },
  earningsHint: { marginTop: 4, fontSize: 11, color: '#929A95' },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: '#EDF1EE',
  },
  metricItem: { width: '50%', minHeight: 102, paddingVertical: 15, paddingRight: 8 },
  metricValue: { fontSize: 18, fontWeight: '800', color: '#2D3931' },
  metricLabel: { marginTop: 4, fontSize: 12, fontWeight: '600', color: '#59655D' },
  metricHint: { marginTop: 3, fontSize: 10, color: '#959D98' },
  recentSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 14,
    padding: 13,
    backgroundColor: '#EDF8F0',
  },
  recentIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D6EFDD',
  },
  recentCopy: { flex: 1 },
  recentLabel: { fontSize: 11, fontWeight: '700', color: '#237A3B' },
  recentValue: { marginTop: 2, fontSize: 12, lineHeight: 18, color: '#3D4B42' },
  breakdownText: { marginTop: 11, fontSize: 10, lineHeight: 16, color: '#8A938D' },
  staleText: { marginTop: 8, fontSize: 10, color: '#B26A00' },
  section: {
    marginBottom: 30,
  },
  sectionHeader: {
    marginBottom: 15,
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999999',
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  menuItemDisabled: { opacity: 0.5 },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    marginBottom: 2,
  },
  menuItemSubtitle: {
    fontSize: 13,
    color: '#999999',
    lineHeight: 16,
  },
  menuItemRight: {
    paddingLeft: 16,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingVertical: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  activeTabItem: {
    opacity: 1,
  },
  tabText: {
    fontSize: 10,
    color: '#999999',
    marginTop: 2,
  },
  activeTabText: {
    fontSize: 10,
    color: '#4CAF50',
    marginTop: 2,
  },
});

export default Account;
