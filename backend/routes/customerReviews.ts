import express from 'express';
import type { AccountRequest } from '../accountAccess';
import { requireActiveAccount, requireReadableAccount } from '../accountAccess';
import { supabase } from '../supabaseClient';

const router = express.Router();

const ALLOWED_TAGS = new Set([
  'on_time',
  'clear_communication',
  'smooth_handover',
  'late',
  'unreachable',
  'changed_plan',
  'disrespectful',
  'unsafe_behaviour',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

type Relation<T> = T | T[] | null;

type ReviewListing = { cook_id: string; title: string; image_url: string | null };

type ReviewOrder = {
  id: string;
  customer_id: string;
  status: string | null;
  scheduled_date: string;
  pickup_time: string | null;
  fulfillment_type: string;
  quantity: number;
  listings: Relation<ReviewListing>;
  profiles: Relation<{ full_name: string; profile_image: string | null }>;
};

const relation = <T>(value: Relation<T>): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

type RatingReviewRow = {
  id: string;
  punctuality_rating: number;
  communication_rating: number;
  handover_rating: number;
  comment: string | null;
  created_at: string;
  orders: Relation<{ fulfillment_type: string }>;
};

const reviewAverage = (review: RatingReviewRow) =>
  (review.punctuality_rating + review.communication_rating + review.handover_rating) / 3;

const loadCustomerSummary = async (customerId: string, writtenLimit: number) => {
  const { data, error } = await supabase
    .from('customer_reviews')
    .select(
      'id, punctuality_rating, communication_rating, handover_rating, comment, created_at, orders!inner(fulfillment_type)'
    )
    .eq('customer_id', customerId)
    .eq('orders.fulfillment_type', 'pickup')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const reviews = ((data ?? []) as unknown as RatingReviewRow[]).filter(
    review => relation(review.orders)?.fulfillment_type === 'pickup'
  );
  const average =
    reviews.length > 0
      ? Number(
          (
            reviews.reduce((sum, review) => sum + reviewAverage(review), 0) / reviews.length
          ).toFixed(1)
        )
      : null;
  const writtenReviews = reviews.filter(review => Boolean(review.comment?.trim()));
  return {
    average,
    count: reviews.length,
    writtenReviewCount: writtenReviews.length,
    recentReviews: writtenReviews.slice(0, writtenLimit).map(review => ({
      id: review.id,
      rating: Number(reviewAverage(review).toFixed(1)),
      comment: review.comment!.trim(),
      createdAt: review.created_at,
    })),
  };
};

const loadReviewOrder = async (orderId: string): Promise<ReviewOrder | null> => {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, customer_id, status, scheduled_date, pickup_time, fulfillment_type, quantity, listings(cook_id, title, image_url), profiles(full_name, profile_image)'
    )
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ReviewOrder | null) ?? null;
};

const ensureOwnedOrder = (
  order: ReviewOrder | null,
  cookProfileId: string
): { ok: true; listing: ReviewListing } | { ok: false; status: number; error: string } => {
  if (!order) return { ok: false, status: 404, error: 'Order not found.' };
  const listing = relation(order.listings);
  if (!listing || listing.cook_id !== cookProfileId) {
    return {
      ok: false,
      status: 403,
      error: 'You can only review customers from your own orders.',
    };
  }
  return { ok: true, listing };
};

// GET /me/summary - Buyers see only their aggregate pickup score.
router.get('/me/summary', requireReadableAccount, async (req: AccountRequest, res) => {
  try {
    const summary = await loadCustomerSummary(req.account!.profileId, 0);
    res.json({ average: summary.average });
  } catch (error: unknown) {
    console.error('Error loading buyer rating summary:', error);
    res.status(500).json({ error: 'Your buyer rating could not be loaded.' });
  }
});

