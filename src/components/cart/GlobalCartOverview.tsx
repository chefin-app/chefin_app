import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { images } from '@/src/constants/images';
import { useCart, type CartItem } from '@/src/context/CartContext';
import { checkCartAvailability, type BasketAvailability } from '@/src/utils/cartAvailability';

type Basket = {
  cookId: string;
  cookName: string;
  items: CartItem[];
  count: number;
  subtotal: number;
};

const formatOrderTime = (item: CartItem): string => {
  if (!item.pickupSlotStart) return 'Choose an order time';
  return new Date(item.pickupSlotStart).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export default function GlobalCartOverview() {
  const router = useRouter();
  const { cartItems, cartCount, hydrated, clearCart, clearCookCart } = useCart();
  const [statuses, setStatuses] = useState<Record<string, BasketAvailability>>({});
  const [checking, setChecking] = useState(false);
  const [openingCookId, setOpeningCookId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const baskets = useMemo(() => {
    const byCook = new Map<string, Basket>();
    for (const item of cartItems) {
      const basket = byCook.get(item.cookId) ?? {
        cookId: item.cookId,
        cookName: item.cookName || 'Home restaurant',
        items: [],
        count: 0,
        subtotal: 0,
      };
      basket.items.push(item);
      basket.count += item.quantity;
      basket.subtotal += item.price * item.quantity;
      byCook.set(item.cookId, basket);
    }
    return [...byCook.values()];
  }, [cartItems]);

  const refreshStatus = useCallback(async () => {
    if (!hydrated || cartItems.length === 0) {
      setStatuses({});
      return;
    }
    setChecking(true);
    setStatusError(null);
    try {
      const result = await checkCartAvailability(cartItems);
      setStatuses(Object.fromEntries(result.map(status => [status.cookId, status])));
    } catch (error: unknown) {
      setStatusError(error instanceof Error ? error.message : 'Availability could not be checked.');
    } finally {
      setChecking(false);
    }
  }, [cartItems, hydrated]);

  useFocusEffect(
    useCallback(() => {
      refreshStatus();
    }, [refreshStatus])
  );

  const openBasket = async (basket: Basket) => {
    if (openingCookId) return;
    setOpeningCookId(basket.cookId);
    try {
      const result = await checkCartAvailability(basket.items);
      const status = result.find(candidate => candidate.cookId === basket.cookId);
      if (!status) throw new Error('The restaurant basket could not be checked.');
      setStatuses(current => ({ ...current, [basket.cookId]: status }));
      if (status.status === 'ready') {
        router.push({ pathname: '/(user)/cart', params: { cookId: basket.cookId } });
        return;
      }
      Alert.alert(
        status.status === 'store_closed' ? 'Restaurant unavailable' : 'Basket needs an update',
        status.message ?? 'Some dishes are unavailable for the selected time.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Choose another time',
            onPress: () =>
              router.push({
                pathname: '/restaurant/[id]',
                params: { id: basket.cookId, openSchedule: '1' },
              }),
          },
          {
            text: 'Another restaurant',
            onPress: () => router.push('/(user)/(tabs)/search'),
          },
        ]
      );
    } catch (error: unknown) {
      Alert.alert(
        'Could not check this basket',
        error instanceof Error ? error.message : 'Please check your connection and try again.'
      );
    } finally {
      setOpeningCookId(null);
    }
  };

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#238B45" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={25} color="#202622" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Cart</Text>
        {cartItems.length ? (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() =>
              Alert.alert('Clear every basket?', 'This removes all saved restaurant baskets.', [
                { text: 'Keep baskets', style: 'cancel' },
                { text: 'Clear all', style: 'destructive', onPress: clearCart },
              ])
            }
          >
            <Text style={styles.manageText}>Manage</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      {cartItems.length === 0 ? (
        <View style={styles.centered}>
          <View style={styles.emptyIcon}>
            <Ionicons name="bag-outline" size={38} color="#68716B" />
          </View>
          <Text style={styles.emptyTitle}>No saved baskets</Text>
          <Text style={styles.emptyText}>
            Dishes you add from a home restaurant will appear here.
          </Text>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => router.replace('/(user)/(tabs)/home')}
          >
            <Text style={styles.browseText}>Browse home restaurants</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>
            {cartCount} item{cartCount === 1 ? '' : 's'} across {baskets.length} home restaurant
            {baskets.length === 1 ? '' : 's'}. Each basket checks out separately.
          </Text>
          {statusError ? (
            <TouchableOpacity style={styles.warning} onPress={refreshStatus}>
              <Ionicons name="cloud-offline-outline" size={18} color="#8A6100" />
              <Text style={styles.warningText}>{statusError} Tap to retry.</Text>
            </TouchableOpacity>
          ) : null}
          {baskets.map(basket => {
            const status = statuses[basket.cookId];
            const unavailable = status && status.status !== 'ready';
            const firstItem = basket.items[0];
            return (
              <TouchableOpacity
                key={basket.cookId}
                style={styles.card}
                activeOpacity={0.78}
                onPress={() => {
                  openBasket(basket);
                }}
              >
                <Image
                  source={firstItem.imageUrl ? { uri: firstItem.imageUrl } : images.templateMeal}
                  style={styles.image}
                />
                <View style={styles.cardCopy}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.restaurantName} numberOfLines={1}>
                      {status?.restaurantName || basket.cookName}
                    </Text>
                    <TouchableOpacity
                      hitSlop={8}
                      onPress={event => {
                        event.stopPropagation();
                        Alert.alert(
                          'Remove this basket?',
                          `${basket.cookName} will be removed from My Cart.`,
                          [
                            { text: 'Keep', style: 'cancel' },
                            {
                              text: 'Remove',
                              style: 'destructive',
                              onPress: () => clearCookCart(basket.cookId),
                            },
                          ]
                        );
                      }}
                    >
                      <Ionicons name="trash-outline" size={19} color="#8A9490" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.meta}>
                    {basket.count} item{basket.count === 1 ? '' : 's'} · RM{' '}
                    {basket.subtotal.toFixed(2)}
                  </Text>
                  <Text style={styles.time} numberOfLines={1}>
                    {formatOrderTime(firstItem)}
                  </Text>
                  {unavailable ? (
                    <Text style={styles.unavailable}>
                      {status.message || 'Unavailable for the selected time'}
                    </Text>
                  ) : (
                    <Text style={styles.ready}>
                      {checking && !status ? 'Checking availability…' : 'Ready to review'}
                    </Text>
                  )}
                </View>
                {openingCookId === basket.cookId ? (
                  <ActivityIndicator size="small" color="#238B45" />
                ) : (
                  <Ionicons name="chevron-forward" size={21} color="#68716B" />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F8F6' },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E5E1',
  },
  headerButton: { width: 76, minHeight: 44, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#202622' },
  manageText: { color: '#238B45', fontWeight: '800', textAlign: 'right' },
  content: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 13, lineHeight: 19, color: '#66706A', marginBottom: 14 },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF7DF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  warningText: { flex: 1, color: '#755A12', fontSize: 12, lineHeight: 17 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 13,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  image: { width: 66, height: 66, borderRadius: 13, backgroundColor: '#E8ECE9' },
  cardCopy: { flex: 1 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  restaurantName: { flex: 1, fontSize: 15, fontWeight: '800', color: '#202622' },
  meta: { marginTop: 4, fontSize: 13, color: '#505A53' },
  time: { marginTop: 3, fontSize: 12, color: '#747D77' },
  ready: { marginTop: 6, color: '#238B45', fontSize: 12, fontWeight: '800' },
  unavailable: { marginTop: 6, color: '#B13A2E', fontSize: 12, fontWeight: '800' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#E8ECE9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { marginTop: 18, fontSize: 21, fontWeight: '800', color: '#202622' },
  emptyText: { marginTop: 8, maxWidth: 290, textAlign: 'center', color: '#6B746E', lineHeight: 20 },
  browseButton: {
    marginTop: 22,
    borderRadius: 16,
    backgroundColor: '#238B45',
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  browseText: { color: '#FFF', fontWeight: '800' },
});
