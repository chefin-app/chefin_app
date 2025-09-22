import express from 'express';
import { supabase } from '../supabaseClient';

const router = express.Router();

// fetch popular listings
router.get('/popular-chefin-listings', async (req, res) => {
  try {
    // fetch popular home restaurant listings
    const { data: popularData, error: popularError } = await supabase
      .from('listings')
      .select(
        `
                *,
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
    // const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error fetching popular listings:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
