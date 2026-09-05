import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCart, CartItem } from '@/src/context/CartContext';
import { useAuth } from '@/src/services/auth-context';
import {
  getDefaultPaymentCard,
  loadPaymentMethods,
  type SavedPaymentCard,
} from '@/src/utils/payment-method-storage';
import { toRequestedOptionSelections } from '@/src/utils/menuOptions';
import {
  DeliveryAddressModal,
  type DeliveryAddress,
} from '@/src/components/delivery/DeliveryAddressModal';
import GlobalCartOverview from '@/src/components/cart/GlobalCartOverview';
import { checkCartAvailability, type BasketAvailability } from '@/src/utils/cartAvailability';
import { formatArrivalWindow, formatScheduledWindow } from '@/src/utils/orderStatus';
import {
  loadCheckoutDraft,
  removeCheckoutDraft,
  saveCheckoutDraft,
  type CheckoutDeliveryQuote,
  type CheckoutFulfillmentType,
} from '@/src/utils/checkout-state';

type FulfillmentType = CheckoutFulfillmentType;
type DeliveryQuote = CheckoutDeliveryQuote;

const getPickupWindowEnd = (item: CartItem): string | undefined => {
  if (item.pickupSlotEnd) return item.pickupSlotEnd;
  if (!item.pickupSlotStart) return undefined;
  const start = new Date(item.pickupSlotStart).getTime();
  return Number.isNaN(start) ? undefined : new Date(start + 30 * 60_000).toISOString();
};

export default function CartScreen() {
  const params = useLocalSearchParams<{ cookId?: string | string[] }>();
  const cookId = Array.isArray(params.cookId) ? params.cookId[0] : params.cookId;
  return cookId ? <RestaurantCartScreen cookId={cookId} /> : <GlobalCartOverview />;
}

