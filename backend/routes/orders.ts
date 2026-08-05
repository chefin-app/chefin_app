import express from 'express';
import { supabase } from '../supabaseClient';
import {
  notifyBuyerOrderPlaced,
  notifyBuyerOrderConfirmed,
  notifyBuyerOrderReady,
  notifyBuyerOrderCancelled,
  notifyBuyerReviewRequest,
  notifyCookNewOrder,
  notifyCookPayoutSent,
} from '../notifications';
import type { AccountRequest } from '../accountAccess';
import { requireActiveAccount, requireReadableAccount } from '../accountAccess';

const router = express.Router();

router.get('/', requireReadableAccount, async (req: AccountRequest, res) => {
  const { status } = req.query;
  const today = new Date().toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format

  try {
    const { data: cookProfile, error: cookError } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', req.account!.userId)
      .single();
    if (cookError || !cookProfile)
      return res.status(403).json({ error: 'Cook profile not found.' });
    const { data: cookListings, error: listingsError } = await supabase
      .from('listings')
      .select('id')
      .eq('cook_id', cookProfile.id);
    if (listingsError) throw listingsError;
    const listingIds = (cookListings ?? []).map(listing => listing.id);
    if (listingIds.length === 0) return res.json([]);

    let query = supabase
      .from('orders')
      .select('*')
      .in('listing_id', listingIds)
      .eq('status', status)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)
      .order('created_at', { ascending: false });

    // For confirmed orders, also filter by pickup date
    if (status === 'confirmed') {
      query = query.eq('scheduled_date', today);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data ?? []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const FULFILLMENT_TYPES = ['pickup', 'delivery'];

// POST / - Place an order from the cart
router.post('/', requireActiveAccount, async (req: AccountRequest, res) => {
  const { userId, items, fulfillmentType } = req.body as {
    userId?: string;
    items: {
      listingId: string;
      quantity: number;
      pickupDate: string;
      pickupTime?: string; // ISO of the 1-hour slot start the customer picked
      priceAtOrder: number; // unit price
    }[];
    fulfillmentType?: string; // 'pickup' | 'delivery', applies to the whole order
  };

  if (userId && userId !== req.account!.userId) {
    return res.status(403).json({ error: 'The order user does not match the signed-in account.' });
  }
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'No items in order.' });
  }
  if (fulfillmentType && !FULFILLMENT_TYPES.includes(fulfillmentType)) {
    return res.status(400).json({ error: "fulfillmentType must be 'pickup' or 'delivery'." });
  }

  try {
    // orders.customer_id references profiles.id, not auth.users.id — look it up.
    const profile = { id: req.account!.profileId };

    const orderRows = items.map(item => {
      const scheduled = item.pickupDate
        ? new Date(item.pickupDate).toISOString().split('T')[0]
        : null;
      if (!scheduled) {
        throw new Error('Each item must have a pickupDate.');
      }
      return {
        customer_id: profile.id,
        listing_id: item.listingId,
        quantity: item.quantity,
        total_price: +(item.priceAtOrder * item.quantity).toFixed(2),
        scheduled_date: scheduled,
        pickup_time: item.pickupTime ?? null,
        fulfillment_type: fulfillmentType ?? 'pickup',
        status: 'pending',
        payment_status: 'paid', // mock-paid via locally-saved card
      };
    });

    // Capacity check: for each item, find the availability row covering the
    // pickup time and refuse the order if it would exceed max_orders.
    for (const item of items) {
      if (!item.pickupTime) continue; // skip the check if no slot was selected
      const scheduled = new Date(item.pickupDate).toISOString().split('T')[0];
      const { data: avail, error: availErr } = await supabase
        .from('availability')
        .select('id, max_orders, orders_taken, start_time, end_time, is_available')
        .eq('listing_id', item.listingId)
        .eq('available_date', scheduled)
        .lte('start_time', item.pickupTime)
        .gt('end_time', item.pickupTime)
        .eq('is_available', true)
        .maybeSingle();
      if (availErr) throw availErr;
      if (!avail) {
        return res
          .status(409)
          .json({ error: 'This pickup slot is no longer available. Please pick another time.' });
      }
      const remaining = avail.max_orders - (avail.orders_taken ?? 0);
      if (remaining < item.quantity) {
        return res.status(409).json({
          error: `Only ${remaining} order(s) left for this slot.`,
        });
      }
    }

    const { data, error } = await supabase.from('orders').insert(orderRows).select();

    if (error) {
      console.error('Error placing order:', error);
      return res.status(400).json({ error: error.message });
    }

    // Bump orders_taken on each availability row. Best-effort: if this fails,
    // the order is already placed — log but don't fail the request.
    for (const item of items) {
      if (!item.pickupTime) continue;
      const scheduled = new Date(item.pickupDate).toISOString().split('T')[0];
      const { data: avail } = await supabase
        .from('availability')
        .select('id, orders_taken')
        .eq('listing_id', item.listingId)
        .eq('available_date', scheduled)
        .lte('start_time', item.pickupTime)
        .gt('end_time', item.pickupTime)
        .eq('is_available', true)
        .maybeSingle();
      if (!avail) continue;
      const newCount = (avail.orders_taken ?? 0) + item.quantity;
      const { error: bumpErr } = await supabase
        .from('availability')
        .update({ orders_taken: newCount })
        .eq('id', avail.id);
      if (bumpErr) {
        console.error('Failed to bump orders_taken for', avail.id, bumpErr);
      }
    }

    // Notify everyone involved (best-effort — the order is already placed).
    // Buyer gets one payment-received summary; each cook gets one
    // notification per order row so they can act on it from Today.
    try {
      const createdOrders = data ?? [];
      const total = createdOrders.reduce((sum, o) => sum + Number(o.total_price), 0);
      await notifyBuyerOrderPlaced(
        req.account!.userId,
        total,
        createdOrders.length,
        createdOrders.map(o => o.id)
      );

      const listingIds = [...new Set(createdOrders.map(o => o.listing_id))];
      const { data: listingRows } = await supabase
        .from('listings')
        .select('id, title, profiles(user_id)')
        .in('id', listingIds);
      const listingById = new Map((listingRows ?? []).map(l => [l.id, l]));

      for (const order of createdOrders) {
        const listing = listingById.get(order.listing_id) as any;
        const cookUserId = listing?.profiles?.user_id;
        if (!cookUserId) continue;
        await notifyCookNewOrder(cookUserId, {
          orderId: order.id,
          listingTitle: listing.title ?? 'your dish',
          quantity: order.quantity,
          totalPrice: order.total_price,
          scheduledDate: order.scheduled_date,
          pickupTime: order.pickup_time,
        });
      }
    } catch (notifyErr: any) {
      console.error('Order notifications failed:', notifyErr.message ?? notifyErr);
    }

    res.status(201).json({ success: true, orders: data });
  } catch (err: any) {
    console.error('Error placing order:', err);
    res.status(500).json({ error: err.message });
  }
});

