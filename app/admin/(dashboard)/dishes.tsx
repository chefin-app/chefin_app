import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { fetchManagedDishDetails, fetchManagedDishes, runManagedDishAction } from '@/src/admin/api';
import { showAdminFailure, showAdminSuccess } from '@/src/admin/feedback';
import type {
  DishManagementAction,
  DishManagementDateRange,
  DishManagementFilter,
  DishManagementResponse,
  DishManagementSort,
  ManagedDish,
  ManagedDishDetails,
} from '@/src/admin/types';
import AdminDialog from '@/src/components/admin/AdminDialog';
import AdminDateFilter from '@/src/components/admin/AdminDateFilter';
import { AdminPanel, AdminStatusBadge } from '@/src/components/admin/AdminOverviewUI';
import AdminSelect from '@/src/components/admin/AdminSelect';
import { useAuth } from '@/src/services/auth-context';

const FILTERS: Array<{ key: DishManagementFilter; label: string }> = [
  { key: 'all', label: 'All dishes' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'pending', label: 'Pending review' },
  { key: 'flagged', label: 'Flagged' },
  { key: 'rejected', label: 'Rejected' },
];

const SORTS: Array<{ key: DishManagementSort; label: string }> = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'title_asc', label: 'Dish A–Z' },
  { key: 'title_desc', label: 'Dish Z–A' },
  { key: 'price_asc', label: 'Price: low to high' },
  { key: 'price_desc', label: 'Price: high to low' },
  { key: 'orders_desc', label: 'Most ordered' },
  { key: 'rating_desc', label: 'Highest rated' },
];

