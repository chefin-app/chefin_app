import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { fetchModerationReports, updateModerationReport } from '@/src/admin/api';
import type { ModerationReport } from '@/src/admin/types';
import { useAuth } from '@/src/services/auth-context';
import AdminDialog from '@/src/components/admin/AdminDialog';
import { AdminPanel, AdminStatusBadge } from '@/src/components/admin/AdminOverviewUI';

const FILTERS = [
  { key: 'open', label: 'Open queue' },
  { key: 'pending', label: 'Pending' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'actioned', label: 'Actioned' },
  { key: 'dismissed', label: 'Dismissed' },
];

const relation = <T,>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

const humanize = (value: string): string =>
  value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

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
        styles.button,
        tone === 'primary' && styles.buttonPrimary,
        tone === 'danger' && styles.buttonDanger,
        disabled && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
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

export default function ModerationScreen() {
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const tableMode = width >= 920;
  const [status, setStatus] = useState('open');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ModerationReport | null>(null);
  const [resolutionMode, setResolutionMode] = useState<'actioned' | 'dismissed' | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchModerationReports(session.access_token, { status, search });
      setReports(data.reports);
      setCounts(data.counts);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Moderation queue could not load.');
    } finally {
      setLoading(false);
    }
  }, [search, session?.access_token, status]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (
    report: ModerationReport,
    nextStatus: 'reviewing' | 'actioned' | 'dismissed',
    note = ''
  ) => {
    if (!session?.access_token || actionLoading) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await updateModerationReport(session.access_token, report.id, {
        status: nextStatus,
        resolutionNote: note || undefined,
      });
      setResolutionMode(null);
      setResolutionNote('');
      setSelected(null);
      await load();
    } catch (caught: unknown) {
      setActionError(caught instanceof Error ? caught.message : 'Report update failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const openResolution = (mode: 'actioned' | 'dismissed') => {
    setResolutionNote('');
    setActionError(null);
    setResolutionMode(mode);
  };

  const openCount = (counts.pending ?? 0) + (counts.reviewing ?? 0);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>TRUST & SAFETY</Text>
          <Text style={styles.title}>Moderation</Text>
          <Text style={styles.subtitle}>
            Investigate listing and restaurant reports with an auditable resolution trail.
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={load} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color="#4CAF50" />
          ) : (
            <Ionicons name="refresh" size={18} color="#455149" />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
        {[
          ['Open reports', openCount, '#F4B740', 'alert-circle-outline'],
          ['Pending', counts.pending ?? 0, '#F56C73', 'time-outline'],
          ['Under review', counts.reviewing ?? 0, '#438BF5', 'eye-outline'],
          [
            'Resolved',
            (counts.actioned ?? 0) + (counts.dismissed ?? 0),
            '#4CAF50',
            'checkmark-circle-outline',
          ],
        ].map(([label, value, color, icon]) => (
          <View key={String(label)} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
              <Ionicons
                name={icon as React.ComponentProps<typeof Ionicons>['name']}
                size={20}
                color={String(color)}
              />
            </View>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{Number(value).toLocaleString('en-MY')}</Text>
          </View>
        ))}
      </View>

      <AdminPanel>
        <View style={styles.controls}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filters}>
              {FILTERS.map(filter => (
                <TouchableOpacity
                  key={filter.key}
                  style={[styles.filter, status === filter.key && styles.filterActive]}
                  onPress={() => setStatus(filter.key)}
                >
                  <Text
                    style={[styles.filterText, status === filter.key && styles.filterTextActive]}
                  >
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color="#89928C" />
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder="Search reported listing or restaurant"
              placeholderTextColor="#9AA29D"
              style={styles.searchInput}
            />
          </View>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color="#B42318" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Loading moderation queue…</Text>
          </View>
        ) : reports.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="shield-checkmark-outline" size={38} color="#8DA095" />
            <Text style={styles.emptyTitle}>No matching reports</Text>
            <Text style={styles.emptyText}>The selected moderation queue is clear.</Text>
          </View>
        ) : tableMode ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableHeaderText, styles.idColumn]}>REPORT</Text>
                <Text style={[styles.tableHeaderText, styles.targetColumn]}>TARGET</Text>
                <Text style={[styles.tableHeaderText, styles.reporterColumn]}>REPORTED BY</Text>
                <Text style={[styles.tableHeaderText, styles.reasonColumn]}>REASON</Text>
                <Text style={[styles.tableHeaderText, styles.dateColumn]}>SUBMITTED</Text>
                <Text style={[styles.tableHeaderText, styles.statusColumn]}>STATUS</Text>
                <Text style={[styles.tableHeaderText, styles.actionColumn]}>ACTION</Text>
              </View>
              {reports.map(report => {
                const reporter = relation(report.profiles);
                return (
                  <View key={report.id} style={styles.tableRow}>
                    <Text style={[styles.tableCell, styles.idColumn]}>
                      #{report.id.split('-')[0].toUpperCase()}
                    </Text>
                    <View style={styles.targetColumn}>
                      <Text style={styles.tableStrong} numberOfLines={1}>
                        {report.target_label}
                      </Text>
                      <Text style={styles.tableSecondary}>{humanize(report.target_type)}</Text>
                    </View>
                    <View style={[styles.personCell, styles.reporterColumn]}>
                      {reporter?.profile_image ? (
                        <Image source={{ uri: reporter.profile_image }} style={styles.avatar} />
                      ) : (
                        <View style={styles.avatarFallback}>
                          <Ionicons name="person-outline" size={14} color="#667169" />
                        </View>
                      )}
                      <Text style={styles.tableCell} numberOfLines={1}>
                        {reporter?.full_name ?? 'Unknown user'}
                      </Text>
                    </View>
                    <Text style={[styles.tableCell, styles.reasonColumn]}>
                      {humanize(report.reason)}
                    </Text>
                    <Text style={[styles.tableCell, styles.dateColumn]}>
                      {formatDateTime(report.created_at)}
                    </Text>
                    <View style={styles.statusColumn}>
                      <AdminStatusBadge status={report.status} />
                    </View>
                    <View style={styles.actionColumn}>
                      <SmallButton label="View report" onPress={() => setSelected(report)} />
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.cards}>
            {reports.map(report => (
              <TouchableOpacity
                key={report.id}
                style={styles.card}
                onPress={() => setSelected(report)}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardCopy}>
                    <Text style={styles.cardTitle}>{report.target_label}</Text>
                    <Text style={styles.cardMeta}>
                      {humanize(report.target_type)} · {humanize(report.reason)}
                    </Text>
                  </View>
                  <AdminStatusBadge status={report.status} />
                </View>
                <Text style={styles.cardDetails} numberOfLines={2}>
                  {report.details || 'No additional details provided.'}
                </Text>
                <Text style={styles.cardDate}>{formatDateTime(report.created_at)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </AdminPanel>

      <AdminDialog
        visible={Boolean(selected) && !resolutionMode}
        title="Report details"
        subtitle={selected ? `Report #${selected.id.split('-')[0].toUpperCase()}` : undefined}
        onClose={() => setSelected(null)}
        maxWidth={720}
        footer={
          selected && ['pending', 'reviewing'].includes(selected.status) ? (
            <>
              {selected.status === 'pending' ? (
                <SmallButton
                  label="Start review"
                  onPress={() => updateStatus(selected, 'reviewing')}
                />
              ) : null}
              <SmallButton label="Dismiss" onPress={() => openResolution('dismissed')} />
              <SmallButton
                label="Action taken"
                tone="primary"
                onPress={() => openResolution('actioned')}
              />
            </>
          ) : undefined
        }
      >
        {selected ? (
          <View style={styles.detailsContent}>
            <View style={styles.detailsHeader}>
              <View style={styles.targetIcon}>
                <Ionicons
                  name={
                    selected.target_type === 'listing' ? 'fast-food-outline' : 'restaurant-outline'
                  }
                  size={24}
                  color="#237A3B"
                />
              </View>
              <View style={styles.detailsHeaderCopy}>
                <Text style={styles.detailsTitle}>{selected.target_label}</Text>
                <Text style={styles.detailsMeta}>
                  {humanize(selected.target_type)} · Submitted {formatDateTime(selected.created_at)}
                </Text>
              </View>
              <AdminStatusBadge status={selected.status} />
            </View>
            <View style={styles.detailGrid}>
              <View style={styles.detailCell}>
                <Text style={styles.detailLabel}>Reason</Text>
                <Text style={styles.detailValue}>{humanize(selected.reason)}</Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={styles.detailLabel}>Reporter</Text>
                <Text style={styles.detailValue}>
                  {relation(selected.profiles)?.full_name ?? 'Unknown user'}
                </Text>
              </View>
            </View>
            <View style={styles.descriptionBox}>
              <Text style={styles.detailLabel}>Report details</Text>
              <Text style={styles.descriptionText}>
                {selected.details || 'No additional details were provided.'}
              </Text>
            </View>
            <View style={styles.descriptionBox}>
              <Text style={styles.detailLabel}>Captured content snapshot</Text>
              {Object.entries(selected.target_snapshot ?? {}).map(([key, value]) => (
                <View key={key} style={styles.snapshotRow}>
                  <Text style={styles.snapshotKey}>{humanize(key)}</Text>
                  <Text style={styles.snapshotValue}>
                    {typeof value === 'string' ? value : JSON.stringify(value)}
                  </Text>
                </View>
              ))}
            </View>
            {selected.resolution_note ? (
              <View style={styles.resolutionBox}>
                <Text style={styles.detailLabel}>Resolution</Text>
                <Text style={styles.descriptionText}>{selected.resolution_note}</Text>
                <Text style={styles.cardDate}>{formatDateTime(selected.resolved_at)}</Text>
              </View>
            ) : null}
            {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
          </View>
        ) : null}
      </AdminDialog>

      <AdminDialog
        visible={Boolean(resolutionMode)}
        title={resolutionMode === 'actioned' ? 'Record action taken' : 'Dismiss report'}
        subtitle={selected?.target_label}
        onClose={() => setResolutionMode(null)}
        maxWidth={560}
        footer={
          <>
            <SmallButton
              label="Cancel"
              onPress={() => setResolutionMode(null)}
              disabled={actionLoading}
            />
            <SmallButton
              label={actionLoading ? 'Saving…' : 'Confirm resolution'}
              tone={resolutionMode === 'actioned' ? 'primary' : 'danger'}
              disabled={actionLoading}
              onPress={() =>
                selected && resolutionMode && updateStatus(selected, resolutionMode, resolutionNote)
              }
            />
          </>
        }
      >
        <View style={styles.resolutionForm}>
          <Text style={styles.detailLabel}>Resolution note</Text>
          <TextInput
            value={resolutionNote}
            onChangeText={setResolutionNote}
            multiline
            placeholder="Document what was reviewed and why this outcome was selected"
            placeholderTextColor="#A1A9A4"
            style={styles.textarea}
          />
          <Text style={styles.formHint}>
            This note becomes part of the administrator audit trail.
          </Text>
          {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
        </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
  },
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
    minWidth: 180,
    maxWidth: 330,
    minHeight: 118,
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
    marginBottom: 10,
  },
  statLabel: { fontFamily: 'mon-sb', fontSize: 9, color: '#7B857E' },
  statValue: { fontFamily: 'mon-b', fontSize: 23, color: '#202B24', marginTop: 4 },
  controls: { gap: 13, marginBottom: 16 },
  filters: { flexDirection: 'row', gap: 8 },
  filter: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterActive: { backgroundColor: '#E8F7ED', borderColor: '#A9DEB9' },
  filterText: { fontFamily: 'mon-sb', fontSize: 9, color: '#737D77' },
  filterTextActive: { color: '#237A3B' },
  searchBox: {
    maxWidth: 520,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 11,
  },
  searchInput: { flex: 1, fontFamily: 'mon', fontSize: 10, color: '#303C35' },
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
  loadingState: { minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontFamily: 'mon', fontSize: 10, color: '#818A84' },
  emptyState: { minHeight: 330, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontFamily: 'mon-b', fontSize: 14, color: '#344039' },
  emptyText: { fontFamily: 'mon', fontSize: 10, color: '#89928C' },
  table: {
    minWidth: 1120,
    borderWidth: 1,
    borderColor: '#E4E9E6',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1EE',
  },
  tableHeader: { minHeight: 42, backgroundColor: '#F3F6F8' },
  tableHeaderText: { fontFamily: 'mon-b', fontSize: 8, color: '#59645D' },
  tableCell: { fontFamily: 'mon', fontSize: 9, color: '#59655D' },
  tableStrong: { fontFamily: 'mon-sb', fontSize: 9, color: '#344039' },
  tableSecondary: { fontFamily: 'mon', fontSize: 8, color: '#909993', marginTop: 3 },
  idColumn: { width: 105 },
  targetColumn: { width: 210 },
  reporterColumn: { width: 190 },
  reasonColumn: { width: 160 },
  dateColumn: { width: 145 },
  statusColumn: { width: 120 },
  actionColumn: { flex: 1, minWidth: 145 },
  personCell: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EEF1EF' },
  avatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EEF1EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    minHeight: 34,
    paddingHorizontal: 13,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#D8DEDA',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  buttonDanger: { backgroundColor: '#FFF4F3', borderColor: '#F4C7C3' },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontFamily: 'mon-sb', fontSize: 9, color: '#626D66' },
  buttonTextPrimary: { color: '#FFFFFF' },
  buttonTextDanger: { color: '#B42318' },
  cards: { gap: 10 },
  card: { padding: 14, borderWidth: 1, borderColor: '#E3E8E5', borderRadius: 13, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardCopy: { flex: 1 },
  cardTitle: { fontFamily: 'mon-sb', fontSize: 11, color: '#344039' },
  cardMeta: { fontFamily: 'mon', fontSize: 8, color: '#89928C', marginTop: 4 },
  cardDetails: { fontFamily: 'mon', fontSize: 9, lineHeight: 15, color: '#626D66' },
  cardDate: { fontFamily: 'mon', fontSize: 8, color: '#969E99' },
  detailsContent: { gap: 18 },
  detailsHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  targetIcon: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: '#E8F7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsHeaderCopy: { flex: 1 },
  detailsTitle: { fontFamily: 'mon-b', fontSize: 18, color: '#26322B' },
  detailsMeta: { fontFamily: 'mon', fontSize: 9, color: '#858E88', marginTop: 4 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailCell: {
    flex: 1,
    minWidth: 180,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E1E6E3',
    borderRadius: 11,
  },
  detailLabel: { fontFamily: 'mon-sb', fontSize: 8, color: '#7A847D', marginBottom: 6 },
  detailValue: { fontFamily: 'mon-sb', fontSize: 10, color: '#344039' },
  descriptionBox: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#E1E6E3',
    borderRadius: 11,
    backgroundColor: '#FBFCFB',
  },
  descriptionText: { fontFamily: 'mon', fontSize: 10, lineHeight: 17, color: '#4E5A52' },
  snapshotRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1EF',
  },
  snapshotKey: { width: 140, fontFamily: 'mon-sb', fontSize: 8, color: '#7B857E' },
  snapshotValue: { flex: 1, fontFamily: 'mon', fontSize: 8, color: '#4E5A52' },
  resolutionBox: { padding: 14, borderRadius: 11, backgroundColor: '#EAF7EE' },
  actionError: { fontFamily: 'mon-sb', fontSize: 9, color: '#B42318' },
  resolutionForm: { gap: 8 },
  textarea: {
    minHeight: 130,
    padding: 13,
    borderWidth: 1,
    borderColor: '#D8DEDA',
    borderRadius: 10,
    fontFamily: 'mon',
    fontSize: 10,
    color: '#303B34',
    textAlignVertical: 'top',
  },
  formHint: { fontFamily: 'mon', fontSize: 8, color: '#89928C' },
});
