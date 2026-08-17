import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/src/services/auth-context';

type ReviewOrder = {
  id: string;
  status: string | null;
  quantity: number;
  scheduledDate: string;
  pickupTime: string | null;
  fulfillmentType: string;
  listingTitle: string;
  listingImageUrl: string | null;
  customerName: string;
  customerImageUrl: string | null;
};

type CustomerReview = {
  id: string;
  punctuality_rating: number;
  communication_rating: number;
  handover_rating: number;
  tags: string[];
  comment: string | null;
  created_at: string;
};

type ReviewPayload = { order: ReviewOrder; review: CustomerReview | null };

type RatingQuestionProps = {
  title: string;
  description: string;
  value: number;
  onChange?: (rating: number) => void;
  readOnly?: boolean;
};

const RATING_LABELS = ['', 'Poor', 'Below expectations', 'Okay', 'Good', 'Excellent'];

const TAGS = [
  { value: 'on_time', label: 'On time', icon: 'time-outline' },
  { value: 'clear_communication', label: 'Clear communication', icon: 'chatbubble-outline' },
  { value: 'smooth_handover', label: 'Smooth handover', icon: 'checkmark-circle-outline' },
  { value: 'late', label: 'Late', icon: 'alarm-outline' },
  { value: 'unreachable', label: 'Unreachable', icon: 'call-outline' },
  { value: 'changed_plan', label: 'Changed plan', icon: 'swap-horizontal-outline' },
  { value: 'disrespectful', label: 'Disrespectful', icon: 'alert-circle-outline' },
  { value: 'unsafe_behaviour', label: 'Safety concern', icon: 'warning-outline' },
] as const;

const CONFLICTING_TAGS: Record<string, string[]> = {
  on_time: ['late'],
  late: ['on_time'],
};

