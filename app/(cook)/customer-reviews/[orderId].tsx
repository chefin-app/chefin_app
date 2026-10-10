import React, { useCallback, useEffect, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/src/services/auth-context';
import theme from '@/src/styles/theme';

type WrittenReview = { id: string; rating: number; comment: string; createdAt: string };
type Summary = {
  average: number | null;
  count: number;
  writtenReviewCount: number;
  recentReviews: WrittenReview[];
};

export default function CustomerReviewsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const { session } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId || !session?.access_token) {
      setError('Sign in to view buyer reviews.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/customer-reviews/customer-summary/${orderId}?limit=50`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const body = (await response.json().catch(() => ({}))) as Summary & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Buyer reviews are unavailable.');
      setSummary(body);
      setError(null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Buyer reviews are unavailable.');
    } finally {
      setLoading(false);
    }
  }, [orderId, session?.access_token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Buyer reviews</Text>
        <View style={styles.headerButton} />
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : error || !summary ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={40} color={theme.colors.error} />
          <Text style={styles.errorText}>{error ?? 'Buyer reviews are unavailable.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.scoreCard}>
            <Text style={styles.score}>{summary.average?.toFixed(1) ?? '—'}</Text>
            <Ionicons name="star" size={24} color="#E5A900" />
            <Text style={styles.count}>
              {summary.count} completed pickup review{summary.count === 1 ? '' : 's'}
            </Text>
          </View>
          <Text style={styles.sectionTitle}>Written reviews ({summary.writtenReviewCount})</Text>
          {summary.recentReviews.map(review => (
            <View key={review.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewScore}>★ {review.rating.toFixed(1)}</Text>
                <Text style={styles.reviewDate}>
                  {new Date(review.createdAt).toLocaleDateString('en-MY')}
                </Text>
              </View>
              <Text style={styles.comment}>{review.comment}</Text>
            </View>
          ))}
          {summary.recentReviews.length === 0 && (
            <Text style={styles.empty}>No written reviews yet.</Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.surfaceAlt },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
  errorText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: theme.colors.primaryAction,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: theme.colors.textOnAction, fontWeight: '800' },
  content: { padding: 20, paddingBottom: 40 },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: theme.colors.warningSoft,
    borderRadius: 16,
    padding: 18,
  },
  score: { fontSize: 28, fontWeight: '800', color: '#352B0C' },
  count: { flex: 1, color: '#716747', fontSize: 13, marginLeft: 4 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  reviewCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 15,
    marginBottom: 10,
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  reviewScore: { color: '#9B7000', fontSize: 13, fontWeight: '800' },
  reviewDate: { color: theme.colors.textMuted, fontSize: 12 },
  comment: { color: theme.colors.textStrong, fontSize: 14, lineHeight: 21, marginTop: 8 },
  empty: { color: theme.colors.textSecondary, fontSize: 14 },
});
