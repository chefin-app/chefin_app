import express from 'express';
import { supabase } from '../supabaseClient';
import { notifyFavouritersNewSlots } from '../notifications';

const router = express.Router();

const AVAILABILITY_TIME_ZONE = 'Asia/Kuala_Lumpur';

const getDateKeyInTimeZone = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: AVAILABILITY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const isWindowStillOpen = (endTime: unknown, now: Date): boolean => {
  if (typeof endTime !== 'string' || !endTime.trim()) return true;

  const timeOnly = endTime.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (timeOnly) {
    const currentTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: AVAILABILITY_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);
    return `${timeOnly[1]}:${timeOnly[2]}:${timeOnly[3] ?? '00'}` > currentTime;
  }

  const parsedEndTime = new Date(endTime);
  return !Number.isNaN(parsedEndTime.getTime()) && parsedEndTime.getTime() > now.getTime();
};

// GET listing_id
router.get('/:listing_id', async (req, res) => {
  const { listing_id } = req.params;

  try {
    const { data, error } = await supabase
      .from('availability')
      .select('*')
      .eq('listing_id', listing_id)
      // Null is treated as enabled for rows created before the flag existed.
      // Explicitly disabled rows must never be returned as bookable.
      .or('is_available.eq.true,is_available.is.null')
      .order('available_date', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ available: false, message: 'No availability found.' });
    }

    const today = getDateKeyInTimeZone();
    const now = new Date();
    const availableToday = data.find(
      record =>
        String(record.available_date).split('T')[0] === today &&
        (record.orders_taken ?? 0) < record.max_orders &&
        isWindowStillOpen(record.end_time, now)
    );

    res.json({
      available: !!availableToday,
      remainingSlots: availableToday
        ? availableToday.max_orders - (availableToday.orders_taken ?? 0)
        : 0,
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

// POST /api/availability/announce-slots - Cook's app calls this after adding
// new pickup slots; fans out a "new pickup times" notification to everyone
// who favourited the cook. Throttled server-side (one announcement per cook
// per few hours) so editing several dates doesn't spam followers.
router.post('/announce-slots', async (req, res) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) {
    return res.status(401).json({ error: 'userId is required.' });
  }

  try {
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, restaurant_name, full_name')
      .eq('user_id', userId)
      .single();
    if (profileErr || !profile) {
      return res.status(404).json({ error: 'Profile not found for this user.' });
    }

    // Only actual cooks (someone with at least one listing) can announce.
    const { count } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('cook_id', profile.id);
    if (!count) {
      return res.status(403).json({ error: 'No listings found for this cook.' });
    }

    await notifyFavouritersNewSlots(
      profile.id,
      profile.restaurant_name || profile.full_name || 'A cook you favourited'
    );
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error announcing slots:', err);
    res.status(500).json({ error: err.message });
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
