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
      priceAtOrder: number;
    }[];
  };

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'No items in order.' });
  }

  try {
    const orderRows = items.map(item => ({
      listing_id: item.listingId,
      quantity: item.quantity,
      pickup_date: item.pickupDate ? new Date(item.pickupDate).toISOString().split('T')[0] : null,
      price_at_order: item.priceAtOrder,
      user_id: userId ?? null,
      status: 'pending',
    }));

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
