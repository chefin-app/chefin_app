import express from 'express';
import { supabase } from '../supabaseClient';

const router = express.Router();

type CookRatingRow = {
  id: string;
  cook_id: string;
  reviews: Array<{ rating: number }> | null;
};

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
      .eq('status', 'approved')
      .eq('is_active', true)
      .limit(10);
    if (popularError) throw popularError;

    const popularListings = popularData ?? [];
    const cookIds = [...new Set(popularListings.map(listing => listing.cook_id))];
    const reviewsByCook = new Map<string, Array<{ rating: number }>>();
    const listingIdsByCook = new Map<string, string[]>();

    if (cookIds.length > 0) {
      // The visible feed is deliberately limited, but a restaurant's score
      // must include every active, approved dish—not only whichever dishes
      // happened to land in that ten-item window.
      const { data: ratingRows, error: ratingError } = await supabase
        .from('listings')
        .select('id, cook_id, reviews(rating)')
        .in('cook_id', cookIds)
        .eq('status', 'approved')
        .eq('is_active', true);
      if (ratingError) throw ratingError;

      for (const row of (ratingRows ?? []) as CookRatingRow[]) {
        const current = reviewsByCook.get(row.cook_id) ?? [];
        current.push(...(row.reviews ?? []));
        reviewsByCook.set(row.cook_id, current);

        const listingIds = listingIdsByCook.get(row.cook_id) ?? [];
        listingIds.push(row.id);
        listingIdsByCook.set(row.cook_id, listingIds);
      }
    }

    res.json({
      popularChefins: popularListings.map(listing => ({
        ...listing,
        restaurant_reviews: reviewsByCook.get(listing.cook_id) ?? [],
        restaurant_listing_ids: listingIdsByCook.get(listing.cook_id) ?? [listing.id],
      })),
    });
  } catch (err: unknown) {
    console.error('Error fetching popular listings:', err);
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    res.status(500).json({ error: message });
  }
});

export default router;
