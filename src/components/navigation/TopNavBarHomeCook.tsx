import React from 'react';
import { useSegments } from 'expo-router';
import { Alert, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createShadowStyle } from '../../utils/platform-utils';
import { useAuth } from '@/src/services/auth-context';
import theme from '@/src/styles/theme';

interface NavBarProps {
  options?: {
    headerProps?: {
      currentTab?: string;
    };
  };
}

export default function TopNavBarHomeCook({ options }: NavBarProps) {
  const segments = useSegments();
  const { user } = useAuth();

  // Get current tab from segments or props
  const currentTab = options?.headerProps?.currentTab || segments[segments.length - 1];

  const getGreeting = (tab: string) => {
    switch (tab) {
      case 'orders':
        return getTimeGreeting();
      case 'menu':
        return 'Your Menu';
      case 'account':
        return 'Your Profile';
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

  const getUserName = (): string => {
    if (!user) return 'Chef';

    const rawName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'Chef';

    return rawName.charAt(0).toUpperCase() + rawName.slice(1);
  };

  const renderContent = () => {
    const greeting = getGreeting(currentTab);

    if (currentTab === 'menu') {
      return (
        <View style={styles.calendarHeader}>
          <Text style={styles.calendarTitle}>Menu</Text>
        </View>
      );
    }

    if (currentTab === 'account') {
      // Account tab - minimal header with just title
      return (
        <View style={styles.calendarHeader}>
          <Text style={styles.calendarTitle}>Account</Text>
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
        <TouchableOpacity
          style={styles.plusButton}
          accessibilityRole="button"
          accessibilityLabel="Menu help"
          onPress={() =>
            Alert.alert(
              'Managing your menu',
              'Group dishes into categories, set restaurant opening hours, and use each dish switch only when it sells out for the day. Sold-out dishes turn back on automatically on the next open day.'
            )
          }
        >
          <Ionicons name="help-circle-outline" size={27} color={theme.colors.text} />
        </TouchableOpacity>
      );
    }

    return <View style={styles.headerSpacer} />;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {renderContent()}
        {renderRightButton()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surfaceAlt,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  greeting: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.textStrong,
  },
  calendarHeader: {
    justifyContent: 'center',
  },
  calendarTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.textStrong,
  },
  headerSpacer: { width: 44, height: 44 },
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
    backgroundColor: theme.colors.surface,
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
    color: theme.colors.textStrong,
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  joinButton: {
    backgroundColor: theme.colors.primaryAction,
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
    color: theme.colors.textOnAction,
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
    color: theme.colors.textStrong,
    marginBottom: 16,
  },
  seeAllText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
});
