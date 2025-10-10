import React from 'react';
import { useRouter, useSegments } from 'expo-router';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Entypo from '@expo/vector-icons/Entypo';
import { createShadowStyle } from '../../utils/platform-utils';
import { useAuth } from '@/src/services/auth-context';

interface NavBarProps {
  options?: {
    headerProps?: {
      currentTab?: string;
    };
  };
}

export default function TopNavBarHomeCook({ options }: NavBarProps) {
  const router = useRouter();
  const segments = useSegments();
  const { user, initializing } = useAuth();

  // Get current tab from segments or props
  const currentTab = options?.headerProps?.currentTab || segments[segments.length - 1];

  const getGreeting = (tab: string) => {
    switch (tab) {
      case 'today':
        return getTimeGreeting();
      case 'menu':
        return 'Your Menu';
      case 'account':
        return 'Your Profile';
      case 'calendar':
        return null; // No greeting for calendar
      default:
        return getTimeGreeting();
    }
  };

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const getUserName = () => {
    if (!user) return 'Food Explorer';
    console.log(user.user_metadata.full_name);
    return (
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'Food Explorer'
    );
  };

  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'today':
        return 'Today';
      case 'calendar':
        return 'Calendar';
      case 'menu':
        return 'Menu';
      case 'account':
        return user ? 'Account' : 'Log In';
      default:
        return 'Welcome';
    }
  };

  const shouldShowGreeting = (tab: string) => {
    // Hide greeting for calendar tab
    return tab !== 'calendar';
  };

  const renderContent = () => {
    const greeting = getGreeting(currentTab);

    if (currentTab === 'calendar') {
      // Calendar tab - minimal header with just title
      return (
        <View style={styles.calendarHeader}>
          <Text style={styles.calendarTitle}>Calendar</Text>
        </View>
      );
    }

    if (currentTab === 'menu') {
      // Menu tab - show plus button for adding new items
      return (
        <View style={styles.calendarHeader}>
          <Text style={styles.calendarTitle}>Your Menu</Text>
        </View>
      );
    }
    // Other tabs - show greeting and user name
    return (
      <View>
        {greeting && <Text style={styles.greeting}>{user ? `${greeting}!` : 'Welcome!'}</Text>}
        <Text style={styles.userName}>Chef {getUserName()}</Text>
      </View>
    );
  };

  const renderRightButton = () => {
    if (currentTab === 'menu') {
      return (
        <TouchableOpacity style={styles.plusButton} onPress={() => router.push('/')}>
          <Entypo name="plus" size={24} color="black" />
        </TouchableOpacity>
      );
    } else {
      return (
        <TouchableOpacity style={styles.notificationButton}>
          <Ionicons name="notifications" size={24} color="#333" />
          {user && <View style={styles.notificationDot} />}
        </TouchableOpacity>
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          {renderContent()}
          {renderRightButton()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
  },
  greeting: {
    fontSize: 16,
    color: '#666',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  calendarHeader: {
    justifyContent: 'center',
  },
  calendarTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  notificationButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5252',
  },
  plusButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  welcomeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  joinButton: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
    alignSelf: 'flex-start',
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  seeAllText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '500',
  },
});
