import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Ionicons } from '@expo/vector-icons';

import {
  fetchManagedUserDetails,
  fetchManagedUsers,
  fetchVerificationDocumentFile,
  inviteManagedUser,
  reviewVerificationDocument,
  runManagedUserAction,
  updateManagedUser,
} from '@/src/admin/api';
import type {
  ManagedUser,
  ManagedUserDetails,
  UserManagementFilter,
  UserManagementResponse,
  UserManagementSort,
} from '@/src/admin/types';
import { useAdminAuth } from '@/src/admin/AdminAuthContext';
import { useAuth } from '@/src/services/auth-context';
import AdminDialog from '@/src/components/admin/AdminDialog';
import { AdminPanel, AdminStatusBadge } from '@/src/components/admin/AdminOverviewUI';

type ActionMode = 'invite' | 'edit' | 'suspend' | 'deactivate' | 'message' | 'verification' | null;

const FILTERS: Array<{ key: UserManagementFilter; label: string }> = [
  { key: 'all', label: 'All users' },
  { key: 'cooks', label: 'Cooks' },
  { key: 'customers', label: 'Customers' },
  { key: 'admins', label: 'Admins' },
  { key: 'pending_verification', label: 'Pending verification' },
  { key: 'flagged', label: 'Flagged / restricted' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'deactivated', label: 'Deactivated' },
];

const SORTS: Array<{ key: UserManagementSort; label: string }> = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'name_asc', label: 'Name A–Z' },
  { key: 'name_desc', label: 'Name Z–A' },
  { key: 'last_active', label: 'Last active' },
];

const DATE_RANGES = [
  { key: 'all', label: 'All dates' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
];

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
    : 'Never';

const currency = (value: number): string =>
  new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(value);

const humanize = (value: string): string =>
  value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#A2AAA5"
        multiline={multiline}
        style={[styles.input, multiline && styles.textarea]}
      />
    </View>
  );
}

function ChoiceRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ key: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map(option => (
          <TouchableOpacity
            key={option.key}
            style={[styles.choice, value === option.key && styles.choiceActive]}
            onPress={() => onChange(option.key)}
          >
            <Text style={[styles.choiceText, value === option.key && styles.choiceTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

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
        disabled && styles.actionButtonDisabled,
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

export default function UserManagementScreen() {
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const { admin } = useAdminAuth();
  const tableMode = width >= 900;
  const [response, setResponse] = useState<UserManagementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<UserManagementFilter>('all');
  const [sort, setSort] = useState<UserManagementSort>('newest');
  const [dateRange, setDateRange] = useState('all');
  const [page, setPage] = useState(1);
  const requestId = useRef(0);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [details, setDetails] = useState<ManagedUserDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRestaurant, setFormRestaurant] = useState('');
  const [formRole, setFormRole] = useState('customer');
  const [formReason, setFormReason] = useState('');
  const [suspensionDuration, setSuspensionDuration] = useState('indefinite');
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [verificationDocumentId, setVerificationDocumentId] = useState('');
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
  const [viewedDocumentIds, setViewedDocumentIds] = useState<Set<string>>(new Set());
  const [verificationDecision, setVerificationDecision] = useState<
    'rejected' | 'more_info_requested'
  >('more_info_requested');

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const loadUsers = useCallback(
    async (showRefresh = false) => {
      if (!session?.access_token) return;
      const currentRequest = ++requestId.current;
      if (showRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await fetchManagedUsers(session.access_token, {
          search,
          filter,
          sort,
          dateRange,
          page,
          pageSize: 25,
        });
        if (requestId.current === currentRequest) setResponse(data);
      } catch (caught: unknown) {
        if (requestId.current === currentRequest) {
          setError(caught instanceof Error ? caught.message : 'Users could not be loaded.');
        }
      } finally {
        if (requestId.current === currentRequest) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [dateRange, filter, page, search, session?.access_token, sort]
  );

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const loadDetails = useCallback(
    async (userId: string) => {
      if (!session?.access_token) return;
      setSelectedUserId(userId);
      setDetails(null);
      setDetailsError(null);
      setDetailsLoading(true);
      try {
        setDetails(await fetchManagedUserDetails(session.access_token, userId));
      } catch (caught: unknown) {
        setDetailsError(caught instanceof Error ? caught.message : 'User details could not load.');
      } finally {
        setDetailsLoading(false);
      }
    },
    [session?.access_token]
  );

  const closeDetails = () => {
    setSelectedUserId(null);
    setDetails(null);
    setDetailsError(null);
    setViewedDocumentIds(new Set());
  };

  const openAction = (mode: Exclude<ActionMode, null>, user = details?.user) => {
    setActionMode(mode);
    setActionError(null);
    setFormReason('');
    if (mode === 'invite') {
      setFormName('');
      setFormEmail('');
      setFormPhone('');
      setFormRestaurant('');
      setFormRole('customer');
    } else if (mode === 'edit' && user) {
      setFormName(user.name);
      setFormEmail(user.email);
      setFormPhone(user.phone ?? '');
      setFormRestaurant(user.restaurantName ?? '');
      setFormRole(user.primaryRole.toLowerCase());
    } else if (mode === 'message') {
      setMessageSubject('Message from Chefin Support');
      setMessageBody('');
    }
  };

  const closeAction = () => {
    if (actionLoading) return;
    if (!details) setSelectedUserId(null);
    setActionMode(null);
    setActionError(null);
  };

  const refreshAfterAction = async () => {
    await loadUsers(true);
    if (selectedUserId) await loadDetails(selectedUserId);
  };

  const submitAction = async () => {
    if (!session?.access_token || actionLoading) return;
    setActionLoading(true);
    setActionError(null);
    try {
      if (actionMode === 'invite') {
        await inviteManagedUser(session.access_token, {
          fullName: formName,
          email: formEmail,
          role: formRole,
        });
        Alert.alert('Invitation sent', `${formEmail} has been invited to Chefin.`);
      } else {
        if (!selectedUserId) throw new Error('Select a user first.');
        if (actionMode === 'edit') {
          await updateManagedUser(session.access_token, selectedUserId, {
            fullName: formName,
            email: formEmail,
            phone: formPhone,
            restaurantName: formRestaurant,
            role: formRole,
          });
        } else if (actionMode === 'suspend') {
          await runManagedUserAction(session.access_token, selectedUserId, 'suspend', {
            reason: formReason,
            durationDays: suspensionDuration === 'indefinite' ? null : Number(suspensionDuration),
          });
        } else if (actionMode === 'deactivate') {
          await runManagedUserAction(session.access_token, selectedUserId, 'deactivate', {
            reason: formReason,
          });
        } else if (actionMode === 'message') {
          const result = await runManagedUserAction<{
            success: true;
            email: { sent: boolean; error?: string };
          }>(session.access_token, selectedUserId, 'message', {
            subject: messageSubject,
            message: messageBody,
          });
          Alert.alert(
            'Message delivered',
            result.email.sent
              ? 'The in-app notification and email were sent.'
              : `The in-app notification was sent. Email was not delivered: ${result.email.error}`
          );
        } else if (actionMode === 'verification') {
          await reviewVerificationDocument(session.access_token, {
            documentId: verificationDocumentId,
            decision: verificationDecision,
            reviewerNote: formReason,
          });
        }
      }
      setActionMode(null);
      await refreshAfterAction();
    } catch (caught: unknown) {
      setActionError(
        caught instanceof Error ? caught.message : 'The action could not be completed.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const runQuickAction = async (
    user: ManagedUser,
    action: 'reinstate' | 'reactivate' | 'reset-password'
  ) => {
    if (!session?.access_token || user.userId === admin?.userId) return;
    setActionLoading(true);
    try {
      await runManagedUserAction(session.access_token, user.userId, action);
      Alert.alert(
        action === 'reset-password' ? 'Reset email sent' : 'Account updated',
        action === 'reset-password'
          ? `Password-reset instructions were sent to ${user.email}.`
          : `${user.name}'s account is active again.`
      );
      await refreshAfterAction();
    } catch (caught: unknown) {
      Alert.alert('Action failed', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const approveDocument = async (documentId: string) => {
    if (!session?.access_token || !viewedDocumentIds.has(documentId)) return;
    setActionLoading(true);
    try {
      await reviewVerificationDocument(session.access_token, {
        documentId,
        decision: 'approved',
      });
      if (selectedUserId) await loadDetails(selectedUserId);
      await loadUsers(true);
    } catch (caught: unknown) {
      Alert.alert(
        'Verification failed',
        caught instanceof Error ? caught.message : 'Please try again.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const viewVerificationDocument = async (documentId: string) => {
    if (!session?.access_token || openingDocumentId) return;
    const previewWindow = Platform.OS === 'web' ? window.open('', '_blank') : null;
    setOpeningDocumentId(documentId);
    try {
      const { fileUrl } = await fetchVerificationDocumentFile(session.access_token, documentId);
      if (previewWindow) {
        previewWindow.opener = null;
        previewWindow.location.href = fileUrl;
      } else {
        await Linking.openURL(fileUrl);
      }
      setViewedDocumentIds(current => new Set(current).add(documentId));
      if (selectedUserId) await loadDetails(selectedUserId);
    } catch (caught: unknown) {
      previewWindow?.close();
      Alert.alert(
        'Document unavailable',
        caught instanceof Error ? caught.message : 'The document could not be opened.'
      );
    } finally {
      setOpeningDocumentId(null);
    }
  };

  const openVerificationDecision = (
    documentId: string,
    decision: 'rejected' | 'more_info_requested'
  ) => {
    if (actionLoading || !viewedDocumentIds.has(documentId)) return;
    setVerificationDocumentId(documentId);
    setVerificationDecision(decision);
    setFormReason('');
    setActionError(null);
    setActionMode('verification');
  };

  const exportCsv = async () => {
    if (!session?.access_token || Platform.OS !== 'web') {
      Alert.alert('Web export only', 'CSV export is currently available from the web dashboard.');
      return;
    }
    try {
      const exportData = await fetchManagedUsers(session.access_token, {
        search,
        filter,
        sort,
        dateRange,
        page: 1,
        pageSize: 500,
      });
      const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const csv = [
        [
          'UID',
          'Name',
          'Email',
          'Phone',
          'Role',
          'Verified',
          'Joined',
          'Last active',
          'Status',
          'Reports',
        ],
        ...exportData.users.map(user => [
          user.userId,
          user.name,
          user.email,
          user.phone,
          user.primaryRole,
          user.verified == null ? 'N/A' : user.verified ? 'Yes' : 'No',
          user.joinedAt,
          user.lastSignInAt,
          user.status,
          user.reportCount,
        ]),
      ]
        .map(row => row.map(escape).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `chefin-users-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught: unknown) {
      Alert.alert('Export failed', caught instanceof Error ? caught.message : 'Please try again.');
    }
  };

  const cycleSort = () => {
    const index = SORTS.findIndex(option => option.key === sort);
    setPage(1);
    setSort(SORTS[(index + 1) % SORTS.length].key);
  };
  const cycleDate = () => {
    const index = DATE_RANGES.findIndex(option => option.key === dateRange);
    setPage(1);
    setDateRange(DATE_RANGES[(index + 1) % DATE_RANGES.length].key);
  };

  const sortLabel = SORTS.find(option => option.key === sort)?.label ?? 'Newest';
  const dateLabel = DATE_RANGES.find(option => option.key === dateRange)?.label ?? 'All dates';
  const stats = response?.stats;
  const selectedListUser = useMemo(
    () => response?.users.find(user => user.userId === selectedUserId) ?? null,
    [response?.users, selectedUserId]
  );

  const renderRowActions = (user: ManagedUser) => {
    const isSelf = user.userId === admin?.userId;
    return (
      <View style={styles.rowActions}>
        <ActionButton label="View" onPress={() => loadDetails(user.userId)} />
        {isSelf ? (
          <Text style={styles.protectedText}>Protected</Text>
        ) : user.status === 'suspended' ? (
          <ActionButton label="Reinstate" onPress={() => runQuickAction(user, 'reinstate')} />
        ) : user.status === 'deactivated' ? (
          <ActionButton label="Reactivate" onPress={() => runQuickAction(user, 'reactivate')} />
        ) : user.pendingVerification ? (
          <ActionButton label="Verify" tone="primary" onPress={() => loadDetails(user.userId)} />
        ) : (
          <ActionButton
            label="Suspend"
            onPress={() => {
              setSelectedUserId(user.userId);
              setDetails(null);
              setActionMode('suspend');
              setFormReason('');
            }}
          />
        )}
      </View>
    );
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderCopy}>
          <Text style={styles.eyebrow}>ADMIN DASHBOARD</Text>
          <Text style={styles.pageTitle}>User Management</Text>
          <Text style={styles.pageSubtitle}>
            Manage customer, cook and administrator access from one auditable workspace.
          </Text>
        </View>
        <View style={styles.headerActions}>
          <ActionButton label="Export CSV" onPress={exportCsv} />
          <ActionButton label="+ Add user" tone="primary" onPress={() => openAction('invite')} />
        </View>
      </View>

      <View style={styles.statsGrid}>
        {[
          ['Total users', stats?.totalUsers ?? 0, 'people-outline', '#438BF5'],
          ['Active cooks', stats?.activeCooks ?? 0, 'restaurant-outline', '#24BFB1'],
          ['Active customers', stats?.activeCustomers ?? 0, 'person-outline', '#4CAF50'],
          ['Flagged / restricted', stats?.flagged ?? 0, 'flag-outline', '#F56C73'],
          ['Pending verification', stats?.pendingVerification ?? 0, 'shield-outline', '#F4B740'],
        ].map(([label, value, icon, color]) => (
          <View key={String(label)} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
              <Ionicons
                name={icon as React.ComponentProps<typeof Ionicons>['name']}
                size={19}
                color={String(color)}
              />
            </View>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{Number(value).toLocaleString('en-MY')}</Text>
          </View>
        ))}
      </View>

      <AdminPanel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroller}>
          <View style={styles.filters}>
            {FILTERS.map(option => (
              <TouchableOpacity
                key={option.key}
                style={[styles.filter, filter === option.key && styles.filterActive]}
                onPress={() => {
                  setPage(1);
                  setFilter(option.key);
                }}
              >
                <Text style={[styles.filterText, filter === option.key && styles.filterTextActive]}>
                  {option.label}
                </Text>
                {option.key === 'pending_verification' ? (
                  <View
                    style={[styles.filterCount, filter === option.key && styles.filterCountActive]}
                  >
                    <Text
                      style={[
                        styles.filterCountText,
                        filter === option.key && styles.filterCountTextActive,
                      ]}
                    >
                      {stats?.pendingVerification ?? 0}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <View style={styles.controls}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={19} color="#8A938D" />
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder="Search UID, name, email or phone"
              placeholderTextColor="#9AA29D"
              style={styles.searchInput}
            />
            {searchInput ? (
              <TouchableOpacity onPress={() => setSearchInput('')}>
                <Ionicons name="close-circle" size={18} color="#A0A8A3" />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity style={styles.selectButton} onPress={cycleSort}>
            <Text style={styles.selectButtonText}>Sort: {sortLabel}</Text>
            <Ionicons name="chevron-down" size={15} color="#7D8680" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectButton} onPress={cycleDate}>
            <Text style={styles.selectButtonText}>{dateLabel}</Text>
            <Ionicons name="calendar-outline" size={15} color="#7D8680" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => loadUsers(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#4CAF50" />
            ) : (
              <Ionicons name="refresh" size={18} color="#47544C" />
            )}
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color="#B42318" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => loadUsers()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading && !response ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Loading user accounts…</Text>
          </View>
        ) : response?.users.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={34} color="#9DA59F" />
            <Text style={styles.emptyTitle}>No matching users</Text>
            <Text style={styles.emptyText}>Try changing the search or account filters.</Text>
          </View>
        ) : tableMode ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableHeaderText, styles.uidColumn]}>UID</Text>
                <Text style={[styles.tableHeaderText, styles.nameColumn]}>NAME</Text>
                <Text style={[styles.tableHeaderText, styles.roleColumn]}>ROLE</Text>
                <Text style={[styles.tableHeaderText, styles.verifyColumn]}>VERIFIED</Text>
                <Text style={[styles.tableHeaderText, styles.joinedColumn]}>JOINED</Text>
                <Text style={[styles.tableHeaderText, styles.statusColumn]}>STATUS</Text>
                <Text style={[styles.tableHeaderText, styles.reportColumn]}>REPORTS</Text>
                <Text style={[styles.tableHeaderText, styles.actionsColumn]}>ACTIONS</Text>
              </View>
              {(response?.users ?? []).map(user => (
                <View key={user.userId} style={styles.tableRow}>
                  <Text style={[styles.tableCell, styles.uidColumn]}>#{user.displayId}</Text>
                  <View style={[styles.personCell, styles.nameColumn]}>
                    {user.avatarUrl ? (
                      <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarText}>{initials(user.name)}</Text>
                      </View>
                    )}
                    <View style={styles.personCopy}>
                      <Text style={styles.personName} numberOfLines={1}>
                        {user.name}
                      </Text>
                      <Text style={styles.personEmail} numberOfLines={1}>
                        {user.email}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.tableCellStrong, styles.roleColumn]}>
                    {user.primaryRole}
                  </Text>
                  <Text style={[styles.tableCell, styles.verifyColumn]}>
                    {user.verified == null ? 'N/A' : user.verified ? 'Yes' : 'No'}
                  </Text>
                  <Text style={[styles.tableCell, styles.joinedColumn]}>
                    {formatDate(user.joinedAt)}
                  </Text>
                  <View style={styles.statusColumn}>
                    <AdminStatusBadge status={user.status} />
                  </View>
                  <View style={styles.reportColumn}>
                    <Text
                      style={user.reportCount > 0 ? styles.reportCountFlagged : styles.tableCell}
                    >
                      {user.reportCount}
                    </Text>
                  </View>
                  <View style={styles.actionsColumn}>{renderRowActions(user)}</View>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.userCards}>
            {(response?.users ?? []).map(user => (
              <View key={user.userId} style={styles.userCard}>
                <View style={styles.userCardTop}>
                  <View style={styles.personCell}>
                    {user.avatarUrl ? (
                      <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarText}>{initials(user.name)}</Text>
                      </View>
                    )}
                    <View style={styles.personCopy}>
                      <Text style={styles.personName}>{user.name}</Text>
                      <Text style={styles.personEmail}>{user.email}</Text>
                    </View>
                  </View>
                  <AdminStatusBadge status={user.status} />
                </View>
                <View style={styles.userCardMeta}>
                  <Text style={styles.metaPill}>{user.primaryRole}</Text>
                  <Text style={styles.metaPill}>Joined {formatDate(user.joinedAt)}</Text>
                  {user.reportCount > 0 ? (
                    <Text style={styles.metaPillFlagged}>{user.reportCount} reports</Text>
                  ) : null}
                </View>
                {renderRowActions(user)}
              </View>
            ))}
          </View>
        )}

        {response ? (
          <View style={styles.pagination}>
            <Text style={styles.paginationText}>
              {response.pagination.total.toLocaleString('en-MY')} users · Page{' '}
              {response.pagination.page} of {response.pagination.totalPages}
            </Text>
            <View style={styles.paginationActions}>
              <ActionButton
                label="Previous"
                disabled={page <= 1}
                onPress={() => setPage(value => value - 1)}
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
        visible={Boolean(selectedUserId) && actionMode == null}
        title="User Information"
        subtitle={
          details
            ? `UID #${details.user.displayId} · Joined ${formatDate(details.user.joinedAt)}`
            : undefined
        }
        onClose={closeDetails}
        maxWidth={820}
        footer={
          details && details.user.userId !== admin?.userId ? (
            <>
              <ActionButton label="Send message" onPress={() => openAction('message')} />
              <ActionButton label="Edit" onPress={() => openAction('edit')} />
              {details.user.status === 'active' ? (
                <ActionButton label="Suspend" tone="danger" onPress={() => openAction('suspend')} />
              ) : details.user.status === 'suspended' ? (
                <ActionButton
                  label="Reinstate"
                  tone="primary"
                  onPress={() => runQuickAction(details.user, 'reinstate')}
                />
              ) : (
                <ActionButton
                  label="Reactivate"
                  tone="primary"
                  onPress={() => runQuickAction(details.user, 'reactivate')}
                />
              )}
            </>
          ) : undefined
        }
      >
        {detailsLoading ? (
          <View style={styles.dialogLoading}>
            <ActivityIndicator size="large" color="#4CAF50" />
          </View>
        ) : detailsError ? (
          <View style={styles.dialogLoading}>
            <Text style={styles.errorText}>{detailsError}</Text>
          </View>
        ) : details ? (
          <View style={styles.detailsContent}>
            <View style={styles.detailsHero}>
              {details.user.avatarUrl ? (
                <Image source={{ uri: details.user.avatarUrl }} style={styles.detailsAvatar} />
              ) : (
                <View style={styles.detailsAvatarFallback}>
                  <Text style={styles.detailsAvatarText}>{initials(details.user.name)}</Text>
                </View>
              )}
              <View style={styles.detailsHeroCopy}>
                <Text style={styles.detailsName}>{details.user.name}</Text>
                <Text style={styles.detailsMeta}>
                  {details.user.primaryRole} · Last active{' '}
                  {formatDateTime(details.user.lastSignInAt)}
                </Text>
              </View>
              <AdminStatusBadge status={details.user.status} />
            </View>

            {details.user.status !== 'active' ? (
              <View style={styles.restrictionBox}>
                <Ionicons name="warning-outline" size={18} color="#9A6700" />
                <Text style={styles.restrictionText}>
                  {details.user.suspensionReason ??
                    details.user.deactivationReason ??
                    'Account restricted'}
                  {details.user.suspensionEndsAt
                    ? ` · Ends ${formatDateTime(details.user.suspensionEndsAt)}`
                    : ''}
                </Text>
              </View>
            ) : null}

            <View style={styles.detailsStats}>
              {[
                ['Orders placed', details.summary.ordersPlaced],
                ['Recorded spend', currency(details.summary.recordedSpend)],
                ['Reviews submitted', details.summary.reviewsSubmitted],
                ['Reports against', details.summary.reportsAgainst],
              ].map(([label, value]) => (
                <View key={String(label)} style={styles.detailStat}>
                  <Text style={styles.detailStatValue}>{value}</Text>
                  <Text style={styles.detailStatLabel}>{label}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.detailSectionTitle}>CONTACT INFO</Text>
            <View style={styles.infoGrid}>
              {[
                ['Email', details.user.email],
                ['Phone', details.user.phone ?? 'Not provided'],
                ['Role', details.user.primaryRole],
                ['Restaurant', details.user.restaurantName ?? 'Not applicable'],
                [
                  'Verification',
                  details.user.verified == null
                    ? 'Not applicable'
                    : details.user.verified
                      ? 'Verified'
                      : 'Not verified',
                ],
                ['Profile updated', formatDateTime(details.user.updatedAt)],
              ].map(([label, value]) => (
                <View key={label} style={styles.infoCell}>
                  <Text style={styles.infoLabel}>{label}</Text>
                  <Text style={styles.infoValue}>{value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sectionTitleRow}>
              <Text style={styles.detailSectionTitle}>ORDER SUMMARY</Text>
              <ActionButton
                label="View in Order Monitoring"
                onPress={() =>
                  Alert.alert(
                    'Order Monitoring',
                    'This user filter will open in the Order Monitoring phase.'
                  )
                }
              />
            </View>

            {details.verificationDocuments.length > 0 ? (
              <>
                <Text style={styles.detailSectionTitle}>VERIFICATION DOCUMENTS</Text>
                <View style={styles.listSection}>
                  {details.verificationDocuments.map(document => (
                    <View key={document.id} style={styles.listRow}>
                      <View style={styles.listRowCopy}>
                        <Text style={styles.listRowTitle}>{humanize(document.doc_type)}</Text>
                        <Text style={styles.listRowMeta}>
                          Submitted {formatDate(document.submitted_at)} ·{' '}
                          {humanize(document.status)}
                        </Text>
                      </View>
                      <View style={styles.documentActions}>
                        <ActionButton
                          label={
                            openingDocumentId === document.id
                              ? 'Opening…'
                              : viewedDocumentIds.has(document.id)
                                ? 'View again'
                                : 'View document'
                          }
                          tone="primary"
                          disabled={openingDocumentId != null}
                          onPress={() => viewVerificationDocument(document.id)}
                        />
                        {document.status === 'pending' ? (
                          <View style={styles.inlineActions}>
                            <ActionButton
                              label="Approve"
                              disabled={actionLoading || !viewedDocumentIds.has(document.id)}
                              onPress={() => approveDocument(document.id)}
                            />
                            <ActionButton
                              label="More info"
                              disabled={actionLoading || !viewedDocumentIds.has(document.id)}
                              onPress={() =>
                                openVerificationDecision(document.id, 'more_info_requested')
                              }
                            />
                            <ActionButton
                              label="Reject"
                              tone="danger"
                              disabled={actionLoading || !viewedDocumentIds.has(document.id)}
                              onPress={() => openVerificationDecision(document.id, 'rejected')}
                            />
                          </View>
                        ) : (
                          <AdminStatusBadge status={document.status} />
                        )}
                        {document.status === 'pending' && !viewedDocumentIds.has(document.id) ? (
                          <Text style={styles.documentHint}>
                            Open the document to enable review.
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.detailSectionTitle}>FLAGS & REPORTS</Text>
            {details.reportsAgainst.length === 0 && details.reportsSubmitted.length === 0 ? (
              <Text style={styles.mutedText}>No reports associated with this account.</Text>
            ) : (
              <View style={styles.listSection}>
                {details.reportsAgainst.map(report => (
                  <View key={`against-${report.id}`} style={styles.listRow}>
                    <View style={styles.reportMarker} />
                    <View style={styles.listRowCopy}>
                      <Text style={styles.listRowTitle}>Report against: {report.target_label}</Text>
                      <Text style={styles.listRowMeta}>
                        {humanize(report.reason)} · {humanize(report.status)} ·{' '}
                        {formatDate(report.created_at)}
                      </Text>
                    </View>
                  </View>
                ))}
                {details.reportsSubmitted.map(report => (
                  <View key={`submitted-${report.id}`} style={styles.listRow}>
                    <Ionicons name="flag-outline" size={17} color="#667085" />
                    <View style={styles.listRowCopy}>
                      <Text style={styles.listRowTitle}>Submitted: {report.target_label}</Text>
                      <Text style={styles.listRowMeta}>
                        {humanize(report.reason)} · {humanize(report.status)} ·{' '}
                        {formatDate(report.created_at)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.detailSectionTitle}>ACCOUNT ACTIVITY</Text>
            <View style={styles.timeline}>
              {details.activity.map(item => (
                <View key={item.id} style={styles.timelineRow}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineCopy}>
                    <Text style={styles.timelineTitle}>{humanize(item.action)}</Text>
                    <Text style={styles.timelineDate}>{formatDateTime(item.created_at)}</Text>
                  </View>
                </View>
              ))}
            </View>

            {details.user.userId !== admin?.userId ? (
              <View style={styles.dangerZone}>
                <View style={styles.dangerCopy}>
                  <Text style={styles.dangerTitle}>Account controls</Text>
                  <Text style={styles.dangerText}>
                    Password resets are emailed. Deactivation is reversible and retains audit
                    records.
                  </Text>
                </View>
                <View style={styles.inlineActions}>
                  <ActionButton
                    label="Reset password"
                    onPress={() => runQuickAction(details.user, 'reset-password')}
                  />
                  {details.user.status !== 'deactivated' ? (
                    <ActionButton
                      label="Deactivate"
                      tone="danger"
                      onPress={() => openAction('deactivate')}
                    />
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={styles.selfProtection}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#237A3B" />
                <Text style={styles.selfProtectionText}>
                  Your own administrator account is protected from edits and restrictions.
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </AdminDialog>

      <AdminDialog
        visible={actionMode != null}
        title={
          actionMode === 'invite'
            ? 'Invite user'
            : actionMode === 'edit'
              ? 'Edit user'
              : actionMode === 'suspend'
                ? 'Suspend account'
                : actionMode === 'deactivate'
                  ? 'Deactivate account'
                  : actionMode === 'message'
                    ? 'Send message'
                    : verificationDecision === 'rejected'
                      ? 'Reject document'
                      : 'Request more information'
        }
        subtitle={
          actionMode === 'invite'
            ? 'An invitation email will be sent by Supabase.'
            : (selectedListUser?.name ?? details?.user.name)
        }
        onClose={closeAction}
        maxWidth={610}
        footer={
          <>
            <ActionButton label="Cancel" onPress={closeAction} disabled={actionLoading} />
            <ActionButton
              label={
                actionLoading ? 'Working…' : actionMode === 'invite' ? 'Send invitation' : 'Confirm'
              }
              tone={
                actionMode === 'deactivate' ||
                (actionMode === 'verification' && verificationDecision === 'rejected')
                  ? 'danger'
                  : 'primary'
              }
              onPress={submitAction}
              disabled={actionLoading}
            />
          </>
        }
      >
        {actionMode === 'invite' || actionMode === 'edit' ? (
          <View style={styles.formStack}>
            <FormField
              label="Full name"
              value={formName}
              onChangeText={setFormName}
              placeholder="User's full name"
            />
            <FormField
              label="Email"
              value={formEmail}
              onChangeText={setFormEmail}
              placeholder="name@example.com"
            />
            {actionMode === 'edit' ? (
              <>
                <FormField
                  label="Phone"
                  value={formPhone}
                  onChangeText={setFormPhone}
                  placeholder="+60…"
                />
                <FormField
                  label="Restaurant name"
                  value={formRestaurant}
                  onChangeText={setFormRestaurant}
                  placeholder="Only required for cooks"
                />
              </>
            ) : null}
            <ChoiceRow
              label="Account role"
              value={formRole}
              onChange={setFormRole}
              options={[
                { key: 'customer', label: 'Customer' },
                { key: 'cook', label: 'Cook' },
                { key: 'admin', label: 'Admin' },
              ]}
            />
          </View>
        ) : actionMode === 'suspend' ? (
          <View style={styles.formStack}>
            <ChoiceRow
              label="Suspension duration"
              value={suspensionDuration}
              onChange={setSuspensionDuration}
              options={[
                { key: '7', label: '7 days' },
                { key: '30', label: '30 days' },
                { key: '90', label: '90 days' },
                { key: 'indefinite', label: 'Indefinite' },
              ]}
            />
            <FormField
              label="Reason"
              value={formReason}
              onChangeText={setFormReason}
              placeholder="Explain why this account is being suspended"
              multiline
            />
            <View style={styles.infoNotice}>
              <Ionicons name="information-circle-outline" size={18} color="#175CD3" />
              <Text style={styles.infoNoticeText}>
                The user can sign in and browse. New orders and other mutations are blocked; cooks
                may finish existing orders.
              </Text>
            </View>
          </View>
        ) : actionMode === 'deactivate' ? (
          <View style={styles.formStack}>
            <View style={styles.dangerNotice}>
              <Ionicons name="warning-outline" size={20} color="#B42318" />
              <Text style={styles.dangerNoticeText}>
                This is a reversible soft deletion. Login will be banned, listings hidden, and
                historical records retained.
              </Text>
            </View>
            <FormField
              label="Reason"
              value={formReason}
              onChangeText={setFormReason}
              placeholder="Reason for deactivation"
              multiline
            />
          </View>
        ) : actionMode === 'message' ? (
          <View style={styles.formStack}>
            <FormField label="Subject" value={messageSubject} onChangeText={setMessageSubject} />
            <FormField
              label="Message"
              value={messageBody}
              onChangeText={setMessageBody}
              multiline
            />
            <View style={styles.infoNotice}>
              <Ionicons name="mail-outline" size={18} color="#175CD3" />
              <Text style={styles.infoNoticeText}>
                This will create an in-app notification and send an email through the configured
                provider.
              </Text>
            </View>
          </View>
        ) : (
          <FormField
            label={
              verificationDecision === 'rejected' ? 'Rejection reason' : 'Information required'
            }
            value={formReason}
            onChangeText={setFormReason}
            placeholder="Explain clearly what the cook needs to provide"
            multiline
          />
        )}
        {actionError ? <Text style={styles.formError}>{actionError}</Text> : null}
      </AdminDialog>
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
  pageHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
  },
  pageHeaderCopy: { flex: 1, minWidth: 280 },
  eyebrow: {
    fontFamily: 'mon-b',
    fontSize: 9,
    letterSpacing: 1.4,
    color: '#2C9C5B',
    marginBottom: 7,
  },
  pageTitle: { fontFamily: 'mon-b', fontSize: 30, color: '#1C2720', marginBottom: 7 },
  pageSubtitle: { fontFamily: 'mon', fontSize: 12, lineHeight: 19, color: '#737D77' },
  headerActions: { flexDirection: 'row', gap: 9 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    flexGrow: 1,
    minWidth: 165,
    maxWidth: 280,
    minHeight: 118,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5EAE7',
    borderRadius: 15,
    padding: 15,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 11,
  },
  statLabel: { fontFamily: 'mon-sb', fontSize: 9, color: '#7B857E', marginBottom: 4 },
  statValue: { fontFamily: 'mon-b', fontSize: 23, color: '#202B24' },
  filterScroller: { marginHorizontal: -3, marginBottom: 16 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 3 },
  filter: {
    flexDirection: 'row',
    minHeight: 36,
    paddingHorizontal: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
  },
  filterActive: { backgroundColor: '#E8F7ED', borderColor: '#A9DEB9' },
  filterText: { fontFamily: 'mon-sb', fontSize: 9, color: '#727C75' },
  filterTextActive: { color: '#237A3B' },
  filterCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF1EF',
  },
  filterCountActive: { backgroundColor: '#4CAF50' },
  filterCountText: { fontFamily: 'mon-b', fontSize: 9, color: '#667069' },
  filterCountTextActive: { color: '#FFFFFF' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 17 },
  searchBox: {
    flex: 1,
    minWidth: 250,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  searchInput: { flex: 1, fontFamily: 'mon', fontSize: 10, color: '#303C35' },
  selectButton: {
    minWidth: 135,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 9,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  selectButtonText: { fontFamily: 'mon-sb', fontSize: 9, color: '#69736D' },
  refreshButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  actionButton: {
    minHeight: 34,
    paddingHorizontal: 13,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#D8DEDA',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  actionButtonPrimary: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  actionButtonDanger: { backgroundColor: '#FFF4F3', borderColor: '#F6C6C2' },
  actionButtonDisabled: { opacity: 0.4 },
  actionButtonText: { fontFamily: 'mon-sb', fontSize: 9, color: '#626D66' },
  actionButtonTextPrimary: { color: '#FFFFFF' },
  actionButtonTextDanger: { color: '#B42318' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEF3F2',
    marginBottom: 12,
  },
  errorText: { flex: 1, fontFamily: 'mon', fontSize: 10, color: '#8A241A' },
  retryText: { fontFamily: 'mon-b', fontSize: 9, color: '#B42318' },
  loadingState: { minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontFamily: 'mon', fontSize: 10, color: '#818A84' },
  emptyState: { minHeight: 340, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontFamily: 'mon-b', fontSize: 14, color: '#3D4841' },
  emptyText: { fontFamily: 'mon', fontSize: 10, color: '#89918C' },
  table: {
    minWidth: 1130,
    borderWidth: 1,
    borderColor: '#E4E9E6',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1EE',
  },
  tableHeader: { minHeight: 43, backgroundColor: '#F3F6F8' },
  tableHeaderText: { fontFamily: 'mon-b', fontSize: 8, color: '#59645D' },
  tableCell: { fontFamily: 'mon', fontSize: 9, color: '#59655D' },
  tableCellStrong: { fontFamily: 'mon-sb', fontSize: 9, color: '#354139' },
  uidColumn: { width: 100 },
  nameColumn: { width: 230 },
  roleColumn: { width: 100 },
  verifyColumn: { width: 90 },
  joinedColumn: { width: 120 },
  statusColumn: { width: 120 },
  reportColumn: { width: 75 },
  actionsColumn: { flex: 1, minWidth: 250 },
  personCell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EDF1EE' },
  avatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E4F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: 'mon-b', fontSize: 10, color: '#237A3B' },
  personCopy: { flex: 1, minWidth: 0 },
  personName: { fontFamily: 'mon-sb', fontSize: 10, color: '#303C35' },
  personEmail: { fontFamily: 'mon', fontSize: 8, color: '#929A95', marginTop: 3 },
  rowActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  protectedText: { fontFamily: 'mon-sb', fontSize: 8, color: '#237A3B' },
  reportCountFlagged: { fontFamily: 'mon-b', fontSize: 10, color: '#B42318' },
  userCards: { gap: 10 },
  userCard: { padding: 14, borderWidth: 1, borderColor: '#E3E8E5', borderRadius: 13, gap: 12 },
  userCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  userCardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  metaPill: {
    fontFamily: 'mon-sb',
    fontSize: 8,
    color: '#68736B',
    backgroundColor: '#F1F4F2',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 99,
  },
  metaPillFlagged: {
    fontFamily: 'mon-sb',
    fontSize: 8,
    color: '#B42318',
    backgroundColor: '#FEE4E2',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 99,
  },
  pagination: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 18,
  },
  paginationText: { fontFamily: 'mon', fontSize: 9, color: '#7C857F' },
  paginationActions: { flexDirection: 'row', gap: 8 },
  dialogLoading: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  detailsContent: { gap: 20 },
  detailsHero: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  detailsAvatar: { width: 62, height: 62, borderRadius: 22, backgroundColor: '#EDF1EE' },
  detailsAvatarFallback: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: '#E4F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsAvatarText: { fontFamily: 'mon-b', fontSize: 17, color: '#237A3B' },
  detailsHeroCopy: { flex: 1 },
  detailsName: { fontFamily: 'mon-b', fontSize: 20, color: '#26322B' },
  detailsMeta: { fontFamily: 'mon', fontSize: 9, lineHeight: 15, color: '#818B84', marginTop: 4 },
  restrictionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 11,
    backgroundColor: '#FFF4D6',
  },
  restrictionText: { flex: 1, fontFamily: 'mon', fontSize: 9, lineHeight: 15, color: '#765100' },
  detailsStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailStat: {
    flex: 1,
    minWidth: 130,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E1E6E3',
    borderRadius: 12,
    alignItems: 'center',
  },
  detailStatValue: { fontFamily: 'mon-b', fontSize: 17, color: '#27332B' },
  detailStatLabel: { fontFamily: 'mon', fontSize: 8, color: '#8A938D', marginTop: 4 },
  detailSectionTitle: {
    fontFamily: 'mon-b',
    fontSize: 9,
    letterSpacing: 0.7,
    color: '#737D77',
    marginTop: 3,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  infoCell: { width: '50%', minHeight: 65, padding: 12, borderWidth: 0.5, borderColor: '#E1E6E3' },
  infoLabel: { fontFamily: 'mon', fontSize: 8, color: '#8A938D', marginBottom: 4 },
  infoValue: { fontFamily: 'mon-sb', fontSize: 10, color: '#303B34' },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  listSection: { borderWidth: 1, borderColor: '#E3E8E5', borderRadius: 12, overflow: 'hidden' },
  listRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1EE',
  },
  listRowCopy: { flex: 1 },
  listRowTitle: { fontFamily: 'mon-sb', fontSize: 9, color: '#344039' },
  listRowMeta: { fontFamily: 'mon', fontSize: 8, color: '#89928C', marginTop: 4 },
  reportMarker: { width: 7, height: 28, borderRadius: 4, backgroundColor: '#F56C73' },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  documentActions: { alignItems: 'flex-end', gap: 7 },
  documentHint: { fontFamily: 'mon', fontSize: 9, color: '#7C8680' },
  mutedText: { fontFamily: 'mon', fontSize: 9, color: '#939B96' },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: 'row', minHeight: 48 },
  timelineDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    marginTop: 5,
    marginRight: 12,
  },
  timelineCopy: { flex: 1, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#EDF1EE' },
  timelineTitle: { fontFamily: 'mon-sb', fontSize: 9, color: '#38443C' },
  timelineDate: { fontFamily: 'mon', fontSize: 8, color: '#929A95', marginTop: 3 },
  dangerZone: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F5CBC7',
    backgroundColor: '#FFF9F8',
    borderRadius: 12,
  },
  dangerCopy: { flex: 1, minWidth: 240 },
  dangerTitle: { fontFamily: 'mon-b', fontSize: 10, color: '#8A241A' },
  dangerText: { fontFamily: 'mon', fontSize: 8, lineHeight: 14, color: '#8D5C57', marginTop: 4 },
  selfProtection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 11,
    backgroundColor: '#EAF7EE',
  },
  selfProtectionText: { flex: 1, fontFamily: 'mon-sb', fontSize: 9, color: '#27613A' },
  formStack: { gap: 16 },
  formField: { gap: 7 },
  formLabel: { fontFamily: 'mon-sb', fontSize: 9, color: '#59655D' },
  input: {
    minHeight: 44,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#D8DEDA',
    borderRadius: 10,
    fontFamily: 'mon',
    fontSize: 10,
    color: '#303B34',
    backgroundColor: '#FBFCFB',
  },
  textarea: { minHeight: 110, textAlignVertical: 'top' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 36,
    paddingHorizontal: 13,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#D8DEDA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceActive: { backgroundColor: '#E8F7ED', borderColor: '#9ED6AE' },
  choiceText: { fontFamily: 'mon-sb', fontSize: 9, color: '#737D77' },
  choiceTextActive: { color: '#237A3B' },
  infoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#EEF5FF',
  },
  infoNoticeText: { flex: 1, fontFamily: 'mon', fontSize: 9, lineHeight: 15, color: '#315B91' },
  dangerNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEF3F2',
  },
  dangerNoticeText: { flex: 1, fontFamily: 'mon', fontSize: 9, lineHeight: 15, color: '#8A241A' },
  formError: { fontFamily: 'mon-sb', fontSize: 9, lineHeight: 15, color: '#B42318', marginTop: 13 },
});
