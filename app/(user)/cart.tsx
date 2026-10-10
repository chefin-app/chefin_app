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
import { useCustomerLocation } from '@/src/context/CustomerLocationContext';
import { toRequestedOptionSelections } from '@/src/utils/menuOptions';
import { type DeliveryAddress } from '@/src/components/delivery/DeliveryAddressModal';
import LocationPromptModal from '@/src/components/location/LocationPromptModal';
import GlobalCartOverview from '@/src/components/cart/GlobalCartOverview';
import PaymentMethodSelector from '@/src/components/cart/PaymentMethodSelector';
import { checkCartAvailability, type BasketAvailability } from '@/src/utils/cartAvailability';
import { formatArrivalWindow, formatScheduledWindow } from '@/src/utils/orderStatus';
import { findServiceRegion } from '@/src/constants/serviceRegions';
import {
  loadCheckoutDraft,
  removeCheckoutDraft,
  type CheckoutDeliveryQuote,
  type CheckoutFulfillmentType,
} from '@/src/utils/checkout-state';
import theme from '@/src/styles/theme';

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
  const { fulfillmentPreference, location, region, selectLocation, setFulfillmentPreference } =
    useCustomerLocation();
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
  const [paymentMethod, setPaymentMethod] = useState<'cook_qr' | 'pay_on_collection'>('cook_qr');
  const [paymentAcknowledged, setPaymentAcknowledged] = useState(false);
  const [paymentOptions, setPaymentOptions] = useState<{
    qr_enabled: boolean;
    collection_enabled: boolean;
  } | null>(null);
  const [paymentOptionsError, setPaymentOptionsError] = useState('');
  const [paymentOptionsLoading, setPaymentOptionsLoading] = useState(false);
  const [paymentOptionsRetry, setPaymentOptionsRetry] = useState(0);
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>(fulfillmentPreference);
  useEffect(() => {
    setPaymentAcknowledged(false);
    if (fulfillmentType === 'delivery') setPaymentMethod('cook_qr');
  }, [fulfillmentType, cookId]);
  useEffect(() => {
    let active = true;
    setPaymentOptions(null);
    setPaymentOptionsError('');
    setPaymentAcknowledged(false);
    if (!cookId || !session?.access_token) {
      setPaymentOptionsLoading(false);
      setPaymentOptionsError('Sign in to load payment options.');
      return;
    }
    setPaymentOptionsLoading(true);
    void fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/direct-payments/settings/${cookId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      })
      .then(body => {
        if (active) {
          setPaymentOptions(body.settings);
          if (body.settings?.qr_enabled) setPaymentMethod('cook_qr');
          setPaymentOptionsError(
            body.settings ? '' : 'This cook has not configured payment options yet.'
          );
          if (
            !body.settings?.qr_enabled &&
            body.settings?.collection_enabled &&
            fulfillmentType === 'pickup'
          )
            setPaymentMethod('pay_on_collection');
        }
      })
      .catch(() => {
        if (active)
          setPaymentOptionsError('We couldn’t load this cook’s payment options. Please try again.');
      })
      .finally(() => {
        if (active) setPaymentOptionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cookId, session?.access_token, fulfillmentType, paymentOptionsRetry]);
  const paymentReady =
    !paymentOptionsLoading &&
    !paymentOptionsError &&
    paymentAcknowledged &&
    (paymentMethod === 'cook_qr'
      ? paymentOptions?.qr_enabled
      : fulfillmentType === 'pickup' && paymentOptions?.collection_enabled);
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
    if (!checkoutDraftLoaded) setFulfillmentType(fulfillmentPreference);
  }, [checkoutDraftLoaded, fulfillmentPreference]);

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
    if (!address || !location) return;
    const addressRegion = findServiceRegion(address.latitude, address.longitude);
    const sameCoordinates =
      Math.abs(address.latitude - location.latitude) < 0.0001 &&
      Math.abs(address.longitude - location.longitude) < 0.0001;
    if (addressRegion?.id === region.id && sameCoordinates) return;
    setAddress(null);
    setQuotes([]);
    setQuoteExpiresAt(null);
  }, [address, location, region.id]);

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
    if (!setFulfillmentPreference('delivery')) {
      Alert.alert(
        'Delivery unavailable',
        `Delivery is not available in ${region.name} yet. Choose pickup or change to Klang Valley.`
      );
      return;
    }
    setFulfillmentType('delivery');
    if (!user) {
      Alert.alert('Login Required', 'Please login to place your order.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Login', onPress: () => router.push('/(auth)/login') },
      ]);
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

    if (
      !paymentAcknowledged ||
      !paymentOptions ||
      (paymentMethod === 'cook_qr'
        ? !paymentOptions.qr_enabled
        : fulfillmentType !== 'pickup' || !paymentOptions.collection_enabled)
    ) {
      Alert.alert(
        'Choose payment',
        'Choose an available payment option and acknowledge the direct payment notice.'
      );
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
          paymentMethod,
          directPaymentAcknowledged: paymentAcknowledged,
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
          'Wait for the cook to accept. Open your order for payment instructions.',
          [
            {
              text: 'View order',
              onPress: () =>
                router.replace({
                  pathname: '/order-status/[orderId]',
                  params: { orderId: body.orders[0].id },
                }),
            },
          ]
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
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (cartItems.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
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
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
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
        contentContainerStyle={{ paddingBottom: 16 }}
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
                  <Ionicons name="trash-outline" size={18} color={theme.colors.destructive} />
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
        {/* Summary and payment details scroll together on smaller screens. */}
        <View style={styles.checkoutDetails}>
          <View style={styles.fulfillmentToggle}>
            <TouchableOpacity
              style={[
                styles.fulfillmentOption,
                fulfillmentType === 'pickup' && styles.fulfillmentOptionActive,
              ]}
              onPress={() => {
                setFulfillmentPreference('pickup');
                setFulfillmentType('pickup');
              }}
            >
              <Ionicons
                name="bag-handle-outline"
                size={18}
                color={
                  fulfillmentType === 'pickup'
                    ? theme.colors.primaryOnLight
                    : theme.colors.textSecondary
                }
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
                color={
                  fulfillmentType === 'delivery'
                    ? theme.colors.primaryOnLight
                    : theme.colors.textSecondary
                }
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
              <Ionicons name="location-outline" size={21} color={theme.colors.primaryOnLight} />
              <View style={{ flex: 1 }}>
                <Text style={styles.addressTitle}>
                  {address ? 'Deliver to' : 'Add exact delivery address'}
                </Text>
                {address ? (
                  <Text style={styles.addressText} numberOfLines={2}>
                    {[address.addressLine2, address.addressLine1].filter(Boolean).join(', ')},{' '}
                    {address.postcode} {address.city}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.addressEdit}>{address ? 'Edit' : 'Add'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.pickupNotice}>
              <Ionicons name="bag-handle-outline" size={26} color="#9A5B25" />
              <View style={{ flex: 1 }}>
                <Text style={styles.addressTitle}>This is a pickup order</Text>
                <Text style={styles.addressText}>
                  Collect your food from {cartItems[0]?.cookName || 'the home restaurant'} when it’s
                  ready. Your selected collection time is shown with each dish above.
                </Text>
              </View>
            </View>
          )}

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
              <ActivityIndicator size="small" color={theme.colors.primaryOnLight} />
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

          <PaymentMethodSelector
            qrAvailable={!!paymentOptions?.qr_enabled}
            collectionAvailable={
              fulfillmentType === 'pickup' && !!paymentOptions?.collection_enabled
            }
            loading={paymentOptionsLoading}
            error={paymentOptionsError}
            disabled={placingOrder}
            value={paymentMethod}
            acknowledged={paymentAcknowledged}
            onSelect={method => {
              if (method !== paymentMethod) {
                setPaymentMethod(method);
                setPaymentAcknowledged(false);
              }
            }}
            onAcknowledge={() => setPaymentAcknowledged(value => !value)}
            onRetry={() => setPaymentOptionsRetry(value => value + 1)}
          />
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>RM {grandTotal.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.placeOrderBtn, (placingOrder || !paymentReady) && { opacity: 0.5 }]}
          onPress={handlePlaceOrder}
          disabled={placingOrder || !paymentReady}
          accessibilityRole="button"
          accessibilityState={{ disabled: placingOrder || !paymentReady }}
        >
          {placingOrder ? (
            <ActivityIndicator color={theme.colors.textOnAction} />
          ) : (
            <Text style={styles.placeOrderText}>
              {fulfillmentType === 'pickup' ? 'Place Order · Pickup' : 'Place Order · Delivery'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
      <LocationPromptModal
        visible={addressOpen}
        initialView="location"
        onClose={() => setAddressOpen(false)}
        delivery={{
          initialAddress: address,
          defaults: {
            ...addressDefaults,
            latitude: location?.latitude,
            longitude: location?.longitude,
          },
          onSave: async nextAddress => {
            const synced = await selectLocation({
              latitude: nextAddress.latitude,
              longitude: nextAddress.longitude,
              label: [
                nextAddress.addressLine1,
                nextAddress.addressLine2,
                nextAddress.postcode,
                nextAddress.city,
                nextAddress.state,
              ]
                .filter(Boolean)
                .join(', '),
              source: 'manual',
            });
            if (!synced) {
              Alert.alert(
                'Address outside your region',
                'Choose an address in Klang Valley or change your selected region.'
              );
              return;
            }
            setAddress(nextAddress);
            setAddressOpen(false);
            await requestQuote(nextAddress);
          },
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
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.separator,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: theme.colors.separator,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  clearAllText: {
    color: theme.colors.destructive,
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
    color: theme.colors.text,
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 16,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  startShoppingBtn: {
    backgroundColor: theme.colors.primaryAction,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
  },
  startShoppingText: {
    color: theme.colors.textOnAction,
    fontSize: 16,
    fontWeight: '700',
  },
  itemCount: {
    fontSize: 14,
    color: theme.colors.textMuted,
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
    backgroundColor: theme.colors.surface,
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
    color: theme.colors.text,
    flex: 1,
    marginRight: 8,
  },
  cartItemChef: {
    fontSize: 13,
    color: theme.colors.textMuted,
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
    color: theme.colors.placeholder,
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
    color: theme.colors.text,
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
    backgroundColor: theme.colors.separator,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: {
    opacity: 0.4,
  },
  qtyBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    lineHeight: 22,
  },
  maxQtyNote: {
    fontSize: 11,
    color: theme.colors.placeholder,
    marginTop: 4,
  },
  qtyValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    minWidth: 20,
    textAlign: 'center',
  },
  footer: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 10,
  },
  checkoutDetails: { backgroundColor: theme.colors.surface, padding: 24, borderRadius: 24 },
  pickupNotice: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#FFF5EC',
    borderRadius: 12,
    marginBottom: 20,
  },
  fulfillmentToggle: {
    flexDirection: 'row-reverse',
    backgroundColor: theme.colors.surface,
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
    borderRadius: 30,
  },
  fulfillmentOptionActive: {
    backgroundColor: '#EDF9F8',
  },
  fulfillmentOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  fulfillmentOptionTextActive: {
    color: theme.colors.primaryOnLight,
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
  addressEdit: { fontSize: 13, fontWeight: '800', color: theme.colors.primaryOnLight },
  quoteStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  quoteButton: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 8,
  },
  quoteButtonText: { color: theme.colors.primaryOnLight, fontSize: 13, fontWeight: '800' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 15,
    color: theme.colors.textMuted,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 15,
    color: theme.colors.text,
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
    color: theme.colors.primaryOnLight,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 4,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.separator,
    paddingTop: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  totalValue: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  placeOrderBtn: {
    backgroundColor: theme.colors.primaryAction,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  placeOrderText: {
    color: theme.colors.textOnAction,
    fontSize: 16,
    fontWeight: '700',
  },
});
