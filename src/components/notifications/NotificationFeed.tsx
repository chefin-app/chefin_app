import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  DEFAULT_NOTIFICATION_META,
  NOTIFICATION_TYPE_META,
} from '@/src/constants/notificationTypes';
import type { AppNotification } from '@/src/context/NotificationsContext';

interface NotificationFeedProps {
  notifications: AppNotification[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onPress: (notification: AppNotification) => void;
  emptyTitle?: string;
  emptyMessage?: string;
}

/** “Just now”, “5m ago”, “3h ago”, “2d ago”, then a short date. */
export const formatNotificationTime = (iso: string): string => {
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

const NotificationSeparator = () => <View style={styles.separator} />;

export default function NotificationFeed({
  notifications,
  loading,
  onRefresh,
  onPress,
  emptyTitle = "You're all caught up!",
  emptyMessage = "We'll let you know when there's a new notification.",
}: NotificationFeedProps) {
  const renderItem = ({ item }: { item: AppNotification }) => {
    const meta = NOTIFICATION_TYPE_META[item.type] ?? DEFAULT_NOTIFICATION_META;
    return (
      <TouchableOpacity
        activeOpacity={0.72}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.body}. ${formatNotificationTime(item.created_at)}`}
        onPress={() => onPress(item)}
        style={[styles.row, !item.read && styles.rowUnread]}
      >
        <View style={[styles.iconWrap, { backgroundColor: meta.background }]}>
          <Ionicons name={meta.icon} size={22} color={meta.color} />
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTitleLine}>
            <Text style={[styles.rowTitle, !item.read && styles.rowTitleUnread]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.rowTime}>{formatNotificationTime(item.created_at)}</Text>
          </View>
          <Text style={styles.rowText}>{item.body}</Text>
        </View>
        {!item.read ? <View style={styles.unreadDot} /> : null}
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      data={notifications}
      keyExtractor={item => item.id}
      renderItem={renderItem}
      ItemSeparatorComponent={NotificationSeparator}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#2E9C50" />
      }
      contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : styles.list}
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="checkmark-done" size={52} color="#237A3B" />
              <View style={styles.emptySparkle}>
                <Ionicons name="sparkles" size={20} color="#FFFFFF" />
              </View>
            </View>
            <Text style={styles.emptyTitle}>{emptyTitle}</Text>
            <Text style={styles.emptyMessage}>{emptyMessage}</Text>
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  row: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
  },
  rowUnread: { backgroundColor: '#F3FAF5' },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowTitle: { flex: 1, color: '#38413C', fontSize: 14, fontWeight: '600', lineHeight: 19 },
  rowTitleUnread: { color: '#1F2923', fontWeight: '800' },
  rowTime: { paddingTop: 2, color: '#929A95', fontSize: 11 },
  rowText: { color: '#68726C', fontSize: 12, lineHeight: 18 },
  unreadDot: {
    width: 8,
    height: 8,
    marginTop: 7,
    borderRadius: 4,
    backgroundColor: '#2E9C50',
  },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 76, backgroundColor: '#E8ECE9' },
  emptyContainer: { flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingBottom: 70,
  },
  emptyIconWrap: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    borderRadius: 75,
    backgroundColor: '#BCECC8',
  },
  emptySparkle: {
    position: 'absolute',
    top: 32,
    right: 31,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#4CCB70',
  },
  emptyTitle: { color: '#1F2722', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  emptyMessage: {
    maxWidth: 360,
    marginTop: 10,
    color: '#7A837D',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