const ORDER_STATUSES = ['pending', 'confirmed', 'ready', 'completed', 'cancelled'];

// PATCH /:id/status - Cook advances/cancels an order.
// Runs through the service-role client because orders are owned (RLS-wise) by
// the customer, not the cook — a cook updating status has no row-level grant
// from the client, so this has to be a privileged, server-verified write.
router.patch('/:id/status', requireReadableAccount, async (req: AccountRequest, res) => {
  const { id } = req.params;
  const { status, userId } = req.body as { status?: string; userId?: string };

  if (userId && userId !== req.account!.userId) {
    return res
      .status(403)
      .json({ error: 'The request user does not match the signed-in account.' });
  }
  if (!status || !ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  try {
    const profile = { id: req.account!.profileId };

    // Verify the order belongs to a listing owned by the requesting cook
    // before allowing the write.
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select(
        'id, quantity, total_price, scheduled_date, pickup_time, customer_id, listing_id, listings(cook_id, title)'
      )
      .eq('id', id)
      .single();
    if (orderErr || !order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const cookId = (order as any).listings?.cook_id;
    if (cookId !== profile.id) {
      return res.status(403).json({ error: 'You do not have permission to update this order.' });
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    // Notify the affected party (best-effort — the status change already
    // landed). Buyer hears about confirm/ready/cancel; the cook hears about
    // their payout when the order completes.
    try {
      const orderCtx = {
        orderId: order.id,
        listingTitle: (order as any).listings?.title ?? 'your order',
        quantity: order.quantity,
        totalPrice: order.total_price,
        scheduledDate: order.scheduled_date,
        pickupTime: order.pickup_time,
      };

      if (status === 'completed') {
        // The requester is the verified cook — userId is their auth id.
        await notifyCookPayoutSent(req.account!.userId, orderCtx);
      }

      const { data: buyer } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('id', order.customer_id)
        .single();
      if (buyer?.user_id) {
        if (status === 'confirmed') await notifyBuyerOrderConfirmed(buyer.user_id, orderCtx);
        else if (status === 'ready') await notifyBuyerOrderReady(buyer.user_id, orderCtx);
        else if (status === 'cancelled') await notifyBuyerOrderCancelled(buyer.user_id, orderCtx);
        else if (status === 'completed') {
          // Ask for a review — the notification deep-links to the review screen.
          await notifyBuyerReviewRequest(buyer.user_id, {
            ...orderCtx,
            listingId: order.listing_id,
          });
        }
      }
    } catch (notifyErr: any) {
      console.error('Status notification failed:', notifyErr.message ?? notifyErr);
    }

    res.json({ success: true, order: data });
  } catch (err: any) {
    console.error('Error updating order status:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
