import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useRouter } from 'expo-router';
import {
  fetchIdentityDocumentFile,
  fetchManagedCookDetails,
  fetchManagedCooks,
  fetchVerificationDocumentFile,
  hideCookListings,
  inviteManagedUser,
  reviewCookApplication,
  reviewIdentityDocument,
  reviewVerificationDocument,
  runManagedUserAction,
  updateManagedUser,
} from '@/src/admin/api';
import type {
  CookManagementFilter,
  CookManagementResponse,
  CookManagementSort,
  ManagedCook,
  ManagedCookDetails,
} from '@/src/admin/types';
import { useAdminAuth } from '@/src/admin/AdminAuthContext';
import { useAuth } from '@/src/services/auth-context';
import AdminDialog from '@/src/components/admin/AdminDialog';
import { AdminPanel, AdminStatusBadge } from '@/src/components/admin/AdminOverviewUI';
import { showAdminFailure, showAdminSuccess } from '@/src/admin/feedback';

const FILTERS: Array<{ key: CookManagementFilter; label: string }> = [
  { key: 'all', label: 'All cooks' },
  { key: 'active', label: 'Active sellers' },
  { key: 'pending', label: 'Pending verification' },
  { key: 'reverification', label: 'Reverification' },
  { key: 'inactive', label: 'Suspended / deactivated' },
  { key: 'rejected', label: 'Rejected' },
];
const SORTS: Array<{ key: CookManagementSort; label: string }> = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'name_asc', label: 'Name A–Z' },
  { key: 'name_desc', label: 'Name Z–A' },
];
const REQUIRED_DOCS = ['fosim_registration', 'food_handler_certificate', 'typhoid_vaccination'];
const COLUMN_WIDTHS = [
  { width: 310 },
  { width: 210 },
  { width: 130 },
  { width: 170 },
  { width: 140 },
  { width: 220 },
] as const;

