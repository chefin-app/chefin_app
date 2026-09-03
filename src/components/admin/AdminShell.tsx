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

import { fetchAdminActivity } from '@/src/admin/api';
import { showAdminFailure, showAdminSuccess } from '@/src/admin/feedback';
import type { AdminActivityItem } from '@/src/admin/types';
import { useAdminAuth } from '@/src/admin/AdminAuthContext';
import { useAuth } from '@/src/services/auth-context';
import AdminNotificationFeed from './AdminNotificationFeed';

type NavItem = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  route?:
    | '/admin/overview'
    | '/admin/users'
    | '/admin/cooks'
    | '/admin/moderation'
    | '/admin/orders';
};

const WORKSPACE_NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: 'grid-outline', route: '/admin/overview' },
  { key: 'users', label: 'User Management', icon: 'people-outline', route: '/admin/users' },
  { key: 'cooks', label: 'Cook Management', icon: 'restaurant-outline', route: '/admin/cooks' },
  { key: 'dishes', label: 'Dish Management', icon: 'fast-food-outline' },
  {
    key: 'moderation',
    label: 'Moderation',
    icon: 'shield-checkmark-outline',
    route: '/admin/moderation',
  },
  { key: 'orders', label: 'Order Monitoring', icon: 'receipt-outline', route: '/admin/orders' },
  { key: 'payments', label: 'Payments', icon: 'card-outline' },
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
          <Ionicons name="restaurant" size={20} color="#FFFFFF" />
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
              <Ionicons name={item.icon} size={19} color={active ? '#FFFFFF' : '#59665E'} />
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
        <Ionicons name="log-out-outline" size={19} color="#B42318" />
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
                color="#344039"
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
                width={Math.min(410, width - 24)}
                onMarkRead={id => setReadIds(current => new Set(current).add(id))}
                onMarkAllRead={() => setReadIds(new Set(activity.map(item => item.id)))}
              />
            </View>
          )}
        </View>

        {comingSoon && (
          <View style={styles.comingSoonBanner}>
            <Ionicons name="sparkles-outline" size={17} color="#237A3B" />
            <Text style={styles.comingSoonText}>{comingSoon}</Text>
          </View>
        )}
        <View style={styles.content}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, flexDirection: 'row', backgroundColor: '#F4F6F8' },
  sidebar: {
    width: 248,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E8ECE9',
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
    backgroundColor: '#4CAF50',
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
    color: '#A0A8A3',
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
  navItemActive: { backgroundColor: '#4CAF50' },
  navItemText: { flex: 1, fontFamily: 'mon-sb', fontSize: 12, color: '#4B5850' },
  navItemTextActive: { color: '#FFFFFF' },
  soonDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#CDD3CF' },
  sidebarSpacer: { flex: 1, minHeight: 28 },
  logoutItem: { marginTop: 5 },
  logoutText: { fontFamily: 'mon-sb', fontSize: 12, color: '#B42318' },
  mobileOverlay: { ...StyleSheet.absoluteFill, zIndex: 100 },
  mobileBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(17, 27, 20, 0.38)' },
  mobileSidebar: { width: 282, maxWidth: '86%', height: '100%', backgroundColor: '#FFFFFF' },
  workspace: { flex: 1, minWidth: 0 },
  workspaceDesktop: { marginLeft: 0 },
  topbar: {
    position: 'relative',
    height: 72,
    backgroundColor: '#FFFFFF',
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
    borderColor: '#FFFFFF',
  },
  badgeText: { fontFamily: 'mon-b', fontSize: 8, color: '#FFFFFF' },
  profileDivider: { width: 1, height: 30, backgroundColor: '#E5EAE7', marginHorizontal: 16 },
  profileImage: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#EDF1EE' },
  profileFallback: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DFF5E6',
  },
  profileFallbackText: { fontFamily: 'mon-b', fontSize: 12, color: '#237A3B' },
  profileText: { marginLeft: 10, maxWidth: 160 },
  profileName: { fontFamily: 'mon-sb', fontSize: 12, color: '#28342D' },
  profileRole: { fontFamily: 'mon', fontSize: 9, color: '#8A938D', marginTop: 2 },
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
