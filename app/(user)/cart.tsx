import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCart, CartItem } from '@/src/context/CartContext';
import { useAuth } from '@/src/services/auth-context';
import { supabase } from '@/src/utils/supabaseClient';

const DELIVERY_FEE = 3.0;
const PAYMENT_STORAGE_KEY = '@chefin:payment-method';

type SavedCard = { brand: string; last4: string; expMonth: string; expYear: string };

export default function CartScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { cartItems, removeFromCart, updateQuantity, clearCart, cartTotal, cartCount } = useCart();
  const [placingOrder, setPlacingOrder] = useState(false);
  // cookId -> free_delivery_threshold (null = no offer)
  const [cookThresholds, setCookThresholds] = useState<Record<string, number | null>>({});

  // Fetch every unique cook's threshold whenever the cart's cook-set changes.
  const cookIds = useMemo(
    () => Array.from(new Set(cartItems.map(i => i.cookId).filter(Boolean))),
    [cartItems]
  );
  const cookIdsKey = cookIds.join(',');

  useEffect(() => {
    if (cookIds.length === 0) {
      setCookThresholds({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, free_delivery_threshold')
        .in('id', cookIds);
      if (cancelled) return;
      if (error) {
        console.warn('Failed to load cook thresholds', error.message);
        return;
      }
      const map: Record<string, number | null> = {};
      for (const row of data ?? []) {
        map[row.id] =
          row.free_delivery_threshold != null ? Number(row.free_delivery_threshold) : null;
      }
      setCookThresholds(map);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookIdsKey]);

  // Group cart by cook, compute per-cook subtotal + delivery fee.
  const { deliveryFee, freeDeliveryNote } = useMemo(() => {
    const byCook = new Map<string, { subtotal: number; cookName?: string }>();
    for (const item of cartItems) {
      const bucket = byCook.get(item.cookId) ?? { subtotal: 0, cookName: item.cookName };
      bucket.subtotal += item.price * item.quantity;
      byCook.set(item.cookId, bucket);
    }
    let fee = 0;
    const freedCooks: string[] = [];
    for (const [cookId, { subtotal, cookName }] of byCook) {
      const threshold = cookThresholds[cookId];
      if (threshold != null && subtotal >= threshold) {
        // free
        if (cookName) freedCooks.push(cookName);
      } else {
        fee += DELIVERY_FEE;
      }
    }
    const note =
      freedCooks.length === 0
        ? null
        : freedCooks.length === byCook.size
          ? 'Free delivery applied 🎉'
          : `Free delivery from ${freedCooks.join(', ')} 🎉`;
    return { deliveryFee: fee, freeDeliveryNote: note };
  }, [cartItems, cookThresholds]);

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) return;

    if (!user) {
      Alert.alert('Login Required', 'Please login to place your order.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Login', onPress: () => router.push('/(auth)/login') },
      ]);
      return;
    }

    // Require a saved payment method before allowing checkout.
    const raw = await AsyncStorage.getItem(PAYMENT_STORAGE_KEY);
    const savedCard: SavedCard | null = raw ? JSON.parse(raw) : null;
    if (!savedCard) {
      Alert.alert('Payment method needed', 'Add a card to place your order.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add card', onPress: () => router.push('/(user)/payment-methods') },
      ]);
      return;
    }

    setPlacingOrder(true);
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          items: cartItems.map(item => ({
            listingId: item.listingId,
            quantity: item.quantity,
            pickupDate: item.selectedDate,
            pickupTime: item.pickupSlotStart,
            priceAtOrder: item.price,
          })),
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        clearCart();
        Alert.alert(
          '🎉 Order Placed!',
          `Charged ${savedCard.brand} ending in ${savedCard.last4}.`,
          [{ text: 'OK', onPress: () => router.replace('/(user)/(tabs)/home') }]
        );
      } else {
        Alert.alert('Could not place order', body?.error ?? 'Please try again.');
      }
    } catch (err: any) {
      Alert.alert('Network error', err?.message ?? 'Please check your connection.');
    } finally {
      setPlacingOrder(false);
    }
  };

  if (cartItems.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Cart</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyEmoji}>🛒</Text>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySubtitle}>Add dishes to your cart to get started.</Text>
          <TouchableOpacity
            style={styles.startShoppingBtn}
            onPress={() => router.replace('/(user)/(tabs)/home')}
          >
            <Text style={styles.startShoppingText}>Start Browsing</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const grandTotal = cartTotal + deliveryFee;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Cart</Text>
        <TouchableOpacity
          onPress={() => {
            Alert.alert('Clear Cart', 'Remove all items?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: clearCart },
            ]);
          }}
        >
          <Text style={styles.clearAllText}>Clear all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 200 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cart Item Count */}
        <Text style={styles.itemCount}>
          {cartCount} item{cartCount !== 1 ? 's' : ''} in your cart
        </Text>

        {/* Items */}
        {cartItems.map((item: CartItem) => (
          <View key={item.listingId} style={styles.cartCard}>
            <Image source={{ uri: item.imageUrl ?? '' }} style={styles.cartItemImage} />
            <View style={styles.cartItemInfo}>
              <View style={styles.cartItemHeader}>
                <Text style={styles.cartItemTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <TouchableOpacity onPress={() => removeFromCart(item.listingId)}>
                  <Ionicons name="trash-outline" size={18} color="#FF4D4D" />
                </TouchableOpacity>
              </View>
              {item.cookName && <Text style={styles.cartItemChef}>by {item.cookName}</Text>}
              <Text style={styles.cartItemDate}>
                📅{' '}
                {item.selectedDate.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
              <View style={styles.cartItemFooter}>
                <Text style={styles.cartItemPrice}>
                  RM {(item.price * item.quantity).toFixed(2)}
                </Text>
                <View style={styles.quantityRow}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQuantity(item.listingId, item.quantity - 1)}
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQuantity(item.listingId, item.quantity + 1)}
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Order Summary Footer */}
      <View style={styles.footer}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>RM {cartTotal.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Delivery fee</Text>
          <Text style={styles.summaryValue}>
            {deliveryFee === 0 ? 'FREE' : `RM ${deliveryFee.toFixed(2)}`}
          </Text>
        </View>
        {freeDeliveryNote && <Text style={styles.freeDeliveryNote}>{freeDeliveryNote}</Text>}
        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>RM {grandTotal.toFixed(2)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.placeOrderBtn, placingOrder && { opacity: 0.7 }]}
          onPress={handlePlaceOrder}
          disabled={placingOrder}
        >
          {placingOrder ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.placeOrderText}>Place Order · RM {grandTotal.toFixed(2)}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  clearAllText: {
    color: '#FF4D4D',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  startShoppingBtn: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
  },
  startShoppingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  itemCount: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  cartCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cartItemImage: {
    width: 110,
    height: '100%',
    minHeight: 120,
  },
  cartItemInfo: {
    flex: 1,
    padding: 14,
  },
  cartItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  cartItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    flex: 1,
    marginRight: 8,
  },
  cartItemChef: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
  },
  cartItemDate: {
    fontSize: 12,
    color: '#AAA',
    marginBottom: 10,
  },
  cartItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cartItemPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    lineHeight: 22,
  },
  qtyValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    minWidth: 20,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 15,
    color: '#888',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 15,
    color: '#1A1A1A',
    fontWeight: '600',
  },
  freeDeliveryNote: {
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 4,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  totalValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  placeOrderBtn: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  placeOrderText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
