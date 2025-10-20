import express from 'express';
import { supabase } from '../supabaseClient';

const router = express.Router();

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // get cook (home restaurant) profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, restaurant_name, profile_image, bio, is_verified')
      .eq('id', id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return res.status(400).json({ erorr: profileError.message });
    }

    // get their listings (menu)
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('id, title, description, price, image_url, cuisine, dietary_tags')
      .eq('cook_id', id)
      .eq('is_active', true);

    if (listingsError) {
      console.error('Error fetching listings:', listingsError);
      return res.status(400).json({ error: listingsError });
    }
    res.json({ profile, listings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Uknown error';
    console.error('Server error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
