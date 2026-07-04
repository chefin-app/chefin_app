import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';

// Active statuses a cook is expected to act on, in workflow order.
type ActiveStatus = 'pending' | 'confirmed' | 'ready';
type OrderStatus = ActiveStatus | 'completed' | 'cancelled';

interface OrderRow {
  id: string;
  quantity: number;
  total_price: number;
  scheduled_date: string; // YYYY-MM-DD
  pickup_time: string | null;
  status: OrderStatus;
  created_at: string;
  listings: { title: string; image_url: string | null } | null;
  profiles: { full_name: string } | null;
}

const TABS: { status: ActiveStatus; label: string }[] = [
  { status: 'pending', label: 'New orders' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'ready', label: 'Pickup' },
];

// The action that advances an order to the next stage of the workflow.
const NEXT_ACTION: Record<ActiveStatus, { next: OrderStatus; label: string }> = {
  pending: { next: 'confirmed', label: 'Accept order' },
  confirmed: { next: 'ready', label: 'Mark ready' },
  ready: { next: 'completed', label: 'Complete pickup' },
};

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

const formatMoney = (n: number): string => `RM ${n.toFixed(2)}`;

/** 'Today', 'Tomorrow', or a short date — same convention used elsewhere in the app. */
const formatDateHeading = (dateStr: string): string => {
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(dateStr + 'T00:00:00');
  const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diff = Math.round((targetMidnight.getTime() - todayMidnight.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 0) return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return target.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function Today() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveStatus>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyOrders, setHistoryOrders] = useState<OrderRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const ORDER_SELECT =
    'id, quantity, total_price, scheduled_date, pickup_time, status, created_at, listings(title, image_url), profiles(full_name)';

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

  const fetchOrders = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      try {
        const ids = await getCookListingIds();
        if (!ids || ids.length === 0) {
          setOrders([]);
          return;
        }
        const { data, error } = await supabase
          .from('orders')
          .select(ORDER_SELECT)
          .in('listing_id', ids)
          .in('status', ['pending', 'confirmed', 'ready'])
          .order('scheduled_date', { ascending: true })
          .order('pickup_time', { ascending: true });
        if (error) throw error;
        setOrders((data ?? []) as unknown as OrderRow[]);
      } catch (e: any) {
        console.error('Error fetching orders:', e.message ?? e);
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [getCookListingIds]
  );

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders])
  );

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

  const openHistory = async () => {
    setHistoryVisible(true);
    setHistoryLoading(true);
    try {
      const ids = await getCookListingIds();
      if (!ids || ids.length === 0) {
        setHistoryOrders([]);
        return;
      }
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .in('listing_id', ids)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setHistoryOrders((data ?? []) as unknown as OrderRow[]);
    } catch (e: any) {
      console.error('Error fetching order history:', e.message ?? e);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Order status writes go through the backend's service-role client, not the
  // client-side Supabase call — orders are RLS-owned by the customer
  // (customer_id), so a cook's own anon-key update silently touches 0 rows
  // instead of erroring, which made "Accept order" look like it worked in the
  // UI while the database never changed.
  const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
    const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, userId: user?.id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { error?: string });
      throw new Error(body.error || 'Failed to update order status.');
    }
  };

  const advanceOrder = async (order: OrderRow) => {
    const action = NEXT_ACTION[order.status as ActiveStatus];
    if (!action || updatingId) return;
    setUpdatingId(order.id);
    try {
      await updateOrderStatus(order.id, action.next);
      setOrders(prev =>
        action.next === 'completed'
          ? prev.filter(o => o.id !== order.id)
          : prev.map(o => (o.id === order.id ? { ...o, status: action.next } : o))
      );
    } catch (e: any) {
      Alert.alert('Could not update order', e.message ?? 'Unknown error');
    } finally {
      setUpdatingId(null);
    }
  };

  const cancelOrder = (order: OrderRow) => {
    Alert.alert('Cancel this order?', 'The customer will need to be refunded outside the app.', [
      { text: 'Keep order', style: 'cancel' },
      {
        text: 'Cancel order',
        style: 'destructive',
        onPress: async () => {
          setUpdatingId(order.id);
          try {
            await updateOrderStatus(order.id, 'cancelled');
            setOrders(prev => prev.filter(o => o.id !== order.id));
          } catch (e: any) {
            Alert.alert('Could not cancel order', e.message ?? 'Unknown error');
          } finally {
            setUpdatingId(null);
          }
        },
      },
    ]);
  };

  const ordersByStatus = useMemo(() => {
    const map: Record<ActiveStatus, OrderRow[]> = { pending: [], confirmed: [], ready: [] };
    for (const o of orders) {
      if (o.status in map) map[o.status as ActiveStatus].push(o);
    }
    return map;
  }, [orders]);

  // Group the active tab's orders under date headers (Today / Tomorrow / ...).
  const groupedForTab = useMemo(() => {
    const list = ordersByStatus[activeTab];
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
  }, [ordersByStatus, activeTab]);

  const totalActive = orders.length;

  const renderOrderCard = (order: OrderRow) => {
    const action = NEXT_ACTION[order.status as ActiveStatus];
    const busy = updatingId === order.id;
    return (
      <View key={order.id} style={styles.orderCard}>
        <View style={styles.orderCardHeader}>
          <Text style={styles.orderCustomer} numberOfLines={1}>
            {order.profiles?.full_name ?? 'Customer'}
          </Text>
          {order.pickup_time && (
            <View style={styles.pickupPill}>
              <Ionicons name="time-outline" size={12} color="#2E7D32" />
              <Text style={styles.pickupPillText}>{formatTime(order.pickup_time)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.orderItem} numberOfLines={1}>
          {order.quantity}× {order.listings?.title ?? 'Dish'}
        </Text>
        <Text style={styles.orderTotal}>{formatMoney(Number(order.total_price))}</Text>

        <View style={styles.orderActions}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => cancelOrder(order)}
            disabled={busy}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          {action && (
            <TouchableOpacity
              style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
              onPress={() => advanceOrder(order)}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.actionBtnText}>{action.label}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <View style={styles.checkIcon}>
        <Ionicons name="checkmark" size={26} color="#666" />
      </View>
      <Text style={styles.emptyStateText}>
        Nothing here right now — new orders will show up automatically.
      </Text>
    </View>
  );

  const renderOrdersList = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      );
    }
    if (groupedForTab.length === 0) return renderEmptyState();
    return (
      <ScrollView
        style={styles.ordersList}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {groupedForTab.map(group => (
          <View key={group.date}>
            <Text style={styles.dateHeading}>{formatDateHeading(group.date)}</Text>
            {group.orders.map(renderOrderCard)}
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderOrderButton = ({ status, label }: (typeof TABS)[number]) => {
    const count = ordersByStatus[status].length;
    const isActive = activeTab === status;
    return (
      <TouchableOpacity
        key={status}
        style={[styles.orderButton, isActive && styles.activeOrderButton]}
        onPress={() => setActiveTab(status)}
      >
        <Text
          style={[styles.orderButtonText, isActive && styles.activeOrderButtonText]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {label} ({count})
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Your orders</Text>

        <View style={styles.orderButtonsContainer}>
          <View style={styles.orderButtonsRow}>{TABS.map(renderOrderButton)}</View>
        </View>

        <View style={styles.ordersContainer}>{renderOrdersList()}</View>

        <View style={styles.allOrdersContainer}>
          <TouchableOpacity style={styles.allOrdersButton} onPress={openHistory}>
            <Text style={styles.allOrdersText}>All orders ({totalActive})</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={historyVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setHistoryVisible(false)}
      >
        <SafeAreaView style={styles.container}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Order history</Text>
            <TouchableOpacity onPress={() => setHistoryVisible(false)} hitSlop={8}>
              <Ionicons name="close" size={24} color="#1A1A1A" />
            </TouchableOpacity>
          </View>
          {historyLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4CAF50" />
            </View>
          ) : historyOrders.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyStateText}>No orders yet.</Text>
            </View>
          ) : (
            <ScrollView style={styles.ordersList} contentContainerStyle={{ padding: 20 }}>
              {historyOrders.map(order => (
                <View key={order.id} style={styles.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderCustomer} numberOfLines={1}>
                      {order.profiles?.full_name ?? 'Customer'} · {order.quantity}×{' '}
                      {order.listings?.title ?? 'Dish'}
                    </Text>
                    <Text style={styles.historyMeta}>
                      {formatDateHeading(order.scheduled_date)}
                      {order.pickup_time ? ` · ${formatTime(order.pickup_time)}` : ''} ·{' '}
                      {formatMoney(Number(order.total_price))}
                    </Text>
                  </View>
                  <Text style={[styles.historyStatus, styles[`status_${order.status}` as const]]}>
                    {order.status}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 15,
    marginTop: 16,
  },
  orderButtonsContainer: {
    marginBottom: 20,
  },
  orderButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  orderButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 3,
    borderRadius: 20,
    borderColor: '#000000',
    borderWidth: 1,
    backgroundColor: '#F8F8F8',
    marginHorizontal: 4,
    alignItems: 'center',
  },
  activeOrderButton: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  orderButtonText: {
    fontSize: 11,
    color: '#666666',
    fontWeight: '500',
    textAlign: 'center',
    flexShrink: 1,
  },
  activeOrderButtonText: {
    color: '#FFFFFF',
  },
  ordersContainer: {
    flex: 1,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  checkIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    maxWidth: 250,
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  ordersList: {
    flex: 1,
  },
  dateHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 4,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  orderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  orderCustomer: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
    flexShrink: 1,
  },
  pickupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0F7F1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 8,
  },
  pickupPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32',
  },
  orderItem: {
    fontSize: 14,
    color: '#444',
    marginBottom: 4,
  },
  orderTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 10,
  },
  orderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionBtnDisabled: {
    backgroundColor: '#A5D6A7',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  allOrdersContainer: {
    marginBottom: 20,
  },
  allOrdersButton: {
    paddingVertical: 12,
  },
  allOrdersText: {
    fontSize: 16,
    color: '#000000',
    textDecorationLine: 'underline',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  historyMeta: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  historyStatus: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginLeft: 10,
  },
  status_pending: { color: '#B26B00' },
  status_confirmed: { color: '#1976D2' },
  status_ready: { color: '#2E7D32' },
  status_completed: { color: '#4CAF50' },
  status_cancelled: { color: '#C62828' },
});
