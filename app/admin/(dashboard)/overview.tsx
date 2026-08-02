import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { fetchAdminOverview } from '@/src/admin/api';
import type { AdminOverviewData, OverviewPeriod } from '@/src/admin/types';
import { useAuth } from '@/src/services/auth-context';
import SkeletonLoader from '@/src/components/feedback/SkeletonLoader';
import {
  ADMIN_COLORS,
  AdminPanel,
  AdminStatusBadge,
  DonutBreakdown,
  MetricCard,
  PeriodSelector,
  SalesChart,
} from '@/src/components/admin/AdminOverviewUI';

const currency = (value: number, compact = false): string =>
  new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    notation: compact && value >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value);

const sumStatuses = (statuses: Record<string, number>, keys: string[]): number =>
  keys.reduce((sum, key) => sum + (statuses[key] ?? 0), 0);

const shortDateTime = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString('en-MY', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionHeadingCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
}

function EmptyPanel({
  icon,
  message,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  message: string;
}) {
  return (
    <View style={styles.emptyPanel}>
      <Ionicons name={icon} size={25} color="#A0A8A3" />
      <Text style={styles.emptyPanelText}>{message}</Text>
    </View>
  );
}

export default function AdminOverviewScreen() {
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const [period, setPeriod] = useState<OverviewPeriod>('30d');
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const desktop = width >= 1024;
  const contentWidth = Math.min(width - (desktop ? 248 : 0) - 48, 1500);
  const metricColumns =
    contentWidth >= 1200 ? 5 : contentWidth >= 720 ? 3 : contentWidth >= 480 ? 2 : 1;
  const metricGap = 12;
  const metricWidth = Math.max(
    220,
    (contentWidth - metricGap * (metricColumns - 1)) / metricColumns
  );
  const donutColumns = contentWidth >= 1050 ? 4 : contentWidth >= 600 ? 2 : 1;
  const donutWidth = Math.max(210, (contentWidth - 44 - 14 * (donutColumns - 1)) / donutColumns);
  const tableMode = contentWidth >= 860;

  const loadOverview = useCallback(
    async (showRefresh = false) => {
      if (!session?.access_token) return;
      const currentRequest = ++requestId.current;
      if (showRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const nextData = await fetchAdminOverview(session.access_token, period);
        if (currentRequest === requestId.current) setData(nextData);
      } catch (caught: unknown) {
        if (currentRequest === requestId.current) {
          setError(caught instanceof Error ? caught.message : 'The overview could not be loaded.');
        }
      } finally {
        if (currentRequest === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [period, session?.access_token]
  );

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const comparisons = useMemo(() => {
    if (!data) return [];
    const accountOthers = Math.max(
      0,
      data.breakdowns.accounts.users - data.breakdowns.accounts.cooks
    );
    return [
      {
        title: 'Users by role',
        segments: [
          {
            label: 'Cook accounts',
            value: data.breakdowns.accounts.cooks,
            color: ADMIN_COLORS.teal,
          },
          { label: 'Other users', value: accountOthers, color: ADMIN_COLORS.pale },
        ],
      },
      {
        title: 'Fulfilment method',
        segments: [
          {
            label: 'Self-collection',
            value: data.breakdowns.fulfillment.pickup,
            color: ADMIN_COLORS.blue,
          },
          {
            label: 'Delivery',
            value: data.breakdowns.fulfillment.delivery,
            color: ADMIN_COLORS.orange,
          },
        ],
      },
      {
        title: 'Order lifecycle',
        segments: [
          {
            label: 'Completed',
            value: data.breakdowns.orderStatus.completed ?? 0,
            color: ADMIN_COLORS.teal,
          },
          {
            label: 'Active',
            value: sumStatuses(data.breakdowns.orderStatus, ['pending', 'confirmed', 'ready']),
            color: ADMIN_COLORS.blue,
          },
          {
            label: 'Cancelled',
            value: data.breakdowns.orderStatus.cancelled ?? 0,
            color: ADMIN_COLORS.amber,
          },
        ],
      },
      {
        title: 'Dish moderation',
        segments: [
          {
            label: 'Approved',
            value: data.breakdowns.dishStatus.approved ?? 0,
            color: ADMIN_COLORS.teal,
          },
          {
            label: 'Pending',
            value: data.breakdowns.dishStatus.pending ?? 0,
            color: ADMIN_COLORS.amber,
          },
          {
            label: 'Rejected',
            value: data.breakdowns.dishStatus.rejected ?? 0,
            color: ADMIN_COLORS.red,
          },
        ],
      },
    ];
  }, [data]);

  const generatedLabel = data
    ? new Date(data.generatedAt).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadOverview(true)}
          tintColor="#4CAF50"
        />
      }
    >
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.eyebrow}>ADMIN DASHBOARD</Text>
          <Text style={styles.pageTitle}>Overview</Text>
          <Text style={styles.pageSubtitle}>
            Marketplace performance, operations and moderation at a glance.
          </Text>
        </View>
        <View style={styles.pageHeaderActions}>
          {generatedLabel && <Text style={styles.updatedText}>Updated {generatedLabel}</Text>}
          <TouchableOpacity style={styles.refreshButton} onPress={() => loadOverview(true)}>
            <Ionicons name="refresh" size={17} color="#425047" />
          </TouchableOpacity>
        </View>
      </View>

      {error && !data && (
        <AdminPanel style={styles.errorPanel}>
          <View style={styles.errorIcon}>
            <Ionicons name="cloud-offline-outline" size={28} color="#9A6700" />
          </View>
          <Text style={styles.errorTitle}>Overview unavailable</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadOverview()}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </AdminPanel>
      )}

      {error && data && (
        <View style={styles.staleBanner}>
          <Ionicons name="warning-outline" size={17} color="#8B6508" />
          <Text style={styles.staleBannerText}>{error} Showing the last loaded overview.</Text>
        </View>
      )}

      {loading && !data ? (
        <View style={styles.loadingGrid}>
          {Array.from({ length: 10 }, (_, index) => (
            <SkeletonLoader
              key={index}
              width={index < 5 ? metricWidth : '100%'}
              height={index < 5 ? 154 : 220}
              borderRadius={16}
            />
          ))}
        </View>
      ) : data ? (
        <>
          <View style={styles.metricGrid}>
            <MetricCard
              label="Recorded order value"
              value={currency(data.summary.recordedOrderValue, true)}
              detail={`Paid, non-cancelled lines · ${period.toUpperCase()}`}
              icon="wallet-outline"
              color={ADMIN_COLORS.green}
              width={metricWidth}
            />
            <MetricCard
              label="Orders"
              value={data.summary.totalOrders.toLocaleString('en-MY')}
              detail={`Order lines created · ${period.toUpperCase()}`}
              icon="receipt-outline"
              color={ADMIN_COLORS.blue}
              width={metricWidth}
            />
            <MetricCard
              label="App users"
              value={data.summary.totalUsers.toLocaleString('en-MY')}
              detail="All marketplace profiles"
              icon="people-outline"
              color={ADMIN_COLORS.teal}
              width={metricWidth}
            />
            <MetricCard
              label="Cook accounts"
              value={data.summary.totalCooks.toLocaleString('en-MY')}
              detail={`${data.summary.totalDishes.toLocaleString('en-MY')} dishes submitted`}
              icon="restaurant-outline"
              color={ADMIN_COLORS.orange}
              width={metricWidth}
            />
            <MetricCard
              label="Pending actions"
              value={data.summary.pendingActions.toLocaleString('en-MY')}
              detail="Dish, document and report reviews"
              icon="shield-outline"
              color={ADMIN_COLORS.red}
              width={metricWidth}
            />
          </View>

          <AdminPanel>
            <SectionHeading
              title="Order value trend"
              subtitle="Recorded GMV from paid, non-cancelled order lines—not settled gateway revenue."
              action={<PeriodSelector value={period} onChange={setPeriod} />}
            />
            <SalesChart data={data.salesSeries} />
          </AdminPanel>

          <AdminPanel>
            <SectionHeading
              title="Quick comparisons"
              subtitle="Current marketplace mix and operational status."
            />
            <View style={styles.donutGrid}>
              {comparisons.map(comparison => (
                <DonutBreakdown
                  key={comparison.title}
                  title={comparison.title}
                  segments={comparison.segments}
                  width={donutWidth}
                />
              ))}
            </View>
          </AdminPanel>

          <AdminPanel>
            <SectionHeading
              title="Top performing cooks"
              subtitle={`Ranked by recorded order value for ${period.toUpperCase()}.`}
            />
            {data.topCooks.length === 0 ? (
              <EmptyPanel
                icon="restaurant-outline"
                message="Cook performance will appear after orders are placed."
              />
            ) : tableMode ? (
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <Text style={[styles.tableHeaderText, styles.idColumn]}>ID</Text>
                  <Text style={[styles.tableHeaderText, styles.nameColumn]}>COOK</Text>
                  <Text style={[styles.tableHeaderText, styles.cuisineColumn]}>CUISINE</Text>
                  <Text style={[styles.tableHeaderText, styles.numberColumn]}>ORDERS</Text>
                  <Text style={[styles.tableHeaderText, styles.numberColumn]}>RATING</Text>
                  <Text style={[styles.tableHeaderText, styles.valueColumn]}>RECORDED VALUE</Text>
                </View>
                {data.topCooks.map(cook => (
                  <View key={cook.id} style={styles.tableRow}>
                    <Text style={[styles.tableCell, styles.idColumn]}>{cook.displayId}</Text>
                    <View style={[styles.personCell, styles.nameColumn]}>
                      {cook.avatarUrl ? (
                        <Image source={{ uri: cook.avatarUrl }} style={styles.avatar} />
                      ) : (
                        <View style={styles.avatarFallback}>
                          <Ionicons name="restaurant" size={14} color="#258B50" />
                        </View>
                      )}
                      <View style={styles.personCopy}>
                        <Text style={styles.personName} numberOfLines={1}>
                          {cook.name}
                        </Text>
                        <Text style={styles.personSecondary} numberOfLines={1}>
                          {cook.ownerName}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.tableCell, styles.cuisineColumn]}>{cook.cuisine}</Text>
                    <Text style={[styles.tableCellStrong, styles.numberColumn]}>
                      {cook.totalOrders.toLocaleString('en-MY')}
                    </Text>
                    <View style={[styles.ratingCell, styles.numberColumn]}>
                      <Ionicons name="star" size={13} color="#F4B740" />
                      <Text style={styles.tableCellStrong}>
                        {cook.averageRating?.toFixed(1) ?? '—'}
                      </Text>
                    </View>
                    <Text style={[styles.tableCellStrong, styles.valueColumn]}>
                      {currency(cook.recordedOrderValue, true)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.mobileCards}>
                {data.topCooks.map(cook => (
                  <View key={cook.id} style={styles.mobileCard}>
                    <View style={styles.mobileCardHeader}>
                      <View style={styles.personCell}>
                        {cook.avatarUrl ? (
                          <Image source={{ uri: cook.avatarUrl }} style={styles.avatar} />
                        ) : (
                          <View style={styles.avatarFallback}>
                            <Ionicons name="restaurant" size={14} color="#258B50" />
                          </View>
                        )}
                        <View style={styles.personCopy}>
                          <Text style={styles.personName}>{cook.name}</Text>
                          <Text style={styles.personSecondary}>{cook.cuisine}</Text>
                        </View>
                      </View>
                      <Text style={styles.mobileValue}>
                        {currency(cook.recordedOrderValue, true)}
                      </Text>
                    </View>
                    <View style={styles.mobileStats}>
                      <Text style={styles.mobileStat}>{cook.totalOrders} orders</Text>
                      <Text style={styles.mobileStat}>
                        ★ {cook.averageRating?.toFixed(1) ?? '—'}
                      </Text>
                      <Text style={styles.mobileStat}>#{cook.displayId}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </AdminPanel>

          <AdminPanel>
            <SectionHeading
              title="Recent orders"
              subtitle="Latest order lines created during the selected period."
            />
            {data.recentOrders.length === 0 ? (
              <EmptyPanel icon="receipt-outline" message="Recent orders will appear here." />
            ) : tableMode ? (
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <Text style={[styles.tableHeaderText, styles.mealColumn]}>MEAL</Text>
                  <Text style={[styles.tableHeaderText, styles.orderIdColumn]}>ORDER</Text>
                  <Text style={[styles.tableHeaderText, styles.customerColumn]}>CUSTOMER</Text>
                  <Text style={[styles.tableHeaderText, styles.cookColumn]}>COOK</Text>
                  <Text style={[styles.tableHeaderText, styles.fulfilmentColumn]}>FULFILMENT</Text>
                  <Text style={[styles.tableHeaderText, styles.dateColumn]}>CREATED</Text>
                  <Text style={[styles.tableHeaderText, styles.orderValueColumn]}>VALUE</Text>
                  <Text style={[styles.tableHeaderText, styles.statusColumn]}>STATUS</Text>
                </View>
                {data.recentOrders.map(order => (
                  <View key={order.id} style={styles.tableRow}>
                    <View style={[styles.mealCell, styles.mealColumn]}>
                      {order.imageUrl ? (
                        <Image source={{ uri: order.imageUrl }} style={styles.mealImage} />
                      ) : (
                        <View style={styles.mealFallback}>
                          <Ionicons name="fast-food-outline" size={14} color="#89928C" />
                        </View>
                      )}
                      <Text style={styles.personName} numberOfLines={1}>
                        {order.mealName}
                      </Text>
                    </View>
                    <Text style={[styles.tableCell, styles.orderIdColumn]}>#{order.displayId}</Text>
                    <Text style={[styles.tableCell, styles.customerColumn]} numberOfLines={1}>
                      {order.customerName}
                    </Text>
                    <Text style={[styles.tableCell, styles.cookColumn]} numberOfLines={1}>
                      {order.cookName}
                    </Text>
                    <Text style={[styles.tableCell, styles.fulfilmentColumn]}>
                      {order.fulfillmentType}
                    </Text>
                    <Text style={[styles.tableCell, styles.dateColumn]}>
                      {shortDateTime(order.createdAt)}
                    </Text>
                    <Text style={[styles.tableCellStrong, styles.orderValueColumn]}>
                      {currency(order.orderValue)}
                    </Text>
                    <View style={styles.statusColumn}>
                      <AdminStatusBadge status={order.status} />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.mobileCards}>
                {data.recentOrders.map(order => (
                  <View key={order.id} style={styles.mobileCard}>
                    <View style={styles.mobileCardHeader}>
                      <View style={styles.mealCell}>
                        {order.imageUrl ? (
                          <Image source={{ uri: order.imageUrl }} style={styles.mealImage} />
                        ) : (
                          <View style={styles.mealFallback}>
                            <Ionicons name="fast-food-outline" size={14} color="#89928C" />
                          </View>
                        )}
                        <View style={styles.personCopy}>
                          <Text style={styles.personName}>{order.mealName}</Text>
                          <Text style={styles.personSecondary}>
                            #{order.displayId} · {shortDateTime(order.createdAt)}
                          </Text>
                        </View>
                      </View>
                      <AdminStatusBadge status={order.status} />
                    </View>
                    <Text style={styles.mobileOrderLine}>
                      {order.customerName} → {order.cookName}
                    </Text>
                    <View style={styles.mobileCardFooter}>
                      <Text style={styles.mobileStat}>{order.fulfillmentType}</Text>
                      <Text style={styles.mobileValue}>{currency(order.orderValue)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </AdminPanel>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F6F8' },
  pageContent: {
    width: '100%',
    maxWidth: 1548,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 54,
    gap: 18,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 18,
    marginBottom: 6,
  },
  eyebrow: {
    fontFamily: 'mon-b',
    fontSize: 9,
    letterSpacing: 1.4,
    color: '#2C9C5B',
    marginBottom: 7,
  },
  pageTitle: { fontFamily: 'mon-b', fontSize: 30, color: '#1C2720', marginBottom: 7 },
  pageSubtitle: { fontFamily: 'mon', fontSize: 12, lineHeight: 19, color: '#737D77' },
  pageHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  updatedText: { fontFamily: 'mon', fontSize: 9, color: '#929A95' },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E9E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  loadingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 22,
  },
  sectionHeadingCopy: { flex: 1 },
  sectionTitle: { fontFamily: 'mon-b', fontSize: 16, color: '#26322B', marginBottom: 5 },
  sectionSubtitle: { fontFamily: 'mon', fontSize: 9, lineHeight: 15, color: '#8A938D' },
  donutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between' },
  table: { borderWidth: 1, borderColor: '#E7EBE8', borderRadius: 12, overflow: 'hidden' },
  tableRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF0EE',
  },
  tableHeader: { minHeight: 42, backgroundColor: '#F2F5F7', borderBottomColor: '#E1E6E3' },
  tableHeaderText: { fontFamily: 'mon-b', fontSize: 8, color: '#59645D' },
  tableCell: { fontFamily: 'mon', fontSize: 9, color: '#5D685F' },
  tableCellStrong: { fontFamily: 'mon-sb', fontSize: 9, color: '#344039' },
  idColumn: { width: 90 },
  nameColumn: { flex: 1.6, minWidth: 190 },
  cuisineColumn: { flex: 1, minWidth: 110 },
  numberColumn: { width: 92 },
  valueColumn: { width: 125 },
  personCell: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  personCopy: { flex: 1, minWidth: 0 },
  personName: { fontFamily: 'mon-sb', fontSize: 9, color: '#344039' },
  personSecondary: { fontFamily: 'mon', fontSize: 8, color: '#929B95', marginTop: 3 },
  avatar: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#ECF0ED' },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E3F6E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mealColumn: { flex: 1.35, minWidth: 150 },
  orderIdColumn: { width: 90 },
  customerColumn: { flex: 1, minWidth: 105 },
  cookColumn: { flex: 1, minWidth: 110 },
  fulfilmentColumn: { width: 110 },
  dateColumn: { width: 110 },
  orderValueColumn: { width: 90 },
  statusColumn: { width: 94 },
  mealCell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mealImage: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#EEF1EF' },
  mealFallback: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#EEF1EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileCards: { gap: 10 },
  mobileCard: { borderWidth: 1, borderColor: '#E7EBE8', borderRadius: 13, padding: 14, gap: 12 },
  mobileCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mobileValue: { fontFamily: 'mon-b', fontSize: 11, color: '#26322B' },
  mobileStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  mobileStat: {
    fontFamily: 'mon-sb',
    fontSize: 8,
    color: '#677169',
    backgroundColor: '#F2F5F3',
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  mobileOrderLine: { fontFamily: 'mon', fontSize: 9, color: '#667169' },
  mobileCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emptyPanel: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyPanelText: { fontFamily: 'mon', fontSize: 10, color: '#929B95' },
  errorPanel: { alignItems: 'center', paddingVertical: 46 },
  errorIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#FFF1C2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  errorTitle: { fontFamily: 'mon-b', fontSize: 16, color: '#273229', marginBottom: 6 },
  errorBody: {
    maxWidth: 460,
    fontFamily: 'mon',
    fontSize: 10,
    lineHeight: 17,
    color: '#7A847D',
    textAlign: 'center',
    marginBottom: 17,
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { fontFamily: 'mon-b', fontSize: 10, color: '#FFFFFF' },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 11,
    backgroundColor: '#FFF6D8',
    borderWidth: 1,
    borderColor: '#F3D779',
  },
  staleBannerText: { flex: 1, fontFamily: 'mon-sb', fontSize: 9, color: '#745306' },
});
