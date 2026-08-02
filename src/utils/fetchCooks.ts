import { supabase } from '../services/supabase';
import type { Listing, Profile } from '@/src/types/models';

interface ListingWithProfile extends Listing {
  profiles: Profile;
}

type CookRatingRow = Pick<Listing, 'id' | 'cook_id'> & {
  reviews?: Array<{ rating: number }> | null;
};

const attachCookWideReviews = (
  listings: ListingWithProfile[],
  ratingRows: CookRatingRow[]
): ListingWithProfile[] => {
  const reviewsByCook = new Map<string, Array<{ rating: number }>>();
  const listingIdsByCook = new Map<string, string[]>();

  for (const row of ratingRows) {
    const current = reviewsByCook.get(row.cook_id) ?? [];
    current.push(...(row.reviews ?? []).map(review => ({ rating: review.rating })));
    reviewsByCook.set(row.cook_id, current);

    const listingIds = listingIdsByCook.get(row.cook_id) ?? [];
    listingIds.push(row.id);
    listingIdsByCook.set(row.cook_id, listingIds);
  }

  return listings.map(listing => ({
    ...listing,
    restaurant_reviews: reviewsByCook.get(listing.cook_id) ?? [],
    restaurant_listing_ids: listingIdsByCook.get(listing.cook_id) ?? [listing.id],
  }));
};

export const fetchCooks = async ({ query }: { query: string }): Promise<ListingWithProfile[]> => {
  const search = `%${query?.trim() ?? ''}%`;

  // Base selection used across all queries
  const baseSelect = `
    *,
    reviews ( id, rating, comment ),
    profiles!inner ( user_id, full_name, profile_image, is_verified, restaurant_name )
  `;

  try {
    // CASE 1: No query — fetch everything
    if (!query || query.trim() === '') {
      const { data, error } = await supabase
        .from('listings')
        .select(baseSelect)
        .eq('status', 'approved')
        .eq('is_active', true);
      if (error) throw error;
      const listings = (data ?? []) as ListingWithProfile[];
      return attachCookWideReviews(listings, listings);
    }

    // CASE 2: Run separate queries for each filter
    const [titleRes, descriptionRes, cuisineRes, restaurantRes, chefRes, locationRes] =
      await Promise.all([
        supabase
          .from('listings')
          .select(baseSelect)
          .eq('status', 'approved')
          .eq('is_active', true)
          .ilike('title', search),
        supabase
          .from('listings')
          .select(baseSelect)
          .eq('status', 'approved')
          .eq('is_active', true)
          .ilike('description', search),
        supabase
          .from('listings')
          .select(baseSelect)
          .eq('status', 'approved')
          .eq('is_active', true)
          .ilike('cuisine', search),
        supabase
          .from('listings')
          .select(baseSelect)
          .eq('status', 'approved')
          .eq('is_active', true)
          .ilike('profiles.restaurant_name', search),
        supabase
          .from('listings')
          .select(baseSelect)
          .eq('status', 'approved')
          .eq('is_active', true)
          .ilike('profiles.full_name', search),
        supabase
          .from('listings')
          .select(baseSelect)
          .eq('status', 'approved')
          .eq('is_active', true)
          .ilike('location', search),
      ]);

    // Collect results
    const allData = [
      ...(titleRes.data ?? []),
      ...(descriptionRes.data ?? []),
      ...(cuisineRes.data ?? []),
      ...(restaurantRes.data ?? []),
      ...(chefRes.data ?? []),
      ...(locationRes.data ?? []),
    ];

    // Combine and remove duplicates by ID
    const uniqueResults = allData.filter(
      (item, index, self) => index === self.findIndex(t => t.id === item.id)
    ) as ListingWithProfile[];

    const cookIds = [...new Set(uniqueResults.map(listing => listing.cook_id))];
    let ratingRows: CookRatingRow[] = [];
    if (cookIds.length > 0) {
      const { data, error } = await supabase
        .from('listings')
        .select('id, cook_id, reviews(rating)')
        .in('cook_id', cookIds)
        .eq('status', 'approved')
        .eq('is_active', true);
      if (error) throw error;
      ratingRows = (data ?? []) as CookRatingRow[];
    }

    console.log('✅ Search results:', uniqueResults.length);
    return attachCookWideReviews(uniqueResults, ratingRows);
  } catch (err) {
    console.error('❌ fetchCooks error:', err);
    throw err;
  }
};