const humanize = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString('en-MY', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';
const currency = (value: number) =>
  new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(value);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');

function Button({
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
        styles.button,
        tone === 'primary' && styles.buttonPrimary,
        tone === 'danger' && styles.buttonDanger,
        disabled && styles.buttonDisabled,
      ]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text
        style={[
          styles.buttonText,
          tone === 'primary' && styles.buttonTextPrimary,
          tone === 'danger' && styles.buttonTextDanger,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function CookManagementScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { session } = useAuth();
  const { admin } = useAdminAuth();
  const tableMode = width >= 920;
  const [response, setResponse] = useState<CookManagementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CookManagementFilter>('all');
  const [sort, setSort] = useState<CookManagementSort>('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const requestId = useRef(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<ManagedCookDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openedDocs, setOpenedDocs] = useState<Set<string>>(new Set());
  const [reviewerNote, setReviewerNote] = useState('');
  const [dialog, setDialog] = useState<
    'invite' | 'edit' | 'message' | 'suspend' | 'deactivate' | 'reject' | null
  >(null);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [messageSubject, setMessageSubject] = useState('Message from Chefin Support');
  const [messageBody, setMessageBody] = useState('');
  const [suspensionDays, setSuspensionDays] = useState('');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRestaurant, setEditRestaurant] = useState('');

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const loadCooks = useCallback(
    async (refresh = false) => {
      if (!session?.access_token) return;
      const id = ++requestId.current;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await fetchManagedCooks(session.access_token, {
          search,
          filter,
          sort,
          page,
          pageSize: 25,
        });
        if (id === requestId.current) setResponse(data);
      } catch (caught: unknown) {
        if (id === requestId.current)
          setError(caught instanceof Error ? caught.message : 'Cooks could not be loaded.');
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [filter, page, search, session?.access_token, sort]
  );

  useEffect(() => {
    loadCooks();
  }, [loadCooks]);

  const loadDetails = useCallback(
    async (userId: string) => {
      if (!session?.access_token) return;
      setSelectedId(userId);
      setDetails(null);
      setDetailsError(null);
      setDetailsLoading(true);
      setReviewerNote('');
      try {
        setDetails(await fetchManagedCookDetails(session.access_token, userId));
      } catch (caught: unknown) {
        setDetailsError(caught instanceof Error ? caught.message : 'Cook details could not load.');
      } finally {
        setDetailsLoading(false);
      }
    },
    [session?.access_token]
  );

  const refreshDetails = async () => {
    await loadCooks(true);
    if (selectedId) await loadDetails(selectedId);
  };

  const openFile = async (kind: 'identity' | 'compliance', documentId: string) => {
    if (!session?.access_token || !selectedId || busy) return;
    const preview = Platform.OS === 'web' ? window.open('', '_blank') : null;
    setBusy(true);
    try {
      const { fileUrl } =
        kind === 'identity'
          ? await fetchIdentityDocumentFile(session.access_token, selectedId, documentId)
          : await fetchVerificationDocumentFile(session.access_token, documentId);
      if (preview) {
        preview.opener = null;
        preview.location.href = fileUrl;
      } else await Linking.openURL(fileUrl);
      setOpenedDocs(current => new Set(current).add(documentId));
    } catch (caught: unknown) {
      preview?.close();
      Alert.alert('Document unavailable', caught instanceof Error ? caught.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const reviewDocument = async (
    kind: 'identity' | 'compliance',
    documentId: string,
    decision: 'approved' | 'rejected' | 'more_info_requested'
  ) => {
    if (!session?.access_token || !selectedId || !openedDocs.has(documentId)) return;
    if (decision !== 'approved' && reviewerNote.trim().length < 5) {
      Alert.alert(
        'Reviewer note required',
        'Explain what is rejected or what information is needed.'
      );
      return;
    }
    setBusy(true);
    try {
      if (kind === 'identity') {
        await reviewIdentityDocument(session.access_token, selectedId, documentId, {
          decision,
          reviewerNote,
        });
      } else {
        await reviewVerificationDocument(session.access_token, {
          documentId,
          decision,
          reviewerNote,
        });
      }
      setReviewerNote('');
      await refreshDetails();
      showAdminSuccess(
        decision === 'approved'
          ? 'Document approved'
          : decision === 'rejected'
            ? 'Document rejected'
            : 'More information requested',
        `${kind === 'identity' ? 'Identity' : 'Compliance'} review saved successfully${
          decision === 'approved' ? '.' : ', and the cook was notified.'
        }`
      );
    } catch (caught: unknown) {
      showAdminFailure(caught, 'The document decision could not be saved.', 'Review failed');
    } finally {
      setBusy(false);
    }
  };

  const decideApplication = async (action: 'approve' | 'reject') => {
    if (!session?.access_token || !selectedId) return;
    if (action === 'reject' && reviewerNote.trim().length < 5) {
      Alert.alert('Rejection reason required', 'Enter a clear reason for the cook.');
      return;
    }
    setBusy(true);
    try {
      await reviewCookApplication(session.access_token, selectedId, action, reviewerNote);
      setDialog(null);
      setReviewerNote('');
      await refreshDetails();
      showAdminSuccess(
        action === 'approve' ? 'Cook approved' : 'Cook application rejected',
        action === 'approve'
          ? 'The cook may now submit dishes for publication and accept orders after dish approval.'
          : 'The rejection was saved, the cook was notified, and customer-mode access was retained.'
      );
    } catch (caught: unknown) {
      showAdminFailure(
        caught,
        'The cook application decision could not be saved.',
        'Decision failed'
      );
    } finally {
      setBusy(false);
    }
  };

  const quickAction = async (
    action: 'reinstate' | 'reactivate' | 'reset-password' | 'hide',
    targetUserId = selectedId
  ) => {
    if (!session?.access_token || !targetUserId) return;
    setBusy(true);
    try {
      if (action === 'hide') await hideCookListings(session.access_token, targetUserId);
      else await runManagedUserAction(session.access_token, targetUserId, action);
      await refreshDetails();
      showAdminSuccess(
        action === 'hide'
          ? 'Listings hidden'
          : action === 'reset-password'
            ? 'Reset email sent'
            : action === 'reinstate'
              ? 'Account reinstated'
              : 'Account reactivated',
        action === 'hide'
          ? 'All of this cook’s listings were removed from customer discovery.'
          : action === 'reset-password'
            ? 'Password-reset instructions were sent to the cook’s email address.'
            : 'The account is active again.'
      );
    } catch (caught: unknown) {
      showAdminFailure(caught);
    } finally {
      setBusy(false);
    }
  };

  const submitDialog = async () => {
    if (!session?.access_token || busy) return;
    setBusy(true);
    try {
      let successFeedback: { title: string; message: string } | null = null;
      if (dialog === 'invite') {
        await inviteManagedUser(session.access_token, {
          fullName: inviteName,
          email: inviteEmail,
          role: 'cook',
        });
        successFeedback = {
          title: 'Invitation sent',
          message: 'The invitation leads into account setup and cook onboarding.',
        };
      } else if (dialog === 'edit' && selectedId) {
        await updateManagedUser(session.access_token, selectedId, {
          fullName: editName,
          email: editEmail,
          phone: editPhone,
          restaurantName: editRestaurant,
          role: 'cook',
          preserveAdminRole: true,
        });
        successFeedback = {
          title: 'Cook updated',
          message: 'The cook’s profile and restaurant details were saved successfully.',
        };
      } else if (dialog === 'message' && selectedId) {
        const result = await runManagedUserAction<{
          success: true;
          email: { sent: boolean; error?: string };
        }>(session.access_token, selectedId, 'message', {
          subject: messageSubject,
          message: messageBody,
        });
        successFeedback = {
          title: result.email.sent ? 'Message delivered' : 'Message partially delivered',
          message: result.email.sent
            ? 'The in-app notification and email were sent.'
            : `The in-app notification was sent. Email was not delivered: ${result.email.error}`,
        };
      } else if (dialog === 'suspend' && selectedId) {
        const reason = reviewerNote.trim();
        const durationDays = suspensionDays.trim() ? Number(suspensionDays) : null;
        if (reason.length < 5 || reason.length > 500) {
          throw new Error('Provide a suspension reason of 5–500 characters.');
        }
        if (
          durationDays !== null &&
          (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650)
        ) {
          throw new Error('Suspension duration must be a whole number from 1 to 3650 days.');
        }
        const result = await runManagedUserAction<{
          success: true;
          email: { sent: boolean; error?: string };
          notification: { sent: boolean; error?: string };
          audit: { recorded: boolean; error?: string };
        }>(session.access_token, selectedId, 'suspend', {
          reason,
          durationDays,
        });
        const deliveryWarnings = [
          !result.notification.sent ? 'in-app notification' : null,
          !result.email.sent ? 'email' : null,
          !result.audit.recorded ? 'audit log' : null,
        ].filter(Boolean);
        successFeedback = {
          title: deliveryWarnings.length ? 'Cook suspended with warnings' : 'Cook suspended',
          message: `${
            durationDays
              ? `The account is read-only for ${durationDays} day(s).`
              : 'The account now has indefinite read-only access.'
          }${
            deliveryWarnings.length
              ? ` The suspension succeeded, but these follow-up actions failed: ${deliveryWarnings.join(', ')}.`
              : ''
          }`,
        };
      } else if (dialog === 'deactivate' && selectedId) {
        await runManagedUserAction(session.access_token, selectedId, 'deactivate', {
          reason: reviewerNote,
        });
        successFeedback = {
          title: 'Cook deactivated',
          message: 'The account was soft-deactivated and its records were retained.',
        };
      } else if (dialog === 'reject') {
        setBusy(false);
        await decideApplication('reject');
        return;
      }
      setDialog(null);
      setReviewerNote('');
      await refreshDetails();
      if (successFeedback) showAdminSuccess(successFeedback.title, successFeedback.message);
    } catch (caught: unknown) {
      showAdminFailure(caught);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    if (!session?.access_token || Platform.OS !== 'web') {
      showAdminFailure(
        new Error('CSV export is currently available from the web dashboard only.'),
        undefined,
        'Export unavailable'
      );
      return;
    }
    setBusy(true);
    try {
      const firstPage = await fetchManagedCooks(session.access_token, {
        search,
        filter,
        sort,
        page: 1,
        pageSize: 100,
      });
      const cooks = [...firstPage.cooks];
      for (let nextPage = 2; nextPage <= firstPage.pagination.totalPages; nextPage += 1) {
        const next = await fetchManagedCooks(session.access_token, {
          search,
          filter,
          sort,
          page: nextPage,
          pageSize: 100,
        });
        cooks.push(...next.cooks);
      }

      const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const csv = [
        [
          'Cook ID',
          'User ID',
          'Name',
          'Restaurant',
          'Email',
          'Address',
          'Joined',
          'Account Status',
          'Application Status',
          'Identity Status',
          'Compliance Status',
          'Eligible to Sell',
          'Verified',
          'Reverification Due',
          'Dish Count',
        ],
        ...cooks.map(cook => [
          cook.displayId,
          cook.userId,
          cook.name,
          cook.restaurantName,
          cook.email,
          cook.address,
          cook.joinedAt,
          cook.accountStatus,
          cook.applicationStatus,
          cook.identityStatus,
          cook.complianceStatus,
          cook.eligibleToSell ? 'Yes' : 'No',
          cook.verified ? 'Yes' : 'No',
          cook.reverificationDueAt,
          cook.dishCount,
        ]),
      ]
        .map(row => row.map(escape).join(','))
        .join('\n');
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `chefin-cooks-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      showAdminSuccess(
        'CSV exported',
        `${cooks.length.toLocaleString('en-MY')} cook record(s) were downloaded.`
      );
    } catch (caught: unknown) {
      showAdminFailure(caught, 'The cook CSV could not be generated.', 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const openSuspendDialog = (targetUserId: string) => {
    setSelectedId(targetUserId);
    setReviewerNote('');
    setSuspensionDays('');
    setDialog('suspend');
  };

  const renderActions = (cook: ManagedCook) => {
    const self = cook.userId === admin?.userId;
    return (
      <View style={styles.rowActions}>
        <Button label="View" onPress={() => loadDetails(cook.userId)} />
        {self ? (
          <Text style={styles.protected}>Protected</Text>
        ) : cook.accountStatus === 'suspended' ? (
          <Button
            label="Reinstate"
            onPress={() => {
              quickAction('reinstate', cook.userId);
            }}
          />
        ) : cook.accountStatus === 'deactivated' ? (
          <Button
            label="Reactivate"
            onPress={() => {
              quickAction('reactivate', cook.userId);
            }}
          />
        ) : cook.applicationStatus === 'pending' ? (
          <Button label="Review" tone="primary" onPress={() => loadDetails(cook.userId)} />
        ) : (
          <Button label="Suspend" onPress={() => openSuspendDialog(cook.userId)} />
        )}
      </View>
    );
  };

  const latestCompliance = new Map<string, ManagedCookDetails['complianceDocuments'][number]>();
  for (const document of details?.complianceDocuments ?? []) {
    if (!latestCompliance.has(document.doc_type)) latestCompliance.set(document.doc_type, document);
  }
  const allComplianceApproved = REQUIRED_DOCS.every(
    type => latestCompliance.get(type)?.status === 'approved'
  );
  const latestIdentity = details?.identityDocuments[0];
  const canFinalApprove =
    details?.application?.identity_status === 'approved' && allComplianceApproved;
  const complianceReviewLocked =
    details?.application?.identity_status !== 'approved' || details?.cook.userId === admin?.userId;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>ADMIN DASHBOARD</Text>
          <Text style={styles.title}>Cook Management</Text>
          <Text style={styles.subtitle}>
            Review seller eligibility separately from account access, then manage cooks throughout
            their lifecycle.
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Button label="Export CSV" onPress={exportCsv} disabled={busy} />
          <Button label="+ Add cook" tone="primary" onPress={() => setDialog('invite')} />
        </View>
      </View>

      <View style={styles.stats}>
        {[
          ['Total cooks', response?.stats.totalCooks ?? 0, 'restaurant-outline', '#438BF5'],
          [
            'Active sellers',
            response?.stats.activeCooks ?? 0,
            'checkmark-circle-outline',
            '#24BFB1',
          ],
          [
            'Pending verification',
            response?.stats.pendingVerification ?? 0,
            'time-outline',
            '#F4B740',
          ],
          [
            '90-day reverification',
            response?.stats.reverificationRequired ?? 0,
            'refresh-outline',
            '#FF8642',
          ],
        ].map(([label, value, icon, color]) => (
          <View key={String(label)} style={styles.statCard}>
            <Ionicons name={icon as any} size={20} color={String(color)} />
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{Number(value).toLocaleString('en-MY')}</Text>
          </View>
        ))}
      </View>

      <AdminPanel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filters}>
            {FILTERS.map(option => (
              <TouchableOpacity
                key={option.key}
                style={[styles.filter, filter === option.key && styles.filterActive]}
                onPress={() => {
                  setFilter(option.key);
                  setPage(1);
                }}
              >
                <Text style={[styles.filterText, filter === option.key && styles.filterTextActive]}>
                  {option.label}
                </Text>
                {option.key === 'pending' && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>
                      {response?.stats.pendingVerification ?? 0}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <View style={styles.controls}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={19} color="#87918B" />
            <TextInput
              style={styles.searchInput}
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder="Search cook ID, name, restaurant or email"
              placeholderTextColor="#9AA29D"
            />
          </View>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => {
              const index = SORTS.findIndex(option => option.key === sort);
              setSort(SORTS[(index + 1) % SORTS.length].key);
            }}
          >
            <Text style={styles.sortText}>
              Sort: {SORTS.find(option => option.key === sort)?.label}
            </Text>
            <Ionicons name="chevron-down" size={15} color="#667085" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.refresh} onPress={() => loadCooks(true)}>
            {refreshing ? (
              <ActivityIndicator color="#4CAF50" />
            ) : (
              <Ionicons name="refresh" size={19} color="#47544C" />
            )}
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Button label="Retry" onPress={() => loadCooks()} />
          </View>
        ) : loading && !response ? (
          <View style={styles.empty}>
            <ActivityIndicator size="large" color="#4CAF50" />
          </View>
        ) : response?.cooks.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="restaurant-outline" size={34} color="#9DA59F" />
            <Text style={styles.emptyTitle}>No matching cooks</Text>
          </View>
        ) : tableMode ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                {['COOK', 'ADDRESS', 'JOINED', 'VERIFICATION', 'ACCOUNT', 'ACTIONS'].map(
                  (label, i) => (
                    <Text key={label} style={[styles.th, COLUMN_WIDTHS[i]]}>
                      {label}
                    </Text>
                  )
                )}
              </View>
              {(response?.cooks ?? []).map(cook => (
                <View key={cook.userId} style={styles.tableRow}>
                  <View style={[styles.person, COLUMN_WIDTHS[0]]}>
                    {cook.avatarUrl ? (
                      <Image source={{ uri: cook.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarText}>{initials(cook.name)}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.personName}>{cook.name}</Text>
                      <Text style={styles.meta}>
                        #{cook.displayId} · {cook.restaurantName ?? 'No restaurant name'}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.cell, COLUMN_WIDTHS[1]]}>{cook.address}</Text>
                  <Text style={[styles.cell, COLUMN_WIDTHS[2]]}>{formatDate(cook.joinedAt)}</Text>
                  <View style={COLUMN_WIDTHS[3]}>
                    <AdminStatusBadge status={cook.applicationStatus} />
                  </View>
                  <View style={COLUMN_WIDTHS[4]}>
                    <AdminStatusBadge status={cook.accountStatus} />
                  </View>
                  <View style={COLUMN_WIDTHS[5]}>{renderActions(cook)}</View>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : (
          <View style={{ gap: 12 }}>
            {(response?.cooks ?? []).map(cook => (
              <View key={cook.userId} style={styles.mobileCard}>
                <View style={styles.person}>
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarText}>{initials(cook.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName}>{cook.name}</Text>
                    <Text style={styles.meta}>{cook.restaurantName}</Text>
                  </View>
                  <AdminStatusBadge status={cook.applicationStatus} />
                </View>
                <Text style={styles.meta}>
                  {cook.address} · Joined {formatDate(cook.joinedAt)}
                </Text>
                {renderActions(cook)}
              </View>
            ))}
          </View>
        )}
        {response && (
          <View style={styles.pagination}>
            <Text style={styles.meta}>
              {response.pagination.total} cooks · Page {page} of {response.pagination.totalPages}
            </Text>
            <View style={styles.rowActions}>
              <Button
                label="Previous"
                disabled={page <= 1}
                onPress={() => setPage(value => value - 1)}
              />
              <Button
                label="Next"
                disabled={page >= response.pagination.totalPages}
                onPress={() => setPage(value => value + 1)}
              />
            </View>
          </View>
        )}
      </AdminPanel>

      <AdminDialog
        visible={Boolean(selectedId) && dialog == null}
        title="Cook Information"
        subtitle={
          details
            ? `Cook #${details.cook.displayId} · Joined ${formatDate(details.cook.joinedAt)}`
            : undefined
        }
        onClose={() => {
          setSelectedId(null);
          setDetails(null);
          setOpenedDocs(new Set());
        }}
        maxWidth={900}
        footer={
          details && details.cook.userId !== admin?.userId ? (
            <>
              <Button label="Send message" onPress={() => setDialog('message')} />
              <Button
                label="Edit"
                onPress={() => {
                  setEditName(details.cook.name);
                  setEditEmail(details.cook.email);
                  setEditPhone(details.cook.phone ?? '');
                  setEditRestaurant(details.cook.restaurantName ?? '');
                  setDialog('edit');
                }}
              />
              <Button label="Reset password" onPress={() => quickAction('reset-password')} />
              {details.cook.accountStatus === 'active' ? (
                <Button
                  label="Suspend"
                  tone="danger"
                  onPress={() => openSuspendDialog(details.cook.userId)}
                />
              ) : details.cook.accountStatus === 'suspended' ? (
                <Button label="Reinstate" tone="primary" onPress={() => quickAction('reinstate')} />
              ) : (
                <Button
                  label="Reactivate"
                  tone="primary"
                  onPress={() => quickAction('reactivate')}
                />
              )}
              {details.cook.accountStatus !== 'deactivated' && (
                <Button
                  label="Deactivate"
                  tone="danger"
                  onPress={() => {
                    setReviewerNote('');
                    setDialog('deactivate');
                  }}
                />
              )}
            </>
          ) : undefined
        }
      >
        {detailsLoading ? (
          <View style={styles.empty}>
            <ActivityIndicator size="large" color="#4CAF50" />
          </View>
        ) : detailsError ? (
          <Text style={styles.errorText}>{detailsError}</Text>
        ) : details ? (
          <View style={{ gap: 22 }}>
            <View style={styles.hero}>
              {details.cook.avatarUrl ? (
                <Image source={{ uri: details.cook.avatarUrl }} style={styles.heroAvatar} />
              ) : (
                <View style={[styles.avatarFallback, styles.heroAvatar]}>
                  <Text style={styles.avatarText}>{initials(details.cook.name)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.heroName}>{details.cook.name}</Text>
                <Text style={styles.meta}>
                  {details.cook.restaurantName ?? 'No restaurant name'} · {details.cook.address}
                </Text>
              </View>
              <AdminStatusBadge status={details.application?.status ?? 'draft'} />
            </View>
            <View style={styles.detailStats}>
              {[
                ['Orders done', details.summary.ordersDone],
                ['Total earned', currency(details.summary.totalEarned)],
                [
                  'Average rating',
                  details.summary.averageRating == null
                    ? '—'
                    : `${details.summary.averageRating.toFixed(1)} (${details.summary.ratingCount})`,
                ],
                ['Dishes', details.summary.dishCount],
              ].map(([label, value]) => (
                <View key={String(label)} style={styles.detailStat}>
                  <Text style={styles.detailValue}>{value}</Text>
                  <Text style={styles.meta}>{label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>ORDER SUMMARY</Text>
              <Button
                label="Open Order Monitoring"
                onPress={() =>
                  router.push({
                    pathname: '/admin/orders',
                    params: { cookId: details.cook.userId },
                  })
                }
              />
            </View>
            <View style={styles.infoGrid}>
              {[
                ['Email', details.cook.email],
                ['Phone', details.cook.phone ?? 'Not provided'],
                ['Hosting type', humanize(details.cook.hostingType ?? 'not provided')],
                ['Citizenship', humanize(details.application?.citizenship_type ?? 'not submitted')],
                [
                  'Identity stage',
                  humanize(details.application?.identity_status ?? 'not submitted'),
                ],
                [
                  'Compliance stage',
                  humanize(details.application?.compliance_status ?? 'not submitted'),
                ],
              ].map(([label, value]) => (
                <View key={label} style={styles.infoCell}>
                  <Text style={styles.infoLabel}>{label}</Text>
                  <Text style={styles.infoValue}>{value}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>STEP 1 · IDENTITY REVIEW</Text>
            {!details.canReviewIdentity ? (
              <View style={styles.permissionBox}>
                <Ionicons name="lock-closed" size={18} color="#9A6700" />
                <Text style={styles.permissionText}>
                  Identity documents are hidden. This admin lacks the identity_review permission.
                </Text>
              </View>
            ) : latestIdentity ? (
              <View style={styles.documentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.documentTitle}>{humanize(latestIdentity.document_type)}</Text>
                  <Text style={styles.meta}>
                    Submitted {formatDate(latestIdentity.submitted_at)}
                  </Text>
                </View>
                <AdminStatusBadge status={latestIdentity.status} />
                <Button
                  label={openedDocs.has(latestIdentity.id) ? 'View again' : 'View securely'}
                  tone="primary"
                  onPress={() => openFile('identity', latestIdentity.id)}
                />
                {latestIdentity.status === 'pending' && (
                  <View style={styles.rowActions}>
                    <Button
                      label="Approve"
                      disabled={
                        !openedDocs.has(latestIdentity.id) ||
                        busy ||
                        details.cook.userId === admin?.userId
                      }
                      onPress={() => reviewDocument('identity', latestIdentity.id, 'approved')}
                    />
                    <Button
                      label="More info"
                      disabled={
                        !openedDocs.has(latestIdentity.id) ||
                        busy ||
                        details.cook.userId === admin?.userId
                      }
                      onPress={() =>
                        reviewDocument('identity', latestIdentity.id, 'more_info_requested')
                      }
                    />
                    <Button
                      label="Reject"
                      tone="danger"
                      disabled={
                        !openedDocs.has(latestIdentity.id) ||
                        busy ||
                        details.cook.userId === admin?.userId
                      }
                      onPress={() => reviewDocument('identity', latestIdentity.id, 'rejected')}
                    />
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.meta}>No identity document submitted.</Text>
            )}

            <Text style={styles.sectionTitle}>STEP 2 · FOOD & BUSINESS COMPLIANCE</Text>
            <View style={{ gap: 10 }}>
              {REQUIRED_DOCS.map(type => {
                const document = latestCompliance.get(type);
                return (
                  <View key={type} style={styles.documentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.documentTitle}>{humanize(type)}</Text>
                      <Text style={styles.meta}>
                        {document ? `Submitted ${formatDate(document.submitted_at)}` : 'Missing'}
                      </Text>
                    </View>
                    <AdminStatusBadge status={document?.status ?? 'not_submitted'} />
                    {document && (
                      <Button
                        label={openedDocs.has(document.id) ? 'View again' : 'View document'}
                        tone="primary"
                        onPress={() => openFile('compliance', document.id)}
                      />
                    )}
                    {document?.status === 'pending' && (
                      <View style={styles.rowActions}>
                        <Button
                          label="Approve"
                          disabled={!openedDocs.has(document.id) || busy || complianceReviewLocked}
                          onPress={() => reviewDocument('compliance', document.id, 'approved')}
                        />
                        <Button
                          label="More info"
                          disabled={!openedDocs.has(document.id) || busy || complianceReviewLocked}
                          onPress={() =>
                            reviewDocument('compliance', document.id, 'more_info_requested')
                          }
                        />
                        <Button
                          label="Reject"
                          tone="danger"
                          disabled={!openedDocs.has(document.id) || busy || complianceReviewLocked}
                          onPress={() => reviewDocument('compliance', document.id, 'rejected')}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            <View>
              <Text style={styles.infoLabel}>
                REVIEWER NOTE (required for rejection / more info)
              </Text>
              <TextInput
                style={styles.textarea}
                multiline
                submitBehavior="newline"
                value={reviewerNote}
                onChangeText={setReviewerNote}
                placeholder="Explain the decision clearly to the cook"
              />
            </View>
            <View style={styles.finalReview}>
              <View style={{ flex: 1 }}>
                <Text style={styles.finalTitle}>Final platform approval</Text>
                <Text style={styles.meta}>
                  Enabled only after identity and all three compliance documents are approved.
                </Text>
              </View>
              <Button
                label="Hide all listings"
                onPress={() => quickAction('hide')}
                disabled={busy || details.cook.userId === admin?.userId}
              />
              <Button
                label="Reject application"
                tone="danger"
                onPress={() => setDialog('reject')}
                disabled={busy || details.cook.userId === admin?.userId}
              />
              <Button
                label="Approve cook"
                tone="primary"
                onPress={() => decideApplication('approve')}
                disabled={!canFinalApprove || busy || details.cook.userId === admin?.userId}
              />
            </View>
          </View>
        ) : null}
      </AdminDialog>

      <AdminDialog
        visible={dialog != null}
        title={
          dialog === 'invite'
            ? 'Invite cook'
            : dialog === 'edit'
              ? 'Edit cook'
              : dialog === 'message'
                ? 'Send message'
                : dialog === 'suspend'
                  ? 'Suspend cook account'
                  : dialog === 'deactivate'
                    ? 'Deactivate cook account'
                    : 'Reject cook application'
        }
        subtitle={
          dialog === 'invite'
            ? 'The invitation continues into cook onboarding after account setup.'
            : details?.cook.name
        }
        onClose={() => !busy && setDialog(null)}
        maxWidth={600}
        footer={
          <>
            <Button label="Cancel" onPress={() => setDialog(null)} disabled={busy} />
            <Button
              label={
                dialog === 'invite'
                  ? 'Send invitation'
                  : dialog === 'edit'
                    ? 'Save changes'
                    : dialog === 'message'
                      ? 'Send both'
                      : dialog === 'suspend'
                        ? 'Suspend'
                        : dialog === 'deactivate'
                          ? 'Deactivate'
                          : 'Reject'
              }
              tone={
                dialog === 'suspend' || dialog === 'deactivate' || dialog === 'reject'
                  ? 'danger'
                  : 'primary'
              }
              onPress={submitDialog}
              disabled={busy}
            />
          </>
        }
      >
        <View style={{ gap: 14 }}>
          {dialog === 'invite' ? (
            <>
              <TextInput
                style={styles.input}
                value={inviteName}
                onChangeText={setInviteName}
                placeholder="Full name"
              />
              <TextInput
                style={styles.input}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="Email"
                autoCapitalize="none"
              />
            </>
          ) : null}
          {dialog === 'edit' ? (
            <>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="Full name"
              />
              <TextInput
                style={styles.input}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="Email"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="Phone"
              />
              <TextInput
                style={styles.input}
                value={editRestaurant}
                onChangeText={setEditRestaurant}
                placeholder="Restaurant name"
              />
            </>
          ) : null}
          {dialog === 'message' ? (
            <>
              <TextInput
                style={styles.input}
                value={messageSubject}
                onChangeText={setMessageSubject}
                placeholder="Subject"
              />
              <TextInput
                style={styles.textarea}
                multiline
                submitBehavior="newline"
                value={messageBody}
                onChangeText={setMessageBody}
                placeholder="Message sent in-app and by email"
              />
            </>
          ) : null}
          {dialog === 'suspend' ? (
            <>
              <TextInput
                style={styles.textarea}
                multiline
                submitBehavior="newline"
                value={reviewerNote}
                onChangeText={setReviewerNote}
                placeholder="Suspension reason"
              />
              <TextInput
                style={styles.input}
                value={suspensionDays}
                onChangeText={setSuspensionDays}
                placeholder="Days (leave blank for indefinite)"
                keyboardType="number-pad"
              />
            </>
          ) : null}
          {dialog === 'deactivate' ? (
            <TextInput
              style={styles.textarea}
              multiline
              submitBehavior="newline"
              value={reviewerNote}
              onChangeText={setReviewerNote}
              placeholder="Deactivation reason"
            />
          ) : null}
          {dialog === 'reject' ? (
            <TextInput
              style={styles.textarea}
              multiline
              submitBehavior="newline"
              value={reviewerNote}
              onChangeText={setReviewerNote}
              placeholder="Rejection reason and resubmission guidance"
            />
          ) : null}
        </View>
      </AdminDialog>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F8' },
  pageContent: { padding: 28, gap: 22, paddingBottom: 70 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 18 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  eyebrow: { fontSize: 10, fontWeight: '800', color: '#4CAF50', letterSpacing: 1.4 },
  title: { fontSize: 32, fontWeight: '800', color: '#202823', marginTop: 5 },
  subtitle: { fontSize: 14, color: '#6F7973', lineHeight: 21, marginTop: 7, maxWidth: 700 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    minWidth: 180,
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5EAE7',
    borderRadius: 16,
    padding: 17,
  },
  statLabel: { fontSize: 12, color: '#77817B', marginTop: 13 },
  statValue: { fontSize: 27, fontWeight: '800', color: '#202823', marginTop: 3 },
  filters: { flexDirection: 'row', gap: 8, paddingBottom: 18 },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: '#E0E6E2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filterActive: { backgroundColor: '#E6F7EA', borderColor: '#4CAF50' },
  filterText: { fontSize: 12, color: '#657068', fontWeight: '600' },
  filterTextActive: { color: '#237A3B' },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4C44E',
  },
  countBadgeText: { fontSize: 10, fontWeight: '800', color: '#594200' },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  searchBox: {
    flex: 1,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E0E6E2',
    borderRadius: 11,
    paddingHorizontal: 13,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 13, color: '#26322B' },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E0E6E2',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  sortText: { fontSize: 12, color: '#5F6963' },
  refresh: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: '#E0E6E2',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  table: { minWidth: 1200 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 76,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1EE',
    paddingHorizontal: 8,
  },
  tableHeader: { minHeight: 46, backgroundColor: '#F7F9F8', borderRadius: 10 },
  th: { fontSize: 10, fontWeight: '800', color: '#657068' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E3F3E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 12, fontWeight: '800', color: '#237A3B' },
  personName: { fontSize: 13, fontWeight: '700', color: '#27322B' },
  meta: { fontSize: 10, color: '#818A84', marginTop: 3 },
  cell: { fontSize: 12, color: '#56625A' },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  button: {
    borderWidth: 1,
    borderColor: '#DCE3DE',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  buttonPrimary: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  buttonDanger: { backgroundColor: '#FFF4F3', borderColor: '#F1B3AE' },
  buttonDisabled: { opacity: 0.42 },
  buttonText: { fontSize: 11, fontWeight: '700', color: '#5D6861' },
  buttonTextPrimary: { color: '#fff' },
  buttonTextDanger: { color: '#B42318' },
  protected: { fontSize: 10, color: '#237A3B', fontWeight: '700' },
  mobileCard: { borderWidth: 1, borderColor: '#E6EBE7', borderRadius: 14, padding: 14, gap: 12 },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
  },
  empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#5F6963' },
  errorBox: {
    padding: 14,
    backgroundColor: '#FFF3F2',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: { color: '#B42318', fontSize: 12 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  heroAvatar: { width: 58, height: 58, borderRadius: 29 },
  heroName: { fontSize: 20, fontWeight: '800', color: '#202823' },
  detailStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailStat: {
    flex: 1,
    minWidth: 130,
    borderWidth: 1,
    borderColor: '#E3E8E5',
    borderRadius: 12,
    padding: 14,
  },
  detailValue: { fontSize: 20, fontWeight: '800', color: '#27322B' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#6A746E', letterSpacing: 0.8 },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: '#E3E8E5',
    borderRadius: 12,
    overflow: 'hidden',
  },
  infoCell: {
    width: '50%',
    minHeight: 65,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E3E8E5',
  },
  infoLabel: { fontSize: 9, color: '#8A938D', fontWeight: '700', letterSpacing: 0.5 },
  infoValue: { fontSize: 13, color: '#28332C', marginTop: 5 },
  documentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: '#E4E9E6',
    borderRadius: 12,
    padding: 13,
  },
  documentTitle: { fontSize: 13, color: '#28332C', fontWeight: '700' },
  permissionBox: {
    flexDirection: 'row',
    gap: 9,
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 13,
  },
  permissionText: { flex: 1, fontSize: 11, lineHeight: 16, color: '#745C13' },
  textarea: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: '#DCE3DE',
    borderRadius: 11,
    padding: 12,
    marginTop: 6,
    textAlignVertical: 'top',
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DCE3DE',
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
  },
  finalReview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#F7F9F8',
    borderRadius: 14,
    padding: 15,
  },
  finalTitle: { fontSize: 14, fontWeight: '800', color: '#28332C' },
});
