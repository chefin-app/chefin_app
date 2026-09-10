import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  cancelManagedOrder,
  confirmManagedPickup,
  createManagedOrderDispute,
  fetchManagedOrderDetails,
  fetchManagedPickupEvidence,
  fetchManagedOrders,
  revealManagedOrderContact,
  updateManagedOrderDispute,
} from '@/src/admin/api';
import { showAdminFailure, showAdminSuccess } from '@/src/admin/feedback';
import type {
  DishManagementDateRange,
  ManagedOrderDetailsResponse,
  ManagedOrderDispute,
  ManagedOrderListItem,
  OrderMonitoringFilter,
  OrderMonitoringResponse,
  OrderMonitoringSort,
} from '@/src/admin/types';
import AdminDateFilter from '@/src/components/admin/AdminDateFilter';
import AdminDialog from '@/src/components/admin/AdminDialog';
import { AdminPanel, AdminStatusBadge } from '@/src/components/admin/AdminOverviewUI';
import AdminSelect from '@/src/components/admin/AdminSelect';
import { useAuth } from '@/src/services/auth-context';
import { ADMIN_SHARED_STYLES, ADMIN_THEME } from '@/src/admin/theme';

const FILTERS: Array<{ key: OrderMonitoringFilter; label: string }> = [
  { key: 'all', label: 'All orders' },
  { key: 'live', label: 'Live' },
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'disputed', label: 'Disputed' },
];
const SORTS: Array<{ key: OrderMonitoringSort; label: string }> = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'pickup_soonest', label: 'Pickup time: soonest' },
  { key: 'value_desc', label: 'Value: high to low' },
  { key: 'value_asc', label: 'Value: low to high' },
];
const DATE_RANGES: Array<{ key: DishManagementDateRange; label: string }> = [
  { key: 'all', label: 'All dates' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
];

type ActionMode = 'cancel' | 'flag' | 'resolve' | 'handoff' | null;
type LoadMode = 'initial' | 'manual' | 'silent';

const currency = (value: number): string =>
  new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(value);
const formatDateTime = (value: string | null): string =>
  value
    ? new Date(value).toLocaleString('en-MY', {
        timeZone: 'Asia/Kuala_Lumpur',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';
const formatServiceDate = (value: string): string =>
  new Date(`${value}T00:00:00+08:00`).toLocaleDateString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
const formatTimeRange = (start: string | null, end: string | null): string => {
  if (!start) return 'Not available';
  const endLabel = end
    ? new Date(end).toLocaleTimeString('en-MY', {
        timeZone: 'Asia/Kuala_Lumpur',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;
  return `${formatDateTime(start)}${endLabel ? ` – ${endLabel}` : ''}`;
};
const formatDistance = (meters: number | null): string =>
  meters == null
    ? 'Not available'
    : meters < 1000
      ? `${meters.toLocaleString('en-MY')} m`
      : `${(meters / 1000).toFixed(1)} km`;
const humanize = (value: string): string =>
  value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?';

function SmallButton({
  label,
  onPress,
  tone = 'neutral',
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: 'neutral' | 'primary' | 'danger';
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.smallButton,
        tone === 'primary' && styles.smallButtonPrimary,
        tone === 'danger' && styles.smallButtonDanger,
        disabled && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={[
          styles.smallButtonText,
          tone === 'primary' && styles.smallButtonTextPrimary,
          tone === 'danger' && styles.smallButtonTextDanger,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Person({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  return (
    <View style={styles.person}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
      )}
      <Text style={styles.personName} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

function DetailPerson({
  label,
  name,
  secondary,
  imageUrl,
}: {
  label: string;
  name: string;
  secondary: string;
  imageUrl: string | null;
}) {
  return (
    <View style={styles.detailPersonCard}>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.detailPersonRow}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.detailAvatar} />
        ) : (
          <View style={[styles.avatarFallback, styles.detailAvatar]}>
            <Text style={styles.avatarText}>{initials(name)}</Text>
          </View>
        )}
        <View style={styles.flexOne}>
          <Text style={styles.detailPersonName}>{name}</Text>
          <Text style={styles.secondaryText}>{secondary}</Text>
        </View>
      </View>
    </View>
  );
}

export default function OrderMonitoringScreen() {
  const {
    orderId: linkedOrderId,
    cookId,
    customerId,
  } = useLocalSearchParams<{ orderId?: string; cookId?: string; customerId?: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const tableMode = width >= 1050;
  const [response, setResponse] = useState<OrderMonitoringResponse | null>(null);
  const [filter, setFilter] = useState<OrderMonitoringFilter>('all');
  const [sort, setSort] = useState<OrderMonitoringSort>('newest');
  const [dateRange, setDateRange] = useState<DishManagementDateRange>('all');
  const [exactDate, setExactDate] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const openedDeepLink = useRef<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<ManagedOrderDetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [disputeDetails, setDisputeDetails] = useState('');
  const [complainantType, setComplainantType] = useState<'customer' | 'cook' | 'other'>('customer');
  const [resolvingDispute, setResolvingDispute] = useState<ManagedOrderDispute | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const loadOrders = useCallback(
    async (mode: LoadMode = 'initial') => {
      if (!session?.access_token) return;
      const currentRequest = ++requestId.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'manual') setRefreshing(true);
      if (mode !== 'silent') setError(null);
      try {
        const data = await fetchManagedOrders(session.access_token, {
          search,
          filter,
          sort,
          dateRange,
          exactDate,
          cookId,
          customerId,
          page,
          pageSize: 25,
        });
        if (requestId.current !== currentRequest) return;
        setResponse(data);
        if (page !== data.pagination.page) setPage(data.pagination.page);
      } catch (caught: unknown) {
        if (requestId.current === currentRequest && mode !== 'silent') {
          setError(caught instanceof Error ? caught.message : 'Order monitoring could not load.');
        }
      } finally {
        if (requestId.current === currentRequest) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [cookId, customerId, dateRange, exactDate, filter, page, search, session?.access_token, sort]
  );

  useEffect(() => {
    loadOrders('initial');
  }, [loadOrders]);
  useEffect(() => {
    const interval = setInterval(() => loadOrders('silent'), 30_000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const openDetails = useCallback(
    async (id: string, quiet = false) => {
      if (!session?.access_token) return;
      setSelectedId(id);
      if (!quiet) {
        setDetails(null);
        setDetailsLoading(true);
      }
      setDetailsError(null);
      try {
        setDetails(await fetchManagedOrderDetails(session.access_token, id));
      } catch (caught: unknown) {
        setDetailsError(caught instanceof Error ? caught.message : 'Order details could not load.');
      } finally {
        setDetailsLoading(false);
      }
    },
    [session?.access_token]
  );

  useEffect(() => {
    if (!linkedOrderId || openedDeepLink.current === linkedOrderId) return;
    openedDeepLink.current = linkedOrderId;
    openDetails(linkedOrderId);
  }, [linkedOrderId, openDetails]);

  const closeDetails = () => {
    if (actionLoading) return;
    setSelectedId(null);
    setDetails(null);
    setDetailsError(null);
    setActionMode(null);
  };
  const beginAction = (mode: Exclude<ActionMode, null>, dispute?: ManagedOrderDispute) => {
    setActionError(null);
    setReason('');
    setDisputeDetails('');
    setComplainantType('customer');
    setResolvingDispute(dispute ?? null);
    setActionMode(mode);
  };
  const cancelAction = () => {
    if (actionLoading) return;
    setActionMode(null);
    setResolvingDispute(null);
    setActionError(null);
  };
  const refreshAfterAction = async () => {
    await loadOrders('silent');
    if (selectedId) await openDetails(selectedId, true);
  };

  const performAction = async () => {
    if (!session?.access_token || !selectedId || !actionMode || actionLoading) return;
    if (actionMode === 'cancel' && reason.trim().length < 5) {
      setActionError('Enter a cancellation reason of at least 5 characters.');
      return;
    }
    if (actionMode === 'flag' && (reason.trim().length < 3 || disputeDetails.trim().length < 5)) {
      setActionError('Enter a short reason and at least 5 characters of detail.');
      return;
    }
    if (actionMode === 'resolve' && (!resolvingDispute || reason.trim().length < 5)) {
      setActionError('Enter a resolution note of at least 5 characters.');
      return;
    }
    if (actionMode === 'handoff' && reason.trim().length < 5) {
      setActionError('Enter an override reason of at least 5 characters.');
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      if (actionMode === 'cancel') {
        await cancelManagedOrder(session.access_token, selectedId, reason.trim());
        showAdminSuccess('Order cancelled', 'Paid items were added to the manual refund queue.');
      } else if (actionMode === 'flag') {
        await createManagedOrderDispute(session.access_token, selectedId, {
          complainantType,
          reason: reason.trim(),
          details: disputeDetails.trim(),
        });
        showAdminSuccess('Dispute opened', 'The order is now in the open dispute queue.');
      } else if (actionMode === 'handoff') {
        await confirmManagedPickup(session.access_token, selectedId, reason.trim());
        showAdminSuccess(
          'Pickup confirmed',
          'The override and its reason were added to the audit trail.'
        );
      } else if (resolvingDispute) {
        await updateManagedOrderDispute(
          session.access_token,
          resolvingDispute.id,
          'resolved',
          reason.trim()
        );
        showAdminSuccess('Dispute resolved', 'The resolution was saved to the audit trail.');
      }
      setActionMode(null);
      setResolvingDispute(null);
      await refreshAfterAction();
    } catch (caught: unknown) {
      setActionError(
        caught instanceof Error ? caught.message : 'The action could not be completed.'
      );
      showAdminFailure(caught, 'The order action could not be completed.', 'Order update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const markDisputeReviewing = async (dispute: ManagedOrderDispute) => {
    if (!session?.access_token || actionLoading) return;
    setActionLoading(true);
    try {
      await updateManagedOrderDispute(session.access_token, dispute.id, 'reviewing');
      await refreshAfterAction();
      showAdminSuccess('Dispute under review', 'The dispute is now marked as under review.');
    } catch (caught: unknown) {
      showAdminFailure(caught, 'The dispute could not be updated.', 'Dispute update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const revealContact = async () => {
    if (!session?.access_token || !selectedId || revealing) return;
    setRevealing(true);
    try {
      const contact = await revealManagedOrderContact(session.access_token, selectedId);
      setDetails(current =>
        current ? { ...current, order: { ...current.order, contact } } : current
      );
      showAdminSuccess('Details revealed', 'This access was recorded in the admin audit trail.');
    } catch (caught: unknown) {
      showAdminFailure(caught, 'Sensitive contact details could not be revealed.', 'Reveal failed');
    } finally {
      setRevealing(false);
    }
  };

  const openHandoffEvidence = async () => {
    if (!session?.access_token || !selectedId) return;
    try {
      const url = await fetchManagedPickupEvidence(session.access_token, selectedId);
      await Linking.openURL(url);
    } catch (caught: unknown) {
      showAdminFailure(caught, 'The handoff evidence could not be opened.', 'Evidence unavailable');
    }
  };

  const selectedOrder = details?.order ?? null;
  const openDispute = selectedOrder?.disputes.find(dispute =>
    ['open', 'reviewing'].includes(dispute.status)
  );
  const stats = response?.stats;
  const statCards = [
    [
      'Total orders',
      stats?.totalOrders ?? 0,
      'Checkout groups, all time',
      '#26332B',
      'receipt-outline',
      '',
    ],
    [
      'Active now',
      stats?.activeNow ?? 0,
      'Pending, preparing or ready',
      '#438BF5',
      'pulse-outline',
      '',
    ],
    [
      'Completion rate',
      stats?.completionRate ?? 0,
      'Terminal orders · 30 days',
      '#24A98F',
      'checkmark-circle-outline',
      '%',
    ],
    [
      'Cancellation rate',
      stats?.cancellationRate ?? 0,
      'All checkouts · 30 days',
      '#E9A72F',
      'close-circle-outline',
      '%',
    ],
    [
      'Open disputes',
      stats?.openDisputes ?? 0,
      'Needs attention',
      '#F05E68',
      'alert-circle-outline',
      '',
    ],
    [
      'Needs attention',
      stats?.needsAttention ?? 0,
      'Open acceptance, overdue or handoff alerts',
      '#D92D20',
      'warning-outline',
      '',
    ],
  ] as const;

  const renderActions = (order: ManagedOrderListItem) => (
    <View style={styles.rowActions}>
      <SmallButton label="View" onPress={() => openDetails(order.checkoutId)} />
      {order.hasOpenDispute ? (
        <SmallButton label="Resolve" tone="danger" onPress={() => openDetails(order.checkoutId)} />
      ) : null}
    </View>
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>OPERATIONS</Text>
          <Text style={styles.title}>Order Monitoring</Text>
          <Text style={styles.subtitle}>
            Monitor live fulfilment, investigate disputes, and manage exceptional cancellations.
          </Text>
        </View>
        <View style={styles.refreshGroup}>
          <Text style={styles.updatedText}>
            {response?.generatedAt ? `Updated ${formatDateTime(response.generatedAt)}` : ''}
          </Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => loadOrders('manual')}
            disabled={refreshing}
            accessibilityLabel="Refresh orders"
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#4CAF50" />
            ) : (
              <Ionicons name="refresh" size={18} color="#47544C" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsGrid}>
        {statCards.map(([label, value, detail, color, icon, suffix]) => (
          <View key={label} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: `${color}16` }]}>
              <Ionicons name={icon} size={20} color={color} />
            </View>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={[styles.statValue, { color }]}>
              {value.toLocaleString('en-MY')}
              {suffix}
            </Text>
            <Text style={styles.statDetail}>{detail}</Text>
          </View>
        ))}
      </View>

      <AdminPanel>
        {cookId || customerId ? (
          <View style={styles.scopeBanner}>
            <View style={styles.scopeCopy}>
              <Ionicons name="filter-circle-outline" size={18} color="#237A3B" />
              <Text style={styles.scopeText}>
                Showing orders for the selected {cookId ? 'cook' : 'customer'} profile.
              </Text>
            </View>
            <SmallButton label="Show all orders" onPress={() => router.replace('/admin/orders')} />
          </View>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filters}>
            {FILTERS.map(option => {
              const count = response?.counts[option.key];
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.filter, filter === option.key && styles.filterActive]}
                  onPress={() => {
                    setPage(1);
                    setFilter(option.key);
                  }}
                  accessibilityState={{ selected: filter === option.key }}
                >
                  <Text
                    style={[styles.filterText, filter === option.key && styles.filterTextActive]}
                  >
                    {option.label}
                  </Text>
                  {option.key !== 'all' && count != null ? (
                    <View
                      style={[styles.countBadge, filter === option.key && styles.countBadgeActive]}
                    >
                      <Text
                        style={[
                          styles.countBadgeText,
                          filter === option.key && styles.countBadgeTextActive,
                        ]}
                      >
                        {count}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.controls}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={19} color="#89928C" />
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder="Search order ID, customer, cook or dish"
              placeholderTextColor="#9AA29D"
              style={styles.searchInput}
            />
            {searchInput ? (
              <TouchableOpacity
                onPress={() => setSearchInput('')}
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={18} color="#A0A8A3" />
              </TouchableOpacity>
            ) : null}
          </View>
          <AdminSelect
            label="Sort by"
            value={sort}
            options={SORTS}
            onChange={nextSort => {
              setPage(1);
              setSort(nextSort);
            }}
          />
          <AdminDateFilter
            range={dateRange}
            exactDate={exactDate}
            rangeOptions={DATE_RANGES}
            onChange={selection => {
              setPage(1);
              setDateRange(selection.range);
              setExactDate(selection.exactDate);
            }}
          />
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color="#B42318" />
            <Text style={styles.errorText}>{error}</Text>
            <SmallButton label="Retry" onPress={() => loadOrders('initial')} />
          </View>
        ) : null}

        {loading && !response ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.emptyText}>Loading orders…</Text>
          </View>
        ) : response?.orders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={38} color="#9DA59F" />
            <Text style={styles.emptyTitle}>No matching orders</Text>
            <Text style={styles.emptyText}>Try changing the search, status, or date filter.</Text>
          </View>
        ) : tableMode ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableHeaderText, styles.orderColumn]}>ORDER ID</Text>
                <Text style={[styles.tableHeaderText, styles.customerColumn]}>CUSTOMER</Text>
                <Text style={[styles.tableHeaderText, styles.cookColumn]}>COOK</Text>
                <Text style={[styles.tableHeaderText, styles.itemsColumn]}>ITEMS</Text>
                <Text style={[styles.tableHeaderText, styles.valueColumn]}>VALUE</Text>
                <Text style={[styles.tableHeaderText, styles.statusColumn]}>STATUS</Text>
                <Text style={[styles.tableHeaderText, styles.actionsColumn]}>ACTIONS</Text>
              </View>
              {(response?.orders ?? []).map(order => (
                <View key={order.checkoutId} style={styles.tableRow}>
                  <View style={styles.orderColumn}>
                    <Text style={styles.tableStrong}>#{order.displayId}</Text>
                    <Text style={styles.secondaryText}>{humanize(order.fulfillmentType)}</Text>
                  </View>
                  <View style={styles.customerColumn}>
                    <Person name={order.customerName} imageUrl={order.customerAvatarUrl} />
                  </View>
                  <View style={styles.cookColumn}>
                    <Person name={order.cookName} imageUrl={order.cookAvatarUrl} />
                  </View>
                  <View style={styles.itemsColumn}>
                    {order.items.slice(0, 2).map(item => (
                      <Text key={item.id} style={styles.itemText} numberOfLines={1}>
                        {item.title} ×{item.quantity}
                      </Text>
                    ))}
                    {order.items.length > 2 ? (
                      <Text style={styles.secondaryText}>+{order.items.length - 2} more</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.tableStrong, styles.valueColumn]}>
                    {currency(order.orderValue)}
                  </Text>
                  <View style={styles.statusColumn}>
                    <AdminStatusBadge
                      status={
                        order.hasOpenDispute
                          ? 'open'
                          : order.openAlertCount > 0
                            ? 'attention'
                            : order.status
                      }
                    />
                    {order.refundStatus !== 'not_required' ? (
                      <View style={styles.inlineBadgeGap}>
                        <AdminStatusBadge status={order.refundStatus} />
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.actionsColumn}>{renderActions(order)}</View>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.cardList}>
            {(response?.orders ?? []).map(order => (
              <View key={order.checkoutId} style={styles.orderCard}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.tableStrong}>Order #{order.displayId}</Text>
                    <Text style={styles.secondaryText}>{formatDateTime(order.createdAt)}</Text>
                  </View>
                  <AdminStatusBadge
                    status={
                      order.hasOpenDispute
                        ? 'open'
                        : order.openAlertCount > 0
                          ? 'attention'
                          : order.status
                    }
                  />
                </View>
                <View style={styles.cardPeople}>
                  <View style={styles.flexOne}>
                    <Text style={styles.detailLabel}>CUSTOMER</Text>
                    <Person name={order.customerName} imageUrl={order.customerAvatarUrl} />
                  </View>
                  <View style={styles.flexOne}>
                    <Text style={styles.detailLabel}>COOK</Text>
                    <Person name={order.cookName} imageUrl={order.cookAvatarUrl} />
                  </View>
                </View>
                <Text style={styles.itemText} numberOfLines={2}>
                  {order.items.map(item => `${item.title} ×${item.quantity}`).join(', ')}
                </Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardValue}>{currency(order.orderValue)}</Text>
                  {renderActions(order)}
                </View>
              </View>
            ))}
          </View>
        )}

        {response && response.pagination.totalPages > 1 ? (
          <View style={styles.pagination}>
            <SmallButton
              label="Previous"
              onPress={() => setPage(current => Math.max(1, current - 1))}
              disabled={response.pagination.page <= 1}
            />
            <Text style={styles.pageText}>
              Page {response.pagination.page} of {response.pagination.totalPages}
            </Text>
            <SmallButton
              label="Next"
              onPress={() =>
                setPage(current => Math.min(response.pagination.totalPages, current + 1))
              }
              disabled={response.pagination.page >= response.pagination.totalPages}
            />
          </View>
        ) : null}
      </AdminPanel>

      <AdminDialog
        visible={Boolean(selectedId && !actionMode)}
        title={selectedOrder ? `Order #${selectedOrder.displayId}` : 'Order details'}
        subtitle={selectedOrder ? `Placed ${formatDateTime(selectedOrder.createdAt)}` : undefined}
        onClose={closeDetails}
        maxWidth={940}
        footer={
          selectedOrder ? (
            <>
              <SmallButton label="Close" onPress={closeDetails} />
              {!openDispute ? (
                <SmallButton label="Flag dispute" onPress={() => beginAction('flag')} />
              ) : (
                <SmallButton
                  label="Resolve dispute"
                  tone="primary"
                  onPress={() => beginAction('resolve', openDispute)}
                />
              )}
              {selectedOrder.canCancel ? (
                <SmallButton
                  label="Cancel order"
                  tone="danger"
                  onPress={() => beginAction('cancel')}
                />
              ) : null}
              {selectedOrder.fulfillmentType === 'pickup' &&
              selectedOrder.status === 'ready' &&
              selectedOrder.openAlertCount > 0 ? (
                <SmallButton
                  label="Confirm handoff"
                  tone="primary"
                  onPress={() => beginAction('handoff')}
                />
              ) : null}
            </>
          ) : undefined
        }
      >
        {detailsLoading ? (
          <View style={styles.detailLoading}>
            <ActivityIndicator size="large" color="#4CAF50" />
          </View>
        ) : detailsError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{detailsError}</Text>
            {selectedId ? (
              <SmallButton label="Retry" onPress={() => openDetails(selectedId)} />
            ) : null}
          </View>
        ) : selectedOrder ? (
          <View style={styles.detailBody}>
            <View style={styles.detailStatusRow}>
              <AdminStatusBadge status={selectedOrder.status} />
              <View style={styles.metaChip}>
                <Ionicons
                  name={
                    selectedOrder.fulfillmentType === 'delivery'
                      ? 'bicycle-outline'
                      : 'bag-handle-outline'
                  }
                  size={14}
                  color="#526058"
                />
                <Text style={styles.metaChipText}>{humanize(selectedOrder.fulfillmentType)}</Text>
              </View>
              <View style={styles.metaChip}>
                <Ionicons name="time-outline" size={14} color="#526058" />
                <Text style={styles.metaChipText}>{formatDateTime(selectedOrder.pickupTime)}</Text>
              </View>
              {selectedOrder.refundStatus !== 'not_required' ? (
                <AdminStatusBadge status={selectedOrder.refundStatus} />
              ) : null}
            </View>

            <View style={styles.peopleGrid}>
              <DetailPerson
                label="CUSTOMER"
                name={selectedOrder.customer.name}
                secondary={`UID #${selectedOrder.customer.userId.slice(0, 8).toUpperCase()}`}
                imageUrl={selectedOrder.customer.avatarUrl}
              />
              <DetailPerson
                label="COOK"
                name={selectedOrder.cook.restaurantName || selectedOrder.cook.name}
                secondary={`${selectedOrder.cook.name} · UID #${selectedOrder.cook.userId.slice(0, 8).toUpperCase()}`}
                imageUrl={selectedOrder.cook.avatarUrl}
              />
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.detailLabel}>PAYMENT</Text>
                <Text style={styles.infoValue}>{humanize(selectedOrder.paymentStatus)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.detailLabel}>SERVICE DATE</Text>
                <Text style={styles.infoValue}>
                  {formatServiceDate(selectedOrder.scheduledDate)}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.detailLabel}>PICKUP WINDOW</Text>
                <Text style={styles.infoValue}>
                  {formatTimeRange(selectedOrder.pickupTime, selectedOrder.pickupWindowEnd)}
                </Text>
              </View>
            </View>

            {selectedOrder.cancelledAt ? (
              <View style={styles.cancellationNotice}>
                <Ionicons name="close-circle-outline" size={20} color="#B42318" />
                <View style={styles.flexOne}>
                  <Text style={styles.cancellationTitle}>
                    Cancelled by {selectedOrder.cancelledBy ?? 'unknown'} ·{' '}
                    {formatDateTime(selectedOrder.cancelledAt)}
                  </Text>
                  <Text style={styles.cancellationText}>
                    {selectedOrder.cancellationReason ?? 'No cancellation reason was recorded.'}
                  </Text>
                </View>
              </View>
            ) : null}

            {selectedOrder.alerts.length > 0 ? (
              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Operational alerts</Text>
                {selectedOrder.alerts.map(alert => (
                  <View key={alert.id} style={styles.disputeCard}>
                    <View style={styles.sectionHeader}>
                      <View style={styles.flexOne}>
                        <Text style={styles.lineTitle}>{humanize(alert.alert_type)}</Text>
                        <Text style={styles.secondaryText}>
                          Triggered {formatDateTime(alert.triggered_at)} · due{' '}
                          {formatDateTime(alert.due_at)}
                        </Text>
                      </View>
                      <AdminStatusBadge
                        status={alert.status === 'open' ? 'attention' : 'resolved'}
                      />
                    </View>
                    {typeof alert.details.reason === 'string' ? (
                      <Text style={styles.disputeText}>{alert.details.reason}</Text>
                    ) : null}
                    {typeof alert.details.evidenceStoragePath === 'string' ? (
                      <View style={styles.linkRow}>
                        <SmallButton label="Open evidence photo" onPress={openHandoffEvidence} />
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Items ordered</Text>
              {selectedOrder.lines.map(line => (
                <View key={line.id} style={styles.lineItem}>
                  {line.imageUrl ? (
                    <Image source={{ uri: line.imageUrl }} style={styles.lineImage} />
                  ) : (
                    <View style={styles.lineImagePlaceholder}>
                      <Ionicons name="fast-food-outline" size={18} color="#8B958F" />
                    </View>
                  )}
                  <View style={styles.flexOne}>
                    <Text style={styles.lineTitle}>
                      {line.title} ×{line.quantity}
                    </Text>
                    {line.selectedOptions.length > 0 ? (
                      <Text style={styles.secondaryText}>
                        {line.selectedOptions.map(option => option.optionName).join(', ')}
                      </Text>
                    ) : null}
                    {line.customerNote ? (
                      <Text style={styles.noteText}>Note: {line.customerNote}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.linePrice}>{currency(line.totalPrice)}</Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.secondaryText}>Food subtotal</Text>
                <Text style={styles.totalSubValue}>{currency(selectedOrder.foodSubtotal)}</Text>
              </View>
              {selectedOrder.fulfillmentType === 'delivery' ? (
                <View style={styles.totalRow}>
                  <Text style={styles.secondaryText}>Customer delivery fee</Text>
                  <Text style={styles.totalSubValue}>{currency(selectedOrder.deliveryFee)}</Text>
                </View>
              ) : null}
              <View style={[styles.totalRow, styles.grandTotalRow]}>
                <Text style={styles.grandTotalLabel}>Total</Text>
                <Text style={styles.grandTotalValue}>{currency(selectedOrder.orderValue)}</Text>
              </View>
            </View>

            <View style={styles.detailSection}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Contact and fulfilment details</Text>
                  <Text style={styles.sectionHint}>
                    Sensitive access is recorded in the audit trail.
                  </Text>
                </View>
                {!selectedOrder.contact.revealed ? (
                  <SmallButton
                    label={revealing ? 'Revealing…' : 'Reveal details'}
                    onPress={revealContact}
                    disabled={revealing}
                  />
                ) : (
                  <View style={styles.auditedBadge}>
                    <Ionicons name="shield-checkmark-outline" size={14} color="#237A3B" />
                    <Text style={styles.auditedText}>Audited access</Text>
                  </View>
                )}
              </View>
              <View style={styles.infoGrid}>
                <View style={styles.infoCard}>
                  <Text style={styles.detailLabel}>CUSTOMER PHONE</Text>
                  <Text style={styles.infoValue}>
                    {selectedOrder.contact.customerPhone ??
                      selectedOrder.customer.phoneNumber ??
                      'Not provided'}
                  </Text>
                </View>
                <View style={styles.infoCard}>
                  <Text style={styles.detailLabel}>COOK PHONE</Text>
                  <Text style={styles.infoValue}>
                    {selectedOrder.contact.cookPhone ??
                      selectedOrder.cook.phoneNumber ??
                      'Not provided'}
                  </Text>
                </View>
                <View style={styles.infoCard}>
                  <Text style={styles.detailLabel}>PICKUP ADDRESS</Text>
                  <Text style={styles.infoValue}>
                    {selectedOrder.contact.pickupAddress ?? 'Not available'}
                  </Text>
                </View>
                {selectedOrder.fulfillmentType === 'delivery' ? (
                  <View style={styles.infoCard}>
                    <Text style={styles.detailLabel}>DELIVERY ADDRESS</Text>
                    <Text style={styles.infoValue}>
                      {selectedOrder.contact.deliveryAddress ?? 'Not available'}
                    </Text>
                    {selectedOrder.contact.deliveryInstructions ? (
                      <Text style={styles.noteText}>
                        {selectedOrder.contact.deliveryInstructions}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>

            {selectedOrder.delivery ? (
              <View style={styles.detailSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Lalamove delivery</Text>
                  <AdminStatusBadge status={selectedOrder.delivery.status} />
                </View>
                <View style={styles.infoGrid}>
                  <View style={styles.infoCard}>
                    <Text style={styles.detailLabel}>FLEET STATUS</Text>
                    <Text style={styles.infoValue}>
                      {humanize(
                        selectedOrder.delivery.providerStatus ?? selectedOrder.delivery.status
                      )}
                    </Text>
                  </View>
                  <View style={styles.infoCard}>
                    <Text style={styles.detailLabel}>DISTANCE</Text>
                    <Text style={styles.infoValue}>
                      {formatDistance(selectedOrder.delivery.distanceMeters)}
                    </Text>
                  </View>
                  <View style={styles.infoCard}>
                    <Text style={styles.detailLabel}>DRIVER</Text>
                    <Text style={styles.infoValue}>
                      {selectedOrder.delivery.driverName ?? 'Not assigned'}
                    </Text>
                    <Text style={styles.secondaryText}>
                      {selectedOrder.contact.driverPhone ?? 'Phone hidden'}
                      {selectedOrder.delivery.driverPlateNumber
                        ? ` · ${selectedOrder.delivery.driverPlateNumber}`
                        : ''}
                    </Text>
                  </View>
                  <View style={styles.infoCard}>
                    <Text style={styles.detailLabel}>FLEET COST / COOK CHARGE</Text>
                    <Text style={styles.infoValue}>
                      {currency(selectedOrder.delivery.quotedFee)} /{' '}
                      {currency(selectedOrder.cookDeliveryCharge)}
                    </Text>
                  </View>
                  <View style={styles.infoCard}>
                    <Text style={styles.detailLabel}>LALAMOVE ORDER ID</Text>
                    <Text style={styles.infoValue}>
                      {selectedOrder.delivery.providerOrderId ?? 'Not booked yet'}
                    </Text>
                  </View>
                  <View style={styles.infoCard}>
                    <Text style={styles.detailLabel}>ESTIMATED ARRIVAL</Text>
                    <Text style={styles.infoValue}>
                      {formatTimeRange(
                        selectedOrder.delivery.estimatedArrivalStart,
                        selectedOrder.delivery.estimatedArrivalEnd
                      )}
                    </Text>
                  </View>
                </View>
                <View style={styles.linkRow}>
                  {selectedOrder.delivery.shareLink ? (
                    <SmallButton
                      label="Open tracking"
                      onPress={() => Linking.openURL(selectedOrder.delivery!.shareLink!)}
                    />
                  ) : null}
                  {selectedOrder.delivery.proofOfDeliveryUrl ? (
                    <SmallButton
                      label="Proof of delivery"
                      onPress={() => Linking.openURL(selectedOrder.delivery!.proofOfDeliveryUrl!)}
                    />
                  ) : null}
                </View>
              </View>
            ) : null}

            <View style={styles.detailSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Disputes</Text>
                {!openDispute ? (
                  <SmallButton label="Flag dispute" onPress={() => beginAction('flag')} />
                ) : null}
              </View>
              {selectedOrder.disputes.length === 0 ? (
                <Text style={styles.emptyText}>No disputes have been recorded for this order.</Text>
              ) : (
                selectedOrder.disputes.map(dispute => (
                  <View key={dispute.id} style={styles.disputeCard}>
                    <View style={styles.sectionHeader}>
                      <View style={styles.flexOne}>
                        <Text style={styles.lineTitle}>{humanize(dispute.reason)}</Text>
                        <Text style={styles.secondaryText}>
                          Raised for {dispute.complainant_type} ·{' '}
                          {formatDateTime(dispute.created_at)}
                        </Text>
                      </View>
                      <AdminStatusBadge status={dispute.status} />
                    </View>
                    <Text style={styles.disputeText}>{dispute.details}</Text>
                    {dispute.resolution_note ? (
                      <Text style={styles.noteText}>Resolution: {dispute.resolution_note}</Text>
                    ) : null}
                    {['open', 'reviewing'].includes(dispute.status) ? (
                      <View style={styles.linkRow}>
                        {dispute.status === 'open' ? (
                          <SmallButton
                            label="Mark under review"
                            onPress={() => markDisputeReviewing(dispute)}
                            disabled={actionLoading}
                          />
                        ) : null}
                        <SmallButton
                          label="Resolve"
                          tone="primary"
                          onPress={() => beginAction('resolve', dispute)}
                        />
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </View>

            {details?.history.length ? (
              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Admin audit history</Text>
                {details.history.map(entry => (
                  <View key={entry.id} style={styles.historyRow}>
                    <View style={styles.historyDot} />
                    <View style={styles.flexOne}>
                      <Text style={styles.lineTitle}>{humanize(entry.action)}</Text>
                      <Text style={styles.secondaryText}>{formatDateTime(entry.created_at)}</Text>
                      {typeof entry.details.reason === 'string' ? (
                        <Text style={styles.noteText}>{entry.details.reason}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </AdminDialog>

      <AdminDialog
        visible={Boolean(actionMode && selectedId)}
        title={
          actionMode === 'cancel'
            ? 'Cancel this order?'
            : actionMode === 'flag'
              ? 'Flag an order dispute'
              : actionMode === 'handoff'
                ? 'Confirm pickup manually?'
                : 'Resolve this dispute'
        }
        subtitle={selectedOrder ? `Order #${selectedOrder.displayId}` : undefined}
        onClose={cancelAction}
        maxWidth={570}
        footer={
          actionMode ? (
            <>
              <SmallButton label="Back" onPress={cancelAction} disabled={actionLoading} />
              <SmallButton
                label={
                  actionLoading
                    ? 'Saving…'
                    : actionMode === 'cancel'
                      ? 'Cancel order'
                      : actionMode === 'flag'
                        ? 'Open dispute'
                        : actionMode === 'handoff'
                          ? 'Confirm pickup'
                          : 'Resolve dispute'
                }
                tone={actionMode === 'cancel' ? 'danger' : 'primary'}
                onPress={performAction}
                disabled={actionLoading}
              />
            </>
          ) : undefined
        }
      >
        <View style={styles.actionForm}>
          {actionMode === 'cancel' ? (
            <View style={styles.warningBox}>
              <Ionicons name="warning-outline" size={22} color="#B42318" />
              <Text style={styles.warningText}>
                This cancels every item in the checkout, releases capacity, cancels an eligible
                Lalamove job, and places paid items in the manual refund queue.
              </Text>
            </View>
          ) : null}
          {actionMode === 'handoff' ? (
            <View style={styles.warningBox}>
              <Ionicons name="shield-outline" size={22} color="#B26A00" />
              <Text style={styles.warningText}>
                Use this only after reviewing the cook&apos;s evidence or confirming receipt with
                the buyer. The action cannot be undone.
              </Text>
            </View>
          ) : null}
          {actionMode === 'flag' ? (
            <View>
              <Text style={styles.formLabel}>Who raised this dispute?</Text>
              <View style={styles.choiceRow}>
                {(['customer', 'cook', 'other'] as const).map(option => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.choice, complainantType === option && styles.choiceActive]}
                    onPress={() => setComplainantType(option)}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        complainantType === option && styles.choiceTextActive,
                      ]}
                    >
                      {humanize(option)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
          <View>
            <Text style={styles.formLabel}>
              {actionMode === 'cancel'
                ? 'Cancellation reason'
                : actionMode === 'flag'
                  ? 'Dispute category'
                  : actionMode === 'handoff'
                    ? 'Override reason'
                    : 'Resolution note'}
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              multiline={actionMode !== 'flag'}
              maxLength={actionMode === 'flag' ? 100 : 500}
              placeholder={
                actionMode === 'flag'
                  ? 'e.g. Missing item or late delivery'
                  : 'Explain the decision for the audit trail'
              }
              placeholderTextColor="#9AA29D"
              style={actionMode === 'flag' ? styles.input : styles.textarea}
              submitBehavior={actionMode === 'flag' ? 'submit' : 'newline'}
            />
          </View>
          {actionMode === 'flag' ? (
            <View>
              <Text style={styles.formLabel}>Details</Text>
              <TextInput
                value={disputeDetails}
                onChangeText={setDisputeDetails}
                multiline
                maxLength={2000}
                placeholder="Record what was reported and any relevant support context"
                placeholderTextColor="#9AA29D"
                style={styles.textarea}
                submitBehavior="newline"
              />
              <Text style={styles.formHint}>{disputeDetails.length}/2000</Text>
            </View>
          ) : null}
          {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
        </View>
      </AdminDialog>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: ADMIN_SHARED_STYLES.page,
  pageContent: ADMIN_SHARED_STYLES.pageContent,
  header: ADMIN_SHARED_STYLES.pageHeader,
  headerCopy: { flex: 1 },
  eyebrow: ADMIN_SHARED_STYLES.eyebrow,
  title: ADMIN_SHARED_STYLES.pageTitle,
  subtitle: ADMIN_SHARED_STYLES.pageSubtitle,
  refreshGroup: { alignItems: 'flex-end', gap: 7 },
  updatedText: { fontFamily: 'mon', fontSize: 8, color: '#929A95' },
  refreshButton: ADMIN_SHARED_STYLES.refreshButton,
  statsGrid: ADMIN_SHARED_STYLES.statsGrid,
  statCard: {
    ...ADMIN_SHARED_STYLES.statCard,
    minWidth: 175,
  },
  statIcon: ADMIN_SHARED_STYLES.statIcon,
  statLabel: ADMIN_SHARED_STYLES.statLabel,
  statValue: ADMIN_SHARED_STYLES.statValue,
  statDetail: { fontFamily: 'mon', fontSize: 8, lineHeight: 13, color: '#939B96', marginTop: 3 },
  filters: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  scopeBanner: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 11,
    backgroundColor: '#EDF8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  scopeCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  scopeText: { flex: 1, fontFamily: 'mon-sb', fontSize: 10, color: '#2D6640' },
  filter: ADMIN_SHARED_STYLES.filter,
  filterActive: ADMIN_SHARED_STYLES.filterActive,
  filterText: ADMIN_SHARED_STYLES.filterText,
  filterTextActive: ADMIN_SHARED_STYLES.filterTextActive,
  countBadge: {
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF1EF',
  },
  countBadgeActive: { backgroundColor: '#CDEED6' },
  countBadgeText: { fontFamily: 'mon-b', fontSize: 8, color: '#6F7973' },
  countBadgeTextActive: { color: '#237A3B' },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  searchBox: { ...ADMIN_SHARED_STYLES.searchBox, minWidth: 280 },
  searchInput: ADMIN_SHARED_STYLES.searchInput,
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: '#FECDCA',
    borderRadius: 12,
    backgroundColor: '#FFF3F2',
    padding: 13,
    marginBottom: 14,
  },
  errorText: { flex: 1, fontFamily: 'mon', fontSize: 10, color: '#912018' },
  emptyState: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { fontFamily: 'mon-b', fontSize: 15, color: '#37433B' },
  emptyText: { fontFamily: 'mon', fontSize: 10, lineHeight: 16, color: '#828B85' },
  table: { minWidth: 1280 },
  tableRow: {
    minHeight: ADMIN_THEME.layout.tableRowHeight,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF0EE',
    paddingHorizontal: 13,
  },
  tableHeader: ADMIN_SHARED_STYLES.tableHeader,
  tableHeaderText: ADMIN_SHARED_STYLES.tableHeaderText,
  tableStrong: ADMIN_SHARED_STYLES.tableStrong,
  secondaryText: { fontFamily: 'mon', fontSize: 8, lineHeight: 13, color: '#838C86', marginTop: 2 },
  itemText: { fontFamily: 'mon', fontSize: 10, lineHeight: 16, color: '#465149' },
  orderColumn: { width: 135 },
  customerColumn: { width: 205 },
  cookColumn: { width: 215 },
  itemsColumn: { width: 280 },
  valueColumn: { width: 120 },
  statusColumn: { width: 170 },
  actionsColumn: { width: 130 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E6EBE8' },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7F5EB',
  },
  avatarText: { fontFamily: 'mon-b', fontSize: 10, color: '#287F40' },
  personName: { maxWidth: 155, fontFamily: 'mon-sb', fontSize: 10, color: '#303A34' },
  rowActions: { alignItems: 'stretch', gap: 5 },
  smallButton: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#D8DEDA',
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
  },
  smallButtonPrimary: { borderColor: '#35A853', backgroundColor: '#35A853' },
  smallButtonDanger: { borderColor: '#F1B7B4', backgroundColor: '#FFF4F3' },
  smallButtonText: { fontFamily: 'mon-sb', fontSize: 9, color: '#66716A' },
  smallButtonTextPrimary: { color: '#FFFFFF' },
  smallButtonTextDanger: { color: '#B42318' },
  buttonDisabled: { opacity: 0.48 },
  inlineBadgeGap: { marginTop: 5 },
  cardList: { gap: 10 },
  orderCard: {
    borderWidth: 1,
    borderColor: '#E1E6E3',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#FFFFFF',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  cardPeople: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
  },
  cardValue: { fontFamily: 'mon-b', fontSize: 16, color: '#28342C' },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 18,
  },
  pageText: { fontFamily: 'mon-sb', fontSize: 9, color: '#737D77' },
  detailLoading: { minHeight: 380, alignItems: 'center', justifyContent: 'center' },
  detailBody: { gap: 17 },
  detailStatusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  metaChip: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: '#F1F4F2',
  },
  metaChipText: { fontFamily: 'mon-sb', fontSize: 9, color: '#56635B' },
  peopleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: {
    flex: 1,
    minWidth: 190,
    padding: 13,
    borderRadius: 11,
    backgroundColor: '#F7F9F7',
  },
  cancellationNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: '#FECDCA',
    borderRadius: 12,
    backgroundColor: '#FFF5F4',
  },
  cancellationTitle: { fontFamily: 'mon-sb', fontSize: 10, color: '#912018' },
  cancellationText: {
    marginTop: 3,
    fontFamily: 'mon',
    fontSize: 9,
    lineHeight: 15,
    color: '#A13A31',
  },
  detailPersonCard: {
    flex: 1,
    minWidth: 260,
    padding: 15,
    borderWidth: 1,
    borderColor: '#DFE5E1',
    borderRadius: 14,
  },
  detailLabel: {
    fontFamily: 'mon-b',
    fontSize: 8,
    letterSpacing: 0.7,
    color: '#818A84',
    marginBottom: 8,
  },
  detailPersonRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  detailAvatar: { width: 42, height: 42, borderRadius: 21 },
  detailPersonName: { fontFamily: 'mon-sb', fontSize: 13, color: '#2D3831' },
  flexOne: { flex: 1 },
  detailSection: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E8E5',
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: { fontFamily: 'mon-b', fontSize: 14, color: '#303A34', marginBottom: 12 },
  sectionHint: {
    fontFamily: 'mon',
    fontSize: 8,
    color: '#8A938D',
    marginTop: -8,
    marginBottom: 12,
  },
  lineItem: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF0EE',
    paddingVertical: 10,
  },
  lineImage: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#EEF1EF' },
  lineImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF1EF',
  },
  lineTitle: { fontFamily: 'mon-sb', fontSize: 10, color: '#344039' },
  linePrice: { fontFamily: 'mon-sb', fontSize: 11, color: '#344039' },
  noteText: { fontFamily: 'mon', fontSize: 9, lineHeight: 15, color: '#6E7871', marginTop: 5 },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  totalSubValue: { fontFamily: 'mon-sb', fontSize: 10, color: '#455149' },
  grandTotalRow: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#DDE3DF', paddingTop: 13 },
  grandTotalLabel: { fontFamily: 'mon-b', fontSize: 12, color: '#26332B' },
  grandTotalValue: { fontFamily: 'mon-b', fontSize: 16, color: '#26332B' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  infoCard: {
    flex: 1,
    minWidth: 210,
    minHeight: 75,
    padding: 12,
    borderRadius: 11,
    backgroundColor: '#F7F9F8',
  },
  infoValue: { fontFamily: 'mon-sb', fontSize: 10, lineHeight: 16, color: '#344039' },
  auditedBadge: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: '#EAF8EE',
  },
  auditedText: { fontFamily: 'mon-sb', fontSize: 8, color: '#237A3B' },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  disputeCard: { padding: 13, borderRadius: 11, backgroundColor: '#F8FAF9', marginTop: 8 },
  disputeText: { fontFamily: 'mon', fontSize: 10, lineHeight: 17, color: '#505B54', marginTop: 10 },
  historyRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF0EE',
  },
  historyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50', marginTop: 4 },
  actionForm: { gap: 16 },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: '#FECDCA',
    borderRadius: 12,
    backgroundColor: '#FFF4F3',
  },
  warningText: { flex: 1, fontFamily: 'mon', fontSize: 10, lineHeight: 17, color: '#7A271A' },
  formLabel: { fontFamily: 'mon-sb', fontSize: 10, color: '#465149', marginBottom: 8 },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#D8DEDA',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontFamily: 'mon',
    fontSize: 10,
    color: '#344039',
    outlineStyle: 'none',
  } as never,
  textarea: {
    minHeight: 108,
    borderWidth: 1,
    borderColor: '#D8DEDA',
    borderRadius: 10,
    padding: 12,
    fontFamily: 'mon',
    fontSize: 10,
    lineHeight: 17,
    color: '#344039',
    textAlignVertical: 'top',
    outlineStyle: 'none',
  } as never,
  formHint: {
    alignSelf: 'flex-end',
    marginTop: 5,
    fontFamily: 'mon',
    fontSize: 8,
    color: '#929A95',
  },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 9,
  },
  choiceActive: { borderColor: '#4CAF50', backgroundColor: '#EAF8EE' },
  choiceText: { fontFamily: 'mon-sb', fontSize: 9, color: '#68736C' },
  choiceTextActive: { color: '#237A3B' },
  actionError: { fontFamily: 'mon-sb', fontSize: 10, color: '#B42318' },
});
