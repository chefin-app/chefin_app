import express from 'express';
import { supabase } from '../supabaseClient';

const router = express.Router();

// GET listing_id
router.get('/:listing_id', async (req, res) => {
  const { listing_id } = req.params;

  try {
    const { data, error } = await supabase
      .from('availability')
      .select('*')
      .eq('listing_id', listing_id)
      .eq('is_available', true)
      .order('available_date', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ available: false, message: 'No availability found.' });
    }

    const today = new Date();
    const availableToday = data.find(
      record =>
        new Date(record.available_date).toDateString() === today.toDateString() &&
        record.orders_taken < record.max_orders
    );

    res.json({
      available: !!availableToday,
      remainingSlots: availableToday ? availableToday.max_orders - availableToday.orders_taken : 0,
      availability: data,
    });
  } catch (err: unknown) {
    console.error('Error fetching availability:', err);
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    res.status(500).json({ error: message });
  }
});

router.get('/menu-availability', async (req, res) => {
  try {
    const { user_id, date } = req.query;

    if (!user_id || !date) {
      return res.status(400).json({ error: 'Missing required query params: user_id and date' });
    }
    const { data, error } = await supabase
      .from('availability')
      .select('*')
      .eq('user_id', user_id)
      .eq('date', date);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ availability: data });
  } catch (err: any) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/toggle-availability', async (req, res) => {
  try {
    const { id, is_available } = req.body;

    if (!id || typeof is_available !== 'boolean') {
      return res.status(400).json({ error: 'Missing required fields: id and is_available' });
    }
    const { data, error } = await supabase
      .from('availability')
      .update({ is_available: is_available })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    return res.json({ availability: data });
  } catch (err: any) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
