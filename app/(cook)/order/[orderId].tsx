import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';

type OrderStatus = 'pending' | 'confirmed' | 'ready' | 'completed' | 'cancelled';

interface OrderDetail {
  id: string;
  quantity: number;
  total_price: number;
  scheduled_date: string;
  pickup_time: string | null;
  customer_note: string | null;
  selected_options: Array<{
    groupName: string;
    options: Array<{ optionName: string; priceDelta: number }>;
  }> | null;
  fulfillment_type: 'pickup' | 'delivery';
  status: OrderStatus;
  proof_of_prep_url: string | null;
  created_at: string;
  listings: { title: string; price: number; image_url: string | null } | null;
  profiles: { full_name: string } | null;
  delivery_jobs: {
    status: string;
    provider_status: string | null;
    dropoff_address: {
      recipientName: string;
      phoneNumber: string;
      addressLine1: string;
      addressLine2?: string | null;
      locality?: string | null;
      city: string;
      state: string;
      postcode: string;
      deliveryInstructions?: string | null;
    };
    driver_name: string | null;
    driver_phone: string | null;
    driver_plate_number: string | null;
    share_link: string | null;
  } | null;
}

const NEXT_ACTION: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  pending: { next: 'confirmed', label: 'Accept order' },
  confirmed: { next: 'ready', label: 'Mark ready' },
  ready: { next: 'completed', label: 'Complete pickup' },
};

const formatMoney = (n: number): string => `RM${n.toFixed(2)}`;

/** Short human-friendly code shown in place of the raw UUID, e.g. CF-3A9. */
export const shortOrderCode = (id: string): string =>
  `CF-${id.replace(/-/g, '').slice(0, 3).toUpperCase()}`;

