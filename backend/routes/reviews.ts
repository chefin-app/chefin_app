import express from 'express';
import { supabase } from '../supabaseClient';
import type { AccountRequest } from '../accountAccess';
import { requireActiveAccount, requireReadableAccount } from '../accountAccess';

const router = express.Router();

// POST / - Customer reviews a dish from a completed order.
// Body: { userId, orderId, rating (1-5), comment? }
//
// Runs through the service role so we can enforce verified-purchase rules the
// client can't be trusted with: the order must belong to the reviewer, must be
// completed, and can only be reviewed once (reviews.order_id is unique).
router.post('/', requireActiveAccount, async (req: AccountRequest, res) => {
  const { userId, orderId, rating, comment } = req.body as {
    userId?: string;
    orderId?: string;
    rating?: number;
    comment?: string;
  };

  if (userId && userId !== req.account!.userId) {
    return res.status(403).json({ error: 'The review user does not match the signed-in account.' });
  }
  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required.' });
  }
  if (!Number.isInteger(rating) || rating! < 1 || rating! > 5) {
    return res.status(400).json({ error: 'rating must be a whole number from 1 to 5.' });
  }

  try {
    const profile = { id: req.account!.profileId };

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, customer_id, listing_id, status')
      .eq('id', orderId)
      .single();
    if (orderErr || !order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (order.customer_id !== profile.id) {
      return res.status(403).json({ error: 'You can only review your own orders.' });
    }
    if (order.status !== 'completed') {
      return res.status(400).json({ error: 'You can only review completed orders.' });
    }

    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('order_id', orderId)
      .maybeSingle();
    if (existing) {
      return res.status(409).json({ error: 'You have already reviewed this order.' });
    }

    const { data: review, error: insertErr } = await supabase
      .from('reviews')
      .insert({
        customer_id: profile.id,
        listing_id: order.listing_id,
        order_id: orderId,
        rating,
        comment: comment?.trim() || null,
      })
      .select()
      .single();
    if (insertErr) {
      // Unique violation on order_id → someone double-submitted.
      if (insertErr.code === '23505') {
        return res.status(409).json({ error: 'You have already reviewed this order.' });
      }
      throw insertErr;
    }

    res.status(201).json({ success: true, review });
  } catch (err: any) {
    console.error('Error creating review:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /order/:orderId - Has this order been reviewed yet? Used by the review
// screen to show the already-reviewed state instead of an editable form.
router.get('/order/:orderId', requireReadableAccount, async (req: AccountRequest, res) => {
  const { orderId } = req.params;
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, rating, comment, created_at, orders(customer_id)')
      .eq('order_id', orderId)
      .maybeSingle();
    if (error) throw error;
    const ownerId = data
      ? ((data.orders as unknown as { customer_id: string } | null)?.customer_id ?? null)
      : null;
    if (ownerId && ownerId !== req.account!.profileId) {
      return res.status(403).json({ error: 'You can only view reviews for your own orders.' });
    }
    res.json({
      review: data
        ? { id: data.id, rating: data.rating, comment: data.comment, created_at: data.created_at }
        : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
