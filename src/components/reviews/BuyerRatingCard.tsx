import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

type WrittenReview = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
};

type BuyerRatingSummary = {
  average: number | null;
  count: number;
  writtenReviewCount: number;
  recentReviews: WrittenReview[];
};

export default function BuyerRatingCard({
  orderId,
  accessToken,
}: {
  orderId: string;
  accessToken: string | undefined;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState<BuyerRatingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(
      `${process.env.EXPO_PUBLIC_API_URL}/api/customer-reviews/customer-summary/${orderId}?limit=3`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
      .then(async response => {
        const body = (await response.json().catch(() => ({}))) as BuyerRatingSummary & {
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? 'Buyer rating is unavailable.');
        if (!cancelled) setSummary(body);
      })
      .catch(error => {
        if (!cancelled) console.warn('Could not load buyer rating', error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, orderId]);

  if (loading) {
    return (
      <View style={[styles.card, styles.loadingCard]}>
        <ActivityIndicator size="small" color="#7A5A00" />
        <Text style={styles.loadingText}>Loading buyer rating…</Text>
      </View>
    );
  }
  if (!summary) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="person-outline" size={21} color="#765600" />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.label}>BUYER RATING</Text>
          {summary.average == null ? (
            <Text style={styles.newBuyer}>New buyer · no pickup reviews yet</Text>
          ) : (
            <View style={styles.scoreRow}>
              <Ionicons name="star" size={17} color="#E5A900" />
              <Text style={styles.score}>{summary.average.toFixed(1)}</Text>
              <Text style={styles.count}>
                from {summary.count} pickup review{summary.count === 1 ? '' : 's'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {summary.count > 0 && (
        <TouchableOpacity style={styles.expandButton} onPress={() => setExpanded(value => !value)}>
          <Text style={styles.expandText}>{expanded ? 'Hide reviews' : 'See recent reviews'}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color="#237A3B" />
        </TouchableOpacity>
      )}

      {expanded && (
        <View style={styles.reviews}>
          {summary.recentReviews.length === 0 ? (
            <Text style={styles.emptyReviews}>No written reviews yet.</Text>
          ) : (
            summary.recentReviews.map(review => (
              <View key={review.id} style={styles.review}>
                <View style={styles.reviewMeta}>
                  <Text style={styles.reviewScore}>★ {review.rating.toFixed(1)}</Text>
                  <Text style={styles.reviewDate}>
                    {new Date(review.createdAt).toLocaleDateString('en-MY')}
                  </Text>
                </View>
                <Text style={styles.reviewComment}>{review.comment}</Text>
              </View>
            ))
          )}
          {summary.writtenReviewCount > 3 && (
            <TouchableOpacity
              style={styles.viewAllButton}
              onPress={() =>
                router.push({
                  pathname: '/(cook)/customer-reviews/[orderId]',
                  params: { orderId },
                })
              }
            >
              <Text style={styles.viewAllText}>View all {summary.writtenReviewCount} reviews</Text>
              <Ionicons name="chevron-forward" size={16} color="#237A3B" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#E9D89B',
    backgroundColor: '#FFFBEF',
    borderRadius: 16,
    padding: 15,
    marginBottom: 18,
  },
  loadingCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { color: '#6F623C', fontSize: 13, fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F7EAC0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1 },
  label: { fontSize: 10, color: '#756943', fontWeight: '800', letterSpacing: 0.5 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  score: { fontSize: 17, color: '#3D3212', fontWeight: '800' },
  count: { fontSize: 12, color: '#716747', marginLeft: 3 },
  newBuyer: { fontSize: 14, color: '#4E472F', fontWeight: '700', marginTop: 3 },
  expandButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2D39C',
    paddingTop: 9,
  },
  expandText: { color: '#237A3B', fontSize: 13, fontWeight: '800' },
  reviews: { gap: 10 },
  review: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2D39C', paddingTop: 10 },
  reviewMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewScore: { color: '#9B7000', fontSize: 12, fontWeight: '800' },
  reviewDate: { color: '#8A826A', fontSize: 11 },
  reviewComment: { color: '#3F3A2B', fontSize: 13, lineHeight: 19, marginTop: 5 },
  emptyReviews: { color: '#77705C', fontSize: 13, paddingTop: 4 },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  viewAllText: { color: '#237A3B', fontSize: 13, fontWeight: '800' },
});