export default function CookOrderDetail() {
  const router = useRouter();
  const { user, session } = useAuth();
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, quantity, total_price, scheduled_date, pickup_time, customer_note, selected_options, fulfillment_type, status, proof_of_prep_url, created_at, listings(title, price, image_url), profiles(full_name), delivery_jobs(status, provider_status, dropoff_address, driver_name, driver_phone, driver_plate_number, share_link)'
        )
        .eq('id', orderId)
        .single();
      if (error) throw error;
      setOrder(data as unknown as OrderDetail);
    } catch {
      Alert.alert('Order not found', 'This order could not be loaded.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [orderId, router]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (status: OrderStatus) => {
    if (!order || updating) return;
    setUpdating(true);
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ status, userId: user?.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Failed to update order status.');
      }
      setOrder(prev => (prev ? { ...prev, status } : prev));
      if (status === 'completed' || status === 'cancelled') router.back();
    } catch (error: unknown) {
      Alert.alert(
        'Could not update order',
        error instanceof Error ? error.message : 'Unknown error'
      );
    } finally {
      setUpdating(false);
    }
  };

  const confirmCancel = () => {
    if (!order || (order.status !== 'pending' && order.status !== 'confirmed')) return;
    Alert.alert('Cancel this order?', 'The customer will need to be refunded outside the app.', [
      { text: 'Keep order', style: 'cancel' },
      { text: 'Cancel order', style: 'destructive', onPress: () => updateStatus('cancelled') },
    ]);
  };

  const uploadProof = async () => {
    if (!order || uploadingProof) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const picker = perm.granted
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.6,
          base64: true,
        });
    if (picker.canceled || !picker.assets?.[0]?.base64) return;
    const asset = picker.assets[0];

    setUploadingProof(true);
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/orders/${order.id}/proof`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          imageBase64: asset.base64,
          contentType:
            asset.mimeType && asset.mimeType !== 'image/jpg' ? asset.mimeType : 'image/jpeg',
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; proofUrl?: string };
      if (!res.ok) throw new Error(body.error || 'The proof photo could not be uploaded.');
      setOrder(prev => (prev ? { ...prev, proof_of_prep_url: body.proofUrl ?? null } : prev));
    } catch (error: unknown) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setUploadingProof(false);
    }
  };

  const copyBookingId = async () => {
    if (!order) return;
    await Clipboard.setStringAsync(order.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#00A651" />
        </View>
      </SafeAreaView>
    );
  }

  const listingPrice = Number(order.listings?.price ?? 0);
  const optionGroups = order.selected_options ?? [];
  const action =
    order.fulfillment_type === 'delivery' && order.status === 'ready'
      ? undefined
      : NEXT_ACTION[order.status];
  const canCancel = order.status === 'pending' || order.status === 'confirmed';

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{shortOrderCode(order.id)}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            <Text style={styles.summaryBold}>
              {order.quantity} item{order.quantity === 1 ? '' : 's'}
            </Text>{' '}
            for {order.profiles?.full_name ?? 'Customer'}
          </Text>
          <View
            style={[styles.statusTag, order.status === 'cancelled' && styles.statusTagCancelled]}
          >
            <Text
              style={[
                styles.statusTagText,
                order.status === 'cancelled' && styles.statusTagTextCancelled,
              ]}
            >
              {order.status}
            </Text>
          </View>
        </View>

        {order.fulfillment_type === 'delivery' && order.delivery_jobs ? (
          <View style={styles.deliveryCard}>
            <View style={styles.deliveryHeading}>
              <Ionicons name="location-outline" size={21} color="#216E39" />
              <Text style={styles.deliveryTitle}>Customer delivery address</Text>
            </View>
            <Text style={styles.deliveryRecipient}>
              {order.delivery_jobs.dropoff_address.recipientName} ·{' '}
              {order.delivery_jobs.dropoff_address.phoneNumber}
            </Text>
            <Text style={styles.deliveryAddress}>
              {[
                order.delivery_jobs.dropoff_address.addressLine1,
                order.delivery_jobs.dropoff_address.addressLine2,
                order.delivery_jobs.dropoff_address.locality,
                order.delivery_jobs.dropoff_address.postcode,
                order.delivery_jobs.dropoff_address.city,
                order.delivery_jobs.dropoff_address.state,
              ]
                .filter(Boolean)
                .join(', ')}
            </Text>
            {order.delivery_jobs.dropoff_address.deliveryInstructions ? (
              <Text style={styles.deliveryInstructions}>
                Instructions: {order.delivery_jobs.dropoff_address.deliveryInstructions}
              </Text>
            ) : null}
            <View style={styles.deliveryStatusRow}>
              <Text style={styles.deliveryStatus}>
                Lalamove: {order.delivery_jobs.status.replace(/_/g, ' ')}
              </Text>
              {order.delivery_jobs.driver_name ? (
                <Text style={styles.driverText}>
                  {order.delivery_jobs.driver_name}
                  {order.delivery_jobs.driver_plate_number
                    ? ` · ${order.delivery_jobs.driver_plate_number}`
                    : ''}
                </Text>
              ) : null}
            </View>
            {order.delivery_jobs.share_link ? (
              <TouchableOpacity onPress={() => Linking.openURL(order.delivery_jobs!.share_link!)}>
                <Text style={styles.trackingLink}>Open live Lalamove tracking</Text>
              </TouchableOpacity>
            ) : null}
            {order.status === 'ready' ? (
              <Text style={styles.waitingText}>
                Lalamove will confirm completion automatically. Do not hand the order to anyone
                except the assigned rider.
              </Text>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity style={styles.proofCard} onPress={uploadProof} disabled={uploadingProof}>
          {order.proof_of_prep_url ? (
            <Image source={{ uri: order.proof_of_prep_url }} style={styles.proofThumb} />
          ) : null}
          <Text style={styles.proofText}>
            {order.proof_of_prep_url
              ? 'Replace proof of preparation'
              : 'Upload proof of preparation'}
          </Text>
          <View style={styles.proofIcon}>
            {uploadingProof ? (
              <ActivityIndicator size="small" color="#00794F" />
            ) : (
              <Ionicons name="camera-outline" size={22} color="#00794F" />
            )}
          </View>
        </TouchableOpacity>

        {order.customer_note ? (
          <View style={styles.noteRow}>
            <Ionicons name="chatbubble-ellipses-outline" size={19} color="#C62828" />
            <Text style={styles.noteText}>{order.customer_note}</Text>
          </View>
        ) : null}

        <View style={styles.divider} />

        <View style={styles.itemRow}>
          <Text style={styles.itemQty}>
            {order.quantity} <Text style={styles.itemQtyX}>x</Text>
          </Text>
          <Text style={styles.itemTitle}>{order.listings?.title ?? 'Dish'}</Text>
          <Text style={styles.itemPrice}>{(listingPrice * order.quantity).toFixed(2)}</Text>
        </View>
        {optionGroups.map(group => (
          <View key={group.groupName} style={styles.optionGroup}>
            <Text style={styles.optionGroupName}>{group.groupName.toUpperCase()}</Text>
            {group.options.map(option => (
              <View key={option.optionName} style={styles.optionRow}>
                <Text style={styles.optionName}>{option.optionName.toUpperCase()}</Text>
                <Text style={styles.optionPrice}>
                  {Number(option.priceDelta * order.quantity).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.divider} />

        <View style={styles.totalRow}>
          <View>
            <Text style={styles.subtotalLabel}>Subtotal</Text>
            <Text style={styles.taxNote}>Includes tax(RM0.00)</Text>
          </View>
          <Text style={styles.subtotalValue}>{formatMoney(Number(order.total_price))}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatMoney(Number(order.total_price))}</Text>
        </View>

        <View style={styles.bookingBar}>
          <Text style={styles.bookingLabel}>Booking ID</Text>
          <TouchableOpacity style={styles.bookingCopy} onPress={copyBookingId}>
            <Text style={styles.bookingValue} numberOfLines={1}>
              {order.id.replace(/-/g, '').slice(0, 16).toUpperCase()}
            </Text>
            <Ionicons
              name={copied ? 'checkmark-outline' : 'copy-outline'}
              size={19}
              color={copied ? '#00A651' : '#5F6368'}
            />
          </TouchableOpacity>
        </View>

        {canCancel ? (
          <TouchableOpacity style={styles.cancelButton} onPress={confirmCancel} disabled={updating}>
            <Ionicons name="close" size={20} color="#C62828" />
            <Text style={styles.cancelButtonText}>Cancel order</Text>
          </TouchableOpacity>
        ) : null}
        {action ? (
          <TouchableOpacity
            style={[styles.primaryButton, updating && styles.buttonDisabled]}
            onPress={() => updateStatus(action.next)}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color="#00794F" />
            ) : (
              <Text style={styles.primaryButtonText}>{action.label}</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E6E4',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  headerSpacer: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  summaryText: { fontSize: 16, color: '#1A1A1A', flexShrink: 1 },
  summaryBold: { fontWeight: '800' },
  statusTag: {
    backgroundColor: '#E5F5FB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusTagCancelled: { backgroundColor: '#FDECEA' },
  statusTagText: { fontSize: 13, fontWeight: '600', color: '#20586B', textTransform: 'capitalize' },
  statusTagTextCancelled: { color: '#C62828' },
  proofCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#DADEDA',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 16,
  },
  deliveryCard: {
    borderWidth: 1,
    borderColor: '#CFE1D3',
    backgroundColor: '#F4FAF5',
    borderRadius: 16,
    padding: 15,
    marginBottom: 16,
  },
  deliveryHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  deliveryTitle: { fontSize: 16, fontWeight: '800', color: '#214D2B' },
  deliveryRecipient: { fontSize: 14, fontWeight: '700', color: '#252A26', marginBottom: 4 },
  deliveryAddress: { fontSize: 14, color: '#424A44', lineHeight: 20 },
  deliveryInstructions: { fontSize: 13, color: '#6A4A18', marginTop: 8, lineHeight: 18 },
  deliveryStatusRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#BFD4C4',
  },
  deliveryStatus: {
    textTransform: 'capitalize',
    fontSize: 13,
    fontWeight: '800',
    color: '#216E39',
  },
  driverText: { fontSize: 12, color: '#5A655D', marginTop: 3 },
  trackingLink: { color: '#1769AA', fontWeight: '800', marginTop: 10 },
  waitingText: { fontSize: 12, lineHeight: 17, color: '#5A655D', marginTop: 10 },
  proofThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#F0F0F0' },
  proofText: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  proofIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E9F6F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  noteText: { flex: 1, fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#D8DCD8', marginVertical: 15 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemQty: { fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  itemQtyX: { color: '#9AA19B', fontWeight: '600' },
  itemTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  itemPrice: { fontSize: 17, color: '#1A1A1A' },
  optionGroup: { marginTop: 14, paddingLeft: 28 },
  optionGroupName: { fontSize: 13, color: '#9AA19B', letterSpacing: 0.4, marginBottom: 6 },
  optionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  optionName: { fontSize: 15, color: '#333934' },
  optionPrice: { fontSize: 15, color: '#333934' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subtotalLabel: { fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  taxNote: { fontSize: 12, color: '#9AA19B', marginTop: 2 },
  subtotalValue: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  totalLabel: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  totalValue: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  bookingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F6F5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 20,
    marginBottom: 18,
  },
  bookingLabel: { fontSize: 14, color: '#333934' },
  bookingCopy: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  bookingValue: { fontSize: 13, color: '#5F6368', letterSpacing: 0.3 },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FBEDEB',
    borderRadius: 26,
    paddingVertical: 15,
    marginBottom: 12,
  },
  cancelButtonText: { fontSize: 16, fontWeight: '700', color: '#C62828' },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E3F4EC',
    borderRadius: 26,
    paddingVertical: 15,
  },
  primaryButtonText: { fontSize: 16, fontWeight: '800', color: '#00794F' },
  buttonDisabled: { opacity: 0.6 },
});
