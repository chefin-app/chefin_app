import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import MenuItemCard from '@/src/components/cards/MenuItemCard';
import LoadingSpinner from '@/src/components/feedback/LoadingSpinner';
import VerifiedBadge from '@/src/components/feedback/VerifiedBadge';
import StickyCartBar from '@/src/components/navigation/StickyCartBar';
import DishOrderModal, {
  type DishOrderAddPayload,
} from '@/src/components/restaurant/DishOrderModal';
import RestaurantScheduleSheet from '@/src/components/restaurant/RestaurantScheduleSheet';
import { images } from '@/src/constants/images';
import { useCart } from '@/src/context/CartContext';
import { useFavourites } from '@/src/context/FavouritesContext';
import { useAuth } from '@/src/services/auth-context';
import type { Listing } from '@/src/types/models';
import type { MenuOptionGroup } from '@/src/types/menuOptions';
import {
  buildMenuListingAvailabilitySummaries,
  formatAvailabilityLabel,
  getLocalDateKey,
  type AvailabilityRecord,
} from '@/src/utils/listingAvailability';
import { formatRating, getListingsRatingSummary, type RatedReview } from '@/src/utils/ratings';
import {
  buildRestaurantScheduleDays,
  formatOrderSelectionLabel,
  getClosedRestaurantOrderCopy,
  getListingScheduleMatch,
  isRestaurantWithinOrderingWindow,
  type ListingScheduleMatch,
  type RestaurantOrderSelection,
} from '@/src/utils/restaurantOrderSchedule';

interface RestaurantAvailabilityPayload {
  records?: AvailabilityRecord[];
  source?: 'recurring' | 'legacy' | null;
  currentlyAvailable?: boolean;
  remainingSlots?: number;
  constrainedBySellingSchedule?: boolean;
}

interface RestaurantDish
  extends Omit<Listing, 'created_at' | 'image_url' | 'location' | 'reviews'> {
  created_at?: string;
  image_url?: string | null;
  location?: string | null;
  ingredients?: string[] | null;
  reviews?: RatedReview[];
  option_groups?: MenuOptionGroup[];
  availability?: RestaurantAvailabilityPayload;
}

interface RestaurantProfile {
  id: string;
  full_name: string;
  restaurant_name?: string | null;
  profile_image?: string;
  bio?: string | null;
  is_verified?: boolean;
  verified?: boolean;
  free_delivery_threshold?: number | null;
}

interface RestaurantData {
  profile: RestaurantProfile;
  listings: RestaurantDish[];
  storeStatus: 'open' | 'busy' | 'paused';
  busyPrepMinutes: number | null;
}

const ASAP_SELECTION: RestaurantOrderSelection = { mode: 'asap' };
const UNAVAILABLE_BANNER_COLOR = '#8A6100';

const formatMatchLabel = (match: ListingScheduleMatch): string => {
  if (!match.available || !match.startTime || !match.endTime) return 'Order time unavailable';
  const selection: RestaurantOrderSelection = {
    mode: 'scheduled',
    serviceDate: match.serviceDate!,
    startTime: match.startTime,
    endTime: match.endTime,
  };
  return formatOrderSelectionLabel(selection);
};

