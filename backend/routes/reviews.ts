import express from 'express';
import { supabase } from '../supabaseClient';

const router = express.Router();

// POST / - Customer reviews a dish from a completed order.
// Body: { userId, orderId, rating (1-5), comment? }
//
// Runs through the service role so we can enforce verified-purchase rules the
// client can't be trusted with: the order must belong to the reviewer, must be
// completed, and can only be reviewed once (reviews.order_id is unique).
router.post('/', async (req, res) => {
  const { userId, orderId, rating, comment } = req.body as {
    userId?: string;
    orderId?: string;
    rating?: number;
    comment?: string;
  };

  if (!userId) {
    return res.status(401).json({ error: 'userId is required.' });
  }
  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required.' });
  }
  if (!Number.isInteger(rating) || rating! < 1 || rating! > 5) {
    return res.status(400).json({ error: 'rating must be a whole number from 1 to 5.' });
  }

  try {
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .single();
    if (profileErr || !profile) {
      return res.status(404).json({ error: 'Profile not found for this user.' });
    }

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
router.get('/order/:orderId', async (req, res) => {
  const { orderId } = req.params;
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, rating, comment, created_at')
      .eq('order_id', orderId)
      .maybeSingle();
    if (error) throw error;
    res.json({ review: data ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
