import type { Listing, Profile } from '@/src/types/models';

interface ListingWithProfile extends Listing {
  profiles: Profile;
}

const getApiUrl = (): string => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (!apiUrl) throw new Error('The Chefin API URL is not configured.');
  return apiUrl;
};

const readListingsResponse = async (response: Response): Promise<ListingWithProfile[]> => {
  const payload = (await response.json().catch(() => ({}))) as
    | ListingWithProfile[]
    | { error?: string };
  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(!Array.isArray(payload) && payload.error ? payload.error : 'Listings failed.');
  }
  return payload;
};

/**
 * Discovery is served by the backend so the 90-day reverification deadline is
 * enforced even after an already-approved listing has been sitting untouched.
 * A client-side Supabase query cannot safely inspect another cook's private
 * application record.
 */
export const fetchCooks = async ({ query }: { query: string }): Promise<ListingWithProfile[]> => {
  const apiUrl = getApiUrl();
  const params = new URLSearchParams();
  if (query.trim()) params.set('query', query.trim());
  const suffix = params.toString() ? `?${params.toString()}` : '';
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/listings/all-listings${suffix}`);
  } catch {
    throw new Error(
      `Chefin could not reach the backend at ${apiUrl}. On a physical device, use your computer's LAN IP instead of localhost and keep both devices on the same Wi-Fi.`
    );
  }
  return readListingsResponse(response);
};

export const fetchNearestCooks = async ({
  latitude,
  longitude,
  limit = 20,
  radiusKm = 25,
}: {
  latitude: number;
  longitude: number;
  limit?: number;
  radiusKm?: number;
}): Promise<ListingWithProfile[]> => {
  const apiUrl = getApiUrl();
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/home/nearest-chefin-listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude, longitude, limit, radiusKm }),
    });
  } catch {
    throw new Error(
      `Chefin could not reach the backend at ${apiUrl}. Check your connection and try again.`
    );
  }
  return readListingsResponse(response);
};
