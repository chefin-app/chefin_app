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
  pickup_location: string;
}

export interface Profile {
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