// GET /customer-summary/:orderId - A cook may inspect the buyer behind one of
// their own orders before accepting it. Written reviews remain order-gated.
router.get(
  '/customer-summary/:orderId',
  requireReadableAccount,
  async (req: AccountRequest, res) => {
    if (!UUID_PATTERN.test(req.params.orderId)) {
      return res.status(400).json({ error: 'orderId is invalid.' });
    }
    const requestedLimit = Number(req.query.limit ?? 3);
    const limit = Number.isInteger(requestedLimit) ? Math.min(50, Math.max(0, requestedLimit)) : 3;
    try {
      const order = await loadReviewOrder(req.params.orderId);
      const ownership = ensureOwnedOrder(order, req.account!.profileId);
      if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
      res.json(await loadCustomerSummary(order!.customer_id, limit));
    } catch (error: unknown) {
      console.error('Error loading customer rating summary:', error);
      res.status(500).json({ error: 'The buyer rating could not be loaded.' });
    }
  }
);

// GET /status?orderIds=id,id - Batch status for the cook's order history.
router.get('/status', requireReadableAccount, async (req: AccountRequest, res) => {
  const rawOrderIds = typeof req.query.orderIds === 'string' ? req.query.orderIds : '';
  const orderIds = [
    ...new Set(
      rawOrderIds
        .split(',')
        .map(id => id.trim())
        .filter(Boolean)
    ),
  ];
  if (orderIds.length === 0) return res.json({ reviewedOrderIds: [] });
  if (orderIds.length > 50) {
    return res.status(400).json({ error: 'Review status is limited to 50 orders at a time.' });
  }
  if (orderIds.some(id => !UUID_PATTERN.test(id))) {
    return res.status(400).json({ error: 'One or more order IDs are invalid.' });
  }

  try {
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, listings(cook_id)')
      .in('id', orderIds);
    if (ordersError) throw ordersError;

    const ownedOrderIds = (orders ?? [])
      .filter(
        order =>
          relation(order.listings as Relation<{ cook_id: string }>)?.cook_id ===
          req.account!.profileId
      )
      .map(order => order.id);
    if (ownedOrderIds.length !== orderIds.length) {
      return res.status(403).json({ error: 'One or more orders do not belong to this cook.' });
    }

    const { data: reviews, error: reviewsError } = await supabase
      .from('customer_reviews')
      .select('order_id')
      .in('order_id', ownedOrderIds)
      .eq('cook_id', req.account!.profileId);
    if (reviewsError) throw reviewsError;
    res.json({ reviewedOrderIds: (reviews ?? []).map(review => review.order_id) });
  } catch (error: unknown) {
    console.error('Error loading customer review statuses:', error);
    res.status(500).json({ error: 'Customer review statuses could not be loaded.' });
  }
});

