import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  createManagedRefundCase,
  fetchManagedPaymentDetails,
  fetchManagedPayments,
  fetchManagedRefundEvidence,
  reviewManagedRefund,
  runManagedPayoutAction,
} from '@/src/admin/api';
import { showAdminFailure, showAdminSuccess } from '@/src/admin/feedback';
import { ADMIN_SHARED_STYLES } from '@/src/admin/theme';
import type {
  DishManagementDateRange,
  ManagedPayment,
  ManagedPaymentDetails,
  ManagedRefundRequest,
  PaymentManagementFilter,
  PaymentManagementResponse,
  PaymentManagementSort,
} from '@/src/admin/types';
import AdminDateFilter from '@/src/components/admin/AdminDateFilter';
import AdminDialog from '@/src/components/admin/AdminDialog';
import { AdminPanel, AdminStatusBadge } from '@/src/components/admin/AdminOverviewUI';
import AdminSelect from '@/src/components/admin/AdminSelect';
import { useAuth } from '@/src/services/auth-context';
import { ADMIN_THEME } from '@/src/admin/theme';

const FILTERS: Array<{ key: PaymentManagementFilter; label: string }> = [
  { key: 'all', label: 'All transactions' },
  { key: 'payouts', label: 'Cook payouts' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'held', label: 'Held' },
  { key: 'failed', label: 'Failed' },
];
const SORTS: Array<{ key: PaymentManagementSort; label: string }> = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'amount_desc', label: 'Amount: high to low' },
  { key: 'amount_asc', label: 'Amount: low to high' },
];
const DATE_RANGES: Array<{ key: DishManagementDateRange; label: string }> = [
  { key: 'all', label: 'All dates' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
];
const REFUND_REASONS = [
  { key: 'never_arrived', label: 'Order never arrived' },
  { key: 'missing_items', label: 'Missing items' },
  { key: 'incorrect_item', label: 'Incorrect item' },
  { key: 'food_quality', label: 'Food quality issue' },
  { key: 'damaged_order', label: 'Damaged order' },
  { key: 'other', label: 'Other' },
] as const;

type ActionMode =
  | 'hold'
  | 'release'
  | 'create_refund'
  | 'approve'
  | 'reject'
  | 'processing'
  | 'complete'
  | 'fail'
  | null;

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
const humanize = (value: string): string =>
  value.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
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
    <View style={styles.personCard}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Person name={name} imageUrl={imageUrl} />
      <Text style={styles.secondaryText}>{secondary}</Text>
    </View>
  );
}

const csvCell = (value: unknown): string => `"${String(value ?? '').replace(/"/g, '""')}"`;

