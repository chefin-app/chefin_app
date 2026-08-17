import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import NotificationFeed from '@/src/components/notifications/NotificationFeed';
import { type AppNotification, useNotifications } from '@/src/context/NotificationsContext';

/** Customer-only notification centre. Cook notifications live in the cook Inbox tab. */
export default function BuyerNotificationsScreen() {
  const router = useRouter();
  const { notifications, unreadCounts, loading, refresh, markAsRead, markAllAsRead } =
    useNotifications();
  const customerNotifications = notifications.filter(item => item.recipient_role === 'customer');
  const hasUnread = unreadCounts.customer > 0;

  const handlePress = (item: AppNotification) => {
    markAsRead(item.id);

    if (item.type === 'review_request' && typeof item.data?.order_id === 'string') {
      router.push(`/review/${item.data.order_id}`);
      return;
    }
    if (item.type === 'favourite_new_dish' && typeof item.data?.listing_id === 'string') {
      router.push(`/dish/${item.data.listing_id}`);
      return;
    }
    if (item.type === 'favourite_new_slots' && typeof item.data?.cook_profile_id === 'string') {
      router.push(`/restaurant/${item.data.cook_profile_id}`);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={25} color="#1D241F" />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Mark all buyer notifications as read"
          accessibilityState={{ disabled: !hasUnread }}
          disabled={!hasUnread}
          onPress={() => markAllAsRead('customer')}
          style={styles.readAllButton}
        >
          <Text style={[styles.readAllText, !hasUnread && styles.readAllTextDisabled]}>
            Read all
          </Text>
        </TouchableOpacity>
      </View>

      <NotificationFeed
        notifications={customerNotifications}
        loading={loading}
        onRefresh={refresh}
        onPress={handlePress}
        emptyTitle="You're all caught up!"
        emptyMessage="We'll let you know about your orders and favourite home restaurants."
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5EAE7',
    paddingHorizontal: 12,
  },
  backButton: { width: 76, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  title: { flex: 1, color: '#1D241F', fontSize: 19, fontWeight: '800', textAlign: 'center' },
  readAllButton: { width: 76, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  readAllText: { color: '#237A3B', fontSize: 13, fontWeight: '800' },
  readAllTextDisabled: { color: '#A5AEA8' },
});