// GET /order/:orderId - Load a cook-owned order and its private customer review.
router.get('/order/:orderId', requireReadableAccount, async (req: AccountRequest, res) => {
  if (!UUID_PATTERN.test(req.params.orderId)) {
    return res.status(400).json({ error: 'orderId is invalid.' });
  }

  try {
    const order = await loadReviewOrder(req.params.orderId);
    const ownership = ensureOwnedOrder(order, req.account!.profileId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
    if (order!.fulfillment_type !== 'pickup') {
      return res.status(409).json({
        error: 'Customer reviews are only available for completed pickup orders.',
      });
    }
    if (order!.status !== 'completed') {
      return res.status(409).json({ error: 'Customers can only be reviewed after completion.' });
    }

    const { data: review, error: reviewError } = await supabase
      .from('customer_reviews')
      .select(
        'id, punctuality_rating, communication_rating, handover_rating, tags, comment, created_at'
      )
      .eq('order_id', order!.id)
      .eq('cook_id', req.account!.profileId)
      .eq('customer_id', order!.customer_id)
      .maybeSingle();
    if (reviewError) throw reviewError;

    const customer = relation(order!.profiles);
    res.json({
      order: {
        id: order!.id,
        status: order!.status,
        quantity: order!.quantity,
        scheduledDate: order!.scheduled_date,
        pickupTime: order!.pickup_time,
        fulfillmentType: order!.fulfillment_type,
        listingTitle: ownership.listing.title,
        listingImageUrl: ownership.listing.image_url,
        customerName: customer?.full_name ?? 'Customer',
        customerImageUrl: customer?.profile_image ?? null,
      },
      review: review ?? null,
    });
  } catch (error: unknown) {
    console.error('Error loading customer review:', error);
    res.status(500).json({ error: 'The customer review could not be loaded.' });
  }
});

// POST / - Submit one structured customer review per completed pickup order.
router.post('/', requireActiveAccount, async (req: AccountRequest, res) => {
  const { orderId, punctualityRating, communicationRating, handoverRating, tags, comment } =
    (req.body ?? {}) as {
      orderId?: string;
      punctualityRating?: number;
      communicationRating?: number;
      handoverRating?: number;
      tags?: unknown;
      comment?: unknown;
    };

  if (!orderId) return res.status(400).json({ error: 'orderId is required.' });
  if (!UUID_PATTERN.test(orderId)) {
    return res.status(400).json({ error: 'orderId is invalid.' });
  }

  const ratings = [punctualityRating, communicationRating, handoverRating];
  if (ratings.some(rating => !Number.isInteger(rating) || rating! < 1 || rating! > 5)) {
    return res.status(400).json({ error: 'Each rating must be a whole number from 1 to 5.' });
  }

  if (tags !== undefined && !Array.isArray(tags)) {
    return res.status(400).json({ error: 'tags must be an array.' });
  }
  const normalizedTags = [
    ...new Set((tags ?? []).filter((tag): tag is string => typeof tag === 'string')),
  ];
  if (normalizedTags.length > 8 || normalizedTags.some(tag => !ALLOWED_TAGS.has(tag))) {
    return res.status(400).json({ error: 'One or more customer review tags are invalid.' });
  }
  if (normalizedTags.includes('on_time') && normalizedTags.includes('late')) {
    return res.status(400).json({ error: 'A customer cannot be tagged as both on time and late.' });
  }

  if (comment !== undefined && comment !== null && typeof comment !== 'string') {
    return res.status(400).json({ error: 'comment must be text.' });
  }
  const normalizedComment = typeof comment === 'string' ? comment.trim() : '';
  if (normalizedComment.length > 500) {
    return res.status(400).json({ error: 'comment must be 500 characters or fewer.' });
  }

  try {
    const order = await loadReviewOrder(orderId);
    const ownership = ensureOwnedOrder(order, req.account!.profileId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
    if (order!.status !== 'completed') {
      return res.status(409).json({ error: 'Customers can only be reviewed after completion.' });
    }
    if (order!.fulfillment_type !== 'pickup') {
      return res.status(409).json({
        error: 'Customer reviews are only available for completed pickup orders.',
      });
    }
    if (order!.customer_id === req.account!.profileId) {
      return res.status(403).json({ error: 'You cannot review your own customer account.' });
    }

    const { data: review, error: insertError } = await supabase
      .from('customer_reviews')
      .insert({
        order_id: order!.id,
        cook_id: req.account!.profileId,
        customer_id: order!.customer_id,
        punctuality_rating: punctualityRating,
        communication_rating: communicationRating,
        handover_rating: handoverRating,
        tags: normalizedTags,
        comment: normalizedComment || null,
      })
      .select(
        'id, punctuality_rating, communication_rating, handover_rating, tags, comment, created_at'
      )
      .single();
    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(409).json({ error: 'You have already reviewed this customer order.' });
      }
      throw insertError;
    }

    res.status(201).json({ success: true, review });
  } catch (error: unknown) {
    console.error('Error creating customer review:', error);
    res.status(500).json({ error: 'The customer review could not be submitted.' });
  }
});

export default router;
