import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '@/src/utils/supabaseClient';
import {
  formatPickupEta,
  formatArrivalWindow,
  formatScheduledWindow,
  ORDER_STATUS_LABEL,
  shortOrderCode,
  type FulfillmentType,
  type OrderStatus,
} from '@/src/utils/orderStatus';

interface OrderStatusRow {
  id: string;
  quantity: number;
  total_price: number;
  pickup_time: string | null;
  pickup_window_end: string | null;
  customer_note: string | null;
  selected_options: Array<{
    groupName: string;
    options: Array<{ optionName: string; priceDelta: number }>;
  }> | null;
  fulfillment_type: FulfillmentType | null;
  status: OrderStatus | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  proof_of_prep_url: string | null;
  created_at: string;
  listings: {
    title: string;
    image_url: string | null;
    cook_id: string;
    profiles: { restaurant_name: string | null; full_name: string } | null;
  } | null;
  reviews: { id: string } | null;
  delivery_jobs: {
    status: string;
    provider_status: string | null;
    driver_name: string | null;
    driver_phone: string | null;
    driver_plate_number: string | null;
    share_link: string | null;
    proof_of_delivery_url: string | null;
    preparation_ready_at: string | null;
    estimated_arrival_start: string | null;
    estimated_arrival_end: string | null;
  } | null;
}

const POLL_INTERVAL_MS = 15_000;

/** The buyer-visible journey, in order. `completed` label depends on fulfillment. */
const STEPS: Array<{ status: OrderStatus; icon: keyof typeof Ionicons.glyphMap }> = [
  { status: 'pending', icon: 'receipt-outline' },
  { status: 'confirmed', icon: 'flame-outline' },
  { status: 'ready', icon: 'checkmark-circle-outline' },
  { status: 'completed', icon: 'happy-outline' },
];

const STEP_DESCRIPTION: Record<OrderStatus, string> = {
  pending: 'Waiting for the cook to accept your order.',
  confirmed: 'The cook has accepted and is preparing your food.',
  ready: 'Your food is ready!',
  completed: 'Enjoy your meal!',
  cancelled: '',
};

