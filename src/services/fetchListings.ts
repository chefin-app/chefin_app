import { supabase } from "./supabase"
import useFetch from "../hooks/useFetch"
import { Text } from "react-native"

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
    is_certified: boolean;
    is_active: boolean;
    created_at: string;
};

export const fetchListings = async ({ query }: { query?: string }): Promise<Listing[]> => {

    let request = supabase.from("listings").select("*");

    if (query && query.trim() !== "") {
        // ilike is case-insensitive LIKE (good for search)
        request = request.ilike("title", `%${query}%`);
    }

    const { data, error } = await request;
    //console.log("Supabase response:", { data, error });

    if (error) {
        throw new Error(error.message);
    }

    return (data ?? []) as Listing[];
};
