import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';

type OrderStatus = 'pending' | 'confirmed' | 'ready' | 'completed' | 'cancelled';
type TabKey = 'preparing' | 'ready' | 'upcoming' | 'completed';

interface OrderRow {
  id: string;
  quantity: number;
  total_price: number;
  scheduled_date: string; // YYYY-MM-DD
  pickup_time: string | null;
  customer_note: string | null;
  fulfillment_type: 'pickup' | 'delivery';
  status: OrderStatus;
  created_at: string;
  listings: { title: string } | null;
  profiles: { full_name: string } | null;
}

interface OpeningHour {
  isoWeekday: number;
  opensAt: string;
  closesAt: string;
  enabled: boolean;
}

type StoreStatus = 'open' | 'busy' | 'paused';

const PAUSE_CHOICES: { label: string; minutes: number | 'today' }[] = [
  { label: '30 mins', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: 'Today', minutes: 'today' },
  { label: '7 days', minutes: 7 * 24 * 60 },
  { label: '30 days', minutes: 30 * 24 * 60 },
];

const TABS: { key: TabKey; label: string }[] = [
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
];

// The action that advances an order to the next stage of the workflow.
const CARD_ACTION: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  pending: { next: 'confirmed', label: 'Accept' },
  confirmed: { next: 'ready', label: 'Ready' },
  ready: { next: 'completed', label: 'Complete' },
};

