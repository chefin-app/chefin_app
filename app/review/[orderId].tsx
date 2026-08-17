import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';

interface OrderDetails {
  id: string;
  quantity: number;
  scheduled_date: string;
  status: string;
  listings: {
    title: string;
    image_url: string | null;
    profiles: { restaurant_name: string | null; full_name: string } | null;
  } | null;
}

interface ExistingReview {
  id: string;
  rating: number;
  comment: string | null;
}

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent!'];

/**
 * Review a dish from a completed order. Reached by tapping the "How was your
 * food?" notification the buyer gets when the cook completes their order.
 * Submission goes through the backend, which enforces verified-purchase rules
 * (own order, completed, one review per order).
 */
export default function ReviewOrderScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { user, session, canMutate } = useAuth();

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [existingReview, setExistingReview] = useState<ExistingReview | null>(null);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      try {
        // The customer owns the order row under RLS, so this read is theirs.
        const [{ data: orderRow, error: orderErr }, reviewRes] = await Promise.all([
          supabase
            .from('orders')
            .select(
              'id, quantity, scheduled_date, status, listings(title, image_url, profiles(restaurant_name, full_name))'
            )
            .eq('id', orderId)
            .single(),
          fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/reviews/order/${orderId}`, {
            headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
          }).catch(() => null),
        ]);
        if (cancelled) return;
        if (orderErr) throw orderErr;
        setOrder(orderRow as unknown as OrderDetails);

        if (reviewRes?.ok) {
          const { review } = await reviewRes.json();
          if (!cancelled && review) setExistingReview(review);
        }
      } catch (e: any) {
        console.warn('Could not load order for review', e.message ?? e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, session?.access_token]);

  const handleSubmit = async () => {
    if (rating < 1) {
      Alert.alert('Pick a rating', 'Tap a star to rate your dish.');
      return;
    }
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to leave a review.');
      return;
    }
    if (!canMutate) {
      Alert.alert(
        'Read-only account',
        'Reviews cannot be submitted while your account is restricted.'
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          userId: user.id,
          orderId,
          rating,
          comment: comment.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        Alert.alert('Already reviewed', 'You have already reviewed this order. Thank you!', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
      if (!res.ok) {
        throw new Error(body?.error ?? 'Could not submit your review.');
      }
      Alert.alert('Thanks for your review!', 'Your rating helps other foodies decide.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Could not submit review', e.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const listing = order?.listings;
  const restaurantName =
    listing?.profiles?.restaurant_name || listing?.profiles?.full_name || 'the cook';

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rate your order</Text>
        <View style={{ width: 40 }} />
      </View>

      {!order ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>We couldn&apos;t find this order.</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* What's being reviewed */}
            <View style={styles.dishCard}>
              {listing?.image_url ? (
                <Image source={{ uri: listing.image_url }} style={styles.dishImage} />
              ) : (
                <View style={[styles.dishImage, styles.dishImagePlaceholder]} />
              )}
              <View style={styles.dishInfo}>
                <Text style={styles.dishTitle} numberOfLines={2}>
                  {order.quantity}× {listing?.title ?? 'Dish'}
                </Text>
                <Text style={styles.dishSubtitle}>from {restaurantName}</Text>
              </View>
            </View>

            {existingReview ? (
              // Already reviewed — show what they gave, read-only.
              <View style={styles.reviewedCard}>
                <Ionicons name="checkmark-circle" size={40} color="#4CAF50" />
                <Text style={styles.reviewedTitle}>You reviewed this order</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <Ionicons
                      key={star}
                      name={star <= existingReview.rating ? 'star' : 'star-outline'}
                      size={28}
                      color="#FFB800"
                    />
                  ))}
                </View>
                {existingReview.comment ? (
                  <Text style={styles.reviewedComment}>“{existingReview.comment}”</Text>
                ) : null}
              </View>
            ) : (
              <>
                {/* Star rating */}
                <Text style={styles.sectionLabel}>YOUR RATING</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <TouchableOpacity key={star} onPress={() => setRating(star)} hitSlop={8}>
                      <Ionicons
                        name={star <= rating ? 'star' : 'star-outline'}
                        size={40}
                        color={star <= rating ? '#FFB800' : '#CCC'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.ratingLabel}>{RATING_LABELS[rating] || ' '}</Text>

                {/* Comment */}
                <Text style={styles.sectionLabel}>YOUR REVIEW (OPTIONAL)</Text>
                <TextInput
                  style={styles.commentInput}
                  placeholder="How was the taste, portion, packaging…?"
                  placeholderTextColor="#999"
                  value={comment}
                  onChangeText={t => setComment(t.slice(0, 500))}
                  multiline
                  submitBehavior="newline"
                  textAlignVertical="top"
                />
                <Text style={styles.charCount}>{comment.length}/500</Text>

                <TouchableOpacity
                  style={[styles.submitButton, (rating < 1 || submitting) && styles.submitDisabled]}
                  onPress={handleSubmit}
                  disabled={rating < 1 || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitText}>Submit review</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  errorText: { fontSize: 16, color: '#888' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  backButton: { padding: 8, width: 40 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  content: { padding: 20 },

  dishCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9FC',
    borderRadius: 16,
    padding: 12,
    marginBottom: 28,
    gap: 12,
  },
  dishImage: { width: 64, height: 64, borderRadius: 12 },
  dishImagePlaceholder: { backgroundColor: '#E5E5E5' },
  dishInfo: { flex: 1 },
  dishTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  dishSubtitle: { fontSize: 13, color: '#666' },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 8,
  },
  ratingLabel: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#B26A00',
    marginBottom: 24,
    minHeight: 18,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 120,
    color: '#1A1A1A',
  },
  charCount: {
    fontSize: 11,
    color: '#AAA',
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitDisabled: { backgroundColor: '#a5d6a7' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  reviewedCard: {
    alignItems: 'center',
    backgroundColor: '#F7F9FC',
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  reviewedTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  reviewedComment: {
    fontSize: 14,
    color: '#555',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
  },
});
