export type Listing = {
  id: string;
  cook_id: string;
  title: string;
  description: string | null;
  price: number;
  image_url: string | null;
  cuisine: string | null;
  dietary_tags: string | null;
  location: string | null;
  created_at: string;
};

export const fetchListings = async ({ query }: { query?: string }): Promise<Listing[]> => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (!apiUrl) throw new Error('The Chefin API URL is not configured.');
  const url = new URL(`${apiUrl}/api/listings`);
  if (query && query.trim() !== '') {
    url.searchParams.append('query', query);
  }

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch {
    throw new Error(
      `Chefin could not reach the backend at ${apiUrl}. On a physical device, use your computer's LAN IP instead of localhost and keep both devices on the same Wi-Fi.`
    );
  }
  if (!res.ok) {
    throw new Error('Failed to fetch listings');
  }

  return (await res.json()) as Listing[];
};
