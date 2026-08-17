import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';

interface FoodOrderRow {
  id: string;
  total_price: number;
  quantity: number;
  status: string | null;
  created_at: string;
  listings: {
    title: string;
    image_url: string | null;
    cook_id: string;
    profiles: { restaurant_name: string | null; full_name: string } | null;
  } | null;
  reviews: { id: string } | null;
}

const formatOrderDate = (iso: string): string =>
  `${new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}, ${new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`;

/** 'This month' for the current month, otherwise e.g. 'Jul 2026'. */
const monthHeading = (iso: string): string => {
  const date = new Date(iso);
  const nowDate = new Date();
  if (date.getFullYear() === nowDate.getFullYear() && date.getMonth() === nowDate.getMonth()) {
    return 'This month';
  }
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

export default function FoodOrdersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [orders, setOrders] = useState<FoodOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }
    try {
      setLoadError(null);
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (profileError || !profile) throw profileError ?? new Error('Profile not found.');
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, total_price, quantity, status, created_at, listings(title, image_url, cook_id, profiles(restaurant_name, full_name)), reviews(id)'
        )
        .eq('customer_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setOrders((data ?? []) as unknown as FoodOrderRow[]);
    } catch (error: unknown) {
      console.error('Error fetching food orders:', error);
      setLoadError('Your past orders could not be loaded. Pull to refresh or try again later.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const groups: { heading: string; orders: FoodOrderRow[] }[] = [];
  for (const order of orders) {
    const heading = monthHeading(order.created_at);
    let group = groups.find(g => g.heading === heading);
    if (!group) {
      group = { heading, orders: [] };
      groups.push(group);
    }
    group.orders.push(order);
  }

  const restaurantName = (order: FoodOrderRow): string =>
    order.listings?.profiles?.restaurant_name ||
    order.listings?.profiles?.full_name ||
    'Home restaurant';

  const renderOrder = (order: FoodOrderRow) => {
    const canReview = order.status === 'completed' && !order.reviews;
    return (
      <TouchableOpacity
        key={order.id}
        style={styles.orderRow}
        activeOpacity={0.75}
        onPress={() => {
          const cookId = order.listings?.cook_id;
          if (cookId) router.push({ pathname: '/restaurant/[id]', params: { id: cookId } });
        }}
      >
        {order.listings?.image_url ? (
          <Image source={{ uri: order.listings.image_url }} style={styles.orderImage} />
        ) : (
          <View style={[styles.orderImage, styles.orderImagePlaceholder]}>
            <Ionicons name="restaurant-outline" size={20} color="#98A19B" />
          </View>
        )}
        <View style={styles.orderCopy}>
          <View style={styles.orderTitleRow}>
            <Text style={styles.orderTitle} numberOfLines={2}>
              {restaurantName(order)}
            </Text>
            <Text style={styles.orderPrice}>RM{Number(order.total_price).toFixed(2)}</Text>
          </View>
          <Text style={styles.orderMeta}>
            {order.quantity}× {order.listings?.title ?? 'Dish'} · {formatOrderDate(order.created_at)}
          </Text>
          {order.status === 'cancelled' ? (
            <Text style={styles.cancelledTag}>Cancelled</Text>
          ) : null}
          {canReview ? (
            <TouchableOpacity
              style={styles.starsRow}
              onPress={event => {
                event.stopPropagation();
                router.push({ pathname: '/review/[orderId]', params: { orderId: order.id } });
              }}
              accessibilityRole="button"
              accessibilityLabel="Rate this order"
            >
              {[1, 2, 3, 4, 5].map(star => (
                <Ionicons key={star} name="star" size={26} color="#D3D8D4" />
              ))}
            </TouchableOpacity>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Food Orders</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={38} color="#C62828" />
          <Text style={styles.stateText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="receipt-outline" size={42} color="#A5ADA8" />
          <Text style={styles.stateTitle}>No orders yet</Text>
          <Text style={styles.stateText}>
            Dishes you order will show up here so you can find them again.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {groups.map(group => (
            <View key={group.heading}>
              <Text style={styles.monthHeading}>{group.heading}</Text>
              {group.orders.map(renderOrder)}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#1A1A1A' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  monthHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: '#5F6368',
    marginTop: 20,
    marginBottom: 14,
  },
  orderRow: { flexDirection: 'row', gap: 14, marginBottom: 26 },
  orderImage: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#EFF2EF' },
  orderImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  orderCopy: { flex: 1 },
  orderTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  orderTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#1A1A1A', lineHeight: 23 },
  orderPrice: { fontSize: 17, fontWeight: '600', color: '#1A1A1A' },
  orderMeta: { fontSize: 13, color: '#8B928D', marginTop: 5, lineHeight: 18 },
  cancelledTag: { fontSize: 12, fontWeight: '700', color: '#C62828', marginTop: 6 },
  starsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  retryButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 20,
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  stateTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A', marginTop: 12 },
  stateText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 8,
    maxWidth: 260,
  },
});
