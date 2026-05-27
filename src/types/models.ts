export interface Listing {
  id: string;
  cook_id: string;
  title: string;
  description?: string;
  cuisine?: string;
  price: number;
  image_url: string;
  created_at: string;
  dietary_tags?: string[];
  location: string;
  reviews?: ListingReview[];
  profiles?: Profile;
}

/** Slim subset of Review embedded under a listing — matches the fields selected
 * by the home/search Supabase queries (id, rating, comment). */
export type ListingReview = Pick<Review, 'id' | 'rating' | 'comment'>;

export interface Profile {
  id?: string;
  user_id: string;
  full_name: string;
  profile_image?: string;
  is_verified: boolean;
  restaurant_name: string;
}

export interface Review {
  id: string;
  listing_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}
