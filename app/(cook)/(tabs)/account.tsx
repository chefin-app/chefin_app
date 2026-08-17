import React from 'react';
import {
  Alert,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { type Href, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/src/utils/supabaseClient';

interface MenuItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: Href | 'SignOut';
  section?: 'main' | 'more';
}

const Account: React.FC = () => {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = React.useState(false);

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
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
