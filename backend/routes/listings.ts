import express from 'express';
import { supabase } from '../supabaseClient';
import { notifyCookDishReviewed, notifyFavouritersNewDish } from '../notifications';

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

// PATCH /api/listings/:id/status - Admin approves or rejects a dish.
// Body: { status: 'approved' | 'rejected', note? }
// Approval makes the dish publicly visible (feeds filter on status='approved'),
// notifies the cook, and announces the new dish to everyone who favourited
// that cook.
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body as { status?: string; note?: string };

  if (status !== 'approved' && status !== 'rejected') {
    return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
  }

  try {
    const { data: listing, error: fetchErr } = await supabase
      .from('listings')
      .select('id, title, status, cook_id, profiles(user_id, restaurant_name, full_name)')
      .eq('id', id)
      .single();
    if (fetchErr || !listing) {
      return res.status(404).json({ error: 'Listing not found.' });
    }
    const alreadyApproved = listing.status === 'approved';

    const { data, error } = await supabase
      .from('listings')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    // Notifications are best-effort — the review already landed.
    try {
      const cook = (listing as any).profiles;
      if (cook?.user_id) {
        await notifyCookDishReviewed(cook.user_id, listing.title, status === 'approved', note);
      }
      // Only announce to favouriters the first time the dish goes live, not
      // on re-approvals after edits.
      if (status === 'approved' && !alreadyApproved) {
        const restaurantName = cook?.restaurant_name || cook?.full_name || 'A cook you favourited';
        await notifyFavouritersNewDish(listing.cook_id, restaurantName, listing.title, listing.id);
      }
    } catch (notifyErr: any) {
      console.error('Dish review notifications failed:', notifyErr.message ?? notifyErr);
    }

    res.json({ success: true, listing: data });
  } catch (err: any) {
    console.error('Error reviewing listing:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
