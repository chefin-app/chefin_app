import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '@/src/services/auth-context';
import { supabase } from '@/src/utils/supabaseClient';

type MenuTab = 'items' | 'options';
type StatusFilter = 'all' | 'approved' | 'pending' | 'rejected';
type ScheduleFilter = 'all' | 'opening-hours' | string;

type DishRow = {
  id: string;
  title: string;
  price: number;
  image_url: string | null;
  status: string;
  menu_category: string;
};

type DishAvailability = {
  configured: boolean;
  enabled: boolean;
  availableToday: boolean;
  state: string;
  dailyStockLimit: number | null;
  portionsReservedToday: number;
  remainingStockToday: number | null;
  inventoryDepleted: boolean;
};

type StockOutStatus = 'today' | 'indefinite';
type OptionStockStatus = 'in_stock' | 'today' | 'indefinite';

type SellingSchedule = {
  id: string;
  name: string;
  specificDates: boolean;
  startsOn: string | null;
  endsOn: string | null;
  windows: Array<{
    isoWeekday: number;
    allDay: boolean;
    opensAt: string | null;
    closesAt: string | null;
  }>;
  listingIds: string[];
};

type OpeningHour = {
  isoWeekday: number;
  opensAt: string;
  closesAt: string;
  enabled: boolean;
};

type MenuOption = {
  id: string;
  name: string;
  price_delta: number | string;
  is_available: boolean;
  unavailable_until?: string | null;
  availability_status?: OptionStockStatus;
};

type OptionGroup = {
  id: string;
  name: string;
  selection_type: string;
  min_select: number;
  max_select: number;
  is_active: boolean;
  menu_options: MenuOption[];
  listing_option_groups: Array<{ listing_id: string }>;
};

const apiUrl = () => process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';

const relationArray = <T,>(value: T[] | null | undefined): T[] =>
  Array.isArray(value) ? value : [];

