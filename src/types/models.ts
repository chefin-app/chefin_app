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
  /** Cook-wide rating inputs supplied by feed/search queries so restaurant
   * cards do not change score when only a subset of dishes is visible. */
  restaurant_reviews?: Array<Pick<Review, 'rating'>>;
  /** Active, approved dish ids for this cook. Availability filtering uses the
   * complete set even when the current feed shows one representative dish. */
  restaurant_listing_ids?: string[];
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