function RestaurantCartScreen({ cookId }: { cookId: string }) {
  const router = useRouter();
  const { user, session, canMutate, accountStatus } = useAuth();
  const {
    cartItems: allCartItems,
    removeFromCart,
    updateQuantity,
    clearCookCart,
    hydrated,
  } = useCart();
  const cartItems = useMemo(
    () => allCartItems.filter(item => item.cookId === cookId),
    [allCartItems, cookId]
  );
  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems]
  );
  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );
  const clearCart = useCallback(() => clearCookCart(cookId), [clearCookCart, cookId]);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('pickup');
  const [address, setAddress] = useState<DeliveryAddress | null>(null);
  const [addressDefaults, setAddressDefaults] = useState<Partial<DeliveryAddress>>({});
  const [addressOpen, setAddressOpen] = useState(false);
  const [quotes, setQuotes] = useState<DeliveryQuote[]>([]);
  const [quoteExpiresAt, setQuoteExpiresAt] = useState<string | null>(null);
  const [checkoutDraftLoaded, setCheckoutDraftLoaded] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [basketAvailability, setBasketAvailability] = useState<BasketAvailability | null>(null);
  const cartFingerprint = useMemo(
    () =>
      cartItems
        .map(item => [
          item.lineId,
          item.quantity,
          item.pickupSlotStart,
          item.pickupSlotEnd,
          item.selectedOptions,
        ])
        .join('|'),
    [cartItems]
  );

  const previousCartFingerprint = useRef(cartFingerprint);

  useEffect(() => {
    if (previousCartFingerprint.current === cartFingerprint) return;
    previousCartFingerprint.current = cartFingerprint;
    setQuotes([]);
    setQuoteExpiresAt(null);
  }, [cartFingerprint]);

  useEffect(() => {
    if (!hydrated) return;
    if (!user?.id) {
      setCheckoutDraftLoaded(true);
      return;
    }
    let cancelled = false;
    loadCheckoutDraft(user.id, cookId, cartFingerprint)
      .then(draft => {
        if (cancelled || !draft) return;
        setFulfillmentType(draft.fulfillmentType);
        setAddress(draft.address);
        setAddressDefaults(draft.addressDefaults);
        setQuotes(draft.quotes);
        setQuoteExpiresAt(draft.quoteExpiresAt);
      })
      .catch(error => console.warn('Could not restore checkout state', error))
      .finally(() => {
        if (!cancelled) setCheckoutDraftLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cartFingerprint, cookId, hydrated, user?.id]);

  const promptForUnavailableBasket = useCallback(
    (status: BasketAvailability) => {
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
                params: { id: cookId, openSchedule: '1' },
              }),
          },
          {
            text: 'Another restaurant',
            onPress: () => router.push('/(user)/(tabs)/search'),
          },
        ]
      );
    },
    [cookId, router]
  );

  const validateBasket = useCallback(async () => {
    if (cartItems.length === 0) return null;
    const result = await checkCartAvailability(cartItems);
    const status = result.find(basket => basket.cookId === cookId) ?? null;
    setBasketAvailability(status);
    return status;
  }, [cartItems, cookId]);

  useEffect(() => {
    validateBasket().catch(error => {
      console.warn('Could not refresh basket availability', error);
      setBasketAvailability(null);
    });
  }, [validateBasket]);

  useEffect(() => {
    if (!quoteExpiresAt) return;
    const remaining = new Date(quoteExpiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      setQuotes([]);
      setQuoteExpiresAt(null);
      return;
    }
    const timeout = setTimeout(() => {
      setQuotes([]);
      setQuoteExpiresAt(null);
    }, remaining + 100);
    return () => clearTimeout(timeout);
  }, [quoteExpiresAt]);

  useEffect(() => {
    if (!session?.access_token || !checkoutDraftLoaded) return;
    fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/delivery/address`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(response =>
        response.ok ? response.json() : Promise.reject(new Error('Address request failed'))
      )
      .then(body => {
        setAddress(current => current ?? body.address ?? null);
        setAddressDefaults(current =>
          Object.keys(current).length > 0 ? current : (body.defaults ?? {})
        );
      })
      .catch(error => console.warn('Could not load saved delivery address', error));
  }, [checkoutDraftLoaded, session?.access_token]);

  const requestQuote = useCallback(
    async (deliveryAddress: DeliveryAddress) => {
      if (!session?.access_token) return false;
      setQuoting(true);
      try {
        const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/delivery/quote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            address: deliveryAddress,
            items: cartItems.map(item => ({
              listingId: item.listingId,
              quantity: item.quantity,
              pickupTime: item.pickupSlotStart,
              pickupWindowEnd: getPickupWindowEnd(item),
              selectedOptions: toRequestedOptionSelections(item.selectedOptions),
            })),
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'Could not get a Lalamove quote.');
        setQuotes(body.quotes ?? []);
        setQuoteExpiresAt(body.expiresAt ?? null);
        return true;
      } catch (error: unknown) {
        setQuotes([]);
        setQuoteExpiresAt(null);
        Alert.alert(
          'Delivery quote unavailable',
          error instanceof Error ? error.message : 'Try again or choose pickup.'
        );
        return false;
      } finally {
        setQuoting(false);
      }
    },
    [cartItems, session?.access_token]
  );

  const deliveryFee =
    fulfillmentType === 'delivery' ? quotes.reduce((sum, quote) => sum + quote.customerFee, 0) : 0;
  const quoteIsCurrent =
    quotes.length > 0 &&
    Boolean(quoteExpiresAt) &&
    new Date(quoteExpiresAt!).getTime() > Date.now();

  const chooseDelivery = () => {
    setFulfillmentType('delivery');
    if (!user) {
      Alert.alert(
        'Login required',
        'Sign in to save an exact delivery address and request a Lalamove quote.'
      );
    } else if (!address) {
      setAddressOpen(true);
    } else if (!quoteIsCurrent) {
      requestQuote(address);
    }
  };

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) return;

    let latestAvailability: BasketAvailability | null;
    try {
      latestAvailability = await validateBasket();
    } catch (error) {
      console.warn('Could not validate basket before checkout', error);
      Alert.alert(
        'Could not check this basket',
        'We could not confirm the latest dish availability. Please try again.'
      );
      return;
    }
    if (latestAvailability && latestAvailability.status !== 'ready') {
      promptForUnavailableBasket(latestAvailability);
      return;
    }

    if (!user) {
      Alert.alert('Login Required', 'Please login to place your order.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Login', onPress: () => router.push('/(auth)/login') },
      ]);
      return;
    }
    if (!canMutate) {
      Alert.alert(
        'Checkout unavailable',
        accountStatus === 'suspended'
          ? 'Your account is currently read-only, so new orders cannot be placed.'
          : 'Account access must be verified before placing an order.'
      );
      return;
    }
    const quoteValidAtCheckout =
      quotes.length > 0 &&
      Boolean(quoteExpiresAt) &&
      new Date(quoteExpiresAt!).getTime() > Date.now();
    if (fulfillmentType === 'delivery' && (!address || !quoteValidAtCheckout)) {
      if (!address) setAddressOpen(true);
      else await requestQuote(address);
      Alert.alert(
        'Live quote required',
        'Review the current Lalamove fee, then tap Place Order again.'
      );
      return;
    }

    // Require a saved payment method before allowing checkout. The storage
    // helper also understands the original single-card format.
    let savedCard: SavedPaymentCard | null = null;
    try {
      savedCard = getDefaultPaymentCard(await loadPaymentMethods(user.id));
    } catch (error) {
      console.warn('Failed to load payment methods', error);
      Alert.alert('Could not load payment methods', 'Please try again before placing your order.');
      return;
    }
    if (!savedCard) {
      Alert.alert('Payment method needed', 'Add a card to place your order.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add card',
          onPress: async () => {
            try {
              await saveCheckoutDraft(user.id, cookId, {
                cartFingerprint,
                fulfillmentType,
                address,
                addressDefaults,
                quotes,
                quoteExpiresAt,
              });
            } catch (error) {
              console.warn('Could not preserve checkout state', error);
            }
            router.push({
              pathname: '/(user)/payment-methods',
              params: { returnTo: `/(user)/cart?cookId=${encodeURIComponent(cookId)}` },
            });
          },
        },
      ]);
      return;
    }

    setPlacingOrder(true);
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          userId: user.id,
          fulfillmentType,
          deliveryJobIds: fulfillmentType === 'delivery' ? quotes.map(quote => quote.jobId) : [],
          items: cartItems.map(item => ({
            listingId: item.listingId,
            quantity: item.quantity,
            pickupDate: item.serviceDate ?? item.selectedDate,
            pickupTime: item.pickupSlotStart,
            pickupWindowEnd: getPickupWindowEnd(item),
            priceAtOrder: item.price,
            customerNote: item.customerNote,
            selectedOptions: toRequestedOptionSelections(item.selectedOptions),
          })),
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        await removeCheckoutDraft(user.id, cookId).catch(error =>
          console.warn('Could not clear checkout state', error)
        );
        clearCookCart(cookId);
        Alert.alert(
          'Order Placed!',
          `Payment method: ${savedCard.brand} ending in ${savedCard.last4}. No real payment was processed in this demo.`,
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

  if (!hydrated || !checkoutDraftLoaded) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyStateContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  if (cartItems.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Restaurant basket</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyEmoji}>🛒</Text>
          <Text style={styles.emptyTitle}>This basket is empty</Text>
          <Text style={styles.emptySubtitle}>It may have been checked out or removed.</Text>
          <TouchableOpacity
            style={styles.startShoppingBtn}
            onPress={() => router.replace('/(user)/cart')}
          >
            <Text style={styles.startShoppingText}>View all baskets</Text>
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
        <Text style={styles.headerTitle}>{cartItems[0]?.cookName || 'Order summary'}</Text>
        <TouchableOpacity
          onPress={() => {
            Alert.alert('Remove this basket?', 'Remove every item from this home restaurant?', [
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
        {basketAvailability && basketAvailability.status !== 'ready' ? (
          <TouchableOpacity
            style={styles.unavailableBasketBanner}
            onPress={() => promptForUnavailableBasket(basketAvailability)}
          >
            <Ionicons name="alert-circle-outline" size={20} color="#A33A2C" />
            <Text style={styles.unavailableBasketText}>
              {basketAvailability.message} Tap to fix this basket.
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Cart Item Count */}
        <Text style={styles.itemCount}>
          {cartCount} item{cartCount !== 1 ? 's' : ''} in your cart
        </Text>

        {/* Items */}
        {cartItems.map((item: CartItem) => (
          <View key={item.lineId} style={styles.cartCard}>
            <Image source={{ uri: item.imageUrl ?? '' }} style={styles.cartItemImage} />
            <View style={styles.cartItemInfo}>
              <View style={styles.cartItemHeader}>
                <Text style={styles.cartItemTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <TouchableOpacity onPress={() => removeFromCart(item.lineId)}>
                  <Ionicons name="trash-outline" size={18} color="#FF4D4D" />
                </TouchableOpacity>
              </View>
              {item.cookName && <Text style={styles.cartItemChef}>by {item.cookName}</Text>}
              {(item.selectedOptions?.length ?? 0) > 0 ? (
                <View style={styles.cartOptions}>
                  {item.selectedOptions!.map(option => (
                    <Text key={option.optionId} style={styles.cartOptionText}>
                      {option.groupName}: {option.optionName}
                      {option.priceDelta > 0 ? ` (+RM ${option.priceDelta.toFixed(2)})` : ''}
                    </Text>
                  ))}
                </View>
              ) : null}
              <Text style={styles.cartItemDate}>
                Order window:{' '}
                {formatScheduledWindow(
                  item.pickupSlotStart ?? item.selectedDate.toISOString(),
                  item.pickupSlotEnd ?? null
                )}
              </Text>
              {item.customerNote ? (
                <Text style={styles.cartItemNote} numberOfLines={2}>
                  Note: {item.customerNote}
                </Text>
              ) : null}
              <View style={styles.cartItemFooter}>
                <Text style={styles.cartItemPrice}>
                  RM {(item.price * item.quantity).toFixed(2)}
                </Text>
                <View style={styles.quantityRow}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQuantity(item.lineId, item.quantity - 1)}
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={[
                      styles.qtyBtn,
                      item.maxQuantity != null &&
                        item.quantity >= item.maxQuantity &&
                        styles.qtyBtnDisabled,
                    ]}
                    disabled={item.maxQuantity != null && item.quantity >= item.maxQuantity}
                    onPress={() => updateQuantity(item.lineId, item.quantity + 1)}
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
        <View style={styles.fulfillmentToggle}>
          <TouchableOpacity
            style={[
              styles.fulfillmentOption,
              fulfillmentType === 'pickup' && styles.fulfillmentOptionActive,
            ]}
            onPress={() => setFulfillmentType('pickup')}
          >
            <Ionicons
              name="bag-handle-outline"
              size={18}
              color={fulfillmentType === 'pickup' ? '#fff' : '#666'}
            />
            <Text
              style={[
                styles.fulfillmentOptionText,
                fulfillmentType === 'pickup' && styles.fulfillmentOptionTextActive,
              ]}
            >
              Pickup
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.fulfillmentOption,
              fulfillmentType === 'delivery' && styles.fulfillmentOptionActive,
            ]}
            onPress={chooseDelivery}
          >
            <Ionicons
              name="bicycle-outline"
              size={18}
              color={fulfillmentType === 'delivery' ? '#fff' : '#666'}
            />
            <Text
              style={[
                styles.fulfillmentOptionText,
                fulfillmentType === 'delivery' && styles.fulfillmentOptionTextActive,
              ]}
            >
              Delivery
            </Text>
          </TouchableOpacity>
        </View>

        {fulfillmentType === 'delivery' ? (
          <TouchableOpacity style={styles.addressCard} onPress={() => setAddressOpen(true)}>
            <Ionicons name="location-outline" size={21} color="#216E39" />
            <View style={{ flex: 1 }}>
              <Text style={styles.addressTitle}>
                {address ? 'Deliver to' : 'Add exact delivery address'}
              </Text>
              {address ? (
                <Text style={styles.addressText} numberOfLines={2}>
                  {address.addressLine1}, {address.postcode} {address.city}
                </Text>
              ) : null}
            </View>
            <Text style={styles.addressEdit}>{address ? 'Edit' : 'Add'}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>RM {cartTotal.toFixed(2)}</Text>
        </View>
        {fulfillmentType === 'delivery' && quoteIsCurrent && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Live Lalamove fee</Text>
            <Text style={styles.summaryValue}>
              {deliveryFee === 0 ? 'FREE' : `RM ${deliveryFee.toFixed(2)}`}
            </Text>
          </View>
        )}
        {fulfillmentType === 'delivery' && quoting ? (
          <View style={styles.quoteStatus}>
            <ActivityIndicator size="small" color="#216E39" />
            <Text style={styles.thresholdNote}>Getting live Lalamove price…</Text>
          </View>
        ) : null}
        {fulfillmentType === 'delivery' && !quoting && !quoteIsCurrent ? (
          <TouchableOpacity
            style={styles.quoteButton}
            onPress={() => (address ? requestQuote(address) : setAddressOpen(true))}
          >
            <Text style={styles.quoteButtonText}>
              {address ? 'Get live Lalamove quote' : 'Add address for a delivery quote'}
            </Text>
          </TouchableOpacity>
        ) : null}
        {fulfillmentType === 'delivery' && quoteIsCurrent
          ? quotes.map(quote => (
              <Text
                key={quote.jobId}
                style={quote.freeDeliveryApplied ? styles.freeDeliveryNote : styles.thresholdNote}
              >
                {quote.freeDeliveryApplied
                  ? `${quote.cookName} covers the RM ${quote.quotedFee.toFixed(2)} delivery fee — you pay RM 0`
                  : `RM ${quote.customerFee.toFixed(2)} based on the live Lalamove route`}
                {` · Estimated arrival ${formatArrivalWindow(quote.estimatedArrivalStart, quote.estimatedArrivalEnd)}`}
              </Text>
            ))
          : null}
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
      <DeliveryAddressModal
        visible={addressOpen}
        initialAddress={address}
        defaults={addressDefaults}
        onClose={() => setAddressOpen(false)}
        onSave={nextAddress => {
          setAddress(nextAddress);
          setAddressOpen(false);
          requestQuote(nextAddress);
        }}
      />
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
  cartItemNote: {
    marginTop: 4,
    color: '#69737B',
    fontSize: 12,
    lineHeight: 17,
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
  unavailableBasketBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 13,
    backgroundColor: '#FFF0ED',
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  unavailableBasketText: {
    flex: 1,
    color: '#8B392F',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
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
  cartOptions: {
    marginBottom: 7,
    gap: 2,
  },
  cartOptionText: {
    fontSize: 11,
    lineHeight: 16,
    color: '#657069',
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
  qtyBtnDisabled: {
    opacity: 0.4,
  },
  qtyBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    lineHeight: 22,
  },
  maxQtyNote: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
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
  fulfillmentToggle: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  fulfillmentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  fulfillmentOptionActive: {
    backgroundColor: '#4CAF50',
  },
  fulfillmentOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  fulfillmentOptionTextActive: {
    color: '#fff',
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#CFE1D3',
    backgroundColor: '#F4FAF5',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  addressTitle: { fontSize: 13, fontWeight: '800', color: '#214D2B' },
  addressText: { fontSize: 12, color: '#5D6A60', marginTop: 2 },
  addressEdit: { fontSize: 13, fontWeight: '800', color: '#216E39' },
  quoteStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  quoteButton: {
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 8,
  },
  quoteButtonText: { color: '#216E39', fontSize: 13, fontWeight: '800' },
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
  thresholdNote: {
    fontSize: 12,
    color: '#B26A00',
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 4,
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
