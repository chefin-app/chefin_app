import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { supabase } from '../../../utils/supabase';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createShadowStyle } from '../../../utils/platform-utils';
import type { User } from '@supabase/supabase-js';

export default function AccountScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    const getUserInfo = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        setUser(data.user);
        // console.log(auth);
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error('Error getting user:', error);
          Alert.alert('Error', 'Failed to load user information');
        }
      } finally {
        setIsLoading(false);
      }
    };

    getUserInfo();

    // console.log('Account screen mounted - fetching user info');
  }, []);

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: confirmSignOut,
      },
    ]);
  };

  const confirmSignOut = async () => {
    setIsSigningOut(true);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // Explicitly navigate to login after sign out
      router.replace('/(user)/(tabs)/home');
      Alert.alert('Signed Out', 'You have been signed out successfully.');
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error signing out:', error);
        Alert.alert('Error', 'Failed to sign out. Please try again.');
      }
    } finally {
      setIsSigningOut(false);
    }
  };

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
      onPress: () => {}, // TODO: Navigate to edit profile
    },
    {
      icon: 'heart-outline',
      title: 'Favorite Recipes',
      subtitle: 'View your saved recipes',
      onPress: () => {}, // TODO: Navigate to favorites
    },
    {
      icon: 'restaurant-outline',
      title: 'My Recipes',
      subtitle: "Recipes you've shared",
      onPress: () => {}, // TODO: Navigate to my recipes
    },
    {
      icon: 'notifications-outline',
      title: 'Notifications',
      subtitle: 'Manage your notification preferences',
      onPress: () => {}, // TODO: Navigate to notifications
    },
    {
      icon: 'card-outline',
      title: 'Subscription',
      subtitle: 'Manage your premium subscription',
      onPress: () => {}, // TODO: Navigate to subscription
    },
    {
      icon: 'help-circle-outline',
      title: 'Help & Support',
      subtitle: 'Get help or contact us',
      onPress: () => {}, // TODO: Navigate to help
    },
    {
      icon: 'settings-outline',
      title: 'Settings',
      subtitle: 'App preferences and privacy',
      onPress: () => {}, // TODO: Navigate to settings
    },
  ];

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading your account...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Account</Text>
          <TouchableOpacity style={styles.editButton}>
            <Ionicons name="create-outline" size={20} color="#4CAF50" />
          </TouchableOpacity>
        </View>

        {/* User Info Card */}
        <View style={styles.userCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getUserName().charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumText}>PRO</Text>
            </View>
          </View>

          <Text style={styles.userName}>{getUserName()}</Text>

          <Text style={styles.userEmail}>{user?.email || user?.phone || 'No contact info'}</Text>

          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>42</Text>
              <Text style={styles.statLabel}>Recipes</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>128</Text>
              <Text style={styles.statLabel}>Favourites</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>1.2k</Text>
              <Text style={styles.statLabel}>Followers</Text>
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
        <Text style={styles.versionText}>Food App v1.0.0</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  editButton: {
    padding: 8,
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
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  premiumBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FFD700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  premiumText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333',
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
