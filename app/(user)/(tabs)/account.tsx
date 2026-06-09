import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createShadowStyle } from '../../../src/utils/platform-utils';
import { useAuth } from '@/src/services/auth-context';
import { supabase } from '@/src/utils/supabaseClient';
import { useFavourites } from '@/src/context/FavouritesContext';

type ProfileData = {
  id: string;
  full_name: string | null;
  profile_image: string | null;
};

const formatStat = (n: number): string => {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
};

export default function AccountScreen() {
  const router = useRouter();
  const { user, initializing, loading } = useAuth();
  const { favourites } = useFavourites();
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<ProfileData | null>(null);
  const [stats, setStats] = React.useState({ orders: 0, reviews: 0 });

  React.useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        setUserRole(data?.role || 'guest');
      } catch (err) {
        console.error('Error fetching user role:', err);
        setUserRole('guest');
      }
    };
    fetchUserRole();
  }, [user]);

  React.useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, profile_image')
          .eq('user_id', user.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') throw profileError;
        if (!profileData) return;

        setProfile(profileData);

        const [ordersRes, reviewsRes] = await Promise.all([
          supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('customer_id', profileData.id),
          supabase
            .from('reviews')
            .select('id', { count: 'exact', head: true })
            .eq('customer_id', profileData.id),
        ]);

        setStats({
          orders: ordersRes.count ?? 0,
          reviews: reviewsRes.count ?? 0,
        });
      } catch (err) {
        console.error('Error fetching profile/stats:', err);
      }
    })();
  }, [user]);

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

  if (initializing || loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading your account...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text>No user found. Please log in again.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const getLoginMethod = () => {
    if (!user) return 'Unknown';

    if (user.email && user.phone) return 'Email & Phone';
    if (user.email) return 'Email';
    if (user.phone) return 'Phone';

    // Check for OAuth providers
    const providers = user.app_metadata?.providers || [];
    if (providers.includes('google')) return 'Google';
    if (providers.includes('facebook')) return 'Facebook';
    if (providers.includes('apple')) return 'Apple';

    return 'Unknown';
  };

  const getConfirmationStatus = () => {
    if (!user) return 'Unknown';

    const emailConfirmed = user.email_confirmed_at;
    const phoneConfirmed = user.phone_confirmed_at;

    if (emailConfirmed && phoneConfirmed) return 'Email & Phone Verified';
    if (emailConfirmed) return 'Email Verified';
    if (phoneConfirmed) return 'Phone Verified';

    return 'Not Verified';
  };

  const getUserName = () => {
    if (!user) return 'User';
    return (
      profile?.full_name ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'User'
    );
  };

  const menuItems = [
    {
      icon: 'person-outline',
      title: 'Edit Profile',
      subtitle: 'Update your personal information',
      onPress: () => router.push('/(user)/profile-info'),
    },
    {
      icon: 'card-outline',
      title: 'Payment Methods',
      subtitle: 'Manage your payment details',
      onPress: () => router.push('/(user)/payment-methods'),
    },
    {
      icon: 'heart-outline',
      title: 'Favourites',
      subtitle: 'View your saved chefins',
      onPress: () => router.push('/(user)/favourites'),
    },
    {
      icon: 'swap-horizontal-outline',
      title: userRole === 'cook' ? 'Switch to Cook Mode' : 'Start a Home Restaurant',
      subtitle: userRole === 'cook' ? 'Go to cook dashboard' : 'Start earning with Chefin',
      onPress: () => {
        if (userRole === 'cook') {
          router.push('/(cook)/(tabs)/today');
          return;
        }
        if (!user) {
          router.push('/(auth)/login');
          return;
        }
        // Open the unified onboarding wizard. The cook role is only granted
        // at the end of the wizard, after the application is submitted.
        router.push('/start-restaurant');
      },
    },
    {
      icon: 'notifications-outline',
      title: 'Notifications',
      subtitle: 'Manage your notification preferences',
      onPress: () => {}, // TODO: Navigate to notifications
    },
    {
      icon: 'help-circle-outline',
      title: 'Help & Support',
      subtitle: 'Get help or contact us',
      onPress: () => {}, // TODO: Navigate to help
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* User Info Card */}
        <View style={styles.userCard}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={() => router.push('/(user)/profile-info')}
            activeOpacity={0.8}
          >
            <View style={styles.avatar}>
              {profile?.profile_image ? (
                <Image source={{ uri: profile.profile_image }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{getUserName().charAt(0).toUpperCase()}</Text>
              )}
            </View>
          </TouchableOpacity>

          <Text style={styles.userName}>{getUserName()}</Text>

          <Text style={styles.userEmail}>{user?.email || user?.phone || 'No contact info'}</Text>

          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{formatStat(stats.orders)}</Text>
              <Text style={styles.statLabel}>Orders</Text>
            </View>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => router.push('/(user)/favourites')}
            >
              <Text style={styles.statNumber}>{formatStat(favourites.length)}</Text>
              <Text style={styles.statLabel}>Favourites</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{formatStat(stats.reviews)}</Text>
              <Text style={styles.statLabel}>Reviews</Text>
            </View>
          </View>
        </View>

        {/* Account Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Account Information</Text>

          <View style={styles.detailRow}>
            <Ionicons name="shield-checkmark" size={20} color="#666" />
            <View style={styles.detailText}>
              <Text style={styles.detailLabel}>Login Method</Text>
              <Text style={styles.detailValue}>{getLoginMethod()}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="checkmark-circle" size={20} color="#666" />
            <View style={styles.detailText}>
              <Text style={styles.detailLabel}>Verification Status</Text>
              <Text
                style={[
                  styles.detailValue,
                  getConfirmationStatus().includes('Verified')
                    ? styles.verified
                    : styles.notVerified,
                ]}
              >
                {getConfirmationStatus()}
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="calendar" size={20} color="#666" />
            <View style={styles.detailText}>
              <Text style={styles.detailLabel}>Member Since</Text>
              <Text style={styles.detailValue}>
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
              </Text>
            </View>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menuCard}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.menuItem, index === menuItems.length - 1 && styles.lastMenuItem]}
              onPress={item.onPress}
            >
              <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={24} color="#666" />
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>{item.title}</Text>
                <Text style={styles.menuItemSubtitle}>{item.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign Out Button */}
        <View style={styles.signOutContainer}>
          <TouchableOpacity
            style={[styles.signOutButton, isSigningOut && styles.signOutButtonDisabled]}
            onPress={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="log-out" size={20} color="#fff" />
                <Text style={styles.signOutButtonText}>Sign Out</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* App Version */}
        <Text style={styles.versionText}>Chefin v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  scrollView: {
    flex: 1,
  },
  userCard: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  userName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E0E0E0',
  },
  detailsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailText: {
    marginLeft: 12,
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  verified: {
    color: '#4CAF50',
  },
  notVerified: {
    color: '#FF9800',
  },
  menuCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    borderRadius: 16,
    marginBottom: 20,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  lastMenuItem: {
    borderBottomWidth: 0,
  },
  menuItemContent: {
    flex: 1,
    marginLeft: 16,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  menuItemSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  signOutContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5252',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  signOutButtonDisabled: {
    opacity: 0.7,
  },
  signOutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    marginBottom: 20,
  },
});
