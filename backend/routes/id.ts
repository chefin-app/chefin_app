import express from 'express';
import { getListingAvailabilityBatch, getOpeningHoursForCook } from '../availabilityService';
import { getCookEligibilityByProfileId } from '../cookEligibility';
import { supabase } from '../supabaseClient';
import { getListingOptionGroups } from '../menuOptionService';

const router = express.Router();

const toCoordinate = (value: unknown, minimum: number, maximum: number): number | null => {
  const coordinate = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
};

// Same coarse buckets as home discovery — never a precise distance, so a home
// kitchen's coordinates stay uninferable.
const getDistanceLabel = (distanceKm: number): string => {
  if (distanceKm < 1) return 'Less than 1 km';
  if (distanceKm < 3) return '1–3 km';
  if (distanceKm < 5) return '3–5 km';
  if (distanceKm < 10) return '5–10 km';
  if (distanceKm < 20) return '10–20 km';
  return '20+ km';
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

// GET /:id/profile — public restaurant profile: rough area address (never the
// street or unit), opening hours, food-safety achievements, top picks and the
// full review list. Powers the buyer-side restaurant profile + details pages.
router.get('/:id/profile', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(
        'id, user_id, full_name, restaurant_name, profile_image, bio, is_verified, has_food_safety_license, address_locality, address_town, address_postcode'
      )
      .eq('id', id)
      .single();
    if (profileError || !profile) {
      return res.status(404).json({ error: 'Restaurant not found.' });
    }
    const eligibility = await getCookEligibilityByProfileId(id);
    if (!eligibility.eligibleToSell) {
      return res.status(404).json({ error: 'Restaurant not found.' });
    }

    const [{ data: listings, error: listingsError }, openingHours, { data: documents }] =
      await Promise.all([
        supabase
          .from('listings')
          .select('id, title, price, image_url, cuisine, reviews(rating)')
          .eq('cook_id', id)
          .eq('is_active', true)
          .eq('status', 'approved'),
        getOpeningHoursForCook(id),
        supabase
          .from('verification_documents')
          .select('doc_type, status')
          .eq('user_id', profile.user_id)
          .eq('status', 'approved'),
      ]);
    if (listingsError) throw listingsError;
    const listingRows = listings ?? [];
    const listingIds = listingRows.map(listing => listing.id);

    // Reviews with author + dish, newest first (client sorts/filters further).
    const { data: reviewRows, error: reviewsError } = listingIds.length
      ? await supabase
          .from('reviews')
          .select('id, rating, comment, created_at, listings(title), profiles(full_name)')
          .in('listing_id', listingIds)
          .order('created_at', { ascending: false })
          .limit(200)
      : { data: [], error: null };
    if (reviewsError) throw reviewsError;

    // Completed-order counts drive the "Most ordered" pick.
    const { data: orderRows, error: ordersError } = listingIds.length
      ? await supabase
          .from('orders')
          .select('listing_id, quantity')
          .in('listing_id', listingIds)
          .eq('status', 'completed')
      : { data: [], error: null };
    if (ordersError) throw ordersError;
    const orderCountByListing = new Map<string, number>();
    for (const row of orderRows ?? []) {
      orderCountByListing.set(
        row.listing_id,
        (orderCountByListing.get(row.listing_id) ?? 0) + (row.quantity ?? 1)
      );
    }

    const scored = listingRows.map(listing => {
      const ratings = (listing.reviews ?? []).map(review => review.rating);
      const avgRating = ratings.length
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : null;
      return {
        id: listing.id,
        title: listing.title,
        price: listing.price,
        image_url: listing.image_url,
        cuisine: listing.cuisine,
        orderCount: orderCountByListing.get(listing.id) ?? 0,
        avgRating,
        reviewCount: ratings.length,
      };
    });
    const byOrders = [...scored].sort((a, b) => b.orderCount - a.orderCount);
    const byRating = [...scored].sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0));
    const mostOrderedId = byOrders[0]?.orderCount ? byOrders[0].id : null;
    const topRatedId = byRating[0]?.avgRating ? byRating[0].id : null;
    const topPicks = byOrders.slice(0, 6).map(pick => ({
      ...pick,
      badge:
        pick.id === mostOrderedId ? 'Most ordered' : pick.id === topRatedId ? 'Top rated' : null,
    }));

    // Optional coarse distance when the buyer shares their location.
    let distanceLabel: string | null = null;
    const latitude = toCoordinate(req.query.lat, -90, 90);
    const longitude = toCoordinate(req.query.lng, -180, 180);
    if (latitude !== null && longitude !== null) {
      const { data: location } = await supabase
        .from('restaurant_discovery_locations')
        .select('latitude, longitude')
        .eq('cook_profile_id', id)
        .maybeSingle();
      if (location) {
        distanceLabel = getDistanceLabel(
          haversineDistanceKm(
            latitude,
            longitude,
            Number(location.latitude),
            Number(location.longitude)
          )
        );
      }
    }

    const approvedDocTypes = new Set((documents ?? []).map(doc => doc.doc_type));
    res.json({
      profile: {
        id: profile.id,
        full_name: profile.full_name,
        restaurant_name: profile.restaurant_name,
        profile_image: profile.profile_image,
        bio: profile.bio,
        is_verified: profile.is_verified,
      },
      areaAddress: [profile.address_locality, profile.address_town, profile.address_postcode]
        .filter(Boolean)
        .join(', '),
      openingHours,
      achievements: {
        foodSafetyLicense: Boolean(profile.has_food_safety_license),
        foodHandlerCertificate: approvedDocTypes.has('food_handler_certificate'),
        fosimRegistration: approvedDocTypes.has('fosim_registration'),
        typhoidVaccination: approvedDocTypes.has('typhoid_vaccination'),
      },
      cuisines: [...new Set(listingRows.map(listing => listing.cuisine).filter(Boolean))],
      topPicks,
      reviews: (reviewRows ?? []).map(review => {
        const listing = Array.isArray(review.listings) ? review.listings[0] : review.listings;
        const author = Array.isArray(review.profiles) ? review.profiles[0] : review.profiles;
        return {
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          created_at: review.created_at,
          dishTitle: listing?.title ?? null,
          reviewerName: author?.full_name ?? 'Customer',
        };
      }),
      distanceLabel,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Restaurant profile error:', message);
    res.status(500).json({ error: 'The restaurant profile could not be loaded.' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // get cook (home restaurant) profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(
        'id, full_name, restaurant_name, profile_image, bio, is_verified, free_delivery_threshold, store_status, store_busy_prep_minutes, store_paused_until'
      )
      .eq('id', id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return res.status(400).json({ erorr: profileError.message });
    }
    const eligibility = await getCookEligibilityByProfileId(id);
    if (!eligibility.eligibleToSell) {
      return res.status(404).json({ error: 'Restaurant not found.' });
    }

    // get their listings (menu) with reviews
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select(
        `
    id,
    cook_id,
    title,
    description,
    ingredients,
    price,
    image_url,
    cuisine,
    dietary_tags,
    location,
    reviews:reviews(listing_id, rating)
  `
      )
      .eq('cook_id', id)
      .eq('is_active', true)
      .eq('status', 'approved');

    if (listingsError) {
      console.error('Error fetching listings:', listingsError);
      return res.status(400).json({ error: listingsError });
    }
    const listingRows = listings ?? [];
    const availabilityByListing = await getListingAvailabilityBatch(
      listingRows.map(listing => listing.id)
    );
    const optionGroupsByListing = await getListingOptionGroups(
      listingRows.map(listing => listing.id)
    );
    const listingsWithAvailability = listingRows.map(listing => ({
      ...listing,
      option_groups: optionGroupsByListing[listing.id] ?? [],
      availability: availabilityByListing[listing.id] ?? {
        records: [],
        source: null,
        currentlyAvailable: false,
        remainingSlots: 0,
        constrainedBySellingSchedule: false,
      },
    }));

    // Normalise the cook-set store status for buyers: expired pauses read as
    // open, and the pause timestamp lets the client explain how long.
    const pauseActive =
      profile.store_status === 'paused' &&
      profile.store_paused_until &&
      new Date(profile.store_paused_until).getTime() > Date.now();
    const storeStatus = profile.store_status === 'busy' ? 'busy' : pauseActive ? 'paused' : 'open';
    const {
      store_status: _storeStatus,
      store_busy_prep_minutes: busyPrepMinutes,
      store_paused_until: pausedUntil,
      ...publicProfile
    } = profile;

    res.json({
      profile: publicProfile,
      listings: listingsWithAvailability,
      storeStatus,
      busyPrepMinutes: storeStatus === 'busy' ? busyPrepMinutes : null,
      pausedUntil: storeStatus === 'paused' ? pausedUntil : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Uknown error';
    console.error('Server error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
