import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

import NotificationFeed from '@/src/components/notifications/NotificationFeed';
import { type AppNotification, useNotifications } from '@/src/context/NotificationsContext';

export default function CookNotificationsScreen() {
  const router = useRouter();
  const { notifications, unreadCounts, loading, refresh, markAsRead, markAllAsRead } =
    useNotifications();
  const cookNotifications = notifications.filter(item => item.recipient_role === 'cook');
  const hasUnread = unreadCounts.cook > 0;

  const handlePress = (item: AppNotification) => {
    markAsRead(item.id);

    if (item.type === 'new_order' || item.type === 'payout_sent') {
      router.push('/(cook)/(tabs)/orders');
      return;
    }
    if (item.type === 'delivery_update_cook') {
      if (typeof item.data?.order_id === 'string') {
        router.push({
          pathname: '/(cook)/order/[orderId]',
          params: { orderId: item.data.order_id },
        });
      } else {
        router.push('/(cook)/(tabs)/orders');
      }
      return;
    }
    if (item.type === 'dish_rejected' && typeof item.data?.listing_id === 'string') {
      router.push({
        pathname: '/(cook)/edit-dish',
        params: { id: item.data.listing_id },
      });
      return;
    }
    if (
      item.type === 'dish_approved' ||
      item.type === 'dish_rejected' ||
      item.type === 'dish_unpublished' ||
      item.type === 'dish_review_reopened'
    ) {
      router.push('/(cook)/(tabs)/menu');
      return;
    }
    if (item.type === 'verification_more_info' && item.data?.stage === 'identity') {
      router.push('/(cook)/identity-verification');
      return;
    }
    if (
      item.type === 'verification_more_info' ||
      item.type === 'verification_approved' ||
      item.type === 'verification_rejected'
    ) {
      router.push('/(cook)/food-safety');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Inbox</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Mark all cook notifications as read"
          accessibilityState={{ disabled: !hasUnread }}
          disabled={!hasUnread}
          onPress={() => markAllAsRead('cook')}
          style={styles.readAllButton}
        >
          <Text style={[styles.readAllText, !hasUnread && styles.readAllTextDisabled]}>
            Read all
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.feedContainer}>
        <NotificationFeed
          notifications={cookNotifications}
          loading={loading}
          onRefresh={refresh}
          onPress={handlePress}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 17,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8ECE9',
  },
  eyebrow: { marginBottom: 3, color: '#67806E', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#1E2721', fontSize: 27, fontWeight: '900' },
  readAllButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 5 },
  readAllText: { color: '#237A3B', fontSize: 14, fontWeight: '800' },
  readAllTextDisabled: { color: '#A6AEA8' },
  feedContainer: { flex: 1 },
});
