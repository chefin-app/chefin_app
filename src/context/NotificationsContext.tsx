import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';
import type { NotificationType } from '@/src/constants/notificationTypes';

export type NotificationRole = 'customer' | 'cook';

export interface AppNotification {
  id: string;
  user_id: string;
  recipient_role: NotificationRole;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

/**
 * One account can be both a customer and a cook. Every notification is
 * stamped with the mode it belongs to, so the customer bell/feed never shows
 * cook notifications (new orders, payouts, approvals) and vice versa.
 */
interface NotificationsContextType {
  notifications: AppNotification[];
  /** Unread count per app mode — each navbar badge uses its own. */
  unreadCounts: Record<NotificationRole, number>;
  loading: boolean;
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  /** Scoped to one mode: clearing the cook feed leaves customer unreads. */
  markAllAsRead: (role: NotificationRole) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

/** How many recent notifications the centre keeps in memory. */
const FETCH_LIMIT = 50;

export const NotificationsProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  // Guards against a stale fetch resolving after the user changed (signout /
  // account switch).
  const activeUserRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT);
      if (error) throw error;
      if (activeUserRef.current === userId) {
        setNotifications((data ?? []) as AppNotification[]);
      }
    } catch (e: any) {
      console.warn('Could not load notifications', e.message ?? e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Initial load + live inserts. The backend creates rows when order events
  // happen; realtime pushes them here so the bell badge updates instantly.
  useEffect(() => {
    activeUserRef.current = userId;
    if (!userId) {
      setNotifications([]);
      return;
    }
    refresh();

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        payload => {
          const row = payload.new as AppNotification;
          setNotifications(prev =>
            prev.some(n => n.id === row.id) ? prev : [row, ...prev].slice(0, FETCH_LIMIT)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  const markAsRead = useCallback(
    async (id: string) => {
      const target = notifications.find(n => n.id === id);
      if (!target || target.read) return;
      // Optimistic — flip locally, then persist under the user's own RLS grant.
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
      if (error) {
        console.warn('Could not mark notification read', error.message);
        setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: false } : n)));
      }
    },
    [notifications]
  );

  const markAllAsRead = useCallback(
    async (role: NotificationRole) => {
      if (!userId) return;
      const unreadIds = notifications
        .filter(n => !n.read && n.recipient_role === role)
        .map(n => n.id);
      if (unreadIds.length === 0) return;
      setNotifications(prev =>
        prev.map(n => (!n.read && n.recipient_role === role ? { ...n, read: true } : n))
      );
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('recipient_role', role)
        .eq('read', false);
      if (error) {
        console.warn('Could not mark all notifications read', error.message);
        setNotifications(prev =>
          prev.map(n => (unreadIds.includes(n.id) ? { ...n, read: false } : n))
        );
      }
    },
    [userId, notifications]
  );

  const unreadCounts = notifications.reduce<Record<NotificationRole, number>>(
    (counts, n) => {
      if (!n.read) counts[n.recipient_role] += 1;
      return counts;
    },
    { customer: 0, cook: 0 }
  );

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCounts, loading, refresh, markAsRead, markAllAsRead }}
    >
      {children}
    </NotificationsContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider');
  return ctx;
};
