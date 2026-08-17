import express from 'express';
import { supabase } from '../supabaseClient';
import { notifyCookDishReviewed, notifyFavouritersNewDish } from '../notifications';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  getCookEligibilityByProfileId,
  getEligibleCookUserIds,
  getPausedCookProfileIds,
} from '../cookEligibility';
import {
  filterListingsWithFutureAvailability,
  listingHasFutureAvailability,
} from '../availabilityService';
import { getListingOptionGroups } from '../menuOptionService';

const router = express.Router();

// GET /api/listings - Fetch all listings
router.get('/all-listings', async (req, res) => {
  const query = req.query.query as string | undefined;
  try {
    const { data, error } = await supabase
      .from('listings')
      .select(
        '*, reviews(id, rating, comment), profiles!inner(user_id, full_name, profile_image, is_verified, restaurant_name)'
      )
      .eq('status', 'approved')
      .eq('is_active', true);

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    const rows = data ?? [];
    const userIds = rows.flatMap(row => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return profile?.user_id ? [profile.user_id] : [];
    });
    const eligibleUserIds = await getEligibleCookUserIds(userIds);
    const normalizedQuery = query?.trim().toLowerCase() ?? '';
    const eligibleRows = rows.filter(row => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      if (!profile?.user_id || !eligibleUserIds.has(profile.user_id)) return false;
      if (!normalizedQuery) return true;
      return [
        row.title,
        row.description,
        row.cuisine,
        row.location,
        profile.full_name,
        profile.restaurant_name,
      ].some(value =>
        String(value ?? '')
          .toLowerCase()
          .includes(normalizedQuery)
      );
    });
    const scheduledRows = await filterListingsWithFutureAvailability(eligibleRows);
    const pausedCookIds = await getPausedCookProfileIds(scheduledRows.map(row => row.cook_id));
    const visibleRows = scheduledRows.filter(row => !pausedCookIds.has(row.cook_id));
    const cookIds = [...new Set(visibleRows.map(row => row.cook_id))];
    const { data: ratingRows, error: ratingError } = cookIds.length
      ? await supabase
          .from('listings')
          .select('id, cook_id, reviews(rating)')
          .in('cook_id', cookIds)
          .eq('status', 'approved')
          .eq('is_active', true)
      : { data: [], error: null };
    if (ratingError) throw ratingError;
    const reviewsByCook = new Map<string, Array<{ rating: number }>>();
    const listingIdsByCook = new Map<string, string[]>();
    for (const row of ratingRows ?? []) {
      reviewsByCook.set(row.cook_id, [
        ...(reviewsByCook.get(row.cook_id) ?? []),
        ...(row.reviews ?? []),
      ]);
    }
    for (const row of visibleRows) {
      listingIdsByCook.set(row.cook_id, [...(listingIdsByCook.get(row.cook_id) ?? []), row.id]);
    }
    return res.json(
      visibleRows.map(row => ({
        ...row,
        restaurant_reviews: reviewsByCook.get(row.cook_id) ?? [],
        restaurant_listing_ids: listingIdsByCook.get(row.cook_id) ?? [row.id],
      }))
    );
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

    const eligibility = await getCookEligibilityByProfileId(listing.cook_id);
    if (
      !eligibility.eligibleToSell ||
      listing.status !== 'approved' ||
      listing.is_active !== true ||
      !(await listingHasFutureAvailability({ id: listing.id, cook_id: listing.cook_id }))
    ) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    const { data: ratingRows, error: ratingError } = await supabase
      .from('listings')
      .select('reviews(rating)')
      .eq('cook_id', listing.cook_id)
      .eq('status', 'approved')
      .eq('is_active', true);
    if (ratingError) throw ratingError;

    const restaurantReviews = (ratingRows ?? []).flatMap(row => row.reviews ?? []);
    const optionGroupsByListing = await getListingOptionGroups([listing.id]);
    return res.json({
      ...listing,
      restaurant_reviews: restaurantReviews,
      option_groups: optionGroupsByListing[listing.id] ?? [],
    });
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
router.patch('/:id/status', requireAdmin, async (req, res) => {
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

    if (status === 'approved') {
      const eligibility = await getCookEligibilityByProfileId(listing.cook_id);
      if (!eligibility.eligibleToSell) {
        return res.status(409).json({
          error: 'This cook is not yet approved to sell. Complete the cook verification first.',
          cookApplicationStatus: eligibility.status,
        });
      }
    }

    const { data, error } = await supabase
      .from('listings')
      .update({ status, ...(status === 'approved' ? { is_active: true } : {}) })
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
