import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';
import {
  ACTIVE_ORDER_STATUSES,
  formatEta,
  ORDER_STATUS_LABEL,
  type FulfillmentType,
  type OrderStatus,
} from '@/src/utils/orderStatus';

interface ActiveOrderRow {
  id: string;
  status: OrderStatus | null;
  fulfillment_type: FulfillmentType | null;
  pickup_time: string | null;
  scheduled_date: string | null;
  listings: { title: string } | null;
}

const POLL_INTERVAL_MS = 30_000;

// Stop nagging 15 minutes after the scheduled pickup/delivery slot, even when
// the cook never advanced the order past pending/confirmed/ready.
const EXPIRY_GRACE_MS = 15 * 60_000;

export default function ActiveOrderBanner() {
  const router = useRouter();
  const { user } = useAuth();
  const [order, setOrder] = useState<ActiveOrderRow | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!user) {
      setOrder(null);
      return;
    }
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (profileError || !profile) {
        setOrder(null);
        return;
      }
      // Skip orders whose slot passed more than the grace period ago; orders
      // without a slot yet (pickup_time null) stay visible.
      const expiryCutoff = new Date(Date.now() - EXPIRY_GRACE_MS).toISOString();
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, fulfillment_type, pickup_time, scheduled_date, listings(title)')
        .eq('customer_id', profile.id)
        .in('status', ACTIVE_ORDER_STATUSES)
        .or(`pickup_time.is.null,pickup_time.gte.${expiryCutoff}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setOrder((data ?? null) as unknown as ActiveOrderRow | null);
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

  if (!order || !order.status) return null;
  // Live expiry between polls: the `now` tick re-evaluates this every 30s.
  if (order.pickup_time && new Date(order.pickup_time).getTime() + EXPIRY_GRACE_MS < now) {
    return null;
  }

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.9}
      onPress={() =>
        router.push({ pathname: '/order-status/[orderId]', params: { orderId: order.id } })
      }
    >
      <View style={styles.iconWrap}>
        <Ionicons
          name={order.fulfillment_type === 'delivery' ? 'bicycle-outline' : 'bag-handle-outline'}
          size={20}
          color="#fff"
        />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {ORDER_STATUS_LABEL[order.status]} · {order.listings?.title ?? 'Your order'}
        </Text>
        <Text style={styles.eta} key={now}>
          {formatEta(order.fulfillment_type, order.pickup_time)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
});
