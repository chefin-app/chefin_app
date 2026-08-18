import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';

type OrderStatus = 'pending' | 'confirmed' | 'ready' | 'completed' | 'cancelled';

interface ActiveOrderRow {
  id: string;
  status: OrderStatus | null;
  fulfillment_type: 'pickup' | 'delivery' | null;
  pickup_time: string | null;
  scheduled_date: string | null;
  listings: { title: string } | null;
}

const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'ready'];

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Order placed',
  confirmed: 'Being prepared',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const POLL_INTERVAL_MS = 30_000;

function formatEta(fulfillmentType: 'pickup' | 'delivery' | null, pickupTime: string | null): string {
  const verb = fulfillmentType === 'delivery' ? 'Delivery' : 'Pickup';
  if (!pickupTime) return `${verb} time TBC`;

  const target = new Date(pickupTime).getTime();
  const now = Date.now();
  const diffMinutes = Math.round((target - now) / 60_000);

  if (diffMinutes <= 0) return `${verb} due now`;
  if (diffMinutes < 60) return `${verb} in ${diffMinutes} min`;

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `${verb} in ${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
}

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
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, fulfillment_type, pickup_time, scheduled_date, listings(title)')
        .eq('customer_id', profile.id)
        .in('status', ACTIVE_STATUSES)
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

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.9}
      onPress={() => router.push('/(user)/food-orders')}
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
          {STATUS_LABEL[order.status]} · {order.listings?.title ?? 'Your order'}
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
