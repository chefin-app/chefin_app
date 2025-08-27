import { supabase } from './supabase';
import useFetch from '../hooks/useFetch';

export type Restaurant = {
  restaurant_name: string;
};

export const fetchRestaurantName = async ({ query }: { query?: string }): Promise<Restaurant[]> => {
  let request = supabase.from('profiles').select('restaurant_name');

  if (query && query.trim() !== '') {
    request = request.ilike('restaurant_name', `%${query}%`);
  }

  const { data, error } = await request;
  //console.log("Supabase response:", { data, error });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Restaurant[];
};