function RatingQuestion({
  title,
  description,
  value,
  onChange,
  readOnly = false,
}: RatingQuestionProps) {
  return (
    <View style={styles.questionCard}>
      <Text style={styles.questionTitle}>{title}</Text>
      <Text style={styles.questionDescription}>{description}</Text>
      <View style={styles.ratingRow}>
        {[1, 2, 3, 4, 5].map(rating => {
          const selected = rating <= value;
          return (
            <TouchableOpacity
              key={rating}
              style={styles.starButton}
              onPress={() => onChange?.(rating)}
              disabled={readOnly}
              accessibilityRole="button"
              accessibilityLabel={`${rating} out of 5`}
              accessibilityState={{ selected: rating === value, disabled: readOnly }}
            >
              <Ionicons
                name={selected ? 'star' : 'star-outline'}
                size={30}
                color={selected ? '#FFB800' : '#C8CDD3'}
              />
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.ratingLabel}>{RATING_LABELS[value] || 'Choose a rating'}</Text>
    </View>
  );
}

export default function ReviewCustomerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const { session, canMutate } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<ReviewOrder | null>(null);
  const [existingReview, setExistingReview] = useState<CustomerReview | null>(null);
  const [punctuality, setPunctuality] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [handover, setHandover] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!orderId || !session?.access_token) {
      setError('Sign in to review this customer.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/customer-reviews/order/${orderId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const body = (await response.json().catch(() => ({}))) as Partial<ReviewPayload> & {
        error?: string;
      };
      if (!response.ok || !body.order) {
        throw new Error(body.error ?? 'The order could not be loaded.');
      }
      setOrder(body.order);
      setExistingReview(body.review ?? null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The order could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [orderId, session?.access_token]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleTag = (tag: string) => {
    setTags(current => {
      if (current.includes(tag)) return current.filter(value => value !== tag);
      const conflicts = new Set(CONFLICTING_TAGS[tag] ?? []);
      return [...current.filter(value => !conflicts.has(value)), tag];
    });
  };

  const submit = async () => {
    if (!orderId || !session?.access_token || submitting) return;
    if (!canMutate) {
      Alert.alert(
        'Read-only account',
        'Reviews cannot be submitted while your account is restricted.'
      );
      return;
    }
    if (!punctuality || !communication || !handover) {
      Alert.alert('Complete every rating', 'Please answer all three questions before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/customer-reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          orderId,
          punctualityRating: punctuality,
          communicationRating: communication,
          handoverRating: handover,
          tags,
          comment: comment.trim() || undefined,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        review?: CustomerReview;
      };
      if (!response.ok) throw new Error(body.error ?? 'The review could not be submitted.');
      if (body.review) setExistingReview(body.review);
      Alert.alert(
        'Review submitted',
        'Your private feedback has been saved and can help Chefin handle future customer interactions.',
        [{ text: 'Done', onPress: () => router.back() }]
      );
    } catch (caught: unknown) {
      Alert.alert(
        'Could not submit review',
        caught instanceof Error ? caught.message : 'Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const punctualityTitle =
    order?.fulfillmentType === 'delivery'
      ? 'Was the customer ready to receive the order?'
      : 'Was the customer punctual?';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review customer</Text>
        <View style={styles.headerButton} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      ) : error || !order ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={44} color="#C62828" />
          <Text style={styles.errorTitle}>Review unavailable</Text>
          <Text style={styles.errorText}>{error ?? 'The order could not be found.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flexOne}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.orderSummary}>
              {order.customerImageUrl ? (
                <Image source={{ uri: order.customerImageUrl }} style={styles.customerAvatar} />
              ) : (
                <View style={styles.customerAvatar}>
                  <Ionicons name="person" size={26} color="#4CAF50" />
                </View>
              )}
              <View style={styles.flexOne}>
                <Text style={styles.customerName}>{order.customerName}</Text>
                <Text style={styles.orderMeta}>
                  {order.quantity}× {order.listingTitle} ·{' '}
                  {order.fulfillmentType === 'delivery' ? 'Delivery' : 'Pickup'}
                </Text>
              </View>
              {order.status === 'completed' ? (
                <View style={styles.completedBadge}>
                  <Text style={styles.completedText}>Completed</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.privacyNote}>
              <Ionicons name="lock-closed-outline" size={17} color="#237A3B" />
              <Text style={styles.privacyText}>
                This is private operational feedback. It is not posted as a public customer rating.
              </Text>
            </View>

            {existingReview ? (
              <>
                <View style={styles.reviewedBanner}>
                  <Ionicons name="checkmark-circle" size={24} color="#2E7D32" />
                  <View style={styles.flexOne}>
                    <Text style={styles.reviewedTitle}>You reviewed this customer</Text>
                    <Text style={styles.reviewedSubtitle}>
                      Submitted {new Date(existingReview.created_at).toLocaleDateString('en-MY')}
                    </Text>
                  </View>
                </View>
                <RatingQuestion
                  title={punctualityTitle}
                  description="Consider whether the customer was ready at the agreed time."
                  value={existingReview.punctuality_rating}
                  readOnly
                />
                <RatingQuestion
                  title="How was the communication?"
                  description="Consider clarity, responsiveness and changes to the plan."
                  value={existingReview.communication_rating}
                  readOnly
                />
                <RatingQuestion
                  title="How was the handover?"
                  description="Consider whether the exchange was smooth, respectful and safe."
                  value={existingReview.handover_rating}
                  readOnly
                />
                {existingReview.tags.length > 0 ? (
                  <View style={styles.savedTags}>
                    {existingReview.tags.map(tag => (
                      <View key={tag} style={styles.savedTag}>
                        <Text style={styles.savedTagText}>
                          {TAGS.find(option => option.value === tag)?.label ?? tag}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {existingReview.comment ? (
                  <View style={styles.savedComment}>
                    <Text style={styles.savedCommentLabel}>PRIVATE NOTE</Text>
                    <Text style={styles.savedCommentText}>{existingReview.comment}</Text>
                  </View>
                ) : null}
              </>
            ) : order.status !== 'completed' ? (
              <View style={styles.centeredInline}>
                <Ionicons name="time-outline" size={38} color="#B26A00" />
                <Text style={styles.errorTitle}>Complete the order first</Text>
                <Text style={styles.errorText}>
                  Customer feedback opens after the order has been marked completed.
                </Text>
              </View>
            ) : (
              <>
                <RatingQuestion
                  title={punctualityTitle}
                  description="Consider whether the customer was ready at the agreed time."
                  value={punctuality}
                  onChange={setPunctuality}
                />
                <RatingQuestion
                  title="How was the communication?"
                  description="Consider clarity, responsiveness and changes to the plan."
                  value={communication}
                  onChange={setCommunication}
                />
                <RatingQuestion
                  title="How was the handover?"
                  description="Consider whether the exchange was smooth, respectful and safe."
                  value={handover}
                  onChange={setHandover}
                />

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Add details (optional)</Text>
                  <Text style={styles.sectionDescription}>
                    Select only what you directly observed during this order.
                  </Text>
                  <View style={styles.tagGrid}>
                    {TAGS.map(tag => {
                      const selected = tags.includes(tag.value);
                      return (
                        <TouchableOpacity
                          key={tag.value}
                          style={[styles.tag, selected && styles.tagSelected]}
                          onPress={() => toggleTag(tag.value)}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                        >
                          <Ionicons
                            name={tag.icon}
                            size={16}
                            color={selected ? '#237A3B' : '#666'}
                          />
                          <Text style={[styles.tagText, selected && styles.tagTextSelected]}>
                            {tag.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput
                    style={styles.commentInput}
                    value={comment}
                    onChangeText={text => setComment(text.slice(0, 500))}
                    placeholder="Add a private note for context"
                    placeholderTextColor="#999"
                    submitBehavior="blurAndSubmit"
                    textAlignVertical="top"
                    // onSubmitEditing={Keyboard.dismiss}44
                  />
                  <Text style={styles.characterCount}>{comment.length}/500</Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    (!punctuality || !communication || !handover || submitting) &&
                      styles.submitButtonDisabled,
                  ]}
                  onPress={submit}
                  disabled={!punctuality || !communication || !handover || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitText}>Submit private review</Text>
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
  flexOne: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E8E8',
  },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  centeredInline: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 20, gap: 8 },
  errorTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
  errorText: { fontSize: 14, color: '#666', lineHeight: 20, textAlign: 'center' },
  retryButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 11,
    marginTop: 8,
  },
  retryText: { color: '#fff', fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  orderSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F7F9FC',
  },
  customerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
  },
  customerName: { fontSize: 16, fontWeight: '800', color: '#1A1A1A' },
  orderMeta: { fontSize: 12, color: '#666', marginTop: 3 },
  completedBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
  },
  completedText: { color: '#2E7D32', fontSize: 10, fontWeight: '800' },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F1F8F4',
  },
  privacyText: { flex: 1, fontSize: 12, lineHeight: 17, color: '#356342' },
  reviewedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#E8F5E9',
  },
  reviewedTitle: { fontSize: 14, fontWeight: '800', color: '#235C2A' },
  reviewedSubtitle: { fontSize: 11, color: '#54825A', marginTop: 2 },
  questionCard: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 16, padding: 16 },
  questionTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
  questionDescription: { fontSize: 12, color: '#777', lineHeight: 17, marginTop: 3 },
  ratingRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 15 },
  starButton: { paddingHorizontal: 5, paddingVertical: 3 },
  ratingLabel: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#9A6700',
    minHeight: 16,
  },
  section: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 16, padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
  sectionDescription: { fontSize: 12, color: '#777', marginTop: 3, marginBottom: 12 },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#DADDE1',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tagSelected: { borderColor: '#4CAF50', backgroundColor: '#E8F5E9' },
  tagText: { fontSize: 12, color: '#555', fontWeight: '600' },
  tagTextSelected: { color: '#237A3B' },
  commentInput: {
    borderWidth: 1,
    borderColor: '#DADDE1',
    borderRadius: 12,
    minHeight: 100,
    padding: 12,
    fontSize: 14,
    color: '#1A1A1A',
  },
  characterCount: { fontSize: 11, color: '#999', textAlign: 'right', marginTop: 4 },
  submitButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 25,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitButtonDisabled: { backgroundColor: '#A5D6A7' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  savedTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  savedTag: {
    backgroundColor: '#F0F2F4',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  savedTagText: { fontSize: 12, color: '#555', fontWeight: '600' },
  savedComment: { borderRadius: 14, backgroundColor: '#F7F9FC', padding: 14 },
  savedCommentLabel: { fontSize: 10, fontWeight: '800', color: '#888', letterSpacing: 0.5 },
  savedCommentText: { fontSize: 14, color: '#444', lineHeight: 20, marginTop: 6 },
});
