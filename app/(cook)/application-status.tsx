import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCookApplication } from '@/src/hooks/useCookApplication';

function humanizeStatus(value: string | null) {
  if (!value || value === 'not_submitted') return 'Not submitted';
  return value
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function StatusRow({ label, value }: { label: string; value: string | null }) {
  const approved = value === 'approved';
  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusIcon, approved && styles.statusIconApproved]}>
        <Ionicons
          name={approved ? 'checkmark' : 'time-outline'}
          size={17}
          color={approved ? '#237A3B' : '#8A6100'}
        />
      </View>
      <View style={styles.statusCopy}>
        <Text style={styles.statusLabel}>{label}</Text>
        <Text style={styles.statusValue}>{humanizeStatus(value)}</Text>
      </View>
    </View>
  );
}

export default function ApplicationStatusScreen() {
  const router = useRouter();
  const application = useCookApplication();

  if (application.loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </SafeAreaView>
    );
  }

  const rejected = application.status === 'rejected';
  const pending = application.status === 'pending';
  const title = rejected
    ? 'Your application needs changes'
    : pending
      ? 'Your application is under review'
      : application.status === 'approved'
        ? 'Your application is approved'
        : 'Cook application status';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Application status</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.heroIcon, rejected && styles.heroIconRejected]}>
          <Ionicons
            name={rejected ? 'document-text-outline' : 'hourglass-outline'}
            size={34}
            color={rejected ? '#B3261E' : '#8A6100'}
          />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>
          {rejected
            ? 'Read the reviewer feedback below, then edit and resubmit your application.'
            : pending
              ? 'No action is needed right now. You can continue building draft dishes while the Chefin team reviews your application.'
              : 'This screen reflects the latest decision on your cook application.'}
        </Text>

        {application.submittedAt && (
          <Text style={styles.submittedAt}>
            Submitted {new Date(application.submittedAt).toLocaleDateString('en-MY')}
          </Text>
        )}

        <View style={styles.card}>
          <StatusRow label="Application" value={application.status} />
          <View style={styles.divider} />
          <StatusRow label="Identity review" value={application.identityStatus} />
          <View style={styles.divider} />
          <StatusRow label="Optional food-safety documents" value={application.complianceStatus} />
        </View>

        {rejected && application.reviewerNote && (
          <View style={styles.feedbackCard}>
            <Text style={styles.feedbackLabel}>Reviewer feedback</Text>
            <Text style={styles.feedbackText}>{application.reviewerNote}</Text>
          </View>
        )}

        {rejected && (
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.8}
            onPress={() => router.push('/start-restaurant?resubmit=1')}
          >
            <Text style={styles.primaryButtonText}>Edit and resubmit</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: 44 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  content: { padding: 24, paddingBottom: 48 },
  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3CD',
  },
  heroIconRejected: { backgroundColor: '#FDECEA' },
  title: { fontSize: 25, lineHeight: 31, fontWeight: '800', color: '#1A1A1A', marginTop: 18 },
  body: { fontSize: 14, lineHeight: 21, color: '#666', marginTop: 8 },
  submittedAt: { fontSize: 12, color: '#888', fontWeight: '600', marginTop: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, marginTop: 24 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  statusIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3CD',
  },
  statusIconApproved: { backgroundColor: '#E8F5E9' },
  statusCopy: { flex: 1 },
  statusLabel: { fontSize: 13, color: '#777' },
  statusValue: { fontSize: 15, color: '#1A1A1A', fontWeight: '700', marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E5E5' },
  feedbackCard: {
    marginTop: 18,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#FDECEA',
    borderWidth: 1,
    borderColor: '#F6C7C3',
  },
  feedbackLabel: { color: '#8C1D18', fontSize: 13, fontWeight: '800' },
  feedbackText: { color: '#5F2120', fontSize: 14, lineHeight: 21, marginTop: 6 },
  primaryButton: {
    marginTop: 24,
    minHeight: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
  },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