const DATE_RANGES: Array<{ key: DishManagementDateRange; label: string }> = [
  { key: 'all', label: 'All dates' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const formatDate = (value: string | null): string =>
  value
    ? new Date(value).toLocaleDateString('en-MY', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

const formatDateTime = (value: string | null): string =>
  value
    ? new Date(value).toLocaleString('en-MY', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

const formatTime = (value: string | null): string => {
  if (!value) return 'All day';
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${minuteText ?? '00'} ${suffix}`;
};

const humanize = (value: string): string =>
  value
    .replace(/^dish_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());

const actionMeta: Record<
  DishManagementAction,
  { title: string; button: string; description: string; reasonLabel?: string; success: string }
> = {
  approve: {
    title: 'Approve this dish?',
    button: 'Approve dish',
    description: 'The dish will become active and visible to customers immediately.',
    success: 'The dish is approved and live.',
  },
  reject: {
    title: 'Reject this dish?',
    button: 'Reject dish',
    description: 'The dish will stay hidden. The cook will receive your reason and can update it.',
    reasonLabel: 'Rejection reason',
    success: 'The dish was rejected and the cook was notified.',
  },
  unpublish: {
    title: 'Unpublish this dish?',
    button: 'Unpublish dish',
    description: 'The approval is preserved, but customers will no longer see or order this dish.',
    reasonLabel: 'Unpublish reason',
    success: 'The dish was removed from customer discovery.',
  },
  republish: {
    title: 'Republish this dish?',
    button: 'Republish dish',
    description: 'The previously approved dish will become visible to customers again.',
    success: 'The dish is live again.',
  },
  clear_rejection: {
    title: 'Restore pending review?',
    button: 'Restore to pending',
    description: 'The rejection will be cleared. The dish stays hidden until an admin approves it.',
    success: 'The dish was restored to the pending review queue.',
  },
};

function ActionButton({
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
        styles.actionButton,
        tone === 'primary' && styles.actionButtonPrimary,
        tone === 'danger' && styles.actionButtonDanger,
        disabled && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={[
          styles.actionButtonText,
          tone === 'primary' && styles.actionButtonTextPrimary,
          tone === 'danger' && styles.actionButtonTextDanger,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function DishManagementScreen() {
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const tableMode = width >= 980;
  const [response, setResponse] = useState<DishManagementResponse | null>(null);
  const [filter, setFilter] = useState<DishManagementFilter>('all');
  const [sort, setSort] = useState<DishManagementSort>('newest');
  const [dateRange, setDateRange] = useState<DishManagementDateRange>('all');
  const [exactDate, setExactDate] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<ManagedDishDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<DishManagementAction | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<{ uri: string; title: string } | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const loadDishes = useCallback(
    async (background = false) => {
      if (!session?.access_token) return;
      if (background) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await fetchManagedDishes(session.access_token, {
          search,
          filter,
          sort,
          dateRange,
          exactDate,
          page,
          pageSize: 25,
        });
        setResponse(data);
        if (page > data.pagination.totalPages) setPage(data.pagination.totalPages);
      } catch (caught: unknown) {
        setError(caught instanceof Error ? caught.message : 'Dish management could not load.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dateRange, exactDate, filter, page, search, session?.access_token, sort]
  );

  useEffect(() => {
    loadDishes();
  }, [loadDishes]);

  const openDetails = async (dishId: string) => {
    if (!session?.access_token) return;
    setSelectedId(dishId);
    setDetails(null);
    setDetailsError(null);
    setDetailsLoading(true);
    try {
      setDetails(await fetchManagedDishDetails(session.access_token, dishId));
    } catch (caught: unknown) {
      setDetailsError(caught instanceof Error ? caught.message : 'Dish details could not load.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const resetSelection = () => {
    setSelectedId(null);
    setDetails(null);
    setDetailsError(null);
    setActionMode(null);
  };

  const closeDetails = () => {
    if (actionLoading) return;
    resetSelection();
  };

  const cancelAction = () => {
    if (actionLoading) return;
    setActionMode(null);
    setActionReason('');
    setActionError(null);

    // A row action does not load the detail dialog first, so cancelling it
    // should return to the table instead of revealing an empty dialog.
    if (!details) {
      setSelectedId(null);
    }
  };

  const beginAction = (dish: ManagedDish, action: DishManagementAction) => {
    setSelectedId(dish.id);
    setActionReason('');
    setActionError(null);
    setActionMode(action);
  };

  const performAction = async () => {
    if (!session?.access_token || !selectedId || !actionMode || actionLoading) return;
    if (actionMeta[actionMode].reasonLabel && actionReason.trim().length < 5) {
      setActionError('Enter a reason of at least 5 characters.');
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      await runManagedDishAction(
        session.access_token,
        selectedId,
        actionMode,
        actionReason.trim() || undefined
      );
      const success = actionMeta[actionMode].success;
      resetSelection();
      await loadDishes(true);
      showAdminSuccess('Dish updated', success);
    } catch (caught: unknown) {
      setActionError(caught instanceof Error ? caught.message : 'The dish could not be updated.');
      showAdminFailure(caught, 'The dish action could not be completed.', 'Dish update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const stats = response?.stats;
  const selectedListDish = useMemo(
    () => response?.dishes.find(dish => dish.id === selectedId) ?? details?.dish ?? null,
    [details?.dish, response?.dishes, selectedId]
  );

  const renderActions = (dish: ManagedDish) => (
    <View style={styles.rowActions}>
      <ActionButton label="View" onPress={() => openDetails(dish.id)} />
      {dish.status === 'active' ? (
        <ActionButton label="Unpublish" onPress={() => beginAction(dish, 'unpublish')} />
      ) : dish.status === 'inactive' ? (
        <ActionButton
          label="Republish"
          tone="primary"
          onPress={() => beginAction(dish, 'republish')}
        />
      ) : dish.status === 'pending' ? (
        <ActionButton label="Review" tone="primary" onPress={() => openDetails(dish.id)} />
      ) : (
        <ActionButton
          label="Clear"
          tone="primary"
          onPress={() => beginAction(dish, 'clear_rejection')}
        />
      )}
    </View>
  );

  const renderDetailFooter = () => {
    if (!details) return undefined;
    const dish = details.dish;
    return (
      <>
        <ActionButton label="Close" onPress={closeDetails} />
        {dish.status === 'pending' ? (
          <>
            <ActionButton
              label="Reject"
              tone="danger"
              onPress={() => beginAction(dish, 'reject')}
            />
            <ActionButton
              label="Approve"
              tone="primary"
              onPress={() => beginAction(dish, 'approve')}
            />
          </>
        ) : dish.status === 'active' ? (
          <ActionButton
            label="Unpublish"
            tone="danger"
            onPress={() => beginAction(dish, 'unpublish')}
          />
        ) : dish.status === 'inactive' ? (
          <ActionButton
            label="Republish"
            tone="primary"
            onPress={() => beginAction(dish, 'republish')}
          />
        ) : (
          <ActionButton
            label="Restore to pending"
            tone="primary"
            onPress={() => beginAction(dish, 'clear_rejection')}
          />
        )}
      </>
    );
  };

  const activeReports = details?.reports.filter(report =>
    ['pending', 'reviewing'].includes(report.status)
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>CATALOGUE OPERATIONS</Text>
          <Text style={styles.title}>Dish Management</Text>
          <Text style={styles.subtitle}>
            Review, publish and monitor dishes without changing cook-owned menu content.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => loadDishes(true)}
          disabled={refreshing}
          accessibilityLabel="Refresh dishes"
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#4CAF50" />
          ) : (
            <Ionicons name="refresh" size={19} color="#47544C" />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
        {[
          ['Total dishes', stats?.totalDishes ?? 0, 'fast-food-outline', '#438BF5'],
          ['Active dishes', stats?.activeDishes ?? 0, 'checkmark-circle-outline', '#24BFB1'],
          ['Pending review', stats?.pendingReview ?? 0, 'time-outline', '#F4B740'],
          ['Flagged dishes', stats?.flaggedDishes ?? 0, 'flag-outline', '#F56C73'],
          [
            'Average price',
            `RM ${(stats?.averagePrice ?? 0).toFixed(2)}`,
            'cash-outline',
            '#4CAF50',
          ],
        ].map(([label, value, icon, color]) => (
          <View key={String(label)} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
              <Ionicons
                name={icon as React.ComponentProps<typeof Ionicons>['name']}
                size={20}
                color={String(color)}
              />
            </View>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>
              {typeof value === 'number' ? value.toLocaleString('en-MY') : value}
            </Text>
          </View>
        ))}
      </View>

      <AdminPanel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filters}>
            {FILTERS.map(option => {
              const count =
                option.key === 'pending'
                  ? stats?.pendingReview
                  : option.key === 'flagged'
                    ? stats?.flaggedDishes
                    : option.key === 'inactive'
                      ? stats?.inactiveDishes
                      : undefined;
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
                  {count != null ? (
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
              placeholder="Search dish, cook, restaurant or cuisine"
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
            <TouchableOpacity onPress={() => loadDishes()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading && !response ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Loading dishes…</Text>
          </View>
        ) : response?.dishes.length === 0 ? (
          <View style={styles.loadingState}>
            <Ionicons name="fast-food-outline" size={38} color="#9DA59F" />
            <Text style={styles.emptyTitle}>No matching dishes</Text>
            <Text style={styles.loadingText}>Try changing the search or filters.</Text>
          </View>
        ) : tableMode ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableHeaderText, styles.idColumn]}>DISH ID</Text>
                <Text style={[styles.tableHeaderText, styles.dishColumn]}>DISH</Text>
                <Text style={[styles.tableHeaderText, styles.cookColumn]}>COOK</Text>
                <Text style={[styles.tableHeaderText, styles.cuisineColumn]}>CUISINE</Text>
                <Text style={[styles.tableHeaderText, styles.priceColumn]}>PRICE</Text>
                <Text style={[styles.tableHeaderText, styles.ordersColumn]}>ORDERS</Text>
                <Text style={[styles.tableHeaderText, styles.statusColumn]}>STATUS</Text>
                <Text style={[styles.tableHeaderText, styles.flagsColumn]}>FLAGS</Text>
                <Text style={[styles.tableHeaderText, styles.actionsColumn]}>ACTIONS</Text>
              </View>
              {(response?.dishes ?? []).map(dish => (
                <View key={dish.id} style={styles.tableRow}>
                  <Text style={[styles.tableCell, styles.idColumn]}>#{dish.displayId}</Text>
                  <View style={[styles.dishCell, styles.dishColumn]}>
                    {dish.imageUrl ? (
                      <TouchableOpacity
                        onPress={() => setImagePreview({ uri: dish.imageUrl!, title: dish.title })}
                        accessibilityRole="button"
                        accessibilityLabel={`View full image for ${dish.title}`}
                      >
                        <Image source={{ uri: dish.imageUrl }} style={styles.dishThumb} />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.dishThumbPlaceholder}>
                        <Ionicons name="fast-food-outline" size={16} color="#829087" />
                      </View>
                    )}
                    <Text style={styles.tableStrong} numberOfLines={2}>
                      {dish.title}
                    </Text>
                  </View>
                  <View style={styles.cookColumn}>
                    <Text style={styles.tableStrong} numberOfLines={1}>
                      {dish.cookName}
                    </Text>
                    <Text style={styles.tableSecondary} numberOfLines={1}>
                      {dish.restaurantName ?? 'Home restaurant'}
                    </Text>
                  </View>
                  <Text style={[styles.tableCell, styles.cuisineColumn]}>
                    {dish.cuisine ?? '—'}
                  </Text>
                  <Text style={[styles.tableCell, styles.priceColumn]}>
                    RM {dish.price.toFixed(2)}
                  </Text>
                  <Text style={[styles.tableCell, styles.ordersColumn]}>{dish.totalOrders}</Text>
                  <View style={styles.statusColumn}>
                    <AdminStatusBadge status={dish.status} />
                  </View>
                  <View style={styles.flagsColumn}>
                    {dish.openReportCount > 0 ? (
                      <View style={styles.flagBadge}>
                        <Ionicons name="flag" size={12} color="#B42318" />
                        <Text style={styles.flagText}>{dish.openReportCount}</Text>
                      </View>
                    ) : (
                      <Text style={styles.tableSecondary}>—</Text>
                    )}
                  </View>
                  <View style={styles.actionsColumn}>{renderActions(dish)}</View>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.mobileCards}>
            {(response?.dishes ?? []).map(dish => (
              <View key={dish.id} style={styles.mobileCard}>
                <TouchableOpacity
                  style={styles.mobileCardLink}
                  onPress={() => openDetails(dish.id)}
                >
                  <View style={styles.mobileCardTop}>
                    {dish.imageUrl ? (
                      <TouchableOpacity
                        onPress={event => {
                          event.stopPropagation();
                          setImagePreview({ uri: dish.imageUrl!, title: dish.title });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`View full image for ${dish.title}`}
                      >
                        <Image source={{ uri: dish.imageUrl }} style={styles.mobileImage} />
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.mobileImage, styles.dishThumbPlaceholder]}>
                        <Ionicons name="fast-food-outline" size={20} color="#829087" />
                      </View>
                    )}
                    <View style={styles.mobileCopy}>
                      <Text style={styles.mobileTitle}>{dish.title}</Text>
                      <Text style={styles.tableSecondary}>
                        #{dish.displayId} · {dish.cookName}
                      </Text>
                      <Text style={styles.mobilePrice}>RM {dish.price.toFixed(2)}</Text>
                    </View>
                    <AdminStatusBadge status={dish.status} />
                  </View>
                  <View style={styles.mobileMetaRow}>
                    <Text style={styles.tableSecondary}>{dish.totalOrders} orders</Text>
                    <Text style={styles.tableSecondary}>
                      {dish.averageRating == null
                        ? 'No ratings'
                        : `★ ${dish.averageRating.toFixed(1)}`}
                    </Text>
                    {dish.openReportCount > 0 ? (
                      <Text style={styles.mobileFlag}>{dish.openReportCount} open report(s)</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
                {renderActions(dish)}
              </View>
            ))}
          </View>
        )}

        {response ? (
          <View style={styles.pagination}>
            <Text style={styles.paginationText}>
              {response.pagination.total.toLocaleString('en-MY')} dishes · Page {page} of{' '}
              {response.pagination.totalPages}
            </Text>
            <View style={styles.rowActions}>
              <ActionButton
                label="Previous"
                disabled={page <= 1}
                onPress={() => setPage(value => Math.max(1, value - 1))}
              />
              <ActionButton
                label="Next"
                disabled={page >= response.pagination.totalPages}
                onPress={() => setPage(value => value + 1)}
              />
            </View>
          </View>
        ) : null}
      </AdminPanel>

      <AdminDialog
        visible={Boolean(selectedId) && !actionMode}
        title="Dish Information"
        subtitle={details ? `Dish #${details.dish.displayId}` : undefined}
        onClose={closeDetails}
        maxWidth={980}
        footer={renderDetailFooter()}
      >
        {detailsLoading ? (
          <View style={styles.dialogLoading}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Loading dish information…</Text>
          </View>
        ) : detailsError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color="#B42318" />
            <Text style={styles.errorText}>{detailsError}</Text>
            {selectedId ? (
              <TouchableOpacity onPress={() => openDetails(selectedId)}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : details ? (
          <View style={styles.detailsContent}>
            {details.dish.imageUrl ? (
              <TouchableOpacity
                onPress={() =>
                  setImagePreview({ uri: details.dish.imageUrl!, title: details.dish.title })
                }
                accessibilityRole="button"
                accessibilityLabel={`View full image for ${details.dish.title}`}
              >
                <Image source={{ uri: details.dish.imageUrl }} style={styles.heroImage} />
                <View style={styles.imageExpandHint}>
                  <Ionicons name="expand-outline" size={15} color="#FFFFFF" />
                  <Text style={styles.imageExpandText}>View full image</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={[styles.heroImage, styles.heroPlaceholder]}>
                <Ionicons name="image-outline" size={34} color="#87938B" />
                <Text style={styles.loadingText}>No dish image</Text>
              </View>
            )}

            <View style={styles.detailsHeader}>
              <View style={styles.detailsHeaderCopy}>
                <Text style={styles.detailsTitle}>{details.dish.title}</Text>
                <Text style={styles.detailsMeta}>
                  Added {formatDate(details.dish.createdAt)} · By {details.dish.cookName}
                </Text>
              </View>
              <Text style={styles.detailsPrice}>RM {details.dish.price.toFixed(2)}</Text>
            </View>
            <Text style={styles.description}>
              {details.dish.description || 'The cook did not provide a description.'}
            </Text>

            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{details.dish.totalOrders}</Text>
                <Text style={styles.metricLabel}>Total orders</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>
                  {details.dish.averageRating == null ? '—' : details.dish.averageRating.toFixed(1)}
                </Text>
                <Text style={styles.metricLabel}>Avg rating ({details.dish.ratingCount})</Text>
              </View>
              <View style={styles.metricCard}>
                <AdminStatusBadge status={details.dish.status} />
                <Text style={styles.metricLabel}>Current status</Text>
              </View>
              <View style={styles.metricCard}>
                <Text
                  style={[styles.metricValue, activeReports?.length ? styles.metricDanger : null]}
                >
                  {activeReports?.length ?? 0}
                </Text>
                <Text style={styles.metricLabel}>Open reports</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Dish information</Text>
              <DetailRow label="Menu category" value={details.dish.menuCategory} />
              <DetailRow label="Cuisine" value={details.dish.cuisine ?? 'Not specified'} />
              <DetailRow
                label="Dietary information"
                value={details.dish.dietaryTags.join(', ') || 'None declared'}
              />
              <DetailRow
                label="Ingredients"
                value={details.dish.ingredients.join(', ') || 'Not provided'}
              />
              <DetailRow label="Cook location" value={details.dish.cookAddress} />
              <DetailRow
                label="Delivery offer"
                value={
                  details.dish.freeDeliveryThreshold == null
                    ? 'No free-delivery threshold'
                    : `Cook covers delivery from RM ${details.dish.freeDeliveryThreshold.toFixed(2)}`
                }
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Option groups</Text>
              {details.optionGroups.length === 0 ? (
                <Text style={styles.emptySectionText}>No option groups are attached.</Text>
              ) : (
                details.optionGroups.map(group => (
                  <View key={group.id} style={styles.optionGroup}>
                    <View style={styles.optionHeader}>
                      <Text style={styles.optionTitle}>{group.name}</Text>
                      <Text style={styles.optionRule}>
                        {group.required ? 'Required' : 'Optional'} · Select {group.minSelect}–
                        {group.maxSelect}
                      </Text>
                    </View>
                    {group.options.map(option => (
                      <View key={option.id} style={styles.optionRow}>
                        <Text style={styles.optionName}>{option.name}</Text>
                        <Text style={styles.optionPrice}>
                          {option.priceDelta > 0
                            ? `+RM ${option.priceDelta.toFixed(2)}`
                            : 'Included'}
                        </Text>
                        <AdminStatusBadge status={option.isAvailable ? 'active' : 'inactive'} />
                      </View>
                    ))}
                  </View>
                ))
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Availability</Text>
              <View style={styles.availabilitySummary}>
                <Text style={styles.availabilityTitle}>
                  {details.availability.sellingSchedule?.name ?? 'Restaurant opening hours'}
                </Text>
                <Text style={styles.tableSecondary}>
                  {details.availability.settings
                    ? details.availability.settings.enabled
                      ? 'Dish availability enabled'
                      : 'Dish availability disabled'
                    : 'Availability settings not configured'}
                </Text>
                {details.availability.sellingSchedule?.specificDates ? (
                  <Text style={styles.tableSecondary}>
                    {formatDate(details.availability.sellingSchedule.startsOn)}–
                    {formatDate(details.availability.sellingSchedule.endsOn)}
                  </Text>
                ) : null}
                <View style={styles.weekdayRow}>
                  {WEEKDAYS.map((day, index) => {
                    const selected = details.availability.sellingSchedule
                      ? details.availability.sellingSchedule.windows.some(
                          window => window.isoWeekday === index + 1
                        )
                      : details.availability.openingHours.some(
                          window => window.isoWeekday === index + 1 && window.enabled
                        );
                    return (
                      <View key={day} style={[styles.weekday, selected && styles.weekdayActive]}>
                        <Text style={[styles.weekdayText, selected && styles.weekdayTextActive]}>
                          {day}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                {(
                  details.availability.sellingSchedule?.windows ?? details.availability.openingHours
                )
                  .filter(window => !('enabled' in window) || window.enabled)
                  .map(window => (
                    <View key={window.id} style={styles.scheduleRow}>
                      <Text style={styles.scheduleDay}>{WEEKDAYS[window.isoWeekday - 1]}</Text>
                      <Text style={styles.scheduleTime}>
                        {'allDay' in window && window.allDay
                          ? 'All day'
                          : `${formatTime(window.opensAt)}–${formatTime(window.closesAt)}`}
                      </Text>
                    </View>
                  ))}
                <View style={styles.capacityRow}>
                  <View>
                    <Text style={styles.detailLabel}>Maximum per window</Text>
                    <Text style={styles.capacityValue}>
                      {details.availability.settings?.maxOrdersPerWindow ?? 'Not configured'}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.detailLabel}>Daily stock</Text>
                    <Text style={styles.capacityValue}>
                      {details.availability.settings?.dailyStockLimit ?? 'Unlimited'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Moderation reports</Text>
              {details.reports.length === 0 ? (
                <Text style={styles.emptySectionText}>This dish has not been reported.</Text>
              ) : (
                details.reports.map(report => (
                  <View key={report.id} style={styles.reportCard}>
                    <View style={styles.reportHeader}>
                      <Text style={styles.reportReason}>{humanize(report.reason)}</Text>
                      <AdminStatusBadge status={report.status} />
                    </View>
                    <Text style={styles.reportDetails}>
                      {report.details || 'No additional details provided.'}
                    </Text>
                    <Text style={styles.tableSecondary}>{formatDateTime(report.created_at)}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Customer reviews</Text>
              {details.reviews.length === 0 ? (
                <Text style={styles.emptySectionText}>No customer reviews yet.</Text>
              ) : (
                details.reviews.slice(0, 8).map(review => (
                  <View key={review.id} style={styles.reviewRow}>
                    <View style={styles.reviewScore}>
                      <Text style={styles.reviewScoreText}>{review.rating.toFixed(1)} ★</Text>
                    </View>
                    <View style={styles.reviewCopy}>
                      <Text style={styles.optionTitle}>{review.customerName}</Text>
                      <Text style={styles.reportDetails}>
                        {review.comment || 'No written comment.'}
                      </Text>
                    </View>
                    <Text style={styles.tableSecondary}>{formatDate(review.createdAt)}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Admin review history</Text>
              {details.reviewHistory.length === 0 ? (
                <Text style={styles.emptySectionText}>No recorded admin actions yet.</Text>
              ) : (
                details.reviewHistory.map(entry => (
                  <View key={entry.id} style={styles.historyRow}>
                    <View style={styles.historyDot} />
                    <View style={styles.reviewCopy}>
                      <Text style={styles.optionTitle}>{humanize(entry.action)}</Text>
                      <Text style={styles.tableSecondary}>
                        {entry.actorName} · {formatDateTime(entry.createdAt)}
                      </Text>
                      {typeof entry.details.reason === 'string' && entry.details.reason ? (
                        <Text style={styles.reportDetails}>{entry.details.reason}</Text>
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
        visible={Boolean(actionMode && selectedId)}
        title={actionMode ? actionMeta[actionMode].title : 'Update dish'}
        subtitle={selectedListDish?.title}
        onClose={cancelAction}
        maxWidth={560}
        footer={
          actionMode ? (
            <>
              <ActionButton label="Cancel" onPress={cancelAction} disabled={actionLoading} />
              <ActionButton
                label={actionLoading ? 'Saving…' : actionMeta[actionMode].button}
                tone={actionMode === 'reject' || actionMode === 'unpublish' ? 'danger' : 'primary'}
                onPress={performAction}
                disabled={actionLoading}
              />
            </>
          ) : undefined
        }
      >
        {actionMode ? (
          <View style={styles.actionForm}>
            <View style={styles.actionNotice}>
              <Ionicons
                name={
                  actionMode === 'reject' || actionMode === 'unpublish'
                    ? 'warning-outline'
                    : 'information-circle-outline'
                }
                size={22}
                color={
                  actionMode === 'reject' || actionMode === 'unpublish' ? '#B42318' : '#237A3B'
                }
              />
              <Text style={styles.actionDescription}>{actionMeta[actionMode].description}</Text>
            </View>
            {actionMeta[actionMode].reasonLabel ? (
              <View>
                <Text style={styles.formLabel}>{actionMeta[actionMode].reasonLabel}</Text>
                <TextInput
                  value={actionReason}
                  onChangeText={setActionReason}
                  multiline
                  maxLength={1000}
                  submitBehavior="newline"
                  placeholder="Explain the decision clearly for the cook and audit trail"
                  placeholderTextColor="#9AA29D"
                  style={styles.textarea}
                />
                <Text style={styles.formHint}>
                  {actionReason.length}/1000 · Minimum 5 characters
                </Text>
              </View>
            ) : null}
            {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
          </View>
        ) : null}
      </AdminDialog>

      <Modal
        visible={imagePreview !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setImagePreview(null)}
      >
        <View style={styles.imagePreviewOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setImagePreview(null)}
            accessibilityLabel="Close image preview"
          />
          <View style={styles.imagePreviewCard}>
            <View style={styles.imagePreviewHeader}>
              <Text style={styles.imagePreviewTitle} numberOfLines={2}>
                {imagePreview?.title}
              </Text>
              <TouchableOpacity
                style={styles.imagePreviewClose}
                onPress={() => setImagePreview(null)}
                accessibilityRole="button"
                accessibilityLabel="Close image preview"
              >
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            {imagePreview ? (
              <Image
                source={{ uri: imagePreview.uri }}
                style={styles.imagePreviewImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F6F8' },
  pageContent: {
    width: '100%',
    maxWidth: 1548,
    alignSelf: 'center',
    padding: 24,
    paddingBottom: 56,
    gap: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerCopy: { flex: 1 },
  eyebrow: {
    fontFamily: 'mon-b',
    fontSize: 9,
    letterSpacing: 1.4,
    color: '#2C9C5B',
    marginBottom: 7,
  },
  title: { fontFamily: 'mon-b', fontSize: 30, color: '#1C2720', marginBottom: 7 },
  subtitle: { fontFamily: 'mon', fontSize: 12, lineHeight: 19, color: '#737D77' },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    flex: 1,
    minWidth: 170,
    minHeight: 116,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E5EAE7',
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
  },
  statIcon: {
    width: 35,
    height: 35,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { fontFamily: 'mon-sb', fontSize: 9, color: '#7B857E', marginTop: 9 },
  statValue: { fontFamily: 'mon-b', fontSize: 23, color: '#202B24', marginTop: 4 },
  filters: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filter: {
    minHeight: 37,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E0E5E2',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  filterActive: { borderColor: '#4CAF50', backgroundColor: '#EAF8EE' },
  filterText: { fontFamily: 'mon-sb', fontSize: 9, color: '#66716A' },
  filterTextActive: { color: '#237A3B' },
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
  searchBox: {
    minWidth: 260,
    minHeight: 42,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 12,
    paddingHorizontal: 13,
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    flex: 1,
    minWidth: 120,
    fontFamily: 'mon',
    fontSize: 11,
    color: '#27332B',
    outlineStyle: 'none',
  } as never,
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
  retryText: { fontFamily: 'mon-b', fontSize: 10, color: '#B42318' },
  loadingState: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 10 },
  dialogLoading: { minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontFamily: 'mon', fontSize: 10, color: '#828B85' },
  emptyTitle: { fontFamily: 'mon-b', fontSize: 15, color: '#37433B' },
  table: { minWidth: 1320 },
  tableRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF0EE',
    paddingHorizontal: 8,
  },
  tableHeader: {
    minHeight: 45,
    backgroundColor: '#F8FAF9',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  tableHeaderText: { fontFamily: 'mon-b', fontSize: 8, color: '#5D6861' },
  tableCell: { fontFamily: 'mon', fontSize: 10, color: '#47524B' },
  tableStrong: { flexShrink: 1, fontFamily: 'mon-sb', fontSize: 10, color: '#27322B' },
  tableSecondary: { fontFamily: 'mon', fontSize: 8, color: '#8A938D', marginTop: 3 },
  idColumn: { width: 105 },
  dishColumn: { width: 220 },
  cookColumn: { width: 190 },
  cuisineColumn: { width: 120 },
  priceColumn: { width: 100 },
  ordersColumn: { width: 85 },
  statusColumn: { width: 120 },
  flagsColumn: { width: 75 },
  actionsColumn: { width: 280 },
  dishCell: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 12 },
  dishThumb: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#EEF2EF' },
  dishThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2EF',
  },
  rowActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  actionButton: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#D9DFDB',
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
  },
  actionButtonPrimary: { borderColor: '#4CAF50', backgroundColor: '#4CAF50' },
  actionButtonDanger: { borderColor: '#F6C7C3', backgroundColor: '#FFF3F2' },
  actionButtonText: { fontFamily: 'mon-sb', fontSize: 8, color: '#5F6A63' },
  actionButtonTextPrimary: { color: '#FFFFFF' },
  actionButtonTextDanger: { color: '#B42318' },
  buttonDisabled: { opacity: 0.42 },
  flagBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 99,
    backgroundColor: '#FEE4E2',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  flagText: { fontFamily: 'mon-b', fontSize: 8, color: '#B42318' },
  mobileCards: { gap: 11 },
  mobileCardLink: { gap: 12 },
  mobileCard: {
    borderWidth: 1,
    borderColor: '#E4E9E6',
    borderRadius: 14,
    padding: 13,
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  mobileCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  mobileImage: { width: 58, height: 58, borderRadius: 12, backgroundColor: '#EEF2EF' },
  mobileCopy: { flex: 1, minWidth: 0 },
  mobileTitle: { fontFamily: 'mon-b', fontSize: 13, color: '#27322B' },
  mobilePrice: { fontFamily: 'mon-sb', fontSize: 11, color: '#237A3B', marginTop: 6 },
  mobileMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  mobileFlag: { fontFamily: 'mon-sb', fontSize: 8, color: '#B42318' },
  pagination: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EDF0EE',
  },
  paginationText: { fontFamily: 'mon', fontSize: 9, color: '#7B857E' },
  detailsContent: { gap: 18 },
  heroImage: { width: '100%', height: 240, borderRadius: 16, backgroundColor: '#EEF2EF' },
  imageExpandHint: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: 'rgba(20, 29, 23, 0.72)',
  },
  imageExpandText: { fontFamily: 'mon-sb', fontSize: 9, color: '#FFFFFF' },
  imagePreviewOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(8, 13, 10, 0.92)',
  },
  imagePreviewCard: { width: '100%', maxWidth: 1100, height: '92%', gap: 12 },
  imagePreviewHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  imagePreviewTitle: { flex: 1, fontFamily: 'mon-b', fontSize: 16, color: '#FFFFFF' },
  imagePreviewClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  imagePreviewImage: { width: '100%', flex: 1 },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  detailsHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  detailsHeaderCopy: { flex: 1 },
  detailsTitle: { fontFamily: 'mon-b', fontSize: 23, lineHeight: 29, color: '#202B24' },
  detailsMeta: { fontFamily: 'mon', fontSize: 10, color: '#8A938D', marginTop: 5 },
  detailsPrice: { fontFamily: 'mon-b', fontSize: 24, color: '#1F2923' },
  description: { fontFamily: 'mon', fontSize: 11, lineHeight: 18, color: '#68736C' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: {
    minWidth: 150,
    flex: 1,
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E0E5E2',
    borderRadius: 14,
    padding: 13,
    backgroundColor: '#FBFCFB',
  },
  metricValue: { fontFamily: 'mon-b', fontSize: 22, color: '#27322B' },
  metricDanger: { color: '#B42318' },
  metricLabel: { fontFamily: 'mon', fontSize: 9, color: '#8A938D' },
  section: { gap: 10 },
  sectionTitle: {
    fontFamily: 'mon-b',
    fontSize: 12,
    color: '#59645D',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF0EE',
  },
  detailLabel: { fontFamily: 'mon', fontSize: 9, color: '#8A938D' },
  detailValue: {
    flex: 1,
    fontFamily: 'mon-sb',
    fontSize: 10,
    lineHeight: 16,
    color: '#27322B',
    textAlign: 'right',
  },
  emptySectionText: { fontFamily: 'mon', fontSize: 10, color: '#8A938D', paddingVertical: 8 },
  optionGroup: { borderWidth: 1, borderColor: '#E3E8E5', borderRadius: 13, padding: 13, gap: 8 },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionTitle: { fontFamily: 'mon-sb', fontSize: 10, color: '#27322B' },
  optionRule: { fontFamily: 'mon', fontSize: 8, color: '#7A847E' },
  optionRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: '#EEF1EF',
  },
  optionName: { flex: 1, fontFamily: 'mon', fontSize: 9, color: '#4F5A53' },
  optionPrice: { fontFamily: 'mon-sb', fontSize: 9, color: '#4F5A53' },
  availabilitySummary: {
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 14,
    padding: 14,
    gap: 8,
    backgroundColor: '#FBFCFB',
  },
  availabilityTitle: { fontFamily: 'mon-b', fontSize: 11, color: '#36423A' },
  weekdayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 4 },
  weekday: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E1E6E3',
    backgroundColor: '#FFFFFF',
  },
  weekdayActive: { borderColor: '#C9E8D2', backgroundColor: '#E8F7ED' },
  weekdayText: { fontFamily: 'mon', fontSize: 8, color: '#929A95' },
  weekdayTextActive: { fontFamily: 'mon-sb', color: '#237A3B' },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#EDF0EE',
  },
  scheduleDay: { width: 50, fontFamily: 'mon-sb', fontSize: 9, color: '#4A554E' },
  scheduleTime: { fontFamily: 'mon', fontSize: 9, color: '#68736C' },
  capacityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E7E4',
  },
  capacityValue: { fontFamily: 'mon-b', fontSize: 12, color: '#27322B', marginTop: 4 },
  reportCard: {
    borderWidth: 1,
    borderColor: '#F0D4D1',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#FFF9F8',
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  reportReason: { fontFamily: 'mon-sb', fontSize: 10, color: '#6F2924' },
  reportDetails: { fontFamily: 'mon', fontSize: 9, lineHeight: 15, color: '#67716B', marginTop: 5 },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF0EE',
  },
  reviewScore: {
    borderRadius: 8,
    backgroundColor: '#FFF1C2',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  reviewScoreText: { fontFamily: 'mon-b', fontSize: 8, color: '#805E00' },
  reviewCopy: { flex: 1 },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9 },
  historyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50', marginTop: 3 },
  actionForm: { gap: 16 },
  actionNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 12,
    backgroundColor: '#F7F9F7',
    padding: 13,
  },
  actionDescription: { flex: 1, fontFamily: 'mon', fontSize: 10, lineHeight: 17, color: '#5F6A63' },
  formLabel: { fontFamily: 'mon-sb', fontSize: 10, color: '#3B463F', marginBottom: 7 },
  textarea: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: '#DCE2DE',
    borderRadius: 12,
    padding: 12,
    fontFamily: 'mon',
    fontSize: 10,
    color: '#27322B',
    textAlignVertical: 'top',
    outlineStyle: 'none',
  } as never,
  formHint: { fontFamily: 'mon', fontSize: 8, color: '#8B948E', marginTop: 6, textAlign: 'right' },
  actionError: { fontFamily: 'mon-sb', fontSize: 9, color: '#B42318' },
});
