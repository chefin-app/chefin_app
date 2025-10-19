import React from 'react';
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/services/auth-context';
import { supabase } from '@/src/utils/supabaseClient';

export default function AccountScreen() {
  const router = useRouter();
  const { user, initializing, loading } = useAuth();
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [isLoadingRole, setIsLoadingRole] = React.useState(true);

  React.useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) {
        setIsLoadingRole(false);
        return;
      }
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
      } finally {
        setIsLoadingRole(false);
      }
    };
    fetchUserRole();
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

  const menuItems = [
    {
      icon: 'person-outline',
      title: 'Profile Information',
      onPress: () => {},
    },
    {
      icon: 'card-outline',
      title: 'Payment Methods',
      onPress: () => {},
    },
    {
      icon: 'heart-outline',
      title: 'Favourites',
      onPress: () => {},
    },
    {
      icon: 'share-outline',
      title: 'Invite Friends',
      onPress: () => {},
    },
  ];

  const moreItems = [
    {
      icon: 'star-outline',
      title: 'Rate Us',
      subtitle: 'Rate us on Play Store / App Store',
      onPress: () => {},
    },
    {
      icon: 'help-circle-outline',
      title: 'FAQ',
      subtitle: 'Frequently asked questions',
      onPress: () => {},
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Account</Text>
          <TouchableOpacity style={styles.notificationButton}>
            <Ionicons name="notifications-outline" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          {menuItems.map((item, index) => (
            <TouchableOpacity key={index} style={styles.menuItem} onPress={item.onPress}>
              <View style={styles.menuItemLeft}>
                <Ionicons
                  name={item.icon as keyof typeof Ionicons.glyphMap}
                  size={20}
                  color="#666"
                />
                <Text style={styles.menuItemTitle}>{item.title}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          ))}
        </View>

        {/* More Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>MORE</Text>
        </View>

        <View style={styles.menuSection}>
          {/* Common items */}
          {moreItems.map((item, index) => (
            <TouchableOpacity key={index} style={styles.menuItem} onPress={item.onPress}>
              <View style={styles.menuItemLeft}>
                <Ionicons
                  name={item.icon as keyof typeof Ionicons.glyphMap}
                  size={20}
                  color="#666"
                />
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemTitle}>{item.title}</Text>
                  {item.subtitle ? (
                    <Text style={styles.menuItemSubtitle}>{item.subtitle}</Text>
                  ) : null}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          ))}

          {/* Role-based section */}
          {isLoadingRole ? (
            <View style={[styles.menuItem, { opacity: 0.5 }]}>
              <ActivityIndicator size="small" color="#999" />
              <Text style={{ marginLeft: 10 }}>Loading role...</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() =>
                  userRole === 'cook\n'
                    ? router.push('/(cook)/account')
                    : router.push('/(user)/(tabs)/home')
                }
              >
                <View style={styles.menuItemLeft}>
                  <Ionicons name="restaurant-outline" size={20} color="#666" />
                  <View style={styles.menuItemContent}>
                    <Text style={styles.menuItemTitle}>
                      {userRole === 'cook\n' ? 'Switch to Cook Mode' : 'Start a Home Restaurant'}
                    </Text>
                    <Text style={styles.menuItemSubtitle}>
                      {userRole === 'cook\n' ? 'Go to cook dashboard' : 'Earn with Chefin'}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            </>
          )}

          {/* Logout */}
          <TouchableOpacity style={styles.menuItem} onPress={handleSignOut}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="log-out-outline" size={20} color="#FF5252" />
              <View style={styles.menuItemContent}>
                <Text style={[styles.menuItemTitle, styles.logoutText]}>Logout</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Bottom Indicator */}
        <View style={styles.bottomIndicator}>
          <Text style={styles.indicatorText}>Bottom Nav.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: { fontSize: 16, color: '#666' },
  scrollView: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: '#FAFAFA',
  },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#333' },
  notificationButton: { padding: 8 },
  menuSection: { backgroundColor: '#FFF', marginBottom: 16 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuItemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  menuItemContent: { marginLeft: 12, flex: 1 },
  menuItemTitle: { fontSize: 16, color: '#333', marginLeft: 12 },
  menuItemSubtitle: { fontSize: 12, color: '#999', marginTop: 2 },
  logoutText: { color: '#FF5252' },
  sectionHeader: { paddingHorizontal: 20, paddingVertical: 12 },
  sectionTitle: { fontSize: 14, color: '#999', fontWeight: '600' },
  bottomIndicator: { alignItems: 'center', paddingVertical: 20 },
  indicatorText: { fontSize: 12, color: '#CCC' },
});
