import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  useNotifications,
  AppNotification,
  NotificationRole,
} from '@/src/context/NotificationsContext';
import {
  NOTIFICATION_TYPE_META,
  DEFAULT_NOTIFICATION_META,
} from '@/src/constants/notificationTypes';

/** "Just now", "5m ago", "3h ago", "2d ago", then a short date. */
const timeAgo = (iso: string): string => {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
};

export default function NotificationsScreen() {
  const router = useRouter();
  // Opened from either the customer or the cook navbar — each mode only sees
  // its own notifications and unread count.
  const params = useLocalSearchParams<{ role?: string }>();
  const role: NotificationRole = params.role === 'cook' ? 'cook' : 'customer';
  const { notifications, unreadCounts, loading, refresh, markAsRead, markAllAsRead } =
    useNotifications();

  const roleNotifications = notifications.filter(n => n.recipient_role === role);
  const unreadCount = unreadCounts[role];

  const handlePress = (item: AppNotification) => {
    markAsRead(item.id);
    // Actionable notifications deep-link to their screen.
    if (item.type === 'review_request' && typeof item.data?.order_id === 'string') {
      router.push(`/review/${item.data.order_id}`);
    }
  };

  const renderItem = ({ item }: { item: AppNotification }) => {
    const meta = NOTIFICATION_TYPE_META[item.type] ?? DEFAULT_NOTIFICATION_META;
    return (
      <TouchableOpacity
        style={[styles.row, !item.read && styles.rowUnread]}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconWrap, { backgroundColor: meta.background }]}>
          <Ionicons name={meta.icon} size={22} color={meta.color} />
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTitleLine}>
            <Text style={[styles.rowTitle, !item.read && styles.rowTitleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.rowTime}>{timeAgo(item.created_at)}</Text>
          </View>
          <Text style={styles.rowText}>{item.body}</Text>
        </View>
        {!item.read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={() => markAllAsRead(role)} style={styles.markAllButton}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.markAllButton} />
        )}
      </View>

      <FlatList
        data={roleNotifications}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#4CAF50" />
        }
        contentContainerStyle={roleNotifications.length === 0 && styles.emptyContainer}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="notifications-outline" size={48} color="#4CAF50" />
              </View>
              <Text style={styles.emptyTitle}>No notifications yet</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  backButton: { padding: 8, width: 90 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  markAllButton: { width: 90, alignItems: 'flex-end', paddingRight: 8 },
  markAllText: { fontSize: 13, fontWeight: '600', color: '#4CAF50' },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  rowUnread: { backgroundColor: '#FAFDF9' },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 3 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#333' },
  rowTitleUnread: { fontWeight: '700', color: '#1A1A1A' },
  rowTime: { fontSize: 12, color: '#999' },
  rowText: { fontSize: 13, color: '#666', lineHeight: 18 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginTop: 6,
  },
  separator: { height: 1, backgroundColor: '#F5F5F5', marginLeft: 74 },

  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
});