export default function PaymentsScreen() {
  const { paymentId: linkedPaymentId } = useLocalSearchParams<{ paymentId?: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const tableMode = width >= 1080;
  const [response, setResponse] = useState<PaymentManagementResponse | null>(null);
  const [filter, setFilter] = useState<PaymentManagementFilter>('all');
  const [sort, setSort] = useState<PaymentManagementSort>('newest');
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
  const [details, setDetails] = useState<ManagedPaymentDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [activeRefund, setActiveRefund] = useState<ManagedRefundRequest | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [refundReason, setRefundReason] = useState<string>('other');
  const [gatewayReference, setGatewayReference] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const loadPayments = useCallback(
    async (quiet = false) => {
      if (!session?.access_token) return;
      const currentRequest = ++requestId.current;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const data = await fetchManagedPayments(session.access_token, {
          search,
          filter,
          sort,
          dateRange,
          exactDate,
          page,
          pageSize: 25,
        });
        if (requestId.current !== currentRequest) return;
        setResponse(data);
        if (page !== data.pagination.page) setPage(data.pagination.page);
      } catch (caught: unknown) {
        if (requestId.current === currentRequest) {
          setError(caught instanceof Error ? caught.message : 'Payments could not load.');
        }
      } finally {
        if (requestId.current === currentRequest) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [dateRange, exactDate, filter, page, search, session?.access_token, sort]
  );

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const openDetails = useCallback(
    async (paymentId: string, quiet = false) => {
      if (!session?.access_token) return;
      setSelectedId(paymentId);
      if (!quiet) {
        setDetails(null);
        setDetailsLoading(true);
      }
      setDetailsError(null);
      try {
        setDetails(await fetchManagedPaymentDetails(session.access_token, paymentId));
      } catch (caught: unknown) {
        setDetailsError(
          caught instanceof Error ? caught.message : 'Transaction details could not load.'
        );
      } finally {
        setDetailsLoading(false);
      }
    },
    [session?.access_token]
  );

  useEffect(() => {
    if (!linkedPaymentId || openedDeepLink.current === linkedPaymentId) return;
    openedDeepLink.current = linkedPaymentId;
    openDetails(linkedPaymentId);
  }, [linkedPaymentId, openDetails]);

  const refreshAfterAction = async () => {
    await loadPayments(true);
    if (selectedId) await openDetails(selectedId, true);
  };

  const beginAction = (mode: Exclude<ActionMode, null>, refund?: ManagedRefundRequest) => {
    setActionMode(mode);
    setActiveRefund(refund ?? null);
    setActionNote('');
    setGatewayReference('');
    setRefundReason('other');
    setActionError(null);
  };

  const closeAction = () => {
    if (actionLoading) return;
    setActionMode(null);
    setActiveRefund(null);
    setActionError(null);
  };

  const performAction = async () => {
    if (!session?.access_token || !selectedId || !actionMode || actionLoading) return;
    if (actionNote.trim().length < (actionMode === 'create_refund' ? 10 : 5)) {
      setActionError(
        actionMode === 'create_refund'
          ? 'Describe the refund case in at least 10 characters.'
          : 'Enter an audit note of at least 5 characters.'
      );
      return;
    }
    if (actionMode === 'complete' && gatewayReference.trim().length < 3) {
      setActionError('Enter the reference from the payment gateway refund.');
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      if (actionMode === 'hold' || actionMode === 'release') {
        await runManagedPayoutAction(
          session.access_token,
          selectedId,
          actionMode,
          actionNote.trim()
        );
        showAdminSuccess(
          actionMode === 'hold' ? 'Payout held' : 'Payout released',
          'The decision was recorded in the audit trail.'
        );
      } else if (actionMode === 'create_refund') {
        await createManagedRefundCase(session.access_token, selectedId, {
          reasonCode: refundReason,
          reasonDetails: actionNote.trim(),
        });
        showAdminSuccess('Refund case created', 'The payout is held pending manual review.');
      } else if (activeRefund) {
        await reviewManagedRefund(session.access_token, activeRefund.id, {
          action: actionMode,
          note: actionNote.trim(),
          gatewayReference: gatewayReference.trim() || undefined,
        });
        showAdminSuccess(
          actionMode === 'complete' ? 'Refund recorded' : 'Refund updated',
          actionMode === 'complete'
            ? 'The gateway reference and completion were saved.'
            : 'The review decision was recorded.'
        );
      }
      closeAction();
      await refreshAfterAction();
    } catch (caught: unknown) {
      setActionError(
        caught instanceof Error ? caught.message : 'The action could not be completed.'
      );
      showAdminFailure(
        caught,
        'The payment action could not be completed.',
        'Payment update failed'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const startReview = async (refund: ManagedRefundRequest) => {
    if (!session?.access_token || actionLoading) return;
    setActionLoading(true);
    try {
      await reviewManagedRefund(session.access_token, refund.id, { action: 'review' });
      await refreshAfterAction();
      showAdminSuccess('Review started', 'The request is now marked as under review.');
    } catch (caught: unknown) {
      showAdminFailure(caught, 'The refund request could not be updated.', 'Review failed');
    } finally {
      setActionLoading(false);
    }
  };

  const openEvidence = async (refund: ManagedRefundRequest, index: number) => {
    if (!session?.access_token) return;
    try {
      const url = await fetchManagedRefundEvidence(session.access_token, refund.id, index);
      await Linking.openURL(url);
    } catch (caught: unknown) {
      showAdminFailure(caught, 'The evidence could not be opened.', 'Evidence unavailable');
    }
  };

  const exportCsv = async () => {
    if (!session?.access_token || exporting) return;
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      showAdminFailure(
        new Error('CSV export is available in the web admin console.'),
        'Open the admin console in a browser to export CSV.',
        'Export unavailable'
      );
      return;
    }
    setExporting(true);
    try {
      const rows: ManagedPayment[] = [];
      let exportPage = 1;
      let totalPages = 1;
      do {
        const result = await fetchManagedPayments(session.access_token, {
          search,
          filter,
          sort,
          dateRange,
          exactDate,
          page: exportPage,
          pageSize: 100,
        });
        rows.push(...result.payments);
        totalPages = result.pagination.totalPages;
        exportPage += 1;
      } while (exportPage <= totalPages);
      const header = [
        'Transaction ID',
        'Order ID',
        'Customer',
        'Cook',
        'Gross amount',
        'Cook payout',
        'Method',
        'Payment status',
        'Payout status',
        'Refund status',
        'Created at',
      ];
      const lines = [
        header.map(csvCell).join(','),
        ...rows.map(row =>
          [
            row.transactionCode,
            row.orderDisplayId,
            row.customerName,
            row.cookName,
            row.grossAmount.toFixed(2),
            row.cookPayout.toFixed(2),
            row.paymentMethod,
            row.paymentStatus,
            row.payoutStatus,
            row.refundStatus ?? '',
            row.createdAt,
          ]
            .map(csvCell)
            .join(',')
        ),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `chefin-payments-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      showAdminSuccess('CSV exported', `${rows.length} payment records were exported.`);
    } catch (caught: unknown) {
      showAdminFailure(caught, 'The CSV could not be generated.', 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const stats = response?.stats;
  const statCards = [
    [
      'Gross revenue',
      currency(stats?.grossRevenue ?? 0),
      'Successful recorded payments',
      '#26332B',
      'cash-outline',
    ],
    [
      'Cook payouts due',
      currency(stats?.cookPayoutsDue ?? 0),
      'Held and pending payouts',
      '#E9A72F',
      'wallet-outline',
    ],
    [
      'Funds held',
      currency(stats?.heldFunds ?? 0),
      'Protected from premature payout',
      ADMIN_THEME.colors.blue,
      'lock-closed-outline',
    ],
    [
      'Pending refunds',
      String(stats?.pendingRefunds ?? 0),
      'Awaiting manual review',
      ADMIN_THEME.colors.red,
      'return-down-back-outline',
    ],
    [
      'Failed payments',
      String(stats?.failedPayments ?? 0),
      'Needs attention',
      '#D92D20',
      'alert-circle-outline',
    ],
  ] as const;
  const latestRefund = details?.refunds[0] ?? null;
  const hasActiveRefund = details?.refunds.some(refund =>
    ['pending', 'reviewing', 'approved', 'processing'].includes(refund.status)
  );

  const renderActions = (payment: ManagedPayment) => (
    <View style={styles.rowActions}>
      <SmallButton label="View" onPress={() => openDetails(payment.id)} />
      {payment.refundStatus && ['pending', 'reviewing'].includes(payment.refundStatus) ? (
        <SmallButton label="Review" tone="danger" onPress={() => openDetails(payment.id)} />
      ) : null}
    </View>
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>FINANCE</Text>
          <Text style={styles.title}>Payments</Text>
          <Text style={styles.subtitle}>
            Review transactions, protect cook payouts, and resolve refunds with a complete audit
            trail.
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.exportButton} onPress={exportCsv} disabled={exporting}>
            {exporting ? (
              <ActivityIndicator size="small" color="#445149" />
            ) : (
              <Ionicons name="download-outline" size={17} color="#445149" />
            )}
            <Text style={styles.exportText}>Export CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => {
              setRefreshing(true);
              loadPayments(true);
            }}
            disabled={refreshing}
            accessibilityLabel="Refresh payments"
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={ADMIN_THEME.colors.green} />
            ) : (
              <Ionicons name="refresh" size={18} color="#47544C" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsGrid}>
        {statCards.map(([label, value, detail, color, icon]) => (
          <View key={label} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: `${color}16` }]}>
              <Ionicons name={icon} size={20} color={color} />
            </View>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={[styles.statValue, { color }]}>{value}</Text>
            <Text style={styles.statDetail}>{detail}</Text>
          </View>
        ))}
      </View>

      <View style={styles.policyBanner}>
        <Ionicons name="shield-checkmark-outline" size={21} color="#176A36" />
        <View style={styles.flexOne}>
          <Text style={styles.policyTitle}>Manual refund controls are active</Text>
          <Text style={styles.policyText}>
            Requests are never auto-approved. Pickup claims require a photo, and payouts remain held
            while a refund is active.
          </Text>
        </View>
      </View>

      <AdminPanel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filters}>
            {FILTERS.map(option => (
              <TouchableOpacity
                key={option.key}
                style={[styles.filter, filter === option.key && styles.filterActive]}
                onPress={() => {
                  setPage(1);
                  setFilter(option.key);
                }}
                accessibilityState={{ selected: filter === option.key }}
              >
                <Text style={[styles.filterText, filter === option.key && styles.filterTextActive]}>
                  {option.label}
                </Text>
                {option.key !== 'all' ? (
                  <View
                    style={[styles.countBadge, filter === option.key && styles.countBadgeActive]}
                  >
                    <Text
                      style={[styles.countText, filter === option.key && styles.countTextActive]}
                    >
                      {response?.counts[option.key] ?? 0}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <View style={styles.controls}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={19} color={ADMIN_THEME.colors.textMuted} />
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder="Search transaction, order, cook or customer"
              placeholderTextColor={ADMIN_THEME.colors.textSubtle}
              style={styles.searchInput}
            />
            {searchInput ? (
              <TouchableOpacity
                onPress={() => setSearchInput('')}
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={18} color={ADMIN_THEME.colors.textSubtle} />
              </TouchableOpacity>
            ) : null}
          </View>
          <AdminSelect
            label="Sort"
            value={sort}
            options={SORTS}
            onChange={value => {
              setPage(1);
              setSort(value);
            }}
          />
          <AdminDateFilter
            range={dateRange}
            exactDate={exactDate}
            rangeOptions={DATE_RANGES}
            onChange={({ range, exactDate: date }) => {
              setPage(1);
              setDateRange(range);
              setExactDate(date);
            }}
          />
        </View>

        {loading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color={ADMIN_THEME.colors.green} />
            <Text style={styles.stateText}>Loading payment records…</Text>
          </View>
        ) : error ? (
          <View style={styles.stateBox}>
            <Ionicons name="cloud-offline-outline" size={28} color={ADMIN_THEME.colors.red} />
            <Text style={styles.errorText}>{error}</Text>
            <SmallButton label="Try again" tone="primary" onPress={() => loadPayments()} />
          </View>
        ) : response?.payments.length === 0 ? (
          <View style={styles.stateBox}>
            <Ionicons name="card-outline" size={30} color="#89938D" />
            <Text style={styles.stateTitle}>No payments found</Text>
            <Text style={styles.stateText}>Try changing the filters or search terms.</Text>
          </View>
        ) : tableMode ? (
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableHeaderText, styles.txnColumn]}>TRANSACTION</Text>
              <Text style={[styles.tableHeaderText, styles.orderColumn]}>ORDER</Text>
              <Text style={[styles.tableHeaderText, styles.personColumn]}>CUSTOMER</Text>
              <Text style={[styles.tableHeaderText, styles.personColumn]}>COOK</Text>
              <Text style={[styles.tableHeaderText, styles.amountColumn]}>AMOUNT</Text>
              <Text style={[styles.tableHeaderText, styles.methodColumn]}>METHOD</Text>
              <Text style={[styles.tableHeaderText, styles.statusColumn]}>STATUS</Text>
              <Text style={[styles.tableHeaderText, styles.actionsColumn]}>ACTIONS</Text>
            </View>
            {response?.payments.map(payment => (
              <View key={payment.id} style={styles.tableRow}>
                <View style={styles.txnColumn}>
                  <Text style={styles.cellStrong}>{payment.transactionCode}</Text>
                  <Text style={styles.cellMuted}>{formatDateTime(payment.createdAt)}</Text>
                </View>
                <Text style={[styles.cellText, styles.orderColumn]}>#{payment.orderDisplayId}</Text>
                <View style={styles.personColumn}>
                  <Person name={payment.customerName} imageUrl={payment.customerAvatarUrl} />
                </View>
                <View style={styles.personColumn}>
                  <Person name={payment.cookName} imageUrl={payment.cookAvatarUrl} />
                </View>
                <View style={styles.amountColumn}>
                  <Text style={styles.cellStrong}>{currency(payment.grossAmount)}</Text>
                  <Text style={styles.cellMuted}>Payout {currency(payment.cookPayout)}</Text>
                </View>
                <Text style={[styles.cellText, styles.methodColumn]}>
                  {humanize(payment.paymentMethod)}
                </Text>
                <View style={styles.statusColumn}>
                  <AdminStatusBadge
                    status={
                      payment.refundStatus ??
                      (payment.collectionModel === 'direct_to_cook'
                        ? (payment.directState ?? payment.paymentStatus)
                        : payment.payoutStatus)
                    }
                  />
                </View>
                <View style={styles.actionsColumn}>{renderActions(payment)}</View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.cardList}>
            {response?.payments.map(payment => (
              <View key={payment.id} style={styles.paymentCard}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.cellStrong}>{payment.transactionCode}</Text>
                    <Text style={styles.cellMuted}>Order #{payment.orderDisplayId}</Text>
                  </View>
                  <AdminStatusBadge
                    status={
                      payment.refundStatus ??
                      (payment.collectionModel === 'direct_to_cook'
                        ? (payment.directState ?? payment.paymentStatus)
                        : payment.payoutStatus)
                    }
                  />
                </View>
                <View style={styles.cardPeople}>
                  <Person name={payment.customerName} imageUrl={payment.customerAvatarUrl} />
                  <Ionicons name="arrow-forward" size={16} color="#99A29C" />
                  <Person name={payment.cookName} imageUrl={payment.cookAvatarUrl} />
                </View>
                <View style={styles.cardFooter}>
                  <View>
                    <Text style={styles.cardAmount}>{currency(payment.grossAmount)}</Text>
                    <Text style={styles.cellMuted}>{formatDateTime(payment.createdAt)}</Text>
                  </View>
                  {renderActions(payment)}
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
              disabled={page <= 1}
            />
            <Text style={styles.paginationText}>
              Page {response.pagination.page} of {response.pagination.totalPages}
            </Text>
            <SmallButton
              label="Next"
              onPress={() =>
                setPage(current => Math.min(response.pagination.totalPages, current + 1))
              }
              disabled={page >= response.pagination.totalPages}
            />
          </View>
        ) : null}
      </AdminPanel>

      <AdminDialog
        visible={Boolean(selectedId)}
        title={details ? `Transaction ${details.payment.transactionCode}` : 'Transaction details'}
        subtitle={
          details
            ? `Order #${details.payment.orderDisplayId} · ${formatDateTime(details.payment.createdAt)}`
            : undefined
        }
        onClose={() => {
          if (actionLoading) return;
          setSelectedId(null);
          setDetails(null);
          setDetailsError(null);
        }}
        maxWidth={920}
        footer={
          details ? (
            <View style={styles.dialogFooter}>
              <SmallButton
                label="View full order"
                onPress={() =>
                  router.push({
                    pathname: '/admin/orders',
                    params: { orderId: details.payment.representativeOrderId },
                  })
                }
              />
              {details.payment.payoutStatus === 'held' ? (
                <SmallButton
                  label="Release payout"
                  tone="primary"
                  onPress={() => beginAction('release')}
                />
              ) : details.payment.payoutStatus !== 'paid' &&
                details.payment.payoutStatus !== 'cancelled' &&
                details.payment.collectionModel !== 'direct_to_cook' ? (
                <SmallButton label="Hold payout" onPress={() => beginAction('hold')} />
              ) : null}
              {!hasActiveRefund && details.transaction.status !== 'refunded' ? (
                <SmallButton
                  label="Create refund case"
                  tone="danger"
                  onPress={() => beginAction('create_refund')}
                />
              ) : null}
            </View>
          ) : undefined
        }
      >
        {detailsLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color={ADMIN_THEME.colors.green} />
          </View>
        ) : detailsError ? (
          <View style={styles.stateBox}>
            <Text style={styles.errorText}>{detailsError}</Text>
          </View>
        ) : details ? (
          <View style={styles.detailContent}>
            {details.payment.collectionModel === 'direct_to_cook' && (
              <Text style={styles.refundDetails}>
                Paid directly to cook ·{' '}
                {humanize(details.payment.directState ?? 'awaiting_acceptance')}. Chefin holds no
                funds and no platform payout is due. Refund approval requires the cook to return the
                money directly.
              </Text>
            )}
            <View style={styles.detailStatusRow}>
              <AdminStatusBadge status={details.transaction.status} />
              <AdminStatusBadge status={details.transaction.payout_status} />
              {latestRefund ? <AdminStatusBadge status={latestRefund.status} /> : null}
            </View>

            <View style={styles.personGrid}>
              <DetailPerson
                label="CUSTOMER"
                name={details.payment.customerName}
                secondary={`UID ${details.customer?.user_id?.slice(0, 8).toUpperCase() ?? '—'}`}
                imageUrl={details.payment.customerAvatarUrl}
              />
              <DetailPerson
                label="COOK"
                name={details.payment.cookName}
                secondary={`UID ${details.cook?.user_id?.slice(0, 8).toUpperCase() ?? '—'}`}
                imageUrl={details.payment.cookAvatarUrl}
              />
            </View>

            <View>
              <Text style={styles.sectionTitle}>Payment breakdown</Text>
              <View style={styles.infoList}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Food subtotal</Text>
                  <Text style={styles.infoValue}>{currency(details.breakdown.foodSubtotal)}</Text>
                </View>
                {details.breakdown.deliveryFee > 0 ? (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Delivery fee</Text>
                    <Text style={styles.infoValue}>{currency(details.breakdown.deliveryFee)}</Text>
                  </View>
                ) : null}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Gross payment</Text>
                  <Text style={styles.infoValue}>{currency(details.breakdown.grossAmount)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Processing fee</Text>
                  <Text style={styles.infoValue}>
                    − {currency(details.breakdown.processingFee)}
                  </Text>
                </View>
                <View style={[styles.infoRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>Cook payout</Text>
                  <Text style={styles.totalValue}>{currency(details.breakdown.cookPayout)}</Text>
                </View>
              </View>
            </View>

            <View>
              <Text style={styles.sectionTitle}>Items</Text>
              <View style={styles.infoList}>
                {details.orders.map(order => (
                  <View key={order.id} style={styles.itemRow}>
                    {order.imageUrl ? (
                      <Image source={{ uri: order.imageUrl }} style={styles.itemImage} />
                    ) : (
                      <View style={[styles.itemImage, styles.imagePlaceholder]}>
                        <Ionicons name="restaurant-outline" size={18} color="#8D9791" />
                      </View>
                    )}
                    <Text style={[styles.infoValue, styles.flexOne]}>
                      {order.quantity}× {order.title}
                    </Text>
                    <Text style={styles.infoValue}>{currency(order.totalPrice)}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View>
              <Text style={styles.sectionTitle}>Transaction information</Text>
              <View style={styles.infoList}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Gateway</Text>
                  <Text style={styles.infoValue}>{humanize(details.transaction.gateway)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Gateway reference</Text>
                  <Text style={styles.infoValue}>
                    {details.transaction.gateway_reference ?? '—'}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Method</Text>
                  <Text style={styles.infoValue}>
                    {humanize(details.transaction.payment_method)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Payout available</Text>
                  <Text style={styles.infoValue}>
                    {formatDateTime(details.transaction.payout_available_at)}
                  </Text>
                </View>
                {details.transaction.payout_hold_reason ? (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Hold reason</Text>
                    <Text style={[styles.infoValue, styles.wrapValue]}>
                      {details.transaction.payout_hold_reason}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {details.delivery ? (
              <View style={styles.evidenceCard}>
                <View style={styles.evidenceHeader}>
                  <Ionicons name="bicycle-outline" size={20} color={ADMIN_THEME.colors.blue} />
                  <View style={styles.flexOne}>
                    <Text style={styles.evidenceTitle}>Delivery confirmation</Text>
                    <Text style={styles.evidenceText}>
                      {humanize(details.delivery.status)} ·{' '}
                      {details.delivery.driver_name ?? 'No rider name'}
                      {details.delivery.driver_plate_number
                        ? ` · ${details.delivery.driver_plate_number}`
                        : ''}
                    </Text>
                  </View>
                </View>
                <Text style={styles.evidenceText}>
                  Provider status: {details.delivery.provider_status ?? 'Unavailable'} · Delivered{' '}
                  {formatDateTime(details.delivery.delivered_at)}
                </Text>
                {details.delivery.proof_of_delivery_url ? (
                  <SmallButton
                    label="Open delivery proof"
                    onPress={() => Linking.openURL(details.delivery!.proof_of_delivery_url!)}
                  />
                ) : null}
              </View>
            ) : null}
            {details.fulfillmentType === 'pickup' ? (
              <View style={styles.evidenceCard}>
                <View style={styles.evidenceHeader}>
                  <Ionicons name="key-outline" size={20} color={ADMIN_THEME.colors.greenDark} />
                  <View style={styles.flexOne}>
                    <Text style={[styles.evidenceTitle, styles.pickupEvidenceTitle]}>
                      Pickup handoff confirmation
                    </Text>
                    <Text style={styles.evidenceText}>
                      {details.pickupHandoff?.verified_at
                        ? `Buyer PIN verified ${formatDateTime(details.pickupHandoff.verified_at)}`
                        : 'No verified buyer pickup PIN is recorded.'}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            <View>
              <Text style={styles.sectionTitle}>Refund review</Text>
              {details.refunds.length === 0 ? (
                <View style={styles.emptyRefund}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={20}
                    color={ADMIN_THEME.colors.greenDark}
                  />
                  <Text style={styles.evidenceText}>
                    No refund request has been submitted for this transaction.
                  </Text>
                </View>
              ) : (
                details.refunds.map(refund => (
                  <View key={refund.id} style={styles.refundCard}>
                    <View style={styles.refundHeader}>
                      <View>
                        <Text style={styles.refundTitle}>{humanize(refund.reason_code)}</Text>
                        <Text style={styles.cellMuted}>
                          {refund.source === 'customer'
                            ? 'Submitted by customer'
                            : refund.source === 'system'
                              ? 'Queued after cancellation'
                              : 'Created by admin'}{' '}
                          · {formatDateTime(refund.created_at)}
                        </Text>
                      </View>
                      <AdminStatusBadge status={refund.status} />
                    </View>
                    <Text style={styles.refundDetails}>{refund.reason_details}</Text>
                    <Text style={styles.evidenceText}>
                      Request deadline: {formatDateTime(refund.eligibility_deadline)}
                    </Text>
                    {refund.decision_note ? (
                      <Text style={styles.decisionNote}>Decision note: {refund.decision_note}</Text>
                    ) : null}
                    {refund.gateway_refund_reference ? (
                      <Text style={styles.evidenceText}>
                        Gateway refund ref: {refund.gateway_refund_reference}
                      </Text>
                    ) : null}
                    {refund.evidence_paths.length > 0 ? (
                      <View style={styles.evidenceButtons}>
                        {refund.evidence_paths.map((_, index) => (
                          <SmallButton
                            key={index}
                            label={`Open evidence ${index + 1}`}
                            onPress={() => openEvidence(refund, index)}
                          />
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.noEvidence}>
                        No customer photo attached
                        {details.fulfillmentType === 'delivery'
                          ? '; review delivery confirmation above.'
                          : '.'}
                      </Text>
                    )}
                    <View style={styles.refundActions}>
                      {refund.status === 'pending' ? (
                        <SmallButton label="Start review" onPress={() => startReview(refund)} />
                      ) : null}
                      {['pending', 'reviewing'].includes(refund.status) ? (
                        <>
                          <SmallButton
                            label="Approve"
                            tone="primary"
                            onPress={() => beginAction('approve', refund)}
                          />
                          <SmallButton
                            label="Reject"
                            tone="danger"
                            onPress={() => beginAction('reject', refund)}
                          />
                        </>
                      ) : null}
                      {refund.status === 'approved' ? (
                        <>
                          <SmallButton
                            label="Mark processing"
                            onPress={() => beginAction('processing', refund)}
                          />
                          <SmallButton
                            label="Record refunded"
                            tone="primary"
                            onPress={() => beginAction('complete', refund)}
                          />
                        </>
                      ) : null}
                      {refund.status === 'processing' ? (
                        <>
                          <SmallButton
                            label="Record refunded"
                            tone="primary"
                            onPress={() => beginAction('complete', refund)}
                          />
                          <SmallButton
                            label="Mark failed"
                            tone="danger"
                            onPress={() => beginAction('fail', refund)}
                          />
                        </>
                      ) : null}
                      {refund.status === 'failed' ? (
                        <SmallButton
                          label="Retry processing"
                          onPress={() => beginAction('processing', refund)}
                        />
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        ) : null}
      </AdminDialog>

      <AdminDialog
        visible={Boolean(actionMode)}
        title={
          actionMode === 'create_refund'
            ? 'Create refund case'
            : actionMode === 'hold'
              ? 'Hold cook payout'
              : actionMode === 'release'
                ? 'Release cook payout'
                : actionMode === 'complete'
                  ? 'Record completed refund'
                  : actionMode
                    ? `${humanize(actionMode)} refund`
                    : 'Payment action'
        }
        subtitle={
          actionMode === 'complete'
            ? details?.payment.collectionModel === 'direct_to_cook'
              ? 'The cook must return the money directly. Record completion only after verifying the buyer received it. Enter the bank transfer reference and verification details in the note.'
              : 'Only record completion after the gateway confirms the refund.'
            : 'This action will be recorded in the administrator audit trail.'
        }
        onClose={closeAction}
        maxWidth={560}
        footer={
          <>
            <SmallButton label="Cancel" onPress={closeAction} disabled={actionLoading} />
            <SmallButton
              label={actionLoading ? 'Saving…' : 'Confirm'}
              tone={actionMode === 'reject' || actionMode === 'fail' ? 'danger' : 'primary'}
              onPress={performAction}
              disabled={actionLoading}
            />
          </>
        }
      >
        <View style={styles.actionContent}>
          {actionMode === 'create_refund' ? (
            <AdminSelect
              label="Reason"
              value={refundReason}
              options={[...REFUND_REASONS]}
              onChange={setRefundReason}
            />
          ) : null}
          {actionMode === 'complete' ? (
            <View>
              <Text style={styles.fieldLabel}>
                {details?.payment.collectionModel === 'direct_to_cook'
                  ? 'COOK REFUND TRANSFER REFERENCE'
                  : 'GATEWAY REFUND REFERENCE'}
              </Text>
              <TextInput
                value={gatewayReference}
                onChangeText={setGatewayReference}
                style={styles.textField}
                placeholder="e.g. re_123456"
                placeholderTextColor={ADMIN_THEME.colors.textSubtle}
              />
            </View>
          ) : null}
          <View>
            <Text style={styles.fieldLabel}>
              {actionMode === 'create_refund' ? 'REFUND DETAILS' : 'AUDIT NOTE'}
            </Text>
            <TextInput
              value={actionNote}
              onChangeText={setActionNote}
              style={styles.textArea}
              multiline
              placeholder={
                actionMode === 'create_refund'
                  ? 'Explain why this case is being opened…'
                  : 'Explain this decision…'
              }
              placeholderTextColor={ADMIN_THEME.colors.textSubtle}
              textAlignVertical="top"
            />
          </View>
          {actionError ? <Text style={styles.inlineError}>{actionError}</Text> : null}
        </View>
      </AdminDialog>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: ADMIN_SHARED_STYLES.page,
  pageContent: ADMIN_SHARED_STYLES.pageContent,
  header: ADMIN_SHARED_STYLES.pageHeader,
  headerCopy: { flex: 1, minWidth: 280 },
  eyebrow: ADMIN_SHARED_STYLES.eyebrow,
  title: ADMIN_SHARED_STYLES.pageTitle,
  subtitle: { ...ADMIN_SHARED_STYLES.pageSubtitle, maxWidth: 700 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  exportButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: ADMIN_THEME.colors.border,
    borderRadius: 11,
    backgroundColor: ADMIN_THEME.colors.surface,
  },
  exportText: { fontFamily: 'mon-sb', fontSize: 10, color: '#445149' },
  refreshButton: ADMIN_SHARED_STYLES.refreshButton,
  statsGrid: ADMIN_SHARED_STYLES.statsGrid,
  statCard: ADMIN_SHARED_STYLES.statCard,
  statIcon: ADMIN_SHARED_STYLES.statIcon,
  statLabel: ADMIN_SHARED_STYLES.statLabel,
  statValue: { ...ADMIN_SHARED_STYLES.statValue, fontSize: 19 },
  statDetail: {
    fontFamily: 'mon',
    fontSize: 8,
    lineHeight: 13,
    color: ADMIN_THEME.colors.textSubtle,
    marginTop: 3,
  },
  policyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#CDE9D5',
    borderRadius: 14,
    backgroundColor: '#EFFAF2',
  },
  policyTitle: { fontFamily: 'mon-b', fontSize: 11, color: '#176A36' },
  policyText: { fontFamily: 'mon', fontSize: 9, lineHeight: 15, color: '#4E6957', marginTop: 3 },
  flexOne: { flex: 1 },
  filters: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filter: ADMIN_SHARED_STYLES.filter,
  filterActive: ADMIN_SHARED_STYLES.filterActive,
  filterText: ADMIN_SHARED_STYLES.filterText,
  filterTextActive: ADMIN_SHARED_STYLES.filterTextActive,
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    backgroundColor: '#F0F3F1',
  },
  countBadgeActive: { backgroundColor: '#D3EFD9' },
  countText: { fontFamily: 'mon-b', fontSize: 8, color: '#737D77' },
  countTextActive: { color: ADMIN_THEME.colors.greenDark },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 9,
    marginBottom: 16,
  },
  searchBox: ADMIN_SHARED_STYLES.searchBox,
  searchInput: ADMIN_SHARED_STYLES.searchInput,
  stateBox: {
    minHeight: 250,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 30,
  },
  stateTitle: { fontFamily: 'mon-b', fontSize: 14, color: ADMIN_THEME.colors.textStrong },
  stateText: { fontFamily: 'mon', fontSize: 10, color: '#7C867F', textAlign: 'center' },
  errorText: {
    fontFamily: 'mon-sb',
    fontSize: 10,
    lineHeight: 16,
    color: ADMIN_THEME.colors.red,
    textAlign: 'center',
  },
  table: {
    borderWidth: 1,
    borderColor: ADMIN_THEME.colors.border,
    borderRadius: 14,
    overflow: 'hidden',
  },
  tableRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E9E7',
    paddingHorizontal: 14,
    gap: 10,
    backgroundColor: ADMIN_THEME.colors.surface,
  },
  tableHeader: ADMIN_SHARED_STYLES.tableHeader,
  tableHeaderText: ADMIN_SHARED_STYLES.tableHeaderText,
  txnColumn: { width: 150 },
  orderColumn: { width: 85 },
  personColumn: { flex: 1, minWidth: 135 },
  amountColumn: { width: 120 },
  methodColumn: { width: 105 },
  statusColumn: { width: 130 },
  actionsColumn: { width: 115 },
  cellText: { fontFamily: 'mon', fontSize: 10, color: '#465149' },
  cellStrong: { fontFamily: 'mon-sb', fontSize: 10, color: '#27332B' },
  cellMuted: { fontFamily: 'mon', fontSize: 8, color: '#929B95', marginTop: 3 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  avatar: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: ADMIN_THEME.colors.borderSoft,
  },
  avatarFallback: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ADMIN_THEME.colors.greenSoft,
  },
  avatarText: { fontFamily: 'mon-b', fontSize: 9, color: ADMIN_THEME.colors.greenDark },
  personName: { flex: 1, fontFamily: 'mon-sb', fontSize: 9, color: ADMIN_THEME.colors.textStrong },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  smallButton: {
    minHeight: 31,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#D7DEDA',
    borderRadius: 9,
    backgroundColor: ADMIN_THEME.colors.surface,
  },
  smallButtonPrimary: {
    borderColor: ADMIN_THEME.colors.green,
    backgroundColor: ADMIN_THEME.colors.green,
  },
  smallButtonDanger: { borderColor: '#F3C7C4', backgroundColor: '#FFF5F4' },
  smallButtonText: { fontFamily: 'mon-sb', fontSize: 8, color: '#56615A' },
  smallButtonTextPrimary: { color: ADMIN_THEME.colors.textOnAction },
  smallButtonTextDanger: { color: ADMIN_THEME.colors.red },
  buttonDisabled: { opacity: 0.45 },
  cardList: { gap: 10 },
  paymentCard: {
    padding: 15,
    borderWidth: 1,
    borderColor: ADMIN_THEME.colors.border,
    borderRadius: 14,
    backgroundColor: ADMIN_THEME.colors.surface,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardPeople: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 15,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E9E7',
    paddingTop: 12,
  },
  cardAmount: { fontFamily: 'mon-b', fontSize: 16, color: '#26332B' },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
  },
  paginationText: { fontFamily: 'mon-sb', fontSize: 9, color: '#69736D' },
  dialogFooter: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  detailContent: { gap: 22 },
  detailStatusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  personGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  personCard: {
    flex: 1,
    minWidth: 230,
    padding: 15,
    borderWidth: 1,
    borderColor: ADMIN_THEME.colors.border,
    borderRadius: 14,
    backgroundColor: '#FAFBFA',
    gap: 8,
  },
  detailLabel: { fontFamily: 'mon-b', fontSize: 8, letterSpacing: 0.8, color: '#8A948D' },
  secondaryText: { fontFamily: 'mon', fontSize: 8, color: '#929B95' },
  sectionTitle: {
    fontFamily: 'mon-b',
    fontSize: 13,
    color: ADMIN_THEME.colors.textStrong,
    marginBottom: 10,
  },
  infoList: {
    borderWidth: 1,
    borderColor: ADMIN_THEME.colors.border,
    borderRadius: 13,
    overflow: 'hidden',
  },
  infoRow: {
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ADMIN_THEME.colors.border,
  },
  infoLabel: { flex: 1, fontFamily: 'mon', fontSize: 9, color: ADMIN_THEME.colors.textMuted },
  infoValue: { fontFamily: 'mon-sb', fontSize: 9, color: '#29342D', textAlign: 'right' },
  wrapValue: { flex: 1, lineHeight: 14 },
  totalRow: { backgroundColor: '#F7FAF8', borderBottomWidth: 0 },
  totalLabel: { fontFamily: 'mon-b', fontSize: 10, color: '#29342D' },
  totalValue: { fontFamily: 'mon-b', fontSize: 12, color: '#176A36' },
  itemRow: {
    minHeight: 55,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ADMIN_THEME.colors.border,
  },
  itemImage: { width: 38, height: 38, borderRadius: 9, backgroundColor: '#EEF2EF' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  evidenceCard: {
    gap: 11,
    padding: 15,
    borderWidth: 1,
    borderColor: '#C9DDF2',
    borderRadius: 14,
    backgroundColor: '#F4F8FC',
  },
  evidenceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  evidenceTitle: { fontFamily: 'mon-b', fontSize: 10, color: '#164B78' },
  pickupEvidenceTitle: { color: '#176A36' },
  evidenceText: { fontFamily: 'mon', fontSize: 9, lineHeight: 15, color: '#5F6F65' },
  emptyRefund: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D8EBDD',
    borderRadius: 13,
    backgroundColor: '#F4FBF6',
  },
  refundCard: {
    gap: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: ADMIN_THEME.colors.border,
    borderRadius: 14,
    backgroundColor: ADMIN_THEME.colors.surfaceMuted,
    marginBottom: 10,
  },
  refundHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  refundTitle: { fontFamily: 'mon-b', fontSize: 11, color: '#2C3730' },
  refundDetails: { fontFamily: 'mon', fontSize: 9, lineHeight: 16, color: '#505C54' },
  decisionNote: {
    fontFamily: 'mon-sb',
    fontSize: 9,
    lineHeight: 15,
    color: '#39473E',
    padding: 10,
    borderRadius: 9,
    backgroundColor: '#F0F3F1',
  },
  evidenceButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  noEvidence: {
    fontFamily: 'mon',
    fontSize: 8,
    fontStyle: 'italic',
    color: ADMIN_THEME.colors.amber,
  },
  refundActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingTop: 4 },
  actionContent: { gap: 15 },
  fieldLabel: {
    fontFamily: 'mon-b',
    fontSize: 8,
    letterSpacing: 0.7,
    color: '#69746D',
    marginBottom: 7,
  },
  textField: {
    minHeight: 43,
    borderWidth: 1,
    borderColor: ADMIN_THEME.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontFamily: 'mon',
    fontSize: 10,
    color: '#29342D',
  },
  textArea: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: ADMIN_THEME.colors.border,
    borderRadius: 10,
    padding: 12,
    fontFamily: 'mon',
    fontSize: 10,
    lineHeight: 16,
    color: '#29342D',
  },
  inlineError: {
    fontFamily: 'mon-sb',
    fontSize: 9,
    lineHeight: 15,
    color: ADMIN_THEME.colors.red,
    padding: 10,
    borderRadius: 9,
    backgroundColor: ADMIN_THEME.colors.redSoft,
  },
});
