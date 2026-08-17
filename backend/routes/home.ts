import express from 'express';
import { supabase } from '../supabaseClient';
import { getEligibleCookUserIds, getPausedCookProfileIds } from '../cookEligibility';
import { filterListingsWithFutureAvailability } from '../availabilityService';

const router = express.Router();

type CookRatingRow = {
  id: string;
  cook_id: string;
  reviews: Array<{ rating: number }> | null;
};

type RestaurantLocationRow = {
  cook_profile_id: string;
  latitude: number | string;
  longitude: number | string;
};

const toCoordinate = (value: unknown, minimum: number, maximum: number): number | null => {
  const coordinate = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
};

const haversineDistanceKm = (
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number
): number => {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(toLatitude - fromLatitude);
  const longitudeDelta = radians(toLongitude - fromLongitude);
  const startLatitude = radians(fromLatitude);
  const endLatitude = radians(toLatitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Coarse labels preserve the usefulness of proximity ordering without making
// private home-kitchen coordinates inferable from precise distance values.
const getDistanceLabel = (distanceKm: number): string => {
  if (distanceKm < 1) return 'Less than 1 km away';
  if (distanceKm < 3) return '1–3 km away';
  if (distanceKm < 5) return '3–5 km away';
  if (distanceKm < 10) return '5–10 km away';
  if (distanceKm < 20) return '10–20 km away';
  return '20+ km away';
};

// POST keeps the customer's private origin out of URLs, access logs and route
// history. The response is public restaurant data plus a coarse distance label;
// neither customer nor cook coordinates are ever returned.
router.post('/nearest-chefin-listings', async (req, res) => {
  const body = req.body ?? {};
  const latitude = toCoordinate(body.latitude, -90, 90);
  const longitude = toCoordinate(body.longitude, -180, 180);
  if (latitude === null || longitude === null) {
    return res.status(400).json({ error: 'A valid latitude and longitude are required.' });
  }

  const requestedLimit = Number(body.limit ?? 20);
  const requestedRadius = Number(body.radiusKm ?? 25);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(50, Math.max(1, Math.round(requestedLimit)))
    : 20;
  const radiusKm = Number.isFinite(requestedRadius)
    ? Math.min(50, Math.max(1, requestedRadius))
    : 25;

  try {
    const { data: locationData, error: locationError } = await supabase
      .from('restaurant_discovery_locations')
      .select('cook_profile_id, latitude, longitude');
    if (locationError) throw locationError;

    const nearestLocations = ((locationData ?? []) as RestaurantLocationRow[])
      .map(location => ({
        cookId: location.cook_profile_id,
        distanceKm: haversineDistanceKm(
          latitude,
          longitude,
          Number(location.latitude),
          Number(location.longitude)
        ),
      }))
      .filter(location => Number.isFinite(location.distanceKm) && location.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    if (nearestLocations.length === 0) {
      res.set('Cache-Control', 'no-store');
      return res.json([]);
    }

    const distanceByCook = new Map(
      nearestLocations.map(location => [location.cookId, location.distanceKm])
    );
    const { data: listingData, error: listingError } = await supabase
      .from('listings')
      .select(
        '*, reviews(id, rating, comment), profiles!inner(user_id, full_name, profile_image, is_verified, restaurant_name)'
      )
      .in(
        'cook_id',
        nearestLocations.map(location => location.cookId)
      )
      .eq('status', 'approved')
      .eq('is_active', true);
    if (listingError) throw listingError;

    const rows = listingData ?? [];
    const eligibleUserIds = await getEligibleCookUserIds(
      rows.flatMap(row => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        return profile?.user_id ? [profile.user_id] : [];
      })
    );
    const accountEligibleRows = rows.filter(row => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return Boolean(profile?.user_id && eligibleUserIds.has(profile.user_id));
    });
    // A dish with no recurring schedule (or valid legacy slot) must not leak
    // back into discovery simply because its restaurant happens to be nearby.
    const availableRows = await filterListingsWithFutureAvailability(accountEligibleRows);
    const pausedCookIds = await getPausedCookProfileIds(availableRows.map(row => row.cook_id));
    const eligibleRows = availableRows.filter(row => !pausedCookIds.has(row.cook_id));
    const cooksWithListings = new Set(eligibleRows.map(row => row.cook_id));
    const selectedCookIds = nearestLocations
      .filter(location => cooksWithListings.has(location.cookId))
      .slice(0, limit)
      .map(location => location.cookId);
    const selectedCookSet = new Set(selectedCookIds);
    const orderByCook = new Map(selectedCookIds.map((cookId, index) => [cookId, index]));

    const selectedRows = eligibleRows
      .filter(row => selectedCookSet.has(row.cook_id))
      .sort((a, b) => (orderByCook.get(a.cook_id) ?? 0) - (orderByCook.get(b.cook_id) ?? 0));
    const reviewsByCook = new Map<string, Array<{ rating: number }>>();
    const listingIdsByCook = new Map<string, string[]>();
    for (const row of accountEligibleRows.filter(candidate =>
      selectedCookSet.has(candidate.cook_id)
    ) as CookRatingRow[]) {
      reviewsByCook.set(row.cook_id, [
        ...(reviewsByCook.get(row.cook_id) ?? []),
        ...(row.reviews ?? []),
      ]);
    }
    for (const row of selectedRows) {
      listingIdsByCook.set(row.cook_id, [...(listingIdsByCook.get(row.cook_id) ?? []), row.id]);
    }

    res.set('Cache-Control', 'no-store');
    res.json(
      selectedRows.map(row => ({
        ...row,
        restaurant_reviews: reviewsByCook.get(row.cook_id) ?? [],
        restaurant_listing_ids: listingIdsByCook.get(row.cook_id) ?? [row.id],
        distance_label: getDistanceLabel(distanceByCook.get(row.cook_id) ?? radiusKm),
      }))
    );
  } catch (error: unknown) {
    console.error('Error fetching nearest home restaurants:', error);
    res.status(500).json({ error: 'Nearest home restaurants are unavailable right now.' });
  }
});

// GET popular listings
router.get('/popular-chefin-listings', async (req, res) => {
  try {
    // fetch popular home restaurant listings
    const { data: popularData, error: popularError } = await supabase
      .from('listings')
      .select(
        `
        *,
        reviews (
          id,
          rating,
          comment
        ),
        profiles!inner (
          user_id,
          full_name,
          profile_image,
          is_verified,
          restaurant_name
        )
      `
      )
      .eq('status', 'approved')
      .eq('is_active', true)
      .limit(50);
    if (popularError) throw popularError;

    const candidateListings = popularData ?? [];
    const eligibleUserIds = await getEligibleCookUserIds(
      candidateListings.flatMap(listing => {
        const profile = Array.isArray(listing.profiles) ? listing.profiles[0] : listing.profiles;
        return profile?.user_id ? [profile.user_id] : [];
      })
    );
    const accountEligibleCandidates = candidateListings.filter(listing => {
      const profile = Array.isArray(listing.profiles) ? listing.profiles[0] : listing.profiles;
      return Boolean(profile?.user_id && eligibleUserIds.has(profile.user_id));
    });
    const scheduledCandidates =
      await filterListingsWithFutureAvailability(accountEligibleCandidates);
    const pausedCookIds = await getPausedCookProfileIds(
      scheduledCandidates.map(listing => listing.cook_id)
    );
    const availableCandidates = scheduledCandidates.filter(
      listing => !pausedCookIds.has(listing.cook_id)
    );
    const popularListings = availableCandidates.slice(0, 10);
    const cookIds = [...new Set(popularListings.map(listing => listing.cook_id))];
    const reviewsByCook = new Map<string, Array<{ rating: number }>>();
    const listingIdsByCook = new Map<string, string[]>();

    if (cookIds.length > 0) {
      // The visible feed is deliberately limited, but a restaurant's score
      // must include every active, approved dish—not only whichever dishes
      // happened to land in that ten-item window.
      const { data: ratingRows, error: ratingError } = await supabase
        .from('listings')
        .select('id, cook_id, reviews(rating)')
        .in('cook_id', cookIds)
        .eq('status', 'approved')
        .eq('is_active', true);
      if (ratingError) throw ratingError;

      for (const row of (ratingRows ?? []) as CookRatingRow[]) {
        const current = reviewsByCook.get(row.cook_id) ?? [];
        current.push(...(row.reviews ?? []));
        reviewsByCook.set(row.cook_id, current);
      }

      // Availability lookup should include only customer-visible dishes. A
      // hidden unscheduled sibling must not make a restaurant appear bookable.
      for (const listing of availableCandidates) {
        if (!cookIds.includes(listing.cook_id)) continue;
        const listingIds = listingIdsByCook.get(listing.cook_id) ?? [];
        listingIds.push(listing.id);
        listingIdsByCook.set(listing.cook_id, listingIds);
      }
    }

    res.json({
      popularChefins: popularListings.map(listing => ({
        ...listing,
        restaurant_reviews: reviewsByCook.get(listing.cook_id) ?? [],
        restaurant_listing_ids: listingIdsByCook.get(listing.cook_id) ?? [listing.id],
      })),
    });
  } catch (err: unknown) {
    console.error('Error fetching popular listings:', err);
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    res.status(500).json({ error: message });
  }
});

export default router;