/** Short human-friendly code shown in place of the raw UUID, e.g. CF-3A9. */
const shortOrderCode = (id: string): string =>
  `CF-${id.replace(/-/g, '').slice(0, 3).toUpperCase()}`;

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const localDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** 'Today', 'Tomorrow', or a short date — same convention used elsewhere in the app. */
const formatDateHeading = (dateStr: string): string => {
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((target.getTime() - todayMidnight.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 0) return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return target.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

/** "22:59 min" countdown, or null when the pickup moment has passed. */
const countdownTo = (iso: string, now: number): string | null => {
  const remaining = new Date(iso).getTime() - now;
  if (remaining <= 0) return null;
  const totalSeconds = Math.floor(remaining / 1000);
  if (totalSeconds >= 3600) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return `${h} hr ${m} min`;
  }
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} min`;
};

export default function Orders() {
  const router = useRouter();
  const { user, session } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('preparing');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [reviewedOrderIds, setReviewedOrderIds] = useState<Set<string>>(new Set());
  const [openingHours, setOpeningHours] = useState<OpeningHour[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const [storeStatus, setStoreStatus] = useState<StoreStatus>('open');
  const [busyPrepMinutes, setBusyPrepMinutes] = useState(15);
  const [pausedUntil, setPausedUntil] = useState<string | null>(null);
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<StoreStatus>('open');
  const [draftBusyMinutes, setDraftBusyMinutes] = useState(15);
  const [draftPauseIndex, setDraftPauseIndex] = useState(0);
  const [statusSaving, setStatusSaving] = useState(false);

  const ORDER_SELECT =
    'id, quantity, total_price, scheduled_date, pickup_time, customer_note, fulfillment_type, status, created_at, listings(title), profiles(full_name)';

  const getCookListingIds = useCallback(async (): Promise<string[] | null> => {
    if (!user) return null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!profile) return null;
    const { data: listings } = await supabase
      .from('listings')
      .select('id')
      .eq('cook_id', profile.id);
    return (listings ?? []).map(l => l.id);
  }, [user]);

  const fetchReviewStatuses = useCallback(
    async (loadedOrders: OrderRow[]) => {
      const completedIds = loadedOrders
        .filter(order => order.status === 'completed')
        .map(order => order.id);
      if (completedIds.length === 0 || !session?.access_token) {
        setReviewedOrderIds(new Set());
        return;
      }
      try {
        const response = await fetch(
          `${process.env.EXPO_PUBLIC_API_URL}/api/customer-reviews/status?orderIds=${encodeURIComponent(
            completedIds.join(',')
          )}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          reviewedOrderIds?: string[];
        };
        if (!response.ok) throw new Error(body.error ?? 'Review status could not be loaded.');
        setReviewedOrderIds(new Set(body.reviewedOrderIds ?? []));
      } catch (error: unknown) {
        console.warn('Error fetching customer review status:', getErrorMessage(error, 'unknown'));
        setReviewedOrderIds(new Set());
      }
    },
    [session?.access_token]
  );

  const fetchOrders = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      try {
        const ids = await getCookListingIds();
        if (!ids || ids.length === 0) {
          setOrders([]);
          return;
        }
        // Active orders (any date) plus the most recent finished ones.
        const [active, finished] = await Promise.all([
          supabase
            .from('orders')
            .select(ORDER_SELECT)
            .in('listing_id', ids)
            .in('status', ['pending', 'confirmed', 'ready'])
            .order('scheduled_date', { ascending: true })
            .order('pickup_time', { ascending: true }),
          supabase
            .from('orders')
            .select(ORDER_SELECT)
            .in('listing_id', ids)
            .in('status', ['completed', 'cancelled'])
            .order('created_at', { ascending: false })
            .limit(30),
        ]);
        if (active.error) throw active.error;
        if (finished.error) throw finished.error;
        const loaded = [
          ...((active.data ?? []) as unknown as OrderRow[]),
          ...((finished.data ?? []) as unknown as OrderRow[]),
        ];
        setOrders(loaded);
        fetchReviewStatuses(loaded);
      } catch (error: unknown) {
        console.error('Error fetching orders:', error);
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [getCookListingIds, fetchReviewStatuses]
  );

  const fetchOpeningHours = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/availability/cook/opening-hours`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const body = (await response.json().catch(() => ({}))) as {
        openingHours?: OpeningHour[];
      };
      if (response.ok) setOpeningHours(body.openingHours ?? []);
    } catch {
      // The pill quietly falls back to a neutral label.
    }
  }, [session?.access_token]);

  const fetchStoreStatus = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/availability/cook/store-status`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const body = (await response.json().catch(() => ({}))) as {
        storeStatus?: StoreStatus;
        busyPrepMinutes?: number;
        pausedUntil?: string | null;
      };
      if (response.ok) {
        setStoreStatus(body.storeStatus ?? 'open');
        setBusyPrepMinutes(body.busyPrepMinutes ?? 15);
        setPausedUntil(body.pausedUntil ?? null);
      }
    } catch {
      // The pill quietly falls back to the opening-hours label.
    }
  }, [session?.access_token]);

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
      fetchOpeningHours();
      fetchStoreStatus();
    }, [fetchOrders, fetchOpeningHours, fetchStoreStatus])
  );

  const openStatusSheet = () => {
    setDraftStatus(storeStatus);
    setDraftBusyMinutes(busyPrepMinutes);
    setDraftPauseIndex(0);
    setStatusSheetOpen(true);
  };

  const saveStoreStatus = async () => {
    if (statusSaving) return;
    setStatusSaving(true);
    try {
      let pausedUntilIso: string | undefined;
      if (draftStatus === 'paused') {
        const choice = PAUSE_CHOICES[draftPauseIndex];
        const until = new Date();
        if (choice.minutes === 'today') until.setHours(23, 59, 59, 0);
        else until.setMinutes(until.getMinutes() + choice.minutes);
        pausedUntilIso = until.toISOString();
      }
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/availability/cook/store-status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({
            status: draftStatus,
            ...(draftStatus === 'busy' ? { busyPrepMinutes: draftBusyMinutes } : {}),
            ...(pausedUntilIso ? { pausedUntil: pausedUntilIso } : {}),
          }),
        }
      );
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Store status could not be saved.');
      setStoreStatus(draftStatus);
      setBusyPrepMinutes(draftBusyMinutes);
      setPausedUntil(pausedUntilIso ?? null);
      setStatusSheetOpen(false);
    } catch (error: unknown) {
      Alert.alert(
        'Store status not saved',
        getErrorMessage(error, 'Please try again.')
      );
    } finally {
      setStatusSaving(false);
    }
  };

  // Tick every second while a countdown is on screen.
  const hasCountdown = useMemo(
    () =>
      orders.some(
        o => (o.status === 'confirmed' || o.status === 'ready') && o.pickup_time !== null
      ),
    [orders]
  );
  useEffect(() => {
    if (!hasCountdown) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasCountdown]);

  // Live order updates — a customer placing/cancelling an order, or another
  // device advancing an order's status, should show up here without a manual
  // refresh. Realtime payloads only carry raw `orders` columns (no joins), so
  // on any relevant change we just quietly re-fetch the joined view.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const ids = await getCookListingIds();
      if (cancelled || !ids || ids.length === 0) return;
      const idSet = new Set(ids);

      channel = supabase
        .channel('cook-orders-today')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          (payload: {
            new: { listing_id?: string } | null;
            old: { listing_id?: string } | null;
          }) => {
            const row = payload.new ?? payload.old;
            if (!row?.listing_id || !idSet.has(row.listing_id)) return;
            fetchOrders(false);
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [getCookListingIds, fetchOrders]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOrders(false);
    setRefreshing(false);
  };

  // Order status writes go through the backend's service-role client, not the
  // client-side Supabase call — orders are RLS-owned by the customer
  // (customer_id), so a cook's own anon-key update silently touches 0 rows
  // instead of erroring, which made "Accept order" look like it worked in the
  // UI while the database never changed.
  const advanceOrder = async (order: OrderRow) => {
    const action = CARD_ACTION[order.status];
    if (!action || updatingId) return;
    setUpdatingId(order.id);
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/orders/${order.id}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({ status: action.next, userId: user?.id }),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Failed to update order status.');
      }
      setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, status: action.next } : o)));
    } catch (error: unknown) {
      console.error('Could not update order:', getErrorMessage(error, 'Unknown error'));
      fetchOrders(false);
    } finally {
      setUpdatingId(null);
    }
  };

  const todayKey = localDateKey(new Date());

  // Upcoming = awaiting acceptance (any date) or accepted for a future date.
  // Preparing/Ready = accepted work for today. Completed = finished orders.
  const ordersByTab = useMemo(() => {
    const map: Record<TabKey, OrderRow[]> = {
      preparing: [],
      ready: [],
      upcoming: [],
      completed: [],
    };
    for (const o of orders) {
      if (o.status === 'pending') map.upcoming.push(o);
      else if (o.status === 'confirmed') {
        if (o.scheduled_date > todayKey) map.upcoming.push(o);
        else map.preparing.push(o);
      } else if (o.status === 'ready') map.ready.push(o);
      else map.completed.push(o);
    }
    return map;
  }, [orders, todayKey]);

  // Group the active tab's orders under date headers (Today / Tomorrow / ...).
  const groupedForTab = useMemo(() => {
    const list = ordersByTab[activeTab];
    const groups: { date: string; orders: OrderRow[] }[] = [];
    for (const o of list) {
      let group = groups.find(g => g.date === o.scheduled_date);
      if (!group) {
        group = { date: o.scheduled_date, orders: [] };
        groups.push(group);
      }
      group.orders.push(o);
    }
    return groups;
  }, [ordersByTab, activeTab]);

  const openUntilLabel = useMemo(() => {
    const isoToday = ((new Date().getDay() + 6) % 7) + 1; // Mon=1 … Sun=7
    const todaysWindows = openingHours
      .filter(w => w.enabled && w.isoWeekday === isoToday)
      .sort((a, b) => (a.closesAt < b.closesAt ? 1 : -1));
    if (todaysWindows.length === 0) return openingHours.length ? 'Closed today' : 'Business hours';
    const closes = todaysWindows[0].closesAt.slice(0, 5);
    const [h, m] = closes.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `Open until ${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
  }, [openingHours]);

  // What the header pill shows: the cook-set status wins over opening hours.
  const pillState = useMemo((): { label: string; dot: 'open' | 'busy' | 'paused' | 'closed' } => {
    if (storeStatus === 'paused' && pausedUntil) {
      const until = new Date(pausedUntil);
      const sameDay = localDateKey(until) === localDateKey(new Date());
      const label = sameDay
        ? `Paused until ${formatTime(pausedUntil)}`
        : `Paused until ${until.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      return { label, dot: 'paused' };
    }
    if (storeStatus === 'busy') {
      return { label: `Busy · ${busyPrepMinutes} min prep`, dot: 'busy' };
    }
    return {
      label: openUntilLabel,
      dot: openUntilLabel.startsWith('Closed') ? 'closed' : 'open',
    };
  }, [storeStatus, pausedUntil, busyPrepMinutes, openUntilLabel]);

  const openDetail = (order: OrderRow) => {
    router.push({ pathname: '/(cook)/order/[orderId]', params: { orderId: order.id } });
  };

  const renderCardSubtitle = (order: OrderRow): string => {
    if (order.status === 'cancelled') return 'Cancelled';
    if (order.status === 'completed')
      return `Completed · ${formatDateHeading(order.scheduled_date)}`;
    if (order.status === 'pending') {
      const when = order.pickup_time ? ` · ${formatTime(order.pickup_time)}` : '';
      return `Needs acceptance · ${formatDateHeading(order.scheduled_date)}${when}`;
    }
    if (!order.pickup_time) {
      return order.status === 'ready'
        ? 'Awaiting pickup'
        : `Prepare for ${formatDateHeading(order.scheduled_date)}`;
    }
    const remaining = countdownTo(order.pickup_time, now);
    if (order.status === 'confirmed') {
      return remaining ? `Ready in: ${remaining}` : 'Pickup time reached';
    }
    return remaining ? `${remaining} till pickup` : 'Customer due for pickup';
  };

  const renderOrderCard = (order: OrderRow) => {
    const action = CARD_ACTION[order.status];
    const busy = updatingId === order.id;
    const reviewed = reviewedOrderIds.has(order.id);
    return (
      <TouchableOpacity
        key={order.id}
        style={styles.orderCard}
        activeOpacity={0.75}
        onPress={() => openDetail(order)}
      >
        <View style={styles.orderCardBody}>
          <Text style={styles.orderCode}>{shortOrderCode(order.id)}</Text>
          <Text
            style={[styles.orderSubtitle, order.status === 'cancelled' && styles.orderCancelled]}
            numberOfLines={1}
          >
            {renderCardSubtitle(order)}
          </Text>
          <Text style={styles.orderMeta}>
            {order.quantity} item{order.quantity === 1 ? '' : 's'}
            {order.customer_note ? '  ·  has note' : ''}
          </Text>
        </View>
        {action ? (
          <TouchableOpacity
            style={[styles.cardAction, busy && styles.cardActionDisabled]}
            disabled={busy}
            onPress={event => {
              event.stopPropagation();
              advanceOrder(order);
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.cardActionText}>{action.label}</Text>
            )}
          </TouchableOpacity>
        ) : order.status === 'completed' ? (
          <TouchableOpacity
            style={[styles.reviewButton, reviewed && styles.reviewButtonDone]}
            onPress={event => {
              event.stopPropagation();
              router.push({
                pathname: '/(cook)/review-customer/[orderId]',
                params: { orderId: order.id },
              });
            }}
          >
            <Ionicons
              name={reviewed ? 'checkmark-circle' : 'person-outline'}
              size={14}
              color={reviewed ? '#2E7D32' : '#237A3B'}
            />
            <Text style={[styles.reviewButtonText, reviewed && styles.reviewButtonTextDone]}>
              {reviewed ? 'Reviewed' : 'Review'}
            </Text>
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-forward" size={22} color="#5F6368" />
        )}
      </TouchableOpacity>
    );
  };

  const renderTab = ({ key, label }: (typeof TABS)[number]) => {
    const isActive = activeTab === key;
    const count =
      key === 'completed'
        ? 0 // finished work needs no attention badge
        : ordersByTab[key].length;
    return (
      <TouchableOpacity key={key} style={styles.tab} onPress={() => setActiveTab(key)}>
        <View style={styles.tabLabelRow}>
          <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{label}</Text>
          {count > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{count}</Text>
            </View>
          )}
        </View>
        {isActive && <View style={styles.tabIndicator} />}
      </TouchableOpacity>
    );
  };

  const renderList = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#00A651" />
        </View>
      );
    }
    if (groupedForTab.length === 0) {
      return (
        <ScrollView
          contentContainerStyle={styles.emptyState}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.emptyIcon}>
            <Ionicons name="receipt-outline" size={26} color="#666" />
          </View>
          <Text style={styles.emptyText}>
            Nothing here right now — new orders will show up automatically.
          </Text>
        </ScrollView>
      );
    }
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {groupedForTab.map(group => (
          <View key={group.date}>
            {activeTab === 'upcoming' && (
              <Text style={styles.dateHeading}>{formatDateHeading(group.date)}</Text>
            )}
            {group.orders.map(renderOrderCard)}
          </View>
        ))}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
        <TouchableOpacity style={styles.hoursPill} onPress={openStatusSheet}>
          <View
            style={[
              styles.hoursDot,
              pillState.dot === 'busy' && styles.hoursDotBusy,
              (pillState.dot === 'paused' || pillState.dot === 'closed') && styles.hoursDotClosed,
            ]}
          />
          <Text style={styles.hoursText} numberOfLines={1}>
            {pillState.label}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#333" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.helpButton}
          onPress={() => router.push('/(cook)/help-support')}
          hitSlop={6}
        >
          <Ionicons name="help-circle-outline" size={28} color="#1A1A1A" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {TABS.map(renderTab)}
        </ScrollView>
      </View>
      <View style={styles.tabsDivider} />

      {renderList()}

      <Modal
        visible={statusSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!statusSaving) setStatusSheetOpen(false);
        }}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            disabled={statusSaving}
            onPress={() => setStatusSheetOpen(false)}
          />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Set store status</Text>

            <View style={styles.statusCard}>
              <TouchableOpacity
                style={styles.statusRow}
                onPress={() => setDraftStatus('open')}
                disabled={statusSaving}
              >
                <View style={[styles.statusDot, styles.statusDotOpen]} />
                <View style={styles.statusCopy}>
                  <Text style={styles.statusTitle}>{openUntilLabel}</Text>
                </View>
                {draftStatus === 'open' && (
                  <Ionicons name="checkmark-circle" size={28} color="#00A651" />
                )}
              </TouchableOpacity>

              <View style={styles.statusDivider} />

              <TouchableOpacity
                style={styles.statusRow}
                onPress={() => setDraftStatus('busy')}
                disabled={statusSaving}
              >
                <View style={[styles.statusDot, styles.statusDotBusy]} />
                <View style={styles.statusCopy}>
                  <Text style={styles.statusTitle}>Busy</Text>
                  <Text style={styles.statusHint}>
                    {draftStatus === 'busy'
                      ? 'How much time do you need to prepare each upcoming order?'
                      : 'Adjust the preparation time for orders'}
                  </Text>
                  {draftStatus === 'busy' && (
                    <View style={styles.stepperRow}>
                      <TouchableOpacity
                        style={[
                          styles.stepperButton,
                          draftBusyMinutes <= 5 && styles.stepperButtonDisabled,
                        ]}
                        disabled={draftBusyMinutes <= 5 || statusSaving}
                        onPress={() => setDraftBusyMinutes(m => Math.max(5, m - 5))}
                      >
                        <Ionicons name="remove" size={24} color="#5F6368" />
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>{draftBusyMinutes} mins</Text>
                      <TouchableOpacity
                        style={[
                          styles.stepperButton,
                          styles.stepperButtonPlus,
                          draftBusyMinutes >= 240 && styles.stepperButtonDisabled,
                        ]}
                        disabled={draftBusyMinutes >= 240 || statusSaving}
                        onPress={() => setDraftBusyMinutes(m => Math.min(240, m + 5))}
                      >
                        <Ionicons name="add" size={24} color="#00794F" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                {draftStatus === 'busy' && (
                  <Ionicons name="checkmark-circle" size={28} color="#00A651" />
                )}
              </TouchableOpacity>

              <View style={styles.statusDivider} />

              <TouchableOpacity
                style={styles.statusRow}
                onPress={() => setDraftStatus('paused')}
                disabled={statusSaving}
              >
                <View style={[styles.statusDot, styles.statusDotPaused]} />
                <View style={styles.statusCopy}>
                  <Text style={styles.statusTitle}>Paused</Text>
                  <Text style={styles.statusHint}>
                    {draftStatus === 'paused'
                      ? 'How long do you want to stop incoming orders for?'
                      : 'Stop incoming orders'}
                  </Text>
                  {draftStatus === 'paused' && (
                    <View style={styles.pauseChips}>
                      {PAUSE_CHOICES.map((choice, index) => (
                        <TouchableOpacity
                          key={choice.label}
                          style={[
                            styles.pauseChip,
                            draftPauseIndex === index && styles.pauseChipSelected,
                          ]}
                          disabled={statusSaving}
                          onPress={() => setDraftPauseIndex(index)}
                        >
                          <Text
                            style={[
                              styles.pauseChipText,
                              draftPauseIndex === index && styles.pauseChipTextSelected,
                            ]}
                          >
                            {choice.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                {draftStatus === 'paused' && (
                  <Ionicons name="checkmark-circle" size={28} color="#00A651" />
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.scheduleHint}>Any changes in your schedule?</Text>
            <TouchableOpacity
              onPress={() => {
                setStatusSheetOpen(false);
                router.push('/(cook)/business-hours');
              }}
            >
              <Text style={styles.scheduleLink}>Update business hours</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmButton, statusSaving && styles.confirmButtonDisabled]}
              onPress={saveStoreStatus}
              disabled={statusSaving}
            >
              {statusSaving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>Confirm</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
  },
  headerTitle: { flex: 1, fontSize: 28, fontWeight: '800', color: '#1A1A1A' },
  hoursPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: '#D7DBD8',
    borderRadius: 22,
    paddingHorizontal: 13,
    paddingVertical: 9,
    maxWidth: 220,
  },
  hoursDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00C853' },
  hoursDotBusy: { backgroundColor: '#F5A623' },
  hoursDotClosed: { backgroundColor: '#C62828' },
  hoursText: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', flexShrink: 1 },
  helpButton: { padding: 2 },
  tabs: { paddingHorizontal: 12 },
  tab: { paddingHorizontal: 12, paddingTop: 6 },
  tabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 11 },
  tabText: { fontSize: 16, fontWeight: '600', color: '#3C4440' },
  tabTextActive: { color: '#00794F', fontWeight: '800' },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: '#D93025',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  tabIndicator: { height: 3, borderRadius: 2, backgroundColor: '#00794F' },
  tabsDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#D8DCD8' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  dateHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 6,
    marginLeft: 4,
  },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#DADEDA',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  orderCardBody: { flex: 1 },
  orderCode: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', marginBottom: 5 },
  orderSubtitle: { fontSize: 15, color: '#333934', marginBottom: 6 },
  orderCancelled: { color: '#C62828' },
  orderMeta: { fontSize: 13, color: '#9AA19B' },
  cardAction: {
    backgroundColor: '#00A651',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 12,
    minWidth: 96,
    alignItems: 'center',
  },
  cardActionDisabled: { opacity: 0.6 },
  cardActionText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#A5D6A7',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  reviewButtonDone: { borderColor: '#D5EAD8', backgroundColor: '#F1F8F4' },
  reviewButtonText: { fontSize: 12, fontWeight: '700', color: '#237A3B' },
  reviewButtonTextDone: { color: '#2E7D32' },
  emptyState: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EFF1EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  emptyText: { fontSize: 14, color: '#666666', textAlign: 'center', maxWidth: 260, lineHeight: 20 },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,28,23,0.5)',
  },
  sheet: {
    backgroundColor: '#F7F8F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 34,
  },
  sheetTitle: { fontSize: 26, fontWeight: '800', color: '#1A1A1A', marginBottom: 18 },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5E1',
    borderRadius: 18,
    paddingHorizontal: 18,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 18,
  },
  statusDot: { width: 14, height: 14, borderRadius: 7, marginTop: 4 },
  statusDotOpen: { backgroundColor: '#00C853' },
  statusDotBusy: { backgroundColor: '#F5A623' },
  statusDotPaused: { backgroundColor: '#F05545' },
  statusCopy: { flex: 1 },
  statusTitle: { fontSize: 19, fontWeight: '700', color: '#1A1A1A' },
  statusHint: { fontSize: 16, color: '#5F6368', marginTop: 6, lineHeight: 22 },
  statusDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#DCE0DC' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 26,
    marginTop: 16,
    marginBottom: 4,
  },
  stepperButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D7DBD8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  stepperButtonPlus: { backgroundColor: '#D9F2E3', borderColor: '#D9F2E3' },
  stepperButtonDisabled: { opacity: 0.4 },
  stepperValue: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', minWidth: 84, textAlign: 'center' },
  pauseChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  pauseChip: {
    borderWidth: 1,
    borderColor: '#D7DBD8',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
  },
  pauseChipSelected: { backgroundColor: '#D9F2E3', borderColor: '#00A651' },
  pauseChipText: { fontSize: 16, color: '#3C4440' },
  pauseChipTextSelected: { color: '#00794F', fontWeight: '700' },
  scheduleHint: { fontSize: 15, color: '#5F6368', textAlign: 'center', marginTop: 22 },
  scheduleLink: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1473E6',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  confirmButton: {
    backgroundColor: '#00A651',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonDisabled: { opacity: 0.6 },
  confirmButtonText: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
});
