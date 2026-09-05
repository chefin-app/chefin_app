import React from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AdminActivityItem } from '@/src/admin/types';

const ACTIVITY_META: Record<
  AdminActivityItem['type'],
  { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; background: string }
> = {
  report: { icon: 'flag-outline', color: '#B42318', background: '#FEE4E2' },
  verification: { icon: 'shield-checkmark-outline', color: '#9A6700', background: '#FFF1C2' },
  order: { icon: 'receipt-outline', color: '#175CD3', background: '#E8F1FF' },
  cook: { icon: 'restaurant-outline', color: '#237A3B', background: '#E8F7ED' },
  user: { icon: 'person-outline', color: '#475467', background: '#EEF0F3' },
};

const timeAgo = (iso: string): string => {
  const elapsedSeconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (elapsedSeconds < 60) return 'Just now';
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-MY', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

interface AdminNotificationFeedProps {
  items: AdminActivityItem[];
  readIds: Set<string>;
  loading: boolean;
  width: number;
  onPress: (item: AdminActivityItem) => void;
  onMarkAllRead: () => void;
}

export default function AdminNotificationFeed({
  items,
  readIds,
  loading,
  width,
  onPress,
  onMarkAllRead,
}: AdminNotificationFeedProps) {
  const hasUnread = items.some(item => item.unread && !readIds.has(item.id));

  return (
    <View style={[styles.panel, { width }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>Recent marketplace activity</Text>
        </View>
        <TouchableOpacity
          onPress={onMarkAllRead}
          disabled={!hasUnread}
          style={styles.markAllButton}
          accessibilityRole="button"
        >
          <Text style={[styles.markAllText, !hasUnread && styles.markAllTextDisabled]}>
            Mark all read
          </Text>
          <Ionicons
            name="checkmark-circle-outline"
            size={17}
            color={hasUnread ? '#258B50' : '#AAB2AD'}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#4CAF50" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="notifications-outline" size={26} color="#6B746E" />
          </View>
          <Text style={styles.emptyTitle}>You&apos;re all caught up</Text>
          <Text style={styles.emptyBody}>
            New moderation and marketplace activity will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {items.map(item => {
            const meta = ACTIVITY_META[item.type];
            const unread = item.unread && !readIds.has(item.id);
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.row, unread && { backgroundColor: meta.background }]}
                onPress={() => onPress(item)}
                activeOpacity={0.75}
                accessibilityRole="link"
                accessibilityHint="Opens the related admin record"
              >
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.icon, { backgroundColor: meta.background }]}>
                    <Ionicons name={meta.icon} size={20} color={meta.color} />
                  </View>
                )}
                <View style={styles.rowBody}>
                  <Text
                    style={[styles.rowTitle, unread && styles.rowTitleUnread]}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                  <Text style={styles.rowText} numberOfLines={1}>
                    {item.body}
                  </Text>
                  <Text style={styles.rowTime}>{timeAgo(item.createdAt)}</Text>
                </View>
                <View style={styles.rowTrailing}>
                  {unread && <View style={styles.unreadDot} />}
                  <Ionicons name="chevron-forward" size={16} color="#8E9891" />
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    maxHeight: 540,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E4EAE6',
    overflow: 'hidden',
    shadowColor: '#101B14',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1EE',
  },
  title: { fontFamily: 'mon-b', fontSize: 15, color: '#1F2923' },
  subtitle: { fontFamily: 'mon', fontSize: 10, color: '#8A938D', marginTop: 3 },
  markAllButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5 },
  markAllText: { fontFamily: 'mon-sb', fontSize: 11, color: '#258B50' },
  markAllTextDisabled: { color: '#AAB2AD' },
  loadingState: { height: 180, alignItems: 'center', justifyContent: 'center' },
  emptyState: { minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#F0F4F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontFamily: 'mon-b', fontSize: 14, color: '#26322B', marginBottom: 5 },
  emptyBody: {
    fontFamily: 'mon',
    fontSize: 11,
    lineHeight: 17,
    color: '#7B847E',
    textAlign: 'center',
  },
  list: { maxHeight: 460 },
  row: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F3F1',
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EEF2EF' },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowTitle: { fontFamily: 'mon', fontSize: 12, lineHeight: 17, color: '#344039' },
  rowTitleUnread: { fontFamily: 'mon-sb', color: '#1F2923' },
  rowText: { fontFamily: 'mon', fontSize: 10, color: '#707A73', marginTop: 2 },
  rowTime: { fontFamily: 'mon', fontSize: 10, color: '#9AA29D', marginTop: 5 },
  rowTrailing: { minHeight: 40, alignItems: 'center', justifyContent: 'space-between' },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3BA7F2', marginTop: 5 },
});
