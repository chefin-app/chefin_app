import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';
import {
  ACTIVE_ORDER_STATUSES,
  getBuyerOrderTimingLabel,
  ORDER_STATUS_LABEL,
  type FulfillmentType,
  type OrderStatus,
} from '@/src/utils/orderStatus';

interface ActiveOrderRow {
  id: string;
  status: OrderStatus | null;
  fulfillment_type: FulfillmentType | null;
  pickup_time: string | null;
  pickup_window_end: string | null;
  scheduled_date: string | null;
  listings: { title: string } | null;
  delivery_jobs: {
    estimated_arrival_start: string | null;
    estimated_arrival_end: string | null;
  } | null;
}

const POLL_INTERVAL_MS = 30_000;

// Stop nagging 15 minutes after the scheduled pickup/delivery slot, even when
// the cook never advanced the order past pending/confirmed/ready.
const EXPIRY_GRACE_MS = 15 * 60_000;

export default function ActiveOrderBanner() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const [orders, setOrders] = useState<ActiveOrderRow[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!user) {
      setOrders([]);
      return;
    }
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (profileError || !profile) {
        setOrders([]);
        return;
      }
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, status, fulfillment_type, pickup_time, pickup_window_end, scheduled_date, listings(title), delivery_jobs(estimated_arrival_start, estimated_arrival_end)'
        )
        .eq('customer_id', profile.id)
        .in('status', ACTIVE_ORDER_STATUSES)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      const activeOrders = (data ?? []) as unknown as ActiveOrderRow[];
      const nextOrders = activeOrders.filter(candidate => !isBannerExpired(candidate, Date.now()));
      setOrders(nextOrders);
      setActiveIndex(current => Math.min(current, Math.max(nextOrders.length - 1, 0)));
    } catch (error: unknown) {
      console.error('Error fetching active order:', error);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [load])
  );

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  // Live expiry between polls: the `now` tick re-evaluates this every 30s.
  const visibleOrders = orders.filter(order => order.status && !isBannerExpired(order, now));
  if (visibleOrders.length === 0) return null;
  const displayedIndex = Math.min(activeIndex, visibleOrders.length - 1);

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveIndex(
      Math.min(
        Math.max(Math.round(event.nativeEvent.contentOffset.x / width), 0),
        visibleOrders.length - 1
      )
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={visibleOrders}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={order => order.id}
        onMomentumScrollEnd={handleScrollEnd}
        accessibilityLabel={`${visibleOrders.length} active order${visibleOrders.length === 1 ? '' : 's'}${visibleOrders.length > 1 ? '. Swipe horizontally to view each order.' : ''}`}
        renderItem={({ item: order }) => {
          const timingLabel = getBuyerOrderTimingLabel({
            status: order.status,
            fulfillmentType: order.fulfillment_type,
            pickupTime: order.pickup_time,
            estimatedArrivalStart: order.delivery_jobs?.estimated_arrival_start,
            estimatedArrivalEnd: order.delivery_jobs?.estimated_arrival_end,
          });
          return (
            <View style={[styles.page, { width }]}>
              <TouchableOpacity
                style={styles.orderCard}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel={`${ORDER_STATUS_LABEL[order.status!]}, ${order.listings?.title ?? 'your order'}. ${timingLabel}`}
                onPress={() =>
                  router.push({
                    pathname: '/order-status/[orderId]',
                    params: { orderId: order.id },
                  })
                }
              >
                <View style={styles.iconWrap}>
                  <Ionicons
                    name={
                      order.fulfillment_type === 'delivery'
                        ? 'bicycle-outline'
                        : 'bag-handle-outline'
                    }
                    size={20}
                    color="#fff"
                  />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.title} numberOfLines={1}>
                    {ORDER_STATUS_LABEL[order.status!]} · {order.listings?.title ?? 'Your order'}
                  </Text>
                  <Text style={styles.eta} key={now}>
                    {timingLabel}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#E8EFEA" />
              </TouchableOpacity>
            </View>
          );
        }}
      />
      {visibleOrders.length > 1 && (
        <View style={styles.pagination} pointerEvents="none">
          {visibleOrders.map((order, index) => (
            <View
              key={order.id}
              style={[styles.paginationDot, index === displayedIndex && styles.paginationDotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const isBannerExpired = (order: ActiveOrderRow, now: number): boolean => {
  const target =
    order.fulfillment_type === 'delivery'
      ? (order.delivery_jobs?.estimated_arrival_end ?? order.pickup_window_end ?? order.pickup_time)
      : (order.pickup_window_end ?? order.pickup_time);
  if (!target) return false;
  const targetMs = new Date(target).getTime();
  return !Number.isNaN(targetMs) && targetMs + EXPIRY_GRACE_MS < now;
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    paddingTop: 9,
    paddingBottom: 8,
  },
  page: {
    paddingHorizontal: 12,
  },
  orderCard: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    backgroundColor: '#18211B',
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: '#101712',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 9,
    elevation: 5,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  title: { color: '#fff', fontSize: 13, fontWeight: '700' },
  eta: { color: '#D7D7D7', fontSize: 12, marginTop: 2 },
  pagination: {
    height: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 7,
  },
  paginationDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#C6CEC8',
  },
  paginationDotActive: {
    width: 14,
    backgroundColor: '#278C43',
  },
});
