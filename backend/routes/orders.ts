import express from 'express';
import { supabase } from '../supabaseClient';

const router = express.Router();

router.get('/', async (req, res) => {
  const { status } = req.query;
  const today = new Date().toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format

  try {
    let query = supabase
      .from('orders')
      .select('*')
      .eq('status', status)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)
      .order('created_at', { ascending: false });

    // For preparing orders, also filter by pickup date
    if (status === 'preparing') {
      query = query.eq('pickup_date', today);
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

// POST / - Place an order from the cart
router.post('/', async (req, res) => {
  const { userId, items } = req.body as {
    userId?: string;
    items: {
      listingId: string;
      quantity: number;
      pickupDate: string;
      priceAtOrder: number; // unit price
    }[];
  };

  if (!userId) {
    return res.status(401).json({ error: 'userId is required to place an order.' });
  }
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'No items in order.' });
  }

  try {
    // orders.customer_id references profiles.id, not auth.users.id — look it up.
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (profileErr || !profile) {
      console.error('No profile for user', userId, profileErr);
      return res.status(404).json({ error: 'Profile not found for this user.' });
    }

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
        status: 'pending',
        payment_status: 'paid', // mock-paid via locally-saved card
      };
    });

    const { data, error } = await supabase.from('orders').insert(orderRows).select();

    if (error) {
      console.error('Error placing order:', error);
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({ success: true, orders: data });
  } catch (err: any) {
    console.error('Error placing order:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