export default function RestaurantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, dish, openSchedule } = useLocalSearchParams<{
    id?: string | string[];
    dish?: string | string[];
    openSchedule?: string | string[];
  }>();
  const restaurantId = Array.isArray(id) ? id[0] : id;
  const highlightDishId = Array.isArray(dish) ? dish[0] : dish;
  const shouldOpenSchedule = (Array.isArray(openSchedule) ? openSchedule[0] : openSchedule) === '1';
  const { session } = useAuth();
  const { toggleFavourite, isFavourite } = useFavourites();
  const { addToCart, cartItems, clearCookCart, rescheduleCookCart, updateQuantity } = useCart();

  const [data, setData] = useState<RestaurantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [orderSelection, setOrderSelection] = useState<RestaurantOrderSelection>(ASAP_SELECTION);
  const [scheduleVisible, setScheduleVisible] = useState(false);
  const [selectedDish, setSelectedDish] = useState<RestaurantDish | null>(null);
  const promptedClosedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // A `dish` param (from the profile page's top picks) opens that dish's
  // order sheet once the menu has loaded, then is consumed so closing the
  // sheet doesn't reopen it.
  useEffect(() => {
    if (!highlightDishId || !data) return;
    const target = data.listings.find(listing => listing.id === highlightDishId);
    if (target) setSelectedDish(target);
    router.setParams({ dish: undefined });
  }, [highlightDishId, data, router]);

  useEffect(() => {
    if (!shouldOpenSchedule || !data) return;
    setScheduleVisible(true);
    router.setParams({ openSchedule: undefined });
  }, [data, router, shouldOpenSchedule]);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/id/${restaurantId}`);
        const json = (await response.json().catch(() => ({}))) as Partial<RestaurantData> & {
          error?: string;
        };
        if (!response.ok || !json.profile) {
          throw new Error(json.error ?? 'This home restaurant is not available.');
        }
        if (!cancelled) {
          setData({
            profile: json.profile,
            listings: Array.isArray(json.listings) ? json.listings : [],
            storeStatus: json.storeStatus ?? 'open',
            busyPrepMinutes: json.busyPrepMinutes ?? null,
          });
        }
      } catch (error) {
        console.error('Error fetching restaurant data:', error);
        if (!cancelled) {
          setData(null);
          setLoadError(
            error instanceof Error ? error.message : 'This home restaurant is not available.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  useEffect(() => {
    if (!data || data.storeStatus === 'paused' || shouldOpenSchedule) return;
    const records = data.listings.flatMap(listing => listing.availability?.records ?? []);
    if (isRestaurantWithinOrderingWindow(records, clock)) return;

    const days = buildRestaurantScheduleDays(records, clock, 2, 30);
    const copy = getClosedRestaurantOrderCopy(days, clock);
    if (!copy) return;
    const promptKey = `${data.profile.id}:${copy.promptDetail}`;
    if (promptedClosedKeyRef.current === promptKey) return;
    promptedClosedKeyRef.current = promptKey;

    const timeout = setTimeout(() => {
      Alert.alert(
        'This restaurant is closed',
        `The next available order time is ${copy.promptDetail}. Select Order for later to choose a time.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Order for later', onPress: () => setScheduleVisible(true) },
        ]
      );
    }, 150);
    return () => clearTimeout(timeout);
  }, [clock, data, shouldOpenSchedule]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  if (loadError || !data?.profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.unavailableState}>
          <Ionicons name="restaurant-outline" size={48} color="#9AA3AB" />
          <Text style={styles.unavailableTitle}>Restaurant unavailable</Text>
          <Text style={styles.unavailableText}>
            {loadError ?? 'This home restaurant cannot be viewed right now.'}
          </Text>
          <TouchableOpacity style={styles.unavailableButton} onPress={() => router.back()}>
            <Text style={styles.unavailableButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { profile, listings: allListings, storeStatus, busyPrepMinutes } = data;
  const availabilityRecords = allListings.flatMap(dish => dish.availability?.records ?? []);
  const getDishMatch = (dishId: string, selection = orderSelection) =>
    getListingScheduleMatch(availabilityRecords, dishId, selection, clock);
  const listings = allListings.filter(
    dish => !dish.availability?.constrainedBySellingSchedule || getDishMatch(dish.id).available
  );
  const menuAvailability = buildMenuListingAvailabilitySummaries(
    listings,
    availabilityRecords,
    getLocalDateKey(clock),
    clock
  );
  const scheduleDays = buildRestaurantScheduleDays(availabilityRecords, clock, 2, 30);
  const asapAvailable = listings.some(dish => getDishMatch(dish.id, ASAP_SELECTION).available);
  const restaurantOpenNow = isRestaurantWithinOrderingWindow(availabilityRecords, clock);
  const closedOrderCopy =
    orderSelection.mode === 'asap' && !restaurantOpenNow
      ? getClosedRestaurantOrderCopy(scheduleDays, clock)
      : null;
  const allDishesUnavailable =
    listings.length > 0 && listings.every(dish => !getDishMatch(dish.id).available);
  const selectedDishMatch = selectedDish ? getDishMatch(selectedDish.id) : null;
  const displayVerified = profile.verified ?? profile.is_verified ?? false;
  const ratingSummary = getListingsRatingSummary(allListings);
  const displayRestaurantRating = formatRating(ratingSummary.average);
  const displayReviewCount = ratingSummary.count;
  const heroImage = allListings.find(dish => dish.image_url)?.image_url;
  const cookCartItems = cartItems.filter(item => item.cookId === profile.id);
  const restaurantDisplayName = profile.restaurant_name || profile.full_name || 'Home restaurant';

  const handleToggleFavourite = () => {
    if (!session?.user) {
      router.push('/(auth)/login');
      return;
    }
    toggleFavourite({
      profileId: profile.id,
      restaurantName: restaurantDisplayName,
      imageUrl: profile.profile_image,
      fullChefName: profile.full_name,
      rating: displayRestaurantRating,
      reviewCount: displayReviewCount,
    });
  };

  const shareRestaurant = () =>
    Share.share({
      title: restaurantDisplayName,
      message: `Check out ${restaurantDisplayName} by ${profile.full_name} on Chefin.`,
    }).catch(() => undefined);

  const promptOrderForLater = () => {
    if (!closedOrderCopy) return;
    Alert.alert(
      'This restaurant is closed',
      `The next available order time is ${closedOrderCopy.promptDetail}. Select Order for later to choose a time.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Order for later', onPress: () => setScheduleVisible(true) },
      ]
    );
  };

  const handleReportRestaurant = () => {
    router.push({
      pathname: '/report-listing',
      params: {
        targetType: 'restaurant',
        targetId: profile.id,
        targetName: restaurantDisplayName,
      },
    });
  };

  const getSelectionStart = (selection: RestaurantOrderSelection): string | undefined => {
    if (selection.mode === 'scheduled') return selection.startTime;
    return listings.map(dish => getDishMatch(dish.id, selection)).find(match => match.available)
      ?.startTime;
  };

  const applyOrderSelection = (selection: RestaurantOrderSelection) => {
    const nextStart = getSelectionStart(selection);
    const hasConflict = cookCartItems.some(
      item => item.pickupSlotStart && nextStart && item.pickupSlotStart !== nextStart
    );
    const apply = () => {
      setSelectedDish(null);
      setOrderSelection(selection);
    };

    if (!hasConflict) {
      apply();
      return;
    }

    const matches = cookCartItems.map(item => ({
      item,
      match: getDishMatch(item.listingId, selection),
    }));
    const targetStart = nextStart;
    const unavailable = matches.find(
      ({ item, match }) =>
        !match.available ||
        !match.startTime ||
        !match.endTime ||
        !match.serviceDate ||
        !targetStart ||
        match.startTime !== targetStart ||
        match.remainingSlots < item.quantity
    );
    if (unavailable) {
      Alert.alert(
        'Choose a different time',
        `${unavailable.item.title} is not available in enough quantity at that time. Your current basket has been kept.`,
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Update this basket’s time?',
      'Every dish in this restaurant basket will move to the new time.',
      [
        { text: 'Keep current time', style: 'cancel' },
        {
          text: 'Update time',
          onPress: () => {
            const firstMatch = matches[0]?.match;
            if (targetStart && firstMatch?.serviceDate && firstMatch.endTime) {
              rescheduleCookCart(profile.id, {
                selectedDate: new Date(targetStart),
                serviceDate: firstMatch.serviceDate,
                pickupSlotStart: targetStart,
                pickupSlotEnd: firstMatch.endTime,
                maxQuantityByListing: Object.fromEntries(
                  matches.map(({ item, match }) => [item.listingId, match.remainingSlots])
                ),
              });
            }
            apply();
          },
        },
      ]
    );
  };

  const addDishToCart = (
    targetDish: RestaurantDish,
    match: ListingScheduleMatch,
    { quantity, note, selectedOptions, unitPrice }: DishOrderAddPayload,
    afterCommit?: () => void
  ) => {
    if (!match.available || !match.startTime || !match.endTime || !match.serviceDate) {
      return;
    }

    const commit = () => {
      addToCart({
        listingId: targetDish.id,
        cookId: targetDish.cook_id,
        title: targetDish.title,
        price: unitPrice,
        basePrice: targetDish.price,
        selectedOptions,
        imageUrl: targetDish.image_url ?? undefined,
        cookName: restaurantDisplayName,
        quantity,
        selectedDate: new Date(match.startTime!),
        serviceDate: match.serviceDate,
        pickupSlotStart: match.startTime,
        pickupSlotEnd: match.endTime,
        maxQuantity: match.remainingSlots,
        customerNote: note || undefined,
      });
      afterCommit?.();
    };

    const hasConflict = cookCartItems.some(
      item => item.pickupSlotStart && item.pickupSlotStart !== match.startTime
    );
    if (!hasConflict) {
      commit();
      return;
    }

    Alert.alert(
      'Replace this restaurant’s cart?',
      'Your existing dishes use a different order time. Replace them with this selection?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace items',
          style: 'destructive',
          onPress: () => {
            clearCookCart(profile.id);
            commit();
          },
        },
      ]
    );
  };

  const addSelectedDish = (payload: DishOrderAddPayload) => {
    if (!selectedDish || !selectedDishMatch) return;
    addDishToCart(selectedDish, selectedDishMatch, payload, () => setSelectedDish(null));
  };

  const handleDishAddPress = (dish: RestaurantDish, match: ListingScheduleMatch) => {
    if ((dish.option_groups?.length ?? 0) > 0) {
      setSelectedDish(dish);
      return;
    }

    addDishToCart(dish, match, {
      quantity: 1,
      note: '',
      selectedOptions: [],
      unitPrice: dish.price,
    });
  };

  const availabilityLabelFor = (dish: RestaurantDish): string => {
    const match = getDishMatch(dish.id);
    if (match.available) {
      if (orderSelection.mode === 'asap') return 'Available now';
      const time = new Date(match.startTime!).toLocaleTimeString('en-MY', {
        timeZone: 'Asia/Kuala_Lumpur',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      return `Available for ${time}`;
    }
    if (orderSelection.mode === 'scheduled') return 'Unavailable for selected time';
    return formatAvailabilityLabel(menuAvailability[dish.id], clock);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image
            source={heroImage ? { uri: heroImage } : images.templateMeal}
            style={styles.heroImage}
          />
          <View style={[styles.heroShade, allDishesUnavailable && styles.heroShadeUnavailable]} />

          <TouchableOpacity
            style={[styles.heroCircleButton, styles.backButton, { top: insets.top + 10 }]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={25} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={[styles.heroRightControls, { top: insets.top + 10 }]}>
            <TouchableOpacity
              style={styles.heroCircleButton}
              onPress={handleToggleFavourite}
              accessibilityRole="button"
              accessibilityLabel={
                isFavourite(profile.id) ? 'Remove from favourites' : 'Add to favourites'
              }
            >
              <Ionicons
                name={isFavourite(profile.id) ? 'heart' : 'heart-outline'}
                size={24}
                color={isFavourite(profile.id) ? '#FF6B6B' : '#FFFFFF'}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.summaryStack}>
          {storeStatus === 'busy' ? (
            <View
              style={[
                styles.busyBanner,
                (closedOrderCopy || allDishesUnavailable) && styles.bannerStacked,
              ]}
              accessibilityRole="alert"
            >
              <View style={styles.busyBannerIcon}>
                <Ionicons name="megaphone-outline" size={19} color="#A05E03" />
              </View>
              <Text style={styles.busyBannerText}>
                This restaurant is busy right now. Your order may take a little longer to prepare.
              </Text>
            </View>
          ) : null}
          {storeStatus === 'paused' ? (
            <View style={styles.unavailableBanner} accessibilityRole="alert">
              <View style={styles.unavailableBannerIcon}>
                <Ionicons name="pause-circle-outline" size={19} color={UNAVAILABLE_BANNER_COLOR} />
              </View>
              <Text style={styles.unavailableBannerText}>
                <Text style={styles.unavailableBannerTitle}>Taking a short break</Text>
                {' · This restaurant isn’t accepting new orders right now'}
              </Text>
            </View>
          ) : null}
          {closedOrderCopy && storeStatus !== 'paused' ? (
            <TouchableOpacity
              style={styles.unavailableBanner}
              accessibilityRole="button"
              accessibilityLabel={`Restaurant closed. ${closedOrderCopy.bannerDetail}. Select an order time.`}
              activeOpacity={0.82}
              onPress={promptOrderForLater}
            >
              <View style={styles.unavailableBannerIcon}>
                <Ionicons name="storefront-outline" size={19} color={UNAVAILABLE_BANNER_COLOR} />
              </View>
              <Text style={styles.unavailableBannerText}>
                <Text style={styles.unavailableBannerTitle}>Closed</Text>
                {` · ${closedOrderCopy.bannerDetail}`}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={UNAVAILABLE_BANNER_COLOR} />
            </TouchableOpacity>
          ) : allDishesUnavailable && storeStatus !== 'paused' ? (
            <View style={styles.unavailableBanner} accessibilityRole="alert">
              <View style={styles.unavailableBannerIcon}>
                <Ionicons name="storefront-outline" size={19} color={UNAVAILABLE_BANNER_COLOR} />
              </View>
              <Text style={styles.unavailableBannerText}>
                <Text style={styles.unavailableBannerTitle}>Unavailable for now</Text>
                {' · Check back later'}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.summaryCard}
            activeOpacity={0.8}
            onPress={() =>
              router.push({ pathname: '/restaurant/[id]/profile', params: { id: profile.id } })
            }
            accessibilityRole="button"
            accessibilityLabel="View restaurant profile, reviews and details"
          >
            <Image
              source={
                profile.profile_image ? { uri: profile.profile_image } : images.templateAvatar
              }
              style={styles.restaurantAvatar}
            />
            <View style={styles.summaryContent}>
              <View style={styles.restaurantNameRow}>
                <Text style={styles.restaurantName} numberOfLines={1}>
                  {restaurantDisplayName}
                </Text>
                {displayVerified ? <VerifiedBadge size={20} style={styles.verifiedBadge} /> : null}
              </View>
              <Text style={styles.chefName}>by {profile.full_name}</Text>
              <View style={styles.restaurantMetaRow}>
                <Ionicons name="star" size={16} color="#F5B700" />
                <Text style={styles.restaurantRating}>{displayRestaurantRating}</Text>
                <Text style={styles.restaurantMetaText}>({displayReviewCount})</Text>
              </View>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={15} color="#6E7871" />
                <Text style={styles.locationText} numberOfLines={1}>
                  {listings[0]?.location || 'Location available at checkout'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9AA39D" />
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actionRow}
        >
          <TouchableOpacity
            style={[styles.actionChip, styles.actionChipPrimary]}
            onPress={() => setScheduleVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={
              orderSelection.mode === 'scheduled' ? 'Reschedule order' : 'Order for later'
            }
          >
            <Ionicons name="calendar-outline" size={19} color="#354039" />
            <Text style={[styles.actionChipText, styles.actionChipTextPrimary]}>
              {orderSelection.mode === 'scheduled' ? 'Reschedule' : 'Order for later'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionChip} onPress={shareRestaurant}>
            <Ionicons name="share-social-outline" size={19} color="#354039" />
            <Text style={styles.actionChipText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionChip} onPress={handleReportRestaurant}>
            <Ionicons name="flag-outline" size={18} color="#354039" />
            <Text style={styles.actionChipText}>Report</Text>
          </TouchableOpacity>
        </ScrollView>

        {orderSelection.mode === 'scheduled' ? (
          <TouchableOpacity
            style={styles.scheduleBanner}
            onPress={() => setScheduleVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`Selected order time: ${formatOrderSelectionLabel(orderSelection)}. Tap to reschedule.`}
          >
            <View style={styles.scheduleBannerIcon}>
              <Ionicons name="calendar" size={18} color="#176B36" />
            </View>
            <View style={styles.scheduleBannerContent}>
              <Text style={styles.scheduleBannerEyebrow}>ORDERING FOR</Text>
              <Text style={styles.scheduleBannerText}>
                {formatOrderSelectionLabel(orderSelection)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color="#6E8475" />
          </TouchableOpacity>
        ) : null}

        {profile.free_delivery_threshold != null ? (
          <View style={styles.promoCard}>
            <View style={styles.promoIcon}>
              <Ionicons name="bicycle" size={22} color="#248447" />
            </View>
            <View style={styles.promoContent}>
              <Text style={styles.promoTitle}>Free-delivery offer</Text>
              <Text style={styles.promoText}>
                Spend RM {Number(profile.free_delivery_threshold).toFixed(2)} or more with this cook
                and they will cover your delivery fee
              </Text>
            </View>
            <Ionicons name="sparkles-outline" size={20} color="#4F8E61" />
          </View>
        ) : null}

        {listings.length > 0 ? (
          <View style={styles.menuSection}>
            <View style={styles.menuHeader}>
              <View>
                <Text style={styles.menuTitle}>Menu</Text>
                <Text style={styles.menuSubtitle}>
                  {orderSelection.mode === 'scheduled'
                    ? 'Availability for your selected time'
                    : 'Fresh dishes from this home cook'}
                </Text>
              </View>
              <View style={styles.itemCountPill}>
                <Text style={styles.itemCountText}>{listings.length} dishes</Text>
              </View>
            </View>

            <View style={styles.menuCard}>
              {listings.map(dish => {
                const match = getDishMatch(dish.id);
                const cartItem = cartItems.find(
                  item => item.cookId === profile.id && item.listingId === dish.id
                );
                const cartQuantity = cartItem?.quantity ?? 0;
                return (
                  <MenuItemCard
                    key={dish.id}
                    {...dish}
                    image_url={dish.image_url ?? ''}
                    created_at={dish.created_at ?? ''}
                    location={dish.location ?? ''}
                    reviews={dish.reviews ?? []}
                    isAvailable={match.available}
                    availabilityLabel={availabilityLabelFor(dish)}
                    cartQuantity={cartQuantity}
                    maxQuantity={match.remainingSlots}
                    hasOptionGroups={(dish.option_groups?.length ?? 0) > 0}
                    onPress={() => setSelectedDish(dish)}
                    onAddPress={() => handleDishAddPress(dish, match)}
                    onDecreasePress={() => {
                      if (cartItem) updateQuantity(cartItem.lineId, cartItem.quantity - 1);
                    }}
                  />
                );
              })}
            </View>
          </View>
        ) : (
          <View style={styles.emptyMenuCard}>
            <Ionicons name="restaurant-outline" size={30} color="#708078" />
            <Text style={styles.emptyMenuTitle}>No dishes published yet</Text>
            <Text style={styles.emptyMenuText}>
              This cook has not published any menu items. Check back later.
            </Text>
          </View>
        )}
      </ScrollView>

      <StickyCartBar cookId={profile.id} />

      <RestaurantScheduleSheet
        visible={scheduleVisible}
        days={scheduleDays}
        selection={orderSelection}
        asapAvailable={asapAvailable}
        onSelect={applyOrderSelection}
        onClose={() => setScheduleVisible(false)}
      />

      <DishOrderModal
        visible={Boolean(selectedDish && selectedDishMatch?.available)}
        dish={
          selectedDish
            ? {
                id: selectedDish.id,
                title: selectedDish.title,
                price: selectedDish.price,
                description: selectedDish.description,
                ingredients: selectedDish.ingredients,
                imageUrl: selectedDish.image_url,
                optionGroups: selectedDish.option_groups ?? [],
              }
            : null
        }
        scheduleLabel={selectedDishMatch ? formatMatchLabel(selectedDishMatch) : ''}
        maxQuantity={selectedDishMatch?.remainingSlots ?? 0}
        onClose={() => setSelectedDish(null)}
        onAdd={addSelectedDish}
        onShare={() =>
          selectedDish
            ? Share.share({
                title: selectedDish.title,
                message: `Try ${selectedDish.title} from ${restaurantDisplayName} on Chefin.`,
              }).then(() => undefined)
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F5' },
  scrollContent: { paddingBottom: 130 },
  unavailableState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  unavailableTitle: {
    marginTop: 14,
    color: '#252A2E',
    fontSize: 20,
    fontWeight: '800',
  },
  unavailableText: {
    maxWidth: 320,
    marginTop: 7,
    color: '#69737B',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  unavailableButton: {
    marginTop: 20,
    borderRadius: 22,
    backgroundColor: '#35B958',
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  unavailableButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  hero: { height: 200, backgroundColor: '#DCE4DE' },
  heroImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(13, 20, 16, 0.25)' },
  heroShadeUnavailable: { backgroundColor: 'rgba(22, 28, 24, 0.5)' },
  heroCircleButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    backgroundColor: 'rgba(24, 30, 26, 0.68)',
  },
  backButton: { position: 'absolute', left: 18, zIndex: 5 },
  heroRightControls: {
    position: 'absolute',
    right: 18,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  fulfillmentPill: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 23,
    backgroundColor: 'rgba(24, 30, 26, 0.68)',
    paddingHorizontal: 14,
  },
  fulfillmentText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  summaryStack: { zIndex: 4, marginTop: -52, paddingHorizontal: 16 },
  unavailableBanner: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: -19,
    borderRadius: 18,
    backgroundColor: '#FFF4CC',
    paddingHorizontal: 15,
    paddingVertical: 11,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  unavailableBannerIcon: {
    width: 36,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderRadius: 18,
  },
  unavailableBannerText: { flex: 1, color: '#6B5314', fontSize: 13, lineHeight: 19 },
  unavailableBannerTitle: { color: '#6F4E00', fontWeight: '800' },
  busyBanner: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: -19,
    borderRadius: 18,
    backgroundColor: '#FFF6E8',
    paddingHorizontal: 15,
    paddingVertical: 11,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  busyBannerIcon: {
    width: 36,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderRadius: 18,
  },
  busyBannerText: { flex: 1, color: '#6B4D14', fontSize: 13, lineHeight: 19 },
  bannerStacked: { marginBottom: 12 },
  summaryCard: {
    flexDirection: 'row',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 16,
    shadowColor: '#1B2A20',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 7,
  },
  restaurantAvatar: { width: 86, height: 86, borderRadius: 17, backgroundColor: '#EEF2EF' },
  summaryContent: { flex: 1, minWidth: 0, marginLeft: 15, justifyContent: 'center' },
  restaurantNameRow: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  restaurantName: {
    flexShrink: 1,
    color: '#19201C',
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 26,
  },
  verifiedBadge: { flexShrink: 0, marginLeft: 5 },
  chefName: { marginTop: 3, color: '#6B756F', fontSize: 12, fontWeight: '600' },
  restaurantMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  restaurantRating: { marginLeft: 4, color: '#28312C', fontSize: 13, fontWeight: '800' },
  restaurantMetaText: { maxWidth: 110, color: '#707A73', fontSize: 12, fontWeight: '500' },
  metaDot: { marginHorizontal: 5, color: '#8B938E' },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  locationText: { flex: 1, marginLeft: 4, color: '#6E7871', fontSize: 11 },
  actionRow: { gap: 10, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  actionChip: {
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: '#DDE2DE',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    shadowColor: '#272727ff',
  },
  actionChipPrimary: { borderColor: '#DDE2DE' },
  actionChipText: { color: '#354039', fontSize: 13, fontWeight: '700' },
  actionChipTextPrimary: { color: '#354039' },
  scheduleBanner: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#CBE8D4',
    borderRadius: 16,
    backgroundColor: '#EAF8EE',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  scheduleBannerIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    borderRadius: 19,
    backgroundColor: '#D5F0DD',
  },
  scheduleBannerContent: { flex: 1 },
  scheduleBannerEyebrow: {
    marginBottom: 3,
    color: '#5B7762',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  scheduleBannerText: { color: '#235A34', fontSize: 13, fontWeight: '800', lineHeight: 18 },
  promoCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#DBE5DD',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
  },
  promoIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#E5F6EA',
  },
  promoContent: { flex: 1, marginHorizontal: 12 },
  promoTitle: { color: '#253029', fontSize: 14, fontWeight: '800' },
  promoText: { marginTop: 3, color: '#778079', fontSize: 12 },
  menuSection: { marginTop: 27, paddingHorizontal: 16 },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 13,
    paddingHorizontal: 2,
  },
  menuTitle: { color: '#1D241F', fontSize: 25, fontWeight: '900' },
  menuSubtitle: { marginTop: 3, color: '#768079', fontSize: 12 },
  itemCountPill: {
    borderRadius: 13,
    backgroundColor: '#EAF3EC',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  itemCountText: { color: '#477052', fontSize: 10, fontWeight: '800' },
  menuCard: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E0E5E1',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  emptyMenuCard: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 26,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 25,
  },
  emptyMenuTitle: { marginTop: 10, color: '#2C3430', fontSize: 16, fontWeight: '800' },
  emptyMenuText: {
    marginTop: 6,
    color: '#6B756F',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
