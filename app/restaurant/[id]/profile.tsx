import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import VerifiedBadge from '@/src/components/feedback/VerifiedBadge';
import { images } from '@/src/constants/images';
import { useCustomerLocation } from '@/src/context/CustomerLocationContext';
import { formatRating } from '@/src/utils/ratings';
import {
  describeOpenState,
  type RestaurantProfilePayload,
  type RestaurantReview,
} from '@/src/utils/restaurantProfile';

type SortKey = 'recent' | 'highest' | 'lowest';
type StarFilter = 'all' | 1 | 2 | 3 | 4 | 5;

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Most recent' },
  { key: 'highest', label: 'Highest rated' },
  { key: 'lowest', label: 'Lowest rated' },
];

const relativeTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) {
    const hours = Math.floor(diffMs / 3600000);
    return hours <= 0 ? 'Just now' : `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
};

export default function RestaurantProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const restaurantId = Array.isArray(id) ? id[0] : id;
  const { location } = useCustomerLocation();

  const [data, setData] = useState<RestaurantProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('recent');
  const [starFilter, setStarFilter] = useState<StarFilter>('all');

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const params = location
        ? `?lat=${encodeURIComponent(location.latitude)}&lng=${encodeURIComponent(location.longitude)}`
        : '';
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/id/${restaurantId}/profile${params}`
      );
      const json = (await response.json().catch(() => ({}))) as RestaurantProfilePayload & {
        error?: string;
      };
      if (!response.ok || !json.profile) {
        throw new Error(json.error ?? 'This restaurant profile is not available.');
      }
      setData(json);
    } catch (error) {
      console.error('Error fetching restaurant profile:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, location]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const visibleReviews = useMemo(() => {
    if (!data) return [];
    const filtered =
      starFilter === 'all'
        ? data.reviews
        : data.reviews.filter(review => review.rating === starFilter);
    const sorted = [...filtered];
    if (sort === 'recent') {
      sorted.sort(
        (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      );
    } else if (sort === 'highest') {
      sorted.sort((a, b) => b.rating - a.rating);
    } else {
      sorted.sort((a, b) => a.rating - b.rating);
    }
    return sorted;
  }, [data, sort, starFilter]);

  if (loading) {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.centered}>
          <Ionicons name="restaurant-outline" size={44} color="#9AA3AB" />
          <Text style={styles.stateText}>This restaurant profile could not be loaded.</Text>
          <TouchableOpacity style={styles.stateButton} onPress={() => router.back()}>
            <Text style={styles.stateButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { profile, openingHours, achievements, cuisines, topPicks, reviews, distanceLabel } = data;
  const openState = describeOpenState(openingHours);
  const displayName = profile.restaurant_name || profile.full_name || 'Home restaurant';
  const ratingAverage = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;
  const histogram = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(review => review.rating === star).length,
  }));
  const maxBucket = Math.max(1, ...histogram.map(bucket => bucket.count));
  const hasAchievements = Object.values(achievements).some(Boolean);

  const renderStars = (rating: number, size = 13) => (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map(star => (
        <Ionicons
          key={star}
          name={star <= rating ? 'star' : 'star-outline'}
          size={size}
          color="#F5B700"
        />
      ))}
    </View>
  );

  const renderReview = (review: RestaurantReview) => (
    <View key={review.id} style={styles.reviewRow}>
      <View style={styles.reviewAvatar}>
        <Text style={styles.reviewAvatarText}>{review.reviewerName.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.reviewBody}>
        <Text style={styles.reviewName}>{review.reviewerName}</Text>
        <View style={styles.reviewMetaRow}>
          {renderStars(review.rating)}
          {review.created_at ? (
            <Text style={styles.reviewTime}>{relativeTime(review.created_at)}</Text>
          ) : null}
        </View>
        {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {displayName}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <Image
            source={profile.profile_image ? { uri: profile.profile_image } : images.templateAvatar}
            style={styles.avatar}
          />
          <View style={styles.titleCopy}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{displayName}</Text>
              {profile.is_verified ? <VerifiedBadge size={20} /> : null}
            </View>
            {cuisines.length > 0 ? (
              <Text style={styles.cuisines}>{cuisines.join(', ')}</Text>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          style={styles.detailCard}
          onPress={() =>
            router.push({ pathname: '/restaurant/[id]/details', params: { id: profile.id } })
          }
        >
          <View style={styles.detailSegment}>
            <Text style={[styles.openText, !openState.open && styles.closedText]}>
              {openState.open ? 'Open' : 'Closed'}
            </Text>
            <Text style={styles.detailHint}>{openState.detail}</Text>
          </View>
          {hasAchievements ? (
            <View style={[styles.detailSegment, styles.detailSegmentBordered]}>
              <Ionicons name="shield-checkmark" size={21} color="#2E7D32" />
              <Text style={styles.detailHint}>Food safety</Text>
            </View>
          ) : null}
          {distanceLabel ? (
            <View style={[styles.detailSegment, styles.detailSegmentBordered]}>
              <Ionicons name="location-outline" size={20} color="#333B36" />
              <Text style={styles.detailHint}>{distanceLabel}</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={20} color="#5F6368" />
        </TouchableOpacity>

        <View style={styles.ratingBlock}>
          <View style={styles.ratingSummary}>
            <Text style={styles.ratingBig}>{formatRating(ratingAverage)}</Text>
            {renderStars(Math.round(ratingAverage), 16)}
            <Text style={styles.ratingCount}>
              {reviews.length} rating{reviews.length === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.histogram}>
            {histogram.map(bucket => (
              <View key={bucket.star} style={styles.histogramRow}>
                <Text style={styles.histogramStar}>{bucket.star}</Text>
                <View style={styles.histogramTrack}>
                  <View
                    style={[
                      styles.histogramFill,
                      { width: `${(bucket.count / maxBucket) * 100}%` },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>

        {topPicks.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Top picks</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.picksRow}
            >
              {topPicks.map(pick => (
                <TouchableOpacity
                  key={pick.id}
                  style={styles.pickCard}
                  activeOpacity={0.8}
                  onPress={() =>
                    router.navigate({
                      pathname: '/restaurant/[id]',
                      params: { id: profile.id, dish: pick.id },
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Order ${pick.title}`}
                >
                  <Image
                    source={pick.image_url ? { uri: pick.image_url } : images.templateMeal}
                    style={styles.pickImage}
                  />
                  {pick.badge ? (
                    <View style={styles.pickBadge}>
                      <Ionicons name="ribbon" size={11} color="#2E7D32" />
                      <Text style={styles.pickBadgeText}>{pick.badge}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.pickTitle} numberOfLines={2}>
                    {pick.title}
                  </Text>
                  <Text style={styles.pickPrice}>RM {Number(pick.price).toFixed(2)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Reviews</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {SORTS.map(option => (
            <TouchableOpacity
              key={option.key}
              style={[styles.filterChip, sort === option.key && styles.filterChipActive]}
              onPress={() => setSort(option.key)}
            >
              <Ionicons
                name="swap-vertical"
                size={13}
                color={sort === option.key ? '#00794F' : '#5F6368'}
              />
              <Text
                style={[styles.filterChipText, sort === option.key && styles.filterChipTextActive]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {(['all', 5, 4, 3, 2, 1] as StarFilter[]).map(value => (
            <TouchableOpacity
              key={String(value)}
              style={[styles.filterChip, starFilter === value && styles.filterChipActive]}
              onPress={() => setStarFilter(value)}
            >
              {value !== 'all' ? <Ionicons name="star" size={12} color="#F5B700" /> : null}
              <Text
                style={[
                  styles.filterChipText,
                  starFilter === value && styles.filterChipTextActive,
                ]}
              >
                {value === 'all' ? 'All ratings' : `${value}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {visibleReviews.length === 0 ? (
          <View style={styles.emptyReviews}>
            <Ionicons name="chatbubble-ellipses-outline" size={30} color="#A5ADA8" />
            <Text style={styles.stateText}>
              {reviews.length === 0
                ? 'No reviews yet — order and be the first to review.'
                : 'No reviews match this filter.'}
            </Text>
          </View>
        ) : (
          visibleReviews.map(renderReview)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E6E4',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  content: { padding: 20, paddingBottom: 44 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  avatar: { width: 58, height: 58, borderRadius: 14, backgroundColor: '#EEF2EF' },
  titleCopy: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontSize: 21, fontWeight: '800', color: '#1A1A1A' },
  cuisines: { fontSize: 13, color: '#5F6368', marginTop: 4 },
  detailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E1E5E1',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 22,
  },
  detailSegment: { flex: 1, alignItems: 'center', gap: 3 },
  detailSegmentBordered: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#DCE0DC',
  },
  openText: { fontSize: 15, fontWeight: '800', color: '#2E7D32' },
  closedText: { color: '#C62828' },
  detailHint: { fontSize: 12, color: '#5F6368' },
  ratingBlock: { flexDirection: 'row', gap: 24, marginBottom: 26 },
  ratingSummary: { alignItems: 'flex-start', gap: 5 },
  ratingBig: { fontSize: 40, fontWeight: '800', color: '#1A1A1A' },
  ratingCount: { fontSize: 12, color: '#8B928D' },
  starsRow: { flexDirection: 'row', gap: 2 },
  histogram: { flex: 1, justifyContent: 'center', gap: 5 },
  histogramRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  histogramStar: { width: 10, fontSize: 11, color: '#5F6368', textAlign: 'center' },
  histogramTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EEF1EE',
    overflow: 'hidden',
  },
  histogramFill: { height: 6, borderRadius: 3, backgroundColor: '#F5B700' },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: '#1A1A1A', marginBottom: 14 },
  picksRow: { gap: 12, paddingBottom: 26, paddingRight: 20 },
  pickCard: { width: 132 },
  pickImage: { width: 132, height: 96, borderRadius: 12, backgroundColor: '#EEF2EF' },
  pickBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 7,
  },
  pickBadgeText: { fontSize: 10, fontWeight: '800', color: '#2E7D32' },
  pickTitle: { fontSize: 13, fontWeight: '600', color: '#1A1A1A', marginTop: 6, lineHeight: 18 },
  pickPrice: { fontSize: 12, color: '#5F6368', marginTop: 3 },
  filterRow: { gap: 8, paddingBottom: 12, paddingRight: 20 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#DDE1DE',
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  filterChipActive: { borderColor: '#00A651', backgroundColor: '#E8F5E9' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#5F6368' },
  filterChipTextActive: { color: '#00794F' },
  reviewRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  reviewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E7F1FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewAvatarText: { fontSize: 16, fontWeight: '800', color: '#1565C0' },
  reviewBody: { flex: 1 },
  reviewName: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  reviewMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  reviewTime: { fontSize: 12, color: '#8B928D' },
  reviewComment: { fontSize: 14, color: '#333B36', lineHeight: 20, marginTop: 7 },
  emptyReviews: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  stateText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 260,
    marginTop: 6,
  },
  stateButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 20,
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  stateButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