export default function CookMenuScreen() {
  const router = useRouter();
  const { user, session } = useAuth();
  const [tab, setTab] = useState<MenuTab>('items');
  const [dishes, setDishes] = useState<DishRow[]>([]);
  const [availability, setAvailability] = useState<Record<string, DishAvailability>>({});
  const [sellingSchedules, setSellingSchedules] = useState<SellingSchedule[]>([]);
  const [scheduleByDish, setScheduleByDish] = useState<Record<string, string | null>>({});
  const [openingHours, setOpeningHours] = useState<OpeningHour[]>([]);
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>('all');
  const [scheduleModal, setScheduleModal] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const [threshold, setThreshold] = useState<number | null>(null);
  const [thresholdModal, setThresholdModal] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState('');

  const [stockDish, setStockDish] = useState<DishRow | null>(null);
  const [stockMode, setStockMode] = useState<'unlimited' | 'limited'>('unlimited');
  const [stockDraft, setStockDraft] = useState('');
  const [stockSaving, setStockSaving] = useState(false);

  const [statusDish, setStatusDish] = useState<DishRow | null>(null);
  const [stockOutStatus, setStockOutStatus] = useState<StockOutStatus | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  const [dishSelectionMode, setDishSelectionMode] = useState(false);
  const [selectedDishIds, setSelectedDishIds] = useState<Set<string>>(new Set());
  const [dishStatusModal, setDishStatusModal] = useState(false);
  const [dishStatusChoice, setDishStatusChoice] = useState<OptionStockStatus | null>(null);
  const [dishStatusSaving, setDishStatusSaving] = useState(false);
  const [dishScheduleModal, setDishScheduleModal] = useState(false);
  const [dishScheduleSaving, setDishScheduleSaving] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<string>>(new Set());
  const [statusOptionIds, setStatusOptionIds] = useState<string[]>([]);
  const [optionStockStatus, setOptionStockStatus] = useState<OptionStockStatus | null>(null);
  const [optionStatusSaving, setOptionStatusSaving] = useState(false);

  const authHeaders = useCallback(
    (json = false) => ({
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    }),
    [session?.access_token]
  );

  const loadMenu = useCallback(
    async (refresh = false) => {
      if (!user || !session?.access_token) {
        setLoading(false);
        return;
      }
      if (refresh) setRefreshing(true);
      else setLoading(true);
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, free_delivery_threshold')
          .eq('user_id', user.id)
          .single();
        if (profileError || !profile) throw profileError ?? new Error('Cook profile not found.');

        const [{ data: listingRows, error: listingsError }, availabilityResponse, groupsResponse] =
          await Promise.all([
            supabase
              .from('listings')
              .select('id, title, price, image_url, status, menu_category')
              .eq('cook_id', profile.id)
              .order('created_at', { ascending: false }),
            fetch(`${apiUrl()}/api/availability/cook/menu`, {
              headers: authHeaders(),
            }),
            fetch(`${apiUrl()}/api/cook-menu/option-groups`, {
              headers: authHeaders(),
            }),
          ]);
        if (listingsError) throw listingsError;

        const normalizedDishes = ((listingRows ?? []) as DishRow[]).map(dish => ({
          ...dish,
          price: Number(dish.price),
          menu_category: dish.menu_category?.trim() || 'Uncategorised',
        }));
        setDishes(normalizedDishes);
        setThreshold(
          profile.free_delivery_threshold == null ? null : Number(profile.free_delivery_threshold)
        );
        setExpandedCategories(current =>
          current.size
            ? current
            : new Set(normalizedDishes.map(dish => dish.menu_category || 'Uncategorised'))
        );

        if (availabilityResponse.ok) {
          const payload = (await availabilityResponse.json()) as {
            openingHours?: OpeningHour[];
            sellingSchedules?: SellingSchedule[];
            dishes?: Array<{
              id?: string;
              listingId?: string;
              configured?: boolean;
              enabled?: boolean;
              availableToday?: boolean;
              state?: string;
              sellingScheduleId?: string | null;
              dailyStockLimit?: number | null;
              portionsReservedToday?: number;
              remainingStockToday?: number | null;
              inventoryDepleted?: boolean;
              availability?: {
                configured?: boolean;
                enabled?: boolean;
                availableToday?: boolean;
                state?: string;
                dailyStockLimit?: number | null;
                portionsReservedToday?: number;
                remainingStockToday?: number | null;
                inventoryDepleted?: boolean;
              };
            }>;
          };
          setOpeningHours(payload.openingHours ?? []);
          setSellingSchedules(payload.sellingSchedules ?? []);
          setScheduleByDish(
            Object.fromEntries(
              (payload.dishes ?? []).flatMap(row => {
                const id = row.id ?? row.listingId;
                return id ? [[id, row.sellingScheduleId ?? null]] : [];
              })
            )
          );
          setAvailability(
            Object.fromEntries(
              (payload.dishes ?? []).flatMap(row => {
                const id = row.id ?? row.listingId;
                const details = row.availability ?? row;
                return id
                  ? [
                      [
                        id,
                        {
                          configured: Boolean(details.configured),
                          enabled: details.enabled !== false,
                          availableToday: Boolean(details.availableToday),
                          state: details.state ?? 'unconfigured',
                          dailyStockLimit:
                            details.dailyStockLimit == null
                              ? null
                              : Number(details.dailyStockLimit),
                          portionsReservedToday: Number(details.portionsReservedToday ?? 0),
                          remainingStockToday:
                            details.remainingStockToday == null
                              ? null
                              : Number(details.remainingStockToday),
                          inventoryDepleted: Boolean(details.inventoryDepleted),
                        },
                      ],
                    ]
                  : [];
              })
            )
          );
        }

        if (groupsResponse.ok) {
          const payload = (await groupsResponse.json()) as { groups?: OptionGroup[] };
          const groups = relationArray(payload.groups).map(group => ({
            ...group,
            menu_options: relationArray(group.menu_options),
            listing_option_groups: relationArray(group.listing_option_groups),
          }));
          setOptionGroups(groups);
          setExpandedGroups(current =>
            current.size ? current : new Set(groups.slice(0, 1).map(group => group.id))
          );
        }
      } catch (error: unknown) {
        Alert.alert(
          'Menu unavailable',
          error instanceof Error ? error.message : 'Your menu could not be loaded.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authHeaders, session?.access_token, user]
  );

  useFocusEffect(
    useCallback(() => {
      loadMenu();
    }, [loadMenu])
  );

  const filteredDishes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return dishes.filter(dish => {
      if (statusFilter !== 'all' && dish.status !== statusFilter) return false;
      if (scheduleFilter === 'opening-hours' && scheduleByDish[dish.id]) return false;
      if (
        scheduleFilter !== 'all' &&
        scheduleFilter !== 'opening-hours' &&
        scheduleByDish[dish.id] !== scheduleFilter
      )
        return false;
      return (
        !query ||
        [dish.title, dish.menu_category].some(value => value.toLowerCase().includes(query))
      );
    });
  }, [dishes, scheduleByDish, scheduleFilter, search, statusFilter]);

  const scheduleFilterLabel =
    scheduleFilter === 'all'
      ? 'Availability schedule'
      : scheduleFilter === 'opening-hours'
        ? 'All opening hours'
        : (sellingSchedules.find(schedule => schedule.id === scheduleFilter)?.name ??
          'Availability schedule');

  const openingHoursSummary = useMemo(() => {
    const active = openingHours.filter(window => window.enabled);
    if (!active.length) return 'Business hours not set';
    const days = [...new Set(active.map(window => window.isoWeekday))];
    const first = active[0];
    const dayText = days.length === 7 ? 'Mon – Sun' : `${days.length} days`;
    const time = `${first.opensAt.slice(0, 5)} – ${first.closesAt.slice(0, 5)}`;
    return `${dayText}  ·  ${time}`;
  }, [openingHours]);

  const scheduleSummary = (schedule: SellingSchedule) => {
    const activeDays = [...new Set(schedule.windows.map(window => window.isoWeekday))];
    const time = schedule.windows.some(window => window.allDay)
      ? 'All business hours'
      : schedule.windows[0]?.opensAt && schedule.windows[0]?.closesAt
        ? `${schedule.windows[0].opensAt!.slice(0, 5)} – ${schedule.windows[0].closesAt!.slice(0, 5)}`
        : 'No active periods';
    const dates = schedule.specificDates
      ? ` · ${schedule.startsOn ?? ''} – ${schedule.endsOn ?? ''}`
      : '';
    return `${activeDays.length === 7 ? 'Mon – Sun' : `${activeDays.length} days`} · ${time}${dates}`;
  };

  const categories = useMemo(() => {
    const map = new Map<string, DishRow[]>();
    for (const dish of filteredDishes) {
      const category = dish.menu_category || 'Uncategorised';
      map.set(category, [...(map.get(category) ?? []), dish]);
    }
    return [...map.entries()];
  }, [filteredDishes]);

  const cycleStatus = () => {
    const values: StatusFilter[] = ['all', 'approved', 'pending', 'rejected'];
    setStatusFilter(values[(values.indexOf(statusFilter) + 1) % values.length]);
  };

  const restoreDishAvailability = async (dish: DishRow) => {
    if (!session?.access_token || busyId) return;
    setBusyId(dish.id);
    try {
      const settingsResponse = await fetch(
        `${apiUrl()}/api/availability/cook/listings/${dish.id}/settings`,
        {
          method: 'PATCH',
          headers: authHeaders(true),
          body: JSON.stringify({ enabled: true }),
        }
      );
      const settingsPayload = await settingsResponse.json().catch(() => ({}));
      if (!settingsResponse.ok) {
        throw new Error(settingsPayload.error ?? 'Dish availability could not be updated.');
      }

      const todayResponse = await fetch(
        `${apiUrl()}/api/availability/cook/listings/${dish.id}/orders`,
        {
          method: 'PATCH',
          headers: authHeaders(true),
          body: JSON.stringify({ available: true }),
        }
      );
      const todayPayload = await todayResponse.json().catch(() => ({}));
      if (!todayResponse.ok) {
        throw new Error(todayPayload.error ?? 'Dish availability could not be updated.');
      }
      await loadMenu(true);
      Alert.alert(
        'Dish available',
        `${dish.title} is available during its applicable business hours.`
      );
    } catch (error: unknown) {
      await loadMenu(true);
      Alert.alert(
        'Availability not changed',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const exitDishSelection = () => {
    setDishSelectionMode(false);
    setSelectedDishIds(new Set());
  };

  const startDishSelection = (dish: DishRow) => {
    setDishSelectionMode(true);
    setSelectedDishIds(new Set([dish.id]));
  };

  const toggleDishSelected = (dishId: string) => {
    setSelectedDishIds(current => {
      const next = new Set(current);
      if (next.has(dishId)) next.delete(dishId);
      else next.add(dishId);
      return next;
    });
  };

  const setDishStatus = async (dishId: string, status: OptionStockStatus) => {
    const requests: Array<[string, Record<string, boolean>]> =
      status === 'in_stock'
        ? [
            [`${apiUrl()}/api/availability/cook/listings/${dishId}/settings`, { enabled: true }],
            [`${apiUrl()}/api/availability/cook/listings/${dishId}/orders`, { available: true }],
          ]
        : status === 'today'
          ? [[`${apiUrl()}/api/availability/cook/listings/${dishId}/orders`, { available: false }]]
          : [[`${apiUrl()}/api/availability/cook/listings/${dishId}/settings`, { enabled: false }]];
    for (const [endpoint, body] of requests) {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Dish status could not be updated.');
    }
  };

  const applyDishStatusToSelection = async () => {
    if (!dishStatusChoice || selectedDishIds.size === 0 || dishStatusSaving) return;
    const status = dishStatusChoice;
    const count = selectedDishIds.size;
    setDishStatusSaving(true);
    try {
      await Promise.all([...selectedDishIds].map(dishId => setDishStatus(dishId, status)));
      setDishStatusModal(false);
      setDishStatusChoice(null);
      exitDishSelection();
      await loadMenu(true);
      Alert.alert(
        'Dish status updated',
        status === 'in_stock'
          ? `${count} dish${count === 1 ? ' is' : 'es are'} back in stock.`
          : status === 'today'
            ? `${count} dish${count === 1 ? ' is' : 'es are'} sold out today and will turn on automatically tomorrow.`
            : `${count} dish${count === 1 ? ' is' : 'es are'} out of stock until turned back on.`
      );
    } catch (error: unknown) {
      await loadMenu(true);
      Alert.alert(
        'Status not changed',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setDishStatusSaving(false);
    }
  };

  const applyDishSchedule = async (scheduleId: string | null) => {
    if (selectedDishIds.size === 0 || dishScheduleSaving) return;
    const count = selectedDishIds.size;
    setDishScheduleSaving(true);
    try {
      await Promise.all(
        [...selectedDishIds].map(async dishId => {
          const response = await fetch(
            `${apiUrl()}/api/availability/cook/listings/${dishId}/selling-schedule`,
            {
              method: 'PATCH',
              headers: authHeaders(true),
              body: JSON.stringify({ scheduleId }),
            }
          );
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error ?? 'Dish schedule could not be updated.');
        })
      );
      const scheduleName = scheduleId
        ? (sellingSchedules.find(schedule => schedule.id === scheduleId)?.name ?? 'the schedule')
        : 'all opening hours';
      setDishScheduleModal(false);
      exitDishSelection();
      await loadMenu(true);
      Alert.alert(
        'Schedule updated',
        `${count} dish${count === 1 ? ' now follows' : 'es now follow'} ${scheduleName}.`
      );
    } catch (error: unknown) {
      await loadMenu(true);
      Alert.alert(
        'Schedule not changed',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setDishScheduleSaving(false);
    }
  };

  const saveStockOutStatus = async () => {
    if (!statusDish || !stockOutStatus || !session?.access_token || statusSaving) return;
    const dish = statusDish;
    setStatusSaving(true);
    try {
      const endpoint =
        stockOutStatus === 'today'
          ? `${apiUrl()}/api/availability/cook/listings/${dish.id}/orders`
          : `${apiUrl()}/api/availability/cook/listings/${dish.id}/settings`;
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify(
          stockOutStatus === 'today' ? { available: false } : { enabled: false }
        ),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Availability could not be updated.');
      setStatusDish(null);
      setStockOutStatus(null);
      await loadMenu(true);
      Alert.alert(
        'Dish status updated',
        stockOutStatus === 'today'
          ? `${dish.title} is sold out today and will turn on automatically tomorrow.`
          : `${dish.title} will stay out of stock until you turn it back on.`
      );
    } catch (error: unknown) {
      Alert.alert(
        'Status not changed',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setStatusSaving(false);
    }
  };

  const openStockEditor = (dish: DishRow) => {
    const details = availability[dish.id];
    const limit = details?.dailyStockLimit ?? null;
    setStockDish(dish);
    setStockMode(limit == null ? 'unlimited' : 'limited');
    setStockDraft(limit == null ? '' : String(limit));
  };

  const saveStock = async () => {
    if (!stockDish || !session?.access_token) return;
    const parsed = Number(stockDraft);
    if (stockMode === 'limited' && (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000)) {
      Alert.alert('Check stock quantity', 'Enter a whole number from 1 to 10,000.');
      return;
    }
    const currentReserved = availability[stockDish.id]?.portionsReservedToday ?? 0;
    if (stockMode === 'limited' && parsed < currentReserved) {
      Alert.alert(
        'Quantity already committed',
        `${currentReserved} portion${currentReserved === 1 ? '' : 's'} have already been ordered today. Set the limit to at least ${currentReserved}.`
      );
      return;
    }
    setStockSaving(true);
    try {
      const response = await fetch(
        `${apiUrl()}/api/availability/cook/listings/${stockDish.id}/settings`,
        {
          method: 'PATCH',
          headers: authHeaders(true),
          body: JSON.stringify({
            dailyStockLimit: stockMode === 'unlimited' ? null : parsed,
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Stock level could not be saved.');
      setStockDish(null);
      await loadMenu(true);
      Alert.alert(
        'Daily stock updated',
        stockMode === 'unlimited'
          ? `${stockDish.title} now has unlimited daily stock.`
          : `${stockDish.title} will start each business day with ${parsed} portions.`
      );
    } catch (error: unknown) {
      Alert.alert(
        'Stock not updated',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setStockSaving(false);
    }
  };

  const saveThreshold = async () => {
    if (!user) return;
    const value = Number(thresholdDraft);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than zero.');
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ free_delivery_threshold: value })
      .eq('user_id', user.id);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    setThreshold(value);
    setThresholdModal(false);
    Alert.alert('Free delivery updated', `Customers now qualify from RM ${value.toFixed(2)}.`);
  };

  const applyOptionStatus = async (optionIds: string[], status: OptionStockStatus) => {
    if (!optionIds.length || optionStatusSaving) return;
    setOptionStatusSaving(true);
    try {
      const response = await fetch(`${apiUrl()}/api/cook-menu/options/status`, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify({ optionIds, status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Option status could not be updated.');
      setStatusOptionIds([]);
      setOptionStockStatus(null);
      setSelectedOptionIds(new Set());
      setSelectionMode(false);
      await loadMenu(true);
      Alert.alert(
        'Option status updated',
        status === 'in_stock'
          ? `${optionIds.length} option${optionIds.length === 1 ? ' is' : 's are'} now available.`
          : status === 'today'
            ? `${optionIds.length} option${optionIds.length === 1 ? ' is' : 's are'} sold out today and will restore tomorrow.`
            : `${optionIds.length} option${optionIds.length === 1 ? ' is' : 's are'} sold out until restored manually.`
      );
    } catch (error: unknown) {
      Alert.alert(
        'Option status not changed',
        error instanceof Error ? error.message : 'Try again.'
      );
    } finally {
      setOptionStatusSaving(false);
    }
  };

  const toggleOption = (option: MenuOption, next: boolean) => {
    if (next) {
      applyOptionStatus([option.id], 'in_stock');
      return;
    }
    setStatusOptionIds([option.id]);
    setOptionStockStatus(null);
  };

  const archiveOptionGroup = (group: OptionGroup) => {
    Alert.alert(
      'Delete option group?',
      'It will disappear from linked dishes, while completed orders keep their original selections.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyId(group.id);
            try {
              const response = await fetch(`${apiUrl()}/api/cook-menu/option-groups/${group.id}`, {
                method: 'DELETE',
                headers: authHeaders(),
              });
              const payload = await response.json().catch(() => ({}));
              if (!response.ok)
                throw new Error(payload.error ?? 'Option group could not be deleted.');
              await loadMenu(true);
              Alert.alert('Option group deleted', 'It has been removed from the active menu.');
            } catch (error: unknown) {
              Alert.alert(
                'Option group not deleted',
                error instanceof Error ? error.message : 'Try again.'
              );
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const renderDish = (dish: DishRow) => {
    const dishAvailability = availability[dish.id] ?? {
      configured: false,
      enabled: true,
      availableToday: false,
      state: 'unconfigured',
      dailyStockLimit: null,
      portionsReservedToday: 0,
      remainingStockToday: null,
      inventoryDepleted: false,
    };
    const switchEnabled = dish.status === 'approved' && dishAvailability.configured;
    const switchValue = dishAvailability.enabled && dishAvailability.availableToday;
    const selected = selectedDishIds.has(dish.id);
    return (
      <TouchableOpacity
        key={dish.id}
        style={[styles.dishRow, dishSelectionMode && selected && styles.dishRowSelected]}
        activeOpacity={0.78}
        onPress={() =>
          dishSelectionMode
            ? toggleDishSelected(dish.id)
            : router.push({ pathname: '/(cook)/edit-dish', params: { id: dish.id } })
        }
        onLongPress={() => {
          if (!dishSelectionMode) startDishSelection(dish);
        }}
        delayLongPress={350}
      >
        {dish.image_url ? (
          <Image source={{ uri: dish.image_url }} style={styles.dishImage} />
        ) : (
          <View style={[styles.dishImage, styles.imagePlaceholder]}>
            <Ionicons name="restaurant-outline" size={23} color="#A5ADA8" />
          </View>
        )}
        <View style={styles.dishCopy}>
          <Text style={styles.dishTitle} numberOfLines={1}>
            {dish.title}
          </Text>
          <Text style={styles.dishPrice}>RM {dish.price.toFixed(2)}</Text>
          <Text
            style={[
              styles.dishState,
              (!dishAvailability.enabled || dishAvailability.state === 'sold_out') &&
                styles.dishStateSoldOut,
              !dishAvailability.configured && styles.dishStateWarning,
            ]}
          >
            {dish.status !== 'approved'
              ? dish.status === 'pending'
                ? 'Pending approval'
                : 'Rejected'
              : !dishAvailability.configured
                ? 'Schedule needed · hidden from customers'
                : !dishAvailability.enabled
                  ? 'Out of stock indefinitely'
                  : dishAvailability.state === 'available'
                    ? 'Available now'
                    : dishAvailability.state === 'sold_out'
                      ? 'Sold out today · resets next open day'
                      : dishAvailability.availableToday
                        ? 'Scheduled · currently closed'
                        : 'Not available today'}
          </Text>
          <TouchableOpacity
            style={styles.stockChip}
            onPress={event => {
              event.stopPropagation();
              openStockEditor(dish);
            }}
          >
            <Ionicons name="cube-outline" size={13} color="#1473E6" />
            <Text style={styles.stockChipText}>
              {dishAvailability.dailyStockLimit == null
                ? 'Stock: unlimited'
                : `Stock: ${dishAvailability.remainingStockToday ?? 0} of ${dishAvailability.dailyStockLimit} left today`}
            </Text>
            <Text style={styles.stockChipEdit}>Edit</Text>
          </TouchableOpacity>
        </View>
        {dishSelectionMode ? (
          <Ionicons
            name={selected ? 'checkbox' : 'square-outline'}
            size={26}
            color={selected ? '#20A84F' : '#B4BBB7'}
          />
        ) : busyId === dish.id ? (
          <ActivityIndicator color="#00A651" />
        ) : (
          <Switch
            value={switchValue}
            disabled={!switchEnabled}
            onValueChange={next => {
              if (next && dishAvailability.inventoryDepleted) openStockEditor(dish);
              else if (next) restoreDishAvailability(dish);
              else {
                setStatusDish(dish);
                setStockOutStatus(null);
              }
            }}
            trackColor={{ false: '#D9DEDB', true: '#80D8A1' }}
            thumbColor={switchValue ? '#00A651' : '#F7F8F7'}
            ios_backgroundColor="#D9DEDB"
          />
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.page} edges={['left', 'right']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#00A651" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['left', 'right']}>
      <View style={styles.tabs}>
        {(['items', 'options'] as const).map(value => (
          <TouchableOpacity key={value} style={styles.tab} onPress={() => setTab(value)}>
            <Text style={[styles.tabText, tab === value && styles.tabTextActive]}>
              {value === 'items' ? 'Items' : 'Option Groups'}
            </Text>
            {tab === value && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'items' ? (
        <>
          {dishSelectionMode && (
            <View style={styles.selectionHeader}>
              <TouchableOpacity onPress={exitDishSelection} hitSlop={10}>
                <Ionicons name="close" size={24} color="#242A26" />
              </TouchableOpacity>
              <Text style={styles.selectionHeaderText}>
                {selectedDishIds.size} item{selectedDishIds.size === 1 ? '' : 's'} selected
              </Text>
            </View>
          )}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => loadMenu(true)} />
            }
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filters}>
                <View style={[styles.filterChip, styles.searchChip]}>
                  <Ionicons name="search" size={19} color="#4F5752" />
                  <TextInput
                    style={styles.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search"
                    placeholderTextColor="#727A75"
                    returnKeyType="done"
                    submitBehavior="blurAndSubmit"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>
                <TouchableOpacity style={styles.filterChip} onPress={cycleStatus}>
                  <Text style={styles.filterText}>
                    {statusFilter === 'all' ? 'Item status' : statusFilter}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#343A36" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.filterChip} onPress={() => setScheduleModal(true)}>
                  <Ionicons name="time-outline" size={18} color="#343A36" />
                  <Text style={styles.filterText}>{scheduleFilterLabel}</Text>
                  <Ionicons name="chevron-down" size={18} color="#343A36" />
                </TouchableOpacity>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.promotionCard}
              onPress={() => {
                setThresholdDraft(threshold == null ? '' : String(threshold));
                setThresholdModal(true);
              }}
            >
              <View style={styles.promotionIcon}>
                <Ionicons name="bicycle-outline" size={20} color="#007B55" />
              </View>
              <View style={styles.promotionCopy}>
                <Text style={styles.promotionTitle}>Free-delivery offer</Text>
                <Text style={styles.promotionText}>
                  {threshold == null
                    ? 'Choose how much customers must spend with you to get free delivery'
                    : `Free delivery when customers spend RM ${threshold.toFixed(2)} or more with you`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color="#59615C" />
            </TouchableOpacity>

            {categories.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="book-outline" size={40} color="#A5ADA8" />
                <Text style={styles.emptyTitle}>No menu items found</Text>
                <Text style={styles.emptyText}>Add a dish or change the current filters.</Text>
              </View>
            ) : (
              categories.map(([category, rows]) => {
                const expanded = expandedCategories.has(category);
                return (
                  <View key={category} style={styles.categorySection}>
                    <TouchableOpacity
                      style={styles.categoryHeader}
                      onPress={() =>
                        setExpandedCategories(current => {
                          const next = new Set(current);
                          if (next.has(category)) next.delete(category);
                          else next.add(category);
                          return next;
                        })
                      }
                    >
                      <View>
                        <Text style={styles.categoryTitle}>{category}</Text>
                        <Text style={styles.categoryCount}>
                          {rows.length} item{rows.length === 1 ? '' : 's'}
                        </Text>
                      </View>
                      <View style={styles.expandCircle}>
                        <Ionicons
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={22}
                          color="#006B4F"
                        />
                      </View>
                    </TouchableOpacity>
                    {expanded && <View style={styles.dishList}>{rows.map(renderDish)}</View>}
                  </View>
                );
              })
            )}

            <TouchableOpacity
              style={styles.refreshButton}
              disabled={refreshing}
              onPress={() => loadMenu(true)}
            >
              {refreshing ? (
                <ActivityIndicator color="#007B55" />
              ) : (
                <Text style={styles.refreshText}>Refresh menu</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
          {dishSelectionMode && (
            <View style={styles.selectionBar}>
              <TouchableOpacity
                style={[
                  styles.selectionAction,
                  selectedDishIds.size === 0 && styles.buttonDisabled,
                ]}
                disabled={selectedDishIds.size === 0}
                onPress={() => {
                  setDishStatusChoice(null);
                  setDishStatusModal(true);
                }}
              >
                <Text style={styles.selectionActionText}>Set status</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.selectionActionSecondary,
                  selectedDishIds.size === 0 && styles.buttonDisabled,
                ]}
                disabled={selectedDishIds.size === 0}
                onPress={() => setDishScheduleModal(true)}
              >
                <Text style={styles.selectionActionSecondaryText}>Select schedule</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.selectionActionSecondary,
                  selectedDishIds.size !== 1 && styles.buttonDisabled,
                ]}
                disabled={selectedDishIds.size !== 1}
                onPress={() => {
                  const dish = dishes.find(row => selectedDishIds.has(row.id));
                  if (!dish) return;
                  exitDishSelection();
                  openStockEditor(dish);
                }}
              >
                <Text style={styles.selectionActionSecondaryText}>Edit stock</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.optionContent}>
          {optionGroups.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="options-outline" size={42} color="#A5ADA8" />
              <Text style={styles.emptyTitle}>No option groups yet</Text>
              <Text style={styles.emptyText}>
                Add reusable extras such as drinks, spice levels, or side dishes.
              </Text>
            </View>
          ) : (
            optionGroups.map(group => {
              const expanded = expandedGroups.has(group.id);
              return (
                <View key={group.id} style={styles.optionCard}>
                  <TouchableOpacity
                    style={styles.optionHeader}
                    onPress={() =>
                      setExpandedGroups(current => {
                        const next = new Set(current);
                        if (next.has(group.id)) next.delete(group.id);
                        else next.add(group.id);
                        return next;
                      })
                    }
                  >
                    <View style={styles.optionHeaderCopy}>
                      <Text style={styles.optionTitle}>{group.name.toUpperCase()}</Text>
                      <Text style={styles.optionMeta}>
                        {group.listing_option_groups.length} item
                        {group.listing_option_groups.length === 1 ? '' : 's'} linked ·{' '}
                        {group.min_select > 0 ? 'Required' : 'Optional'} ·{' '}
                        {group.selection_type === 'single'
                          ? 'Pick 1'
                          : group.min_select > 0
                            ? `Pick ${group.min_select}–${group.max_select}`
                            : `Pick up to ${group.max_select}`}
                      </Text>
                    </View>
                    <Ionicons
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={23}
                      color="#171B18"
                    />
                  </TouchableOpacity>
                  {expanded && (
                    <View style={styles.optionRows}>
                      <View style={styles.optionActions}>
                        <TouchableOpacity
                          style={styles.optionAction}
                          onPress={() =>
                            router.push({
                              pathname: '/(cook)/option-group',
                              params: { id: group.id },
                            })
                          }
                        >
                          <Ionicons name="create-outline" size={17} color="#1473E6" />
                          <Text style={styles.optionActionText}>Edit group</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.optionAction}
                          onPress={() =>
                            router.push({
                              pathname: '/(cook)/option-group',
                              params: { id: group.id, step: '2' },
                            })
                          }
                        >
                          <Ionicons name="link-outline" size={17} color="#1473E6" />
                          <Text style={styles.optionActionText}>Linked dishes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.optionAction}
                          onPress={() => {
                            setSelectionMode(true);
                            setSelectedOptionIds(new Set());
                          }}
                        >
                          <Ionicons name="checkbox-outline" size={17} color="#1473E6" />
                          <Text style={styles.optionActionText}>Manage</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.optionAction}
                          disabled={busyId === group.id}
                          onPress={() => archiveOptionGroup(group)}
                        >
                          <Ionicons name="trash-outline" size={17} color="#C94A4A" />
                          <Text style={[styles.optionActionText, styles.deleteActionText]}>
                            Delete
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {group.menu_options.map(option => (
                        <View key={option.id} style={styles.optionRow}>
                          {selectionMode ? (
                            <TouchableOpacity
                              onPress={() =>
                                setSelectedOptionIds(current => {
                                  const next = new Set(current);
                                  if (next.has(option.id)) next.delete(option.id);
                                  else next.add(option.id);
                                  return next;
                                })
                              }
                            >
                              <Ionicons
                                name={
                                  selectedOptionIds.has(option.id) ? 'checkbox' : 'square-outline'
                                }
                                size={25}
                                color={selectedOptionIds.has(option.id) ? '#20A84F' : '#B4BBB7'}
                              />
                            </TouchableOpacity>
                          ) : null}
                          <View style={styles.optionRowCopy}>
                            <Text style={styles.optionName}>{option.name}</Text>
                            <Text style={styles.optionPrice}>
                              {Number(option.price_delta) > 0
                                ? `+RM ${Number(option.price_delta).toFixed(2)}`
                                : 'Included'}
                              {option.availability_status === 'today'
                                ? ' · Out of stock today'
                                : option.availability_status === 'indefinite'
                                  ? ' · Out of stock indefinitely'
                                  : ''}
                            </Text>
                          </View>
                          {!selectionMode ? (
                            <Switch
                              value={option.is_available}
                              onValueChange={next => toggleOption(option, next)}
                              trackColor={{ false: '#D9DEDB', true: '#80D8A1' }}
                              thumbColor={option.is_available ? '#00A651' : '#F7F8F7'}
                            />
                          ) : null}
                        </View>
                      ))}
                      {selectionMode ? (
                        <View style={styles.manageFooter}>
                          <TouchableOpacity
                            style={styles.manageCancel}
                            onPress={() => {
                              setSelectionMode(false);
                              setSelectedOptionIds(new Set());
                            }}
                          >
                            <Text style={styles.manageCancelText}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.manageStatus,
                              selectedOptionIds.size === 0 && styles.buttonDisabled,
                            ]}
                            disabled={selectedOptionIds.size === 0}
                            onPress={() => {
                              setStatusOptionIds([...selectedOptionIds]);
                              setOptionStockStatus(null);
                            }}
                          >
                            <Text style={styles.manageStatusText}>
                              Set status · {selectedOptionIds.size}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {addMenuOpen && !dishSelectionMode && (
        <View style={styles.addChoices}>
          <TouchableOpacity
            style={styles.addChoice}
            onPress={() => {
              setAddMenuOpen(false);
              router.push('/(cook)/add-dish');
            }}
          >
            <Text style={styles.addChoiceText}>Add item</Text>
            <Ionicons name="restaurant-outline" size={20} color="#4CAF50" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addChoice}
            onPress={() => {
              setAddMenuOpen(false);
              router.push('/(cook)/option-group');
            }}
          >
            <Text style={styles.addChoiceText}>Add option group</Text>
            <Ionicons name="options-outline" size={20} color="#4CAF50" />
          </TouchableOpacity>
        </View>
      )}
      {!dishSelectionMode && (
        <TouchableOpacity style={styles.fab} onPress={() => setAddMenuOpen(open => !open)}>
          <Ionicons name={addMenuOpen ? 'close' : 'add'} size={30} color="#fff" />
          <Ionicons name="chevron-down" size={18} color="#fff" />
        </TouchableOpacity>
      )}

      <Modal
        visible={statusOptionIds.length > 0}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (optionStatusSaving) return;
          setStatusOptionIds([]);
          setOptionStockStatus(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            activeOpacity={1}
            disabled={optionStatusSaving}
            onPress={() => {
              setStatusOptionIds([]);
              setOptionStockStatus(null);
            }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.sheet, styles.statusSheet]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.statusSheetTitle}>Set option status</Text>
            <Text style={styles.optionStatusSummary}>
              Updating {statusOptionIds.length} option{statusOptionIds.length === 1 ? '' : 's'}
            </Text>
            {(
              [
                ['in_stock', 'In stock', 'Available to customers immediately.'],
                ['today', 'Out of stock today', 'Turns on automatically tomorrow.'],
                ['indefinite', 'Out of stock indefinitely', 'Stays off until restored manually.'],
              ] as const
            ).map(([value, label, hint]) => (
              <TouchableOpacity
                key={value}
                style={styles.statusChoice}
                onPress={() => setOptionStockStatus(value)}
                disabled={optionStatusSaving}
              >
                <View style={styles.statusChoiceCopy}>
                  <Text style={styles.statusChoiceTitle}>{label}</Text>
                  <Text style={styles.statusChoiceHint}>{hint}</Text>
                </View>
                <Ionicons
                  name={optionStockStatus === value ? 'radio-button-on' : 'radio-button-off'}
                  size={28}
                  color={optionStockStatus === value ? '#00B85A' : '#B7BDB9'}
                />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[
                styles.statusConfirm,
                (!optionStockStatus || optionStatusSaving) && styles.buttonDisabled,
              ]}
              disabled={!optionStockStatus || optionStatusSaving}
              onPress={() =>
                optionStockStatus && applyOptionStatus(statusOptionIds, optionStockStatus)
              }
            >
              {optionStatusSaving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.statusConfirmText}>Confirm</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={thresholdModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderCopy}>
                  <Text style={styles.sheetTitle}>Free-delivery threshold</Text>
                  <Text style={styles.sheetSubtitle}>
                    Enter how much a customer must spend with you to get free delivery. When they
                    qualify, the Lalamove fee will be deducted from your payout.
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setThresholdModal(false)}>
                  <Ionicons name="close" size={24} color="#242A26" />
                </TouchableOpacity>
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.amountCurrency}>RM</Text>
                <TextInput
                  style={styles.amountInput}
                  value={thresholdDraft}
                  onChangeText={text => setThresholdDraft(text.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="30.00"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  submitBehavior="blurAndSubmit"
                />
              </View>
              <TouchableOpacity style={styles.primaryButton} onPress={saveThreshold}>
                <Text style={styles.primaryButtonText}>Save offer</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={Boolean(statusDish)}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (statusSaving) return;
          setStatusDish(null);
          setStockOutStatus(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            accessibilityLabel="Close status menu"
            activeOpacity={1}
            disabled={statusSaving}
            onPress={() => {
              setStatusDish(null);
              setStockOutStatus(null);
            }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.sheet, styles.statusSheet]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.statusSheetTitle}>Change Status</Text>
            <TouchableOpacity
              style={styles.statusChoice}
              onPress={() => setStockOutStatus('today')}
              disabled={statusSaving}
            >
              <View style={styles.statusChoiceCopy}>
                <Text style={styles.statusChoiceTitle}>Out of stock today</Text>
                <Text style={styles.statusChoiceHint}>Turns on automatically tomorrow.</Text>
              </View>
              <Ionicons
                name={stockOutStatus === 'today' ? 'radio-button-on' : 'radio-button-off'}
                size={28}
                color={stockOutStatus === 'today' ? '#00B85A' : '#B7BDB9'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statusChoice}
              onPress={() => setStockOutStatus('indefinite')}
              disabled={statusSaving}
            >
              <View style={styles.statusChoiceCopy}>
                <Text style={styles.statusChoiceTitle}>Out of stock indefinitely</Text>
                <Text style={styles.statusChoiceHint}>Stays off until you turn it back on.</Text>
              </View>
              <Ionicons
                name={stockOutStatus === 'indefinite' ? 'radio-button-on' : 'radio-button-off'}
                size={28}
                color={stockOutStatus === 'indefinite' ? '#00B85A' : '#B7BDB9'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.statusConfirm,
                (!stockOutStatus || statusSaving) && styles.buttonDisabled,
              ]}
              onPress={saveStockOutStatus}
              disabled={!stockOutStatus || statusSaving}
            >
              {statusSaving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.statusConfirmText}>Confirm</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={dishStatusModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (dishStatusSaving) return;
          setDishStatusModal(false);
          setDishStatusChoice(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            activeOpacity={1}
            disabled={dishStatusSaving}
            onPress={() => {
              setDishStatusModal(false);
              setDishStatusChoice(null);
            }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.sheet, styles.statusSheet]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.statusSheetTitle}>Change Status</Text>
            <Text style={styles.optionStatusSummary}>
              Updating {selectedDishIds.size} dish{selectedDishIds.size === 1 ? '' : 'es'}
            </Text>
            {(
              [
                ['in_stock', 'In stock', 'Available to customers immediately.'],
                ['today', 'Out of stock today', 'Turns on automatically tomorrow.'],
                ['indefinite', 'Out of stock indefinitely', 'Stays off until restored manually.'],
              ] as const
            ).map(([value, label, hint]) => (
              <TouchableOpacity
                key={value}
                style={styles.statusChoice}
                onPress={() => setDishStatusChoice(value)}
                disabled={dishStatusSaving}
              >
                <View style={styles.statusChoiceCopy}>
                  <Text style={styles.statusChoiceTitle}>{label}</Text>
                  <Text style={styles.statusChoiceHint}>{hint}</Text>
                </View>
                <Ionicons
                  name={dishStatusChoice === value ? 'radio-button-on' : 'radio-button-off'}
                  size={28}
                  color={dishStatusChoice === value ? '#00B85A' : '#B7BDB9'}
                />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[
                styles.statusConfirm,
                (!dishStatusChoice || dishStatusSaving) && styles.buttonDisabled,
              ]}
              disabled={!dishStatusChoice || dishStatusSaving}
              onPress={applyDishStatusToSelection}
            >
              {dishStatusSaving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.statusConfirmText}>Confirm</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={dishScheduleModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (dishScheduleSaving) return;
          setDishScheduleModal(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            activeOpacity={1}
            disabled={dishScheduleSaving}
            onPress={() => setDishScheduleModal(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.sheet, styles.statusSheet]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.statusSheetTitle}>Select availability schedule</Text>
            <Text style={styles.optionStatusSummary}>
              Applies to {selectedDishIds.size} selected dish
              {selectedDishIds.size === 1 ? '' : 'es'}. Selling schedules narrow Business Hours;
              they never extend them.
            </Text>
            {dishScheduleSaving ? (
              <ActivityIndicator color="#00A651" style={styles.scheduleSpinner} />
            ) : (
              <ScrollView style={styles.scheduleList}>
                <TouchableOpacity
                  style={styles.scheduleRow}
                  onPress={() => applyDishSchedule(null)}
                >
                  <View style={styles.scheduleCopy}>
                    <Text style={styles.scheduleTitle}>All opening hours</Text>
                    <Text style={styles.scheduleMeta}>{openingHoursSummary}</Text>
                  </View>
                  <Ionicons name="radio-button-off" size={25} color="#B9C0BC" />
                </TouchableOpacity>
                {sellingSchedules.map(schedule => (
                  <TouchableOpacity
                    key={schedule.id}
                    style={styles.scheduleRow}
                    onPress={() => applyDishSchedule(schedule.id)}
                  >
                    <View style={styles.scheduleCopy}>
                      <Text style={styles.scheduleTitle}>{schedule.name}</Text>
                      <Text style={styles.scheduleMeta}>{scheduleSummary(schedule)}</Text>
                    </View>
                    <Ionicons name="radio-button-off" size={25} color="#B9C0BC" />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.createSchedule}
                  onPress={() => {
                    setDishScheduleModal(false);
                    router.push('/(cook)/add-selling-schedule');
                  }}
                >
                  <Ionicons name="add" size={24} color="#1473E6" />
                  <Text style={styles.createScheduleText}>Create new schedule</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(stockDish)}
        transparent
        animationType="slide"
        onRequestClose={() => setStockDish(null)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.modalBackdrop}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderCopy}>
                  <Text style={styles.sheetTitle}>Daily stock</Text>
                  <Text style={styles.sheetSubtitle}>
                    {stockDish?.title}. Stock resets automatically for each new business day and
                    decreases by the number of portions ordered.
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setStockDish(null)}>
                  <Ionicons name="close" size={24} color="#242A26" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.stockChoice}
                onPress={() => setStockMode('unlimited')}
              >
                <View style={styles.stockChoiceCopy}>
                  <Text style={styles.stockChoiceTitle}>Unlimited daily stock</Text>
                  <Text style={styles.stockChoiceHint}>Use the sold-out toggle when needed.</Text>
                </View>
                <Ionicons
                  name={stockMode === 'unlimited' ? 'radio-button-on' : 'radio-button-off'}
                  size={25}
                  color={stockMode === 'unlimited' ? '#4CAF50' : '#B7BDB9'}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.stockChoice} onPress={() => setStockMode('limited')}>
                <View style={styles.stockChoiceCopy}>
                  <Text style={styles.stockChoiceTitle}>Set daily quantity</Text>
                  <Text style={styles.stockChoiceHint}>
                    The dish sells out automatically at zero.
                  </Text>
                </View>
                <Ionicons
                  name={stockMode === 'limited' ? 'radio-button-on' : 'radio-button-off'}
                  size={25}
                  color={stockMode === 'limited' ? '#4CAF50' : '#B7BDB9'}
                />
              </TouchableOpacity>
              {stockMode === 'limited' && (
                <View style={styles.stockInputRow}>
                  <TextInput
                    style={styles.stockInput}
                    value={stockDraft}
                    onChangeText={text => setStockDraft(text.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="e.g. 15"
                    returnKeyType="done"
                    submitBehavior="blurAndSubmit"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={styles.stockUnit}>portions per day</Text>
                </View>
              )}
              {(availability[stockDish?.id ?? '']?.portionsReservedToday ?? 0) > 0 && (
                <Text style={styles.stockCommittedText}>
                  {availability[stockDish?.id ?? '']?.portionsReservedToday} portions already
                  ordered today
                </Text>
              )}
              <TouchableOpacity
                style={[styles.primaryButton, stockSaving && styles.buttonDisabled]}
                onPress={saveStock}
                disabled={stockSaving}
              >
                {stockSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save daily stock</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={scheduleModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderCopy}>
                <Text style={styles.sheetTitle}>Filter by availability schedule</Text>
                <Text style={styles.sheetSubtitle}>
                  Selling schedules narrow Business Hours; they never extend them.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setScheduleModal(false)}>
                <Ionicons name="close" size={24} color="#242A26" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.scheduleList}>
              <TouchableOpacity
                style={styles.scheduleRow}
                onPress={() => {
                  setScheduleFilter('all');
                  setScheduleModal(false);
                }}
              >
                <View style={styles.scheduleCopy}>
                  <Text style={styles.scheduleTitle}>All availability schedules</Text>
                  <Text style={styles.scheduleMeta}>Show every menu item</Text>
                </View>
                <Ionicons
                  name={scheduleFilter === 'all' ? 'radio-button-on' : 'radio-button-off'}
                  size={25}
                  color={scheduleFilter === 'all' ? '#4CAF50' : '#B9C0BC'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.scheduleRow}
                onPress={() => {
                  setScheduleFilter('opening-hours');
                  setScheduleModal(false);
                }}
              >
                <View style={styles.scheduleCopy}>
                  <Text style={styles.scheduleTitle}>All opening hours</Text>
                  <Text style={styles.scheduleMeta}>{openingHoursSummary}</Text>
                </View>
                <Ionicons
                  name={scheduleFilter === 'opening-hours' ? 'radio-button-on' : 'radio-button-off'}
                  size={25}
                  color={scheduleFilter === 'opening-hours' ? '#4CAF50' : '#B9C0BC'}
                />
              </TouchableOpacity>
              {sellingSchedules.map(schedule => (
                <View key={schedule.id} style={styles.scheduleRow}>
                  <TouchableOpacity
                    style={styles.scheduleCopy}
                    onPress={() => {
                      setScheduleFilter(schedule.id);
                      setScheduleModal(false);
                    }}
                  >
                    <Text style={styles.scheduleTitle}>{schedule.name}</Text>
                    <Text style={styles.scheduleMeta}>{scheduleSummary(schedule)}</Text>
                    <Text
                      style={styles.scheduleEdit}
                      onPress={() => {
                        setScheduleModal(false);
                        router.push({
                          pathname: '/(cook)/add-selling-schedule',
                          params: { id: schedule.id },
                        });
                      }}
                    >
                      Edit
                    </Text>
                  </TouchableOpacity>
                  <Ionicons
                    name={scheduleFilter === schedule.id ? 'radio-button-on' : 'radio-button-off'}
                    size={25}
                    color={scheduleFilter === schedule.id ? '#4CAF50' : '#B9C0BC'}
                    onPress={() => {
                      setScheduleFilter(schedule.id);
                      setScheduleModal(false);
                    }}
                  />
                </View>
              ))}
              <TouchableOpacity
                style={styles.createSchedule}
                onPress={() => {
                  setScheduleModal(false);
                  router.push('/(cook)/add-selling-schedule');
                }}
              >
                <Ionicons name="add" size={24} color="#1473E6" />
                <Text style={styles.createScheduleText}>Create new schedule</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDE2DF',
  },
  tab: { flex: 1, alignItems: 'center', paddingTop: 17 },
  tabText: { fontSize: 16, fontWeight: '500', color: '#4F5752', paddingBottom: 15 },
  tabTextActive: { color: '#4CAF50', fontWeight: '800' },
  tabIndicator: { height: 3, width: '100%', backgroundColor: '#4CAF50' },
  content: { paddingBottom: 140 },
  filters: { flexDirection: 'row', gap: 9, padding: 16 },
  filterChip: {
    height: 44,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#C8CECA',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    gap: 8,
    backgroundColor: '#fff',
  },
  searchChip: { width: 150 },
  searchInput: { width: 88, fontSize: 14, color: '#252A27', paddingVertical: 0 },
  filterText: { fontSize: 14, color: '#343A36', textTransform: 'capitalize' },
  promotionCard: {
    marginHorizontal: 18,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E1E6E3',
    borderRadius: 15,
    padding: 13,
    backgroundColor: '#FAFCFB',
  },
  promotionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E6F7EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  promotionCopy: { flex: 1 },
  promotionTitle: { fontSize: 13, fontWeight: '800', color: '#202622' },
  promotionText: { fontSize: 11, color: '#6E7771', marginTop: 2 },
  categorySection: { paddingHorizontal: 18, paddingTop: 12 },
  categoryHeader: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryTitle: { fontSize: 20, fontWeight: '800', color: '#171B18' },
  categoryCount: { fontSize: 11, color: '#78817B', marginTop: 3 },
  expandCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EAF8F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishList: { gap: 10, paddingBottom: 8 },
  dishRow: {
    minHeight: 92,
    borderWidth: 1,
    borderColor: '#DDE2DF',
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 12,
    backgroundColor: '#fff',
  },
  dishImage: { width: 68, height: 68, borderRadius: 12 },
  imagePlaceholder: { backgroundColor: '#F1F3F2', alignItems: 'center', justifyContent: 'center' },
  dishCopy: { flex: 1 },
  dishTitle: { fontSize: 15, fontWeight: '800', color: '#202522' },
  dishPrice: { fontSize: 14, color: '#4F5752', marginTop: 4 },
  dishState: { fontSize: 10, color: '#4CAF50', marginTop: 4, fontWeight: '600' },
  dishStateSoldOut: { color: '#B42318' },
  dishStateWarning: { color: '#9A6700' },
  stockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 7,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: '#EAF3FE',
    borderWidth: 1,
    borderColor: '#C7DFFB',
  },
  stockChipText: { color: '#1B60B8', fontSize: 11, fontWeight: '700' },
  stockChipEdit: {
    color: '#1473E6',
    fontSize: 11,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  dishRowSelected: { borderColor: '#20A84F', borderWidth: 1.5, backgroundColor: '#F2FBF5' },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E4E8E5',
    backgroundColor: '#FFFFFF',
  },
  selectionHeaderText: { fontSize: 15, fontWeight: '800', color: '#242A26' },
  selectionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 9,
    padding: 14,
    paddingBottom: 26,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E4E8E5',
  },
  selectionAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 24,
    backgroundColor: '#00A651',
  },
  selectionActionText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  selectionActionSecondary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 24,
    backgroundColor: '#E6F6EC',
  },
  selectionActionSecondaryText: { fontSize: 13, fontWeight: '800', color: '#007B55' },
  scheduleSpinner: { marginVertical: 30 },
  keyboardAccessory: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#F2F4F3',
    borderTopWidth: 1,
    borderTopColor: '#DDE2DF',
  },
  keyboardAccessoryDone: { fontSize: 16, fontWeight: '700', color: '#1473E6' },
  emptyState: { alignItems: 'center', paddingVertical: 70, paddingHorizontal: 36 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#2D342F', marginTop: 13 },
  emptyText: { fontSize: 13, lineHeight: 19, color: '#737D76', textAlign: 'center', marginTop: 5 },
  refreshButton: { alignSelf: 'center', paddingHorizontal: 22, paddingVertical: 13, marginTop: 20 },
  refreshText: { color: '#4CAF50', fontSize: 13, fontWeight: '800' },
  optionContent: { padding: 18, gap: 14, paddingBottom: 140 },
  optionCard: { borderWidth: 1, borderColor: '#D8DDDA', borderRadius: 18, overflow: 'hidden' },
  optionHeader: { minHeight: 88, padding: 18, flexDirection: 'row', alignItems: 'center' },
  optionHeaderCopy: { flex: 1 },
  optionTitle: { fontSize: 17, fontWeight: '900', color: '#171B18' },
  optionMeta: { fontSize: 12, color: '#777F7A', marginTop: 5 },
  optionRows: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D8DDDA' },
  optionActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F8FAF8',
  },
  optionAction: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 6 },
  optionActionText: { fontSize: 11, fontWeight: '700', color: '#1473E6' },
  deleteActionText: { color: '#C94A4A' },
  optionRow: {
    minHeight: 74,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionRowCopy: { flex: 1 },
  optionName: { fontSize: 15, color: '#242A26' },
  optionPrice: { fontSize: 13, color: '#68716B', marginTop: 3 },
  manageFooter: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: '#F8FAF8' },
  manageCancel: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#EDF2EF',
  },
  manageCancelText: { fontSize: 13, fontWeight: '800', color: '#486057' },
  manageStatus: {
    flex: 2,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#20A84F',
  },
  manageStatusText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  fab: {
    position: 'absolute',
    right: 22,
    bottom: 24,
    height: 64,
    minWidth: 118,
    borderRadius: 32,
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#003D2D',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 8,
  },
  addChoices: { position: 'absolute', right: 22, bottom: 96, gap: 8, alignItems: 'flex-end' },
  addChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D5DDD8',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  addChoiceText: { fontSize: 13, fontWeight: '800', color: '#263029' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,28,23,0.45)' },
  sheet: {
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 22,
    paddingBottom: 34,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  sheetHeaderCopy: { flex: 1, paddingRight: 12 },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: '#202622' },
  sheetSubtitle: { fontSize: 12, color: '#6D766F', lineHeight: 18, marginTop: 4 },
  sheetHandle: {
    width: 42,
    height: 4,
    alignSelf: 'center',
    marginTop: -8,
    marginBottom: 24,
    borderRadius: 2,
    backgroundColor: '#DDE2DF',
  },
  statusSheet: { minHeight: 360, paddingBottom: 42 },
  statusSheetTitle: { color: '#171C19', fontSize: 26, fontWeight: '900', marginBottom: 14 },
  optionStatusSummary: { marginTop: -8, marginBottom: 8, fontSize: 12, color: '#737C76' },
  statusChoice: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statusChoiceCopy: { flex: 1 },
  statusChoiceTitle: { color: '#202622', fontSize: 17, fontWeight: '800' },
  statusChoiceHint: { color: '#717A74', fontSize: 12, marginTop: 4 },
  statusConfirm: {
    minHeight: 58,
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    backgroundColor: '#00B85A',
  },
  statusConfirmText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  primaryButton: {
    marginTop: 18,
    minHeight: 50,
    backgroundColor: '#4CAF50',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#68716B',
    letterSpacing: 0.7,
    marginTop: 8,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#CAD1CC',
    borderRadius: 12,
    padding: 13,
    marginTop: 7,
    fontSize: 15,
    color: '#242A26',
  },
  optionInput: { minHeight: 120, textAlignVertical: 'top' },
  inputHint: { fontSize: 11, color: '#7C857F', marginTop: 5 },
  multipleRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  multipleCopy: { flex: 1 },
  multipleTitle: { fontSize: 14, fontWeight: '700', color: '#2B322E' },
  multipleHint: { fontSize: 11, color: '#747D77', marginTop: 2 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CAD1CC',
    borderRadius: 14,
    paddingHorizontal: 15,
  },
  amountCurrency: { fontSize: 18, fontWeight: '800', color: '#5F6862' },
  amountInput: { flex: 1, fontSize: 22, fontWeight: '800', padding: 14, color: '#202622' },
  stockChoice: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E1E6E3',
  },
  stockChoiceCopy: { flex: 1, paddingRight: 12 },
  stockChoiceTitle: { fontSize: 15, color: '#242A26', fontWeight: '800' },
  stockChoiceHint: { fontSize: 11, color: '#747D77', marginTop: 3 },
  stockInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 10 },
  stockInput: {
    width: 112,
    borderWidth: 1,
    borderColor: '#C8CECA',
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    color: '#202522',
    fontWeight: '800',
  },
  stockUnit: { color: '#555E58', fontSize: 13 },
  stockCommittedText: { color: '#9A6700', fontSize: 11, marginTop: 12, lineHeight: 17 },
  scheduleList: { maxHeight: 520 },
  scheduleRow: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E1E6E3',
    paddingVertical: 13,
  },
  scheduleCopy: { flex: 1, paddingRight: 14 },
  scheduleTitle: { fontSize: 16, fontWeight: '800', color: '#232925' },
  scheduleMeta: { fontSize: 12, color: '#707A73', marginTop: 5, lineHeight: 17 },
  scheduleEdit: { fontSize: 13, color: '#1473E6', fontWeight: '800', marginTop: 7 },
  createSchedule: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 22 },
  createScheduleText: { color: '#1473E6', fontSize: 16, fontWeight: '800' },
});