export default function OrderStatusScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;

  const [order, setOrder] = useState<OrderStatusRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      // The customer owns the order row under RLS, so this read is theirs.
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, quantity, total_price, pickup_time, pickup_window_end, customer_note, selected_options, fulfillment_type, status, cancelled_by, cancellation_reason, proof_of_prep_url, created_at, listings(title, image_url, cook_id, profiles(restaurant_name, full_name)), reviews(id), delivery_jobs(status, provider_status, driver_name, driver_phone, driver_plate_number, share_link, proof_of_delivery_url, preparation_ready_at, estimated_arrival_start, estimated_arrival_end)'
        )
        .eq('id', orderId)
        .single();
      if (error) throw error;
      setOrder(data as unknown as OrderStatusRow);
    } catch (error: unknown) {
      console.warn('Could not load order status', error);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [load])
  );

  // Re-render every 30s so the countdown stays fresh between polls.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const listing = order?.listings;
  const restaurantName =
    listing?.profiles?.restaurant_name || listing?.profiles?.full_name || 'Home restaurant';
  const isPickup = order?.fulfillment_type !== 'delivery';
  const isCancelled = order?.status === 'cancelled';
  const isCompleted = order?.status === 'completed';
  const canReview = isCompleted && !order?.reviews;
  const currentStepIndex = order?.status
    ? STEPS.findIndex(step => step.status === order.status)
    : -1;

  const stepLabel = (status: OrderStatus): string => {
    if (status === 'completed') return isPickup ? 'Collected' : 'Delivered';
    return ORDER_STATUS_LABEL[status];
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isPickup ? 'Pickup status' : 'Delivery status'}
          {order ? ` · ${shortOrderCode(order.id)}` : ''}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {!order ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={38} color="#C62828" />
          <Text style={styles.errorText}>We couldn&apos;t find this order.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* ETA / outcome hero */}
          {isCancelled ? (
            <View style={[styles.hero, styles.heroCancelled]}>
              <Ionicons name="close-circle" size={30} color="#C62828" />
              <View style={styles.heroCopy}>
                <Text style={styles.heroCancelledTitle}>Order cancelled</Text>
                <Text style={styles.heroCancelledBody}>
                  {order.cancelled_by === 'cook'
                    ? 'The cook cancelled this order.'
                    : 'This order was cancelled.'}
                  {order.cancellation_reason ? ` Reason: ${order.cancellation_reason}` : ''}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.hero} key={now}>
              <View style={styles.heroIcon}>
                <Ionicons
                  name={isPickup ? 'bag-handle-outline' : 'bicycle-outline'}
                  size={26}
                  color="#1B5E20"
                />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>
                  {isCompleted
                    ? isPickup
                      ? 'Order collected'
                      : 'Order delivered'
                    : isPickup
                      ? formatPickupEta(order.pickup_time)
                      : formatArrivalWindow(
                            order.delivery_jobs?.estimated_arrival_start ?? null,
                            order.delivery_jobs?.estimated_arrival_end ?? null
                          )
                        ? `Estimated arrival ${formatArrivalWindow(
                            order.delivery_jobs?.estimated_arrival_start ?? null,
                            order.delivery_jobs?.estimated_arrival_end ?? null
                          )}`
                        : 'Delivery time being confirmed'}
                </Text>
                {!isCompleted &&
                isPickup &&
                formatScheduledWindow(order.pickup_time, order.pickup_window_end) ? (
                  <Text style={styles.heroSubtitle}>
                    Pickup window{' '}
                    {formatScheduledWindow(order.pickup_time, order.pickup_window_end)}
                  </Text>
                ) : !isCompleted && !isPickup && order.delivery_jobs?.preparation_ready_at ? (
                  <Text style={styles.heroSubtitle}>
                    Food expected ready by{' '}
                    {new Date(order.delivery_jobs.preparation_ready_at).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </Text>
                ) : null}
              </View>
            </View>
          )}

          {/* Progress timeline */}
          {!isCancelled && (
            <View style={styles.timeline}>
              {STEPS.map((step, index) => {
                const reached = currentStepIndex >= index;
                const isCurrent = currentStepIndex === index;
                const isLast = index === STEPS.length - 1;
                return (
                  <View key={step.status} style={styles.stepRow}>
                    <View style={styles.stepRail}>
                      <View
                        style={[
                          styles.stepDot,
                          reached && styles.stepDotReached,
                          isCurrent && styles.stepDotCurrent,
                        ]}
                      >
                        <Ionicons name={step.icon} size={16} color={reached ? '#fff' : '#A5ADA8'} />
                      </View>
                      {!isLast && (
                        <View
                          style={[
                            styles.stepLine,
                            currentStepIndex > index && styles.stepLineReached,
                          ]}
                        />
                      )}
                    </View>
                    <View style={styles.stepCopy}>
                      <Text style={[styles.stepTitle, reached && styles.stepTitleReached]}>
                        {stepLabel(step.status)}
                      </Text>
                      {isCurrent ? (
                        <Text style={styles.stepDescription}>
                          {!isPickup && step.status === 'ready'
                            ? 'Your food is ready and Lalamove is handling the delivery.'
                            : STEP_DESCRIPTION[step.status]}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {!isPickup && order.delivery_jobs && !isCancelled ? (
            <View style={styles.deliveryCard}>
              <View style={styles.deliveryHeader}>
                <Ionicons name="bicycle-outline" size={22} color="#1769AA" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.deliveryTitle}>Lalamove delivery</Text>
                  <Text style={styles.deliveryStatus}>
                    {order.delivery_jobs.status.replace(/_/g, ' ')}
                  </Text>
                </View>
              </View>
              {order.delivery_jobs.driver_name ? (
                <Text style={styles.driverDetails}>
                  Rider: {order.delivery_jobs.driver_name}
                  {order.delivery_jobs.driver_plate_number
                    ? ` · ${order.delivery_jobs.driver_plate_number}`
                    : ''}
                  {order.delivery_jobs.driver_phone ? ` · ${order.delivery_jobs.driver_phone}` : ''}
                </Text>
              ) : (
                <Text style={styles.driverDetails}>
                  Rider details will appear once Lalamove assigns someone.
                </Text>
              )}
              {order.delivery_jobs.share_link ? (
                <TouchableOpacity
                  style={styles.trackButton}
                  onPress={() => Linking.openURL(order.delivery_jobs!.share_link!)}
                >
                  <Text style={styles.trackButtonText}>Track delivery live</Text>
                  <Ionicons name="open-outline" size={16} color="#1769AA" />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* Proof of preparation */}
          {order.proof_of_prep_url && !isCancelled ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>PREPARED BY YOUR COOK</Text>
              <Image source={{ uri: order.proof_of_prep_url }} style={styles.proofImage} />
            </View>
          ) : null}

          {/* Order summary */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ORDER SUMMARY</Text>
            <TouchableOpacity
              style={styles.summaryCard}
              activeOpacity={0.75}
              onPress={() => {
                const cookId = listing?.cook_id;
                if (cookId) router.push({ pathname: '/restaurant/[id]', params: { id: cookId } });
              }}
            >
              {listing?.image_url ? (
                <Image source={{ uri: listing.image_url }} style={styles.summaryImage} />
              ) : (
                <View style={[styles.summaryImage, styles.summaryImagePlaceholder]}>
                  <Ionicons name="restaurant-outline" size={20} color="#98A19B" />
                </View>
              )}
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryTitle} numberOfLines={2}>
                  {order.quantity}× {listing?.title ?? 'Dish'}
                </Text>
                <Text style={styles.summarySubtitle}>from {restaurantName}</Text>
                {(order.selected_options ?? []).map(group => (
                  <Text key={group.groupName} style={styles.summaryOptions} numberOfLines={2}>
                    {group.groupName}: {group.options.map(option => option.optionName).join(', ')}
                  </Text>
                ))}
                {order.customer_note ? (
                  <Text style={styles.summaryNote} numberOfLines={3}>
                    Note: {order.customer_note}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.summaryPrice}>RM{Number(order.total_price).toFixed(2)}</Text>
            </TouchableOpacity>
          </View>

          {/* Review CTA once completed */}
          {canReview ? (
            <TouchableOpacity
              style={styles.reviewButton}
              activeOpacity={0.85}
              onPress={() =>
                router.push({ pathname: '/review/[orderId]', params: { orderId: order.id } })
              }
            >
              <Ionicons name="star" size={18} color="#fff" />
              <Text style={styles.reviewButtonText}>Rate your order</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  errorText: { fontSize: 15, color: '#888' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  backButton: { padding: 8, width: 40 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  content: { padding: 20, paddingBottom: 40 },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#EDF7EF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D3EBD8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1 },
  heroTitle: { fontSize: 18, fontWeight: '800', color: '#1B5E20' },
  heroSubtitle: { fontSize: 13, color: '#4A6B50', marginTop: 3 },
  heroCancelled: { backgroundColor: '#FDECEA' },
  heroCancelledTitle: { fontSize: 17, fontWeight: '800', color: '#C62828' },
  heroCancelledBody: { fontSize: 13, color: '#8C4A45', marginTop: 3, lineHeight: 18 },

  timeline: { marginBottom: 28 },
  deliveryCard: {
    borderWidth: 1,
    borderColor: '#C9DDF2',
    backgroundColor: '#F2F7FC',
    borderRadius: 16,
    padding: 15,
    marginBottom: 24,
  },
  deliveryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deliveryTitle: { fontSize: 16, fontWeight: '800', color: '#164B78' },
  deliveryStatus: { fontSize: 13, color: '#426580', textTransform: 'capitalize', marginTop: 2 },
  driverDetails: { fontSize: 13, lineHeight: 19, color: '#475C6D', marginTop: 10 },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#BDD3E7',
    paddingTop: 12,
    marginTop: 12,
  },
  trackButtonText: { color: '#1769AA', fontWeight: '800' },
  stepRow: { flexDirection: 'row', gap: 14 },
  stepRail: { alignItems: 'center', width: 32 },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF2EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotReached: { backgroundColor: '#4CAF50' },
  stepDotCurrent: {
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  stepLine: { width: 2, flex: 1, minHeight: 18, backgroundColor: '#E3E8E4', marginVertical: 3 },
  stepLineReached: { backgroundColor: '#4CAF50' },
  stepCopy: { flex: 1, paddingBottom: 20 },
  stepTitle: { fontSize: 15, fontWeight: '600', color: '#A5ADA8', marginTop: 6 },
  stepTitleReached: { color: '#1A1A1A' },
  stepDescription: { fontSize: 13, color: '#6B7369', marginTop: 3, lineHeight: 18 },

  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  proofImage: { width: '100%', height: 200, borderRadius: 16, backgroundColor: '#EFF2EF' },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#F7F9FC',
    borderRadius: 16,
    padding: 12,
  },
  summaryImage: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#EFF2EF' },
  summaryImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1 },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  summarySubtitle: { fontSize: 13, color: '#666', marginTop: 3 },
  summaryOptions: { fontSize: 12, color: '#8B928D', marginTop: 4, lineHeight: 16 },
  summaryNote: { fontSize: 12, color: '#8B928D', marginTop: 4, fontStyle: 'italic' },
  summaryPrice: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },

  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 15,
  },
  reviewButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
