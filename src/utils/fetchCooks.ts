import { supabase } from '../services/supabase';
import type { Listing, Profile } from '@/src/types/models';

interface ListingWithProfile extends Listing {
  profiles: Profile;
}

export const fetchCooks = async ({ query }: { query: string }): Promise<ListingWithProfile[]> => {
  const search = `%${query?.trim() ?? ''}%`;

  // Base selection used across all queries
  const baseSelect = `*, profiles!inner ( user_id, full_name, profile_image, is_verified, restaurant_name )`;

  try {
    // CASE 1: No query — fetch everything
    if (!query || query.trim() === '') {
      const { data, error } = await supabase.from('listings').select(baseSelect);
      if (error) throw error;
      return (data ?? []) as ListingWithProfile[];
    }

    // CASE 2: Run separate queries for each filter
    const [titleRes, descriptionRes, cuisineRes, restaurantRes, chefRes, locationRes] =
      await Promise.all([
        supabase.from('listings').select(baseSelect).ilike('title', search),
        supabase.from('listings').select(baseSelect).ilike('description', search),
        supabase.from('listings').select(baseSelect).ilike('cuisine', search),
        supabase.from('listings').select(baseSelect).ilike('profiles.restaurant_name', search),
        supabase.from('listings').select(baseSelect).ilike('profiles.full_name', search),
        supabase.from('listings').select(baseSelect).ilike('location', search),
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
    );

    console.log('✅ Search results:', uniqueResults.length);
    return uniqueResults as ListingWithProfile[];
  } catch (err) {
    console.error('❌ fetchCooks error:', err);
    throw err;
  }
};
