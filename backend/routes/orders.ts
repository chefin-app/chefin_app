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

export default router;
