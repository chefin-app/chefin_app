import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';

import { fetchAdminActivity, markAdminActivityRead } from '@/src/admin/api';
import { showAdminFailure, showAdminSuccess } from '@/src/admin/feedback';
import type { AdminActivityItem } from '@/src/admin/types';
import { useAdminAuth } from '@/src/admin/AdminAuthContext';
import { useAuth } from '@/src/services/auth-context';
import AdminNotificationFeed from './AdminNotificationFeed';
import { ADMIN_THEME } from '@/src/admin/theme';

type NavItem = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  route?:
    | '/admin/overview'
    | '/admin/users'
    | '/admin/cooks'
    | '/admin/dishes'
    | '/admin/moderation'
    | '/admin/orders'
    | '/admin/payments';
};

const WORKSPACE_NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: 'grid-outline', route: '/admin/overview' },
  { key: 'users', label: 'User Management', icon: 'people-outline', route: '/admin/users' },
  {
    key: 'dishes',
    label: 'Dish Management',
    icon: 'fast-food-outline',
    route: '/admin/dishes',
  },
  { key: 'cooks', label: 'Cook Management', icon: 'restaurant-outline', route: '/admin/cooks' },
  {
    key: 'moderation',
    label: 'Moderation',
    icon: 'shield-checkmark-outline',
    route: '/admin/moderation',
  },
  { key: 'orders', label: 'Order Monitoring', icon: 'receipt-outline', route: '/admin/orders' },
  { key: 'payments', label: 'Payments', icon: 'card-outline', route: '/admin/payments' },
];
const SETTINGS_ITEM: NavItem = { key: 'settings', label: 'Settings', icon: 'settings-outline' };

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'A';

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const pathname = usePathname();
  const { session, signOut } = useAuth();
  const { admin } = useAdminAuth();
  const desktop = width >= 1024;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [activity, setActivity] = useState<AdminActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [comingSoon, setComingSoon] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    if (!session?.access_token) return;
    setActivityLoading(true);
    try {
      setActivity(await fetchAdminActivity(session.access_token));
    } catch (error: unknown) {
      console.warn('Could not load admin activity', error);
      setActivity([]);
    } finally {
      setActivityLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    if (!comingSoon) return;
    const timeout = setTimeout(() => setComingSoon(null), 2600);
    return () => clearTimeout(timeout);
  }, [comingSoon]);

  const unreadCount = useMemo(
    () => activity.filter(item => item.unread && !readIds.has(item.id)).length,
    [activity, readIds]
  );

  const persistReadIds = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (!session?.access_token || ids.length === 0) return false;
      try {
        await markAdminActivityRead(session.access_token, ids);
        return true;
      } catch (error: unknown) {
        console.warn('Could not persist admin notification read state', error);
        return false;
      }
    },
    [session?.access_token]
  );

  const openNotification = (item: AdminActivityItem) => {
    setReadIds(current => new Set(current).add(item.id));
    persistReadIds([item.id]);
    setNotificationsOpen(false);
    router.push({ pathname: item.deepLink.pathname, params: item.deepLink.params });
  };

  const markAllNotificationsRead = async () => {
    const ids = activity.filter(item => item.unread && !readIds.has(item.id)).map(item => item.id);
    if (ids.length === 0 || markingAllRead) return;
    setMarkingAllRead(true);
    const persisted = await persistReadIds(ids);
    if (persisted) {
      setReadIds(current => new Set([...current, ...ids]));
    } else {
      showAdminFailure(
        new Error('Notification read state could not be saved.'),
        'The notifications are still unread. Please try again.',
        'Could not mark notifications as read'
      );
    }
    setMarkingAllRead(false);
  };

  const selectNav = (item: NavItem) => {
    setMobileMenuOpen(false);
    if (item.route) router.replace(item.route);
    else setComingSoon(`${item.label} is queued for the next admin dashboard phase.`);
  };

  const handleLogout = async () => {
    const { error } = await signOut();
    if (error) {
      showAdminFailure(
        new Error(error),
        'Your admin session could not be signed out.',
        'Logout failed'
      );
      return;
    }
    showAdminSuccess('Signed out', 'You have been signed out of the admin dashboard.');
    router.replace('/admin/login');
  };

  const navContent = (
    <View style={styles.sidebarInner}>
      <View style={styles.brandRow}>
        <View style={styles.brandIcon}>
          <Ionicons name="restaurant" size={20} color={ADMIN_THEME.colors.textOnAction} />
        </View>
        <View>
          <Text style={styles.brandName}>Chefin</Text>
          <Text style={styles.brandTag}>ADMIN CONSOLE</Text>
        </View>
        {!desktop && (
          <TouchableOpacity style={styles.closeMenuButton} onPress={() => setMobileMenuOpen(false)}>
            <Ionicons name="close" size={23} color="#526058" />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.navLabel}>WORKSPACE</Text>
      <View style={styles.navList}>
        {WORKSPACE_NAV_ITEMS.map(item => {
          const active = item.route ? pathname === item.route : false;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => selectNav(item)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityHint={item.route ? undefined : 'Planned for a later dashboard phase'}
            >
              <Ionicons
                name={item.icon}
                size={19}
                color={active ? ADMIN_THEME.colors.surface : '#59665E'}
              />
              <Text style={[styles.navItemText, active && styles.navItemTextActive]}>
                {item.label}
              </Text>
              {!item.route && <View style={styles.soonDot} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.sidebarSpacer} />
      <Text style={styles.navLabel}>SYSTEM</Text>
      <TouchableOpacity style={styles.navItem} onPress={() => selectNav(SETTINGS_ITEM)}>
        <Ionicons name="settings-outline" size={19} color="#59665E" />
        <Text style={styles.navItemText}>Settings</Text>
        <View style={styles.soonDot} />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.navItem, styles.logoutItem]} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={19} color={ADMIN_THEME.colors.red} />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.page}>
      {desktop ? (
        <View style={styles.sidebar}>{navContent}</View>
      ) : (
        mobileMenuOpen && (
          <View style={styles.mobileOverlay}>
            <Pressable style={styles.mobileBackdrop} onPress={() => setMobileMenuOpen(false)} />
            <View style={styles.mobileSidebar}>{navContent}</View>
          </View>
        )
      )}

      <View style={[styles.workspace, desktop && styles.workspaceDesktop]}>
        <View style={styles.topbar}>
          {!desktop && (
            <TouchableOpacity style={styles.topbarButton} onPress={() => setMobileMenuOpen(true)}>
              <Ionicons name="menu" size={23} color="#2C3931" />
            </TouchableOpacity>
          )}
          {!desktop && <Text style={styles.mobileTitle}>Chefin Admin</Text>}
          <View style={styles.topbarSpacer} />
          <View style={styles.notificationAnchor}>
            <TouchableOpacity
              style={[styles.topbarButton, notificationsOpen && styles.topbarButtonActive]}
              onPress={() => setNotificationsOpen(open => !open)}
              accessibilityRole="button"
              accessibilityLabel={`${unreadCount} unread admin notifications`}
            >
              <Ionicons
                name={notificationsOpen ? 'notifications' : 'notifications-outline'}
                size={22}
                color={ADMIN_THEME.colors.textStrong}
              />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.profileDivider} />
          {admin?.profileImage ? (
            <Image source={{ uri: admin.profileImage }} style={styles.profileImage} />
          ) : (
            <View style={styles.profileFallback}>
              <Text style={styles.profileFallbackText}>{initials(admin?.fullName ?? 'Admin')}</Text>
            </View>
          )}
          {width >= 650 && (
            <View style={styles.profileText}>
              <Text style={styles.profileName} numberOfLines={1}>
                {admin?.fullName ?? 'Chefin Admin'}
              </Text>
              <Text style={styles.profileRole}>Administrator</Text>
            </View>
          )}
          {notificationsOpen && (
            <View style={styles.notificationPopover}>
              <AdminNotificationFeed
                items={activity}
                readIds={readIds}
                loading={activityLoading}
                markingAllRead={markingAllRead}
                width={Math.min(410, width - 24)}
                onPress={openNotification}
                onMarkAllRead={markAllNotificationsRead}
              />
            </View>
          )}
        </View>

        {comingSoon && (
          <View style={styles.comingSoonBanner}>
            <Ionicons name="sparkles-outline" size={17} color={ADMIN_THEME.colors.greenDark} />
            <Text style={styles.comingSoonText}>{comingSoon}</Text>
          </View>
        )}
        <View style={styles.content}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, flexDirection: 'row', backgroundColor: ADMIN_THEME.colors.page },
  sidebar: {
    width: 248,
    backgroundColor: ADMIN_THEME.colors.surface,
    borderRightWidth: 1,
    borderRightColor: ADMIN_THEME.colors.borderSoft,
  },
  sidebarInner: { flex: 1, paddingHorizontal: 18, paddingTop: 24, paddingBottom: 20 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 7,
    marginBottom: 42,
  },
  brandIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: ADMIN_THEME.colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontFamily: 'mon-b', fontSize: 17, color: '#1C2B22' },
  brandTag: {
    fontFamily: 'mon-sb',
    fontSize: 8,
    letterSpacing: 1.1,
    color: '#929B95',
    marginTop: 2,
  },
  closeMenuButton: { marginLeft: 'auto', padding: 8 },
  navLabel: {
    fontFamily: 'mon-b',
    fontSize: 9,
    letterSpacing: 1.3,
    color: ADMIN_THEME.colors.textSubtle,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  navList: { gap: 5 },
  navItem: {
    minHeight: 44,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
  },
  navItemActive: { backgroundColor: ADMIN_THEME.colors.green },
  navItemText: { flex: 1, fontFamily: 'mon-sb', fontSize: 12, color: '#4B5850' },
  navItemTextActive: { color: ADMIN_THEME.colors.textOnAction },
  soonDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#CDD3CF' },
  sidebarSpacer: { flex: 1, minHeight: 28 },
  logoutItem: { marginTop: 5 },
  logoutText: { fontFamily: 'mon-sb', fontSize: 12, color: ADMIN_THEME.colors.red },
  mobileOverlay: { ...StyleSheet.absoluteFill, zIndex: 100 },
  mobileBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(17, 27, 20, 0.38)' },
  mobileSidebar: {
    width: 282,
    maxWidth: '86%',
    height: '100%',
    backgroundColor: ADMIN_THEME.colors.surface,
  },
  workspace: { flex: 1, minWidth: 0 },
  workspaceDesktop: { marginLeft: 0 },
  topbar: {
    position: 'relative',
    height: 72,
    backgroundColor: ADMIN_THEME.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#E9EDEA',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    zIndex: 50,
  },
  topbarButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7F5',
  },
  topbarButtonActive: { backgroundColor: '#E8F7ED' },
  mobileTitle: { fontFamily: 'mon-b', fontSize: 15, color: '#253029', marginLeft: 12 },
  topbarSpacer: { flex: 1 },
  notificationAnchor: { position: 'relative' },
  notificationPopover: { position: 'absolute', top: 64, right: 12, zIndex: 80 },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F04438',
    borderWidth: 2,
    borderColor: ADMIN_THEME.colors.surface,
  },
  badgeText: { fontFamily: 'mon-b', fontSize: 8, color: ADMIN_THEME.colors.textOnAction },
  profileDivider: { width: 1, height: 30, backgroundColor: '#E5EAE7', marginHorizontal: 16 },
  profileImage: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: ADMIN_THEME.colors.borderSoft,
  },
  profileFallback: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DFF5E6',
  },
  profileFallbackText: { fontFamily: 'mon-b', fontSize: 12, color: ADMIN_THEME.colors.greenDark },
  profileText: { marginLeft: 10, maxWidth: 160 },
  profileName: { fontFamily: 'mon-sb', fontSize: 12, color: '#28342D' },
  profileRole: {
    fontFamily: 'mon',
    fontSize: 9,
    color: ADMIN_THEME.colors.textMuted,
    marginTop: 2,
  },
  comingSoonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E9F8EE',
    borderBottomWidth: 1,
    borderBottomColor: '#D3EFDC',
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  comingSoonText: { flex: 1, fontFamily: 'mon-sb', fontSize: 11, color: '#28613A' },
  content: { flex: 1, zIndex: 0 },
});
