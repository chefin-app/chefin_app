import { createDiscoveryCache, withDiscoveryTimeout } from './discoveryCache';
import type { Listing, Profile } from '@/src/types/models';

interface ListingWithProfile extends Listing {
  profiles: Profile;
}

const cachedListings = createDiscoveryCache<ListingWithProfile[]>();

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
  return cachedListings(`${apiUrl}/all${suffix}`, () =>
    withDiscoveryTimeout(async signal => {
      let response: Response;
      try {
        response = await fetch(`${apiUrl}/api/listings/all-listings${suffix}`, { signal });
      } catch {
        throw new Error(
          `Chefin could not reach the backend at ${apiUrl}. On a physical device, use your computer's LAN IP instead of localhost and keep both devices on the same Wi-Fi.`
        );
      }
      return readListingsResponse(response);
    })
  );
};

export const fetchNearestCooks = async ({
  latitude,
  longitude,
  limit = 20,
  radiusKm = 25,
  cuisine,
  query,
}: {
  latitude: number;
  longitude: number;
  limit?: number;
  radiusKm?: number;
  cuisine?: string;
  query?: string;
}): Promise<ListingWithProfile[]> => {
  const apiUrl = getApiUrl();
  const body = JSON.stringify({ latitude, longitude, limit, radiusKm, cuisine, query });
  return cachedListings(`${apiUrl}/nearest:${body}`, () =>
    withDiscoveryTimeout(async signal => {
      let response: Response;
      try {
        response = await fetch(`${apiUrl}/api/home/nearest-chefin-listings`, {
          signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
      } catch {
        throw new Error(
          `Chefin could not reach the backend at ${apiUrl}. Check your connection and try again.`
        );
      }
      return readListingsResponse(response);
    })
  );
};
