import express from 'express';
import { getListingAvailabilityBatch } from '../availabilityService';
import { getCookEligibilityByProfileId } from '../cookEligibility';
import { supabase } from '../supabaseClient';
import { getListingOptionGroups } from '../menuOptionService';

const router = express.Router();

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
