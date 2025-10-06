import express from 'express';
import { supabase } from '../supabaseClient';

const router = express.Router();

// GET /api/listings - Fetch all listings
router.get('/all-listings', async (req, res) => {
  const query = req.query.query as string | undefined;
  try {
    let request = supabase.from('listings').select('*');

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

export default router;
