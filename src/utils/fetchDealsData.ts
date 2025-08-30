import { supabase } from '../services/supabase';

interface Listing {
  id: string;
  cook_id: string;
  title: string;
  description?: string;
  cuisine?: string;
  price: number;
  image_url?: string;
  created_at: string;
  dietary_tags?: string[];
  pickup_location: string;
}

interface Profile {
  user_id: string;
  full_name: string;
  profile_image?: string;
  is_verified: boolean;
  restaurant_name: string;
}

interface ListingWithProfile extends Listing {
  profiles: Profile;
}

export const fetchDealsData = async () => {
  const request = supabase
    .from('listings')
    .select(`*, profiles ( user_id, full_name, profile_image, is_verified, restaurant_name )`)
    .limit(10);
  const { data, error } = await request;

  if (error) {
    throw new Error(error.message);
  }
  console.log('Total listings:', data);
  return (data ?? []) as ListingWithProfile[];
};
