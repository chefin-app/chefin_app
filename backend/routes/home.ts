import express from 'express';
import { supabase } from '../supabaseClient';

const router = express.Router();

// GET popular listings
router.get('/popular-chefin-listings', async (req, res) => {
  try {
    // fetch popular home restaurant listings
    const { data: popularData, error: popularError } = await supabase
      .from('listings')
      .select(
        `
        *,
        reviews (
          id,
          rating,
          comment
        ),
        profiles!inner (
          user_id,
          full_name,
          profile_image,
          is_verified,
          restaurant_name
        )
      `
      )
      .limit(10);
    if (popularError) throw popularError;

    res.json({ popularChefins: popularData });
  } catch (err: unknown) {
    console.error('Error fetching popular listings:', err);
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    res.status(500).json({ error: message });
  }
});

export default router;
