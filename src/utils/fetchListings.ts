import useFetch from '../hooks/useFetch';
import { Text } from 'react-native';
// import { Listing } from '../types/models';

export type Listing = {
  id: string;
  cook_id: string;
  title: string;
  description: string | null;
  price: number;
  image_url: string | null;
  cuisine: string | null;
  dietary_tags: string | null;
  pickup_location: string | null;
  created_at: string;
};

export const fetchListings = async ({ query }: { query?: string }): Promise<Listing[]> => {
  const url = new URL('http://localhost:8000/api/listings');
  if (query && query.trim() !== '') {
    url.searchParams.append('query', query);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error('Failed to fetch listings');
  }

  return (await res.json()) as Listing[];
};
