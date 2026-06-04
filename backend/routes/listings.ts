import express from 'express';
import { supabase } from '../supabaseClient';

const router = express.Router();

// GET /api/listings - Fetch all listings
router.get('/all-listings', async (req, res) => {
  const query = req.query.query as string | undefined;
  try {
    let request = supabase.from('listings').select('*').eq('status', 'approved');

    if (query && query.trim() !== '') {
      // ilike is case-insensitive LIKE (good for search)
      request = request.ilike('title', `%${query}%`);
    }

    const { data, error } = await request;

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json(data ?? []);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error fetching all listings:', errorMessage);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/listings/:id - Fetch a single dish with details
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select(
        `
        *,
        profiles!inner (
          id,
          full_name,
          restaurant_name,
          profile_image,
          bio,
          is_verified
        ),
        reviews (
          id,
          rating,
          comment,
          created_at,
          profiles!inner (
            id,
            full_name,
            profile_image
          )
        )
      `
      )
      .eq('id', id)
      .single();

    if (listingError) {
      console.error('Supabase query error:', JSON.stringify(listingError, null, 2));
      throw new Error(listingError.message);
    }

    return res.json(listing);
  } catch (err: any) {
    console.error(`Error fetching listing ${id}:`, err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
