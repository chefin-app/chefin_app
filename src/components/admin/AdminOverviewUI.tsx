import React, { useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  type ViewStyle,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { OverviewPeriod } from '@/src/admin/types';

export const ADMIN_COLORS = {
  green: '#4CAF50',
  blue: '#438BF5',
  teal: '#24BFB1',
  amber: '#F4C44E',
  orange: '#FF8642',
  red: '#F56C73',
  slate: '#667085',
  pale: '#E7ECE9',
};

export function AdminPanel({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
  color,
  width,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  width: number;
}) {
  return (
    <View style={[styles.metricCard, { width }]}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={21} color={color} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

const PERIODS: Array<{ key: OverviewPeriod; label: string }> = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: '1y', label: '1Y' },
];

export function PeriodSelector({
  value,
  onChange,
}: {
  value: OverviewPeriod;
  onChange: (period: OverviewPeriod) => void;
}) {
  return (
    <View style={styles.periodSelector}>
      {PERIODS.map(period => (
        <TouchableOpacity
          key={period.key}
          style={[styles.periodButton, value === period.key && styles.periodButtonActive]}
          onPress={() => onChange(period.key)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === period.key }}
        >
          <Text style={[styles.periodText, value === period.key && styles.periodTextActive]}>
            {period.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const formatCompactCurrency = (value: number): string =>
  new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    notation: value >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(value);

export function SalesChart({
  data,
}: {
  data: Array<{ label: string; value: number; orders: number }>;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const maxValue = Math.max(...data.map(point => point.value), 1);
  const selected = selectedIndex === null ? null : data[selectedIndex];

  return (
    <View>
      <View style={styles.chartSummary}>
        <View>
          <Text style={styles.chartSummaryLabel}>Recorded order value</Text>
          <Text style={styles.chartSummaryValue}>
            {formatCompactCurrency(data.reduce((sum, point) => sum + point.value, 0))}
          </Text>
        </View>
        {selected && (
          <View style={styles.chartTooltip}>
            <Text style={styles.chartTooltipValue}>{formatCompactCurrency(selected.value)}</Text>
            <Text style={styles.chartTooltipLabel}>
              {selected.label} · {selected.orders} order{selected.orders === 1 ? '' : 's'}
            </Text>
          </View>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chartScroll}
      >
        {data.map((point, index) => {
          const barHeight = point.value > 0 ? Math.max(9, (point.value / maxValue) * 168) : 4;
          const selectedBar = selectedIndex === index;
          return (
            <TouchableOpacity
              key={`${point.label}-${index}`}
              style={styles.chartColumn}
              onPress={() => setSelectedIndex(selectedBar ? null : index)}
              activeOpacity={0.8}
              accessibilityLabel={`${point.label}: ${formatCompactCurrency(point.value)}, ${point.orders} orders`}
            >
              <View style={styles.chartTrack}>
                <View
                  style={[
                    styles.chartBar,
                    { height: barHeight },
                    selectedBar && styles.chartBarSelected,
                  ]}
                >
                  <View style={[styles.chartDot, selectedBar && styles.chartDotSelected]} />
                </View>
              </View>
              <Text style={[styles.chartLabel, selectedBar && styles.chartLabelSelected]}>
                {point.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

type DonutSegment = { label: string; value: number; color: string };
type WebGradientStyle = ViewStyle & { backgroundImage?: string };

const getConicGradient = (segments: DonutSegment[]): WebGradientStyle => {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) {
    return { backgroundImage: `conic-gradient(${ADMIN_COLORS.pale} 0% 100%)` };
  }
  let cursor = 0;
  const stops = segments.map(segment => {
    const start = cursor;
    cursor += (segment.value / total) * 100;
    return `${segment.color} ${start.toFixed(1)}% ${cursor.toFixed(1)}%`;
  });
  return { backgroundImage: `conic-gradient(${stops.join(', ')})` };
};

export function DonutBreakdown({
  title,
  segments,
  width,
}: {
  title: string;
  segments: DonutSegment[];
  width: number;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const gradient = useMemo(() => getConicGradient(segments), [segments]);
  const leadingColor = segments.find(segment => segment.value > 0)?.color ?? ADMIN_COLORS.pale;

  return (
    <View style={[styles.donutCard, { width }]}>
      <View
        style={[
          styles.donut,
          { borderColor: leadingColor },
          Platform.OS === 'web' && styles.donutWeb,
          Platform.OS === 'web' && gradient,
        ]}
      >
        <View style={styles.donutInner}>
          <Text style={styles.donutTotal}>{total.toLocaleString('en-MY')}</Text>
          <Text style={styles.donutTotalLabel}>total</Text>
        </View>
      </View>
      <Text style={styles.donutTitle}>{title}</Text>
      <View style={styles.legend}>
        {segments.map(segment => (
          <View key={segment.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: segment.color }]} />
            <Text style={styles.legendLabel}>{segment.label}</Text>
            <Text style={styles.legendValue}>{segment.value.toLocaleString('en-MY')}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const STATUS_META: Record<string, { label: string; color: string; background: string }> = {
  active: { label: 'Active', color: '#237A3B', background: '#DDF6E5' },
  suspended: { label: 'Suspended', color: '#B42318', background: '#FEE4E2' },
  deactivated: { label: 'Deactivated', color: '#667085', background: '#EEF0F3' },
  completed: { label: 'Completed', color: '#237A3B', background: '#DDF6E5' },
  delivered: { label: 'Delivered', color: '#237A3B', background: '#DDF6E5' },
  ready: { label: 'Ready', color: '#175CD3', background: '#E8F1FF' },
  confirmed: { label: 'Confirmed', color: '#175CD3', background: '#E8F1FF' },
  pending: { label: 'Pending', color: '#8B6508', background: '#FFF1C2' },
  cancelled: { label: 'Cancelled', color: '#B42318', background: '#FEE4E2' },
  rejected: { label: 'Rejected', color: '#B42318', background: '#FEE4E2' },
  approved: { label: 'Approved', color: '#237A3B', background: '#DDF6E5' },
  draft: { label: 'Draft', color: '#667085', background: '#EEF0F3' },
  reverification_required: {
    label: 'Reverification required',
    color: '#9A6700',
    background: '#FFF1C2',
  },
  not_submitted: { label: 'Not submitted', color: '#667085', background: '#EEF0F3' },
  more_info_requested: {
    label: 'More info needed',
    color: '#175CD3',
    background: '#E8F1FF',
  },
};

export function AdminStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const meta = STATUS_META[normalized] ?? {
    label: normalized.replace(/_/g, ' ').replace(/^\w/, letter => letter.toUpperCase()),
    color: '#475467',
    background: '#EEF0F3',
  };
  return (
    <View style={[styles.statusBadge, { backgroundColor: meta.background }]}>
      <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
      <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8ECE9',
    padding: 22,
    shadowColor: '#152219',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.045,
    shadowRadius: 18,
    elevation: 2,
  },
  metricCard: {
    minHeight: 154,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7ECE8',
    padding: 17,
  },
  metricIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  metricLabel: { fontFamily: 'mon-sb', fontSize: 10, color: '#77817B', marginBottom: 6 },
  metricValue: { fontFamily: 'mon-b', fontSize: 22, color: '#1F2923', marginBottom: 4 },
  metricDetail: { fontFamily: 'mon', fontSize: 9, lineHeight: 14, color: '#9AA29D' },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: '#F1F4F2',
    borderRadius: 10,
    padding: 3,
  },
  periodButton: {
    minWidth: 38,
    height: 30,
    paddingHorizontal: 9,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodButtonActive: { backgroundColor: '#FFFFFF' },
  periodText: { fontFamily: 'mon-sb', fontSize: 9, color: '#8A938D' },
  periodTextActive: { color: '#237A3B' },
  chartSummary: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  chartSummaryLabel: { fontFamily: 'mon', fontSize: 10, color: '#8A938D', marginBottom: 5 },
  chartSummaryValue: { fontFamily: 'mon-b', fontSize: 24, color: '#1E2922' },
  chartTooltip: {
    backgroundColor: '#E8F7ED',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'flex-end',
  },
  chartTooltipValue: { fontFamily: 'mon-b', fontSize: 11, color: '#237A3B' },
  chartTooltipLabel: { fontFamily: 'mon', fontSize: 8, color: '#5F7466', marginTop: 2 },
  chartScroll: { minWidth: '100%', gap: 8, paddingTop: 6 },
  chartColumn: { width: 62, alignItems: 'center' },
  chartTrack: {
    height: 184,
    width: 28,
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E9E6',
  },
  chartBar: {
    width: 20,
    minHeight: 4,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    backgroundColor: '#CDE5FF',
    alignItems: 'center',
  },
  chartBarSelected: { backgroundColor: '#4CAF50' },
  chartDot: {
    position: 'absolute',
    top: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#438BF5',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  chartDotSelected: { backgroundColor: '#1D894D' },
  chartLabel: { fontFamily: 'mon', fontSize: 8, color: '#9AA29D', marginTop: 8 },
  chartLabelSelected: { fontFamily: 'mon-sb', color: '#237A3B' },
  donutCard: { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8 },
  donut: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  donutWeb: { borderWidth: 0 },
  donutInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutTotal: { fontFamily: 'mon-b', fontSize: 16, color: '#1F2923' },
  donutTotalLabel: { fontFamily: 'mon', fontSize: 8, color: '#9AA29D', marginTop: 1 },
  donutTitle: {
    fontFamily: 'mon-b',
    fontSize: 11,
    color: '#2F3B34',
    textAlign: 'center',
    marginBottom: 12,
  },
  legend: { alignSelf: 'stretch', gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  legendLabel: { flex: 1, fontFamily: 'mon', fontSize: 8, color: '#77817B' },
  legendValue: { fontFamily: 'mon-sb', fontSize: 8, color: '#46524B' },
  statusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 99,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontFamily: 'mon-sb', fontSize: 8 },
});
