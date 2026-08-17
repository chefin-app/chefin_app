export interface RestaurantDiscoveryLocationDraft {
  latitude: number;
  longitude: number;
  label: string;
  source: 'address_search' | 'manual';
}

type GeocodingResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
};

export async function geocodeRestaurantAddress(
  address: string
): Promise<RestaurantDiscoveryLocationDraft> {
  const query = address.trim();
  if (!query) throw new Error('Enter a complete restaurant address.');
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    query
  )}&format=json&limit=1&countrycodes=my`;
  const response = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!response.ok) throw new Error('The restaurant area could not be located.');
  const results = (await response.json()) as GeocodingResult[];
  const match = results[0];
  const latitude = Number(match?.lat);
  const longitude = Number(match?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Select an address suggestion or check the postcode and city.');
  }
  return {
    latitude,
    longitude,
    label: match.display_name?.trim() || query,
    source: 'manual',
  };
}

export async function saveRestaurantDiscoveryLocation(
  accessToken: string | undefined,
  location: RestaurantDiscoveryLocationDraft
): Promise<void> {
  if (!accessToken) throw new Error('Your session has expired. Please sign in again.');
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (!apiUrl) throw new Error('The Chefin API URL is not configured.');
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/account/restaurant-discovery-location`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(location),
    });
  } catch {
    throw new Error('Chefin could not save the restaurant discovery location.');
  }
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'The restaurant discovery location could not be saved.');
  }
}
