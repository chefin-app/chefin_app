import express from 'express';
import type { AccountRequest } from '../accountAccess';
import { requireActiveAccount, requireReadableAccount } from '../accountAccess';
import {
  buildCookPerformance,
  type CookPerformanceLedgerEntry,
  type CookPerformanceOrder,
} from '../cookPerformance';
import { supabase } from '../supabaseClient';

const router = express.Router();
const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

router.get('/status', requireReadableAccount, (req: AccountRequest, res) => {
  res.json({ account: req.account });
});

router.get('/cook-performance', requireReadableAccount, async (req: AccountRequest, res) => {
  try {
    const [{ data: role, error: roleError }, { data: profile, error: profileError }] =
      await Promise.all([
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', req.account!.userId)
          .eq('role', 'cook')
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('id, full_name, restaurant_name, profile_image')
          .eq('id', req.account!.profileId)
          .single(),
      ]);
    if (roleError || profileError) throw roleError ?? profileError;
    if (!role) return res.status(403).json({ error: 'Cook access is required.' });

    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('id, status, is_active')
      .eq('cook_id', profile.id);
    if (listingsError) throw listingsError;

    const listingIds = (listings ?? []).map(listing => listing.id);
    const publishedListingIds = (listings ?? [])
      .filter(listing => listing.status === 'approved' && listing.is_active === true)
      .map(listing => listing.id);
    const [orders, reviewRows, ledgerEntries] = await Promise.all([
      listingIds.length > 0
        ? fetchAllRows<CookPerformanceOrder>((from, to) =>
            supabase
              .from('orders')
              .select(
                'checkout_id, customer_id, total_price, payment_status, refund_status, status, completed_at'
              )
              .in('listing_id', listingIds)
              .order('id', { ascending: true })
              .range(from, to)
          )
        : Promise.resolve([]),
      publishedListingIds.length > 0
        ? fetchAllRows<{ rating: number }>((from, to) =>
            supabase
              .from('reviews')
              .select('rating')
              .in('listing_id', publishedListingIds)
              .order('id', { ascending: true })
              .range(from, to)
          )
        : Promise.resolve([]),
      fetchAllRows<CookPerformanceLedgerEntry>((from, to) =>
        supabase
          .from('cook_payout_ledger')
          .select('amount, status, updated_at')
          .eq('cook_id', profile.id)
          .order('id', { ascending: true })
          .range(from, to)
      ),
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({
      profile: {
        fullName: profile.full_name,
        restaurantName: profile.restaurant_name,
        imageUrl: profile.profile_image,
      },
      performance: buildCookPerformance(
        orders,
        reviewRows.map(review => review.rating),
        ledgerEntries
      ),
    });
  } catch (error: unknown) {
    console.error('Could not load cook performance:', error);
    res.status(500).json({ error: 'Cook performance could not be loaded.' });
  }
});

type LocationSource = 'device' | 'manual';

const parseCoordinate = (value: unknown, minimum: number, maximum: number): number | null => {
  const coordinate = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
};

const cleanLabel = (value: unknown): string | null => {
  const label = typeof value === 'string' ? value.trim() : '';
  return label ? label.slice(0, 200) : null;
};

// Customer coordinates are private account data. They are returned only to
// the authenticated owner and are never embedded in public discovery payloads.
router.get('/location', requireReadableAccount, async (req: AccountRequest, res) => {
  try {
    const { data, error } = await supabase
      .from('customer_location_preferences')
      .select('label, latitude, longitude, source, prompted_at, consented_at, updated_at')
      .eq('user_id', req.account!.userId)
      .maybeSingle();
    if (error) throw error;

    res.set('Cache-Control', 'no-store');
    res.json({
      preference: data
        ? {
            label: data.label,
            latitude: data.latitude == null ? null : Number(data.latitude),
            longitude: data.longitude == null ? null : Number(data.longitude),
            source: data.source,
            promptedAt: data.prompted_at,
            consentedAt: data.consented_at,
            updatedAt: data.updated_at,
          }
        : null,
    });
  } catch (error: unknown) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Location preference is unavailable.',
    });
  }
});

router.put('/location', requireActiveAccount, async (req: AccountRequest, res) => {
  const body = req.body ?? {};
  const latitude = parseCoordinate(body.latitude, -90, 90);
  const longitude = parseCoordinate(body.longitude, -180, 180);
  const source = String(body.source ?? '') as LocationSource;
  if (latitude === null || longitude === null) {
    return res.status(400).json({ error: 'A valid latitude and longitude are required.' });
  }
  if (source !== 'device' && source !== 'manual') {
    return res.status(400).json({ error: "source must be 'device' or 'manual'." });
  }

  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('customer_location_preferences')
      .upsert(
        {
          user_id: req.account!.userId,
          label: cleanLabel(body.label),
          // Six decimals are supported by the private table. Public responses
          // never include these values.
          latitude: Number(latitude.toFixed(6)),
          longitude: Number(longitude.toFixed(6)),
          source,
          prompted_at: now,
          consented_at: now,
          updated_at: now,
        },
        { onConflict: 'user_id' }
      )
      .select('label, latitude, longitude, source, prompted_at, consented_at, updated_at')
      .single();
    if (error) throw error;

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      preference: {
        label: data.label,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        source: data.source,
        promptedAt: data.prompted_at,
        consentedAt: data.consented_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (error: unknown) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Location preference could not be saved.',
    });
  }
});

const clearCustomerLocation = async (req: AccountRequest, res: express.Response) => {
  try {
    const now = new Date().toISOString();
    const { error } = await supabase.from('customer_location_preferences').upsert(
      {
        user_id: req.account!.userId,
        label: null,
        latitude: null,
        longitude: null,
        source: null,
        prompted_at: now,
        consented_at: null,
        updated_at: now,
      },
      { onConflict: 'user_id' }
    );
    if (error) throw error;
    res.set('Cache-Control', 'no-store');
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Location preference could not be updated.',
    });
  }
};

// Dismissal and clearing both retain prompted_at, so declining permission is
// respected and the first-run prompt is not shown on every launch.
router.post('/location/dismiss', requireActiveAccount, clearCustomerLocation);
router.delete('/location', requireActiveAccount, clearCustomerLocation);

router.get(
  '/restaurant-discovery-location',
  requireReadableAccount,
  async (req: AccountRequest, res) => {
    try {
      const { data, error } = await supabase
        .from('restaurant_discovery_locations')
        .select('label, latitude, longitude, source, precision, updated_at')
        .eq('cook_profile_id', req.account!.profileId)
        .maybeSingle();
      if (error) throw error;
      res.set('Cache-Control', 'no-store');
      res.json({
        location: data
          ? {
              ...data,
              latitude: Number(data.latitude),
              longitude: Number(data.longitude),
            }
          : null,
      });
    } catch (error: unknown) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Restaurant area is unavailable.',
      });
    }
  }
);

router.put(
  '/restaurant-discovery-location',
  requireActiveAccount,
  async (req: AccountRequest, res) => {
    const body = req.body ?? {};
    const latitude = parseCoordinate(body.latitude, -90, 90);
    const longitude = parseCoordinate(body.longitude, -180, 180);
    const source = String(body.source ?? 'manual');
    if (latitude === null || longitude === null) {
      return res.status(400).json({ error: 'A valid latitude and longitude are required.' });
    }
    if (source !== 'manual' && source !== 'address_search') {
      return res.status(400).json({ error: 'Restaurant location source is invalid.' });
    }

    try {
      const now = new Date().toISOString();
      const { error: privateLocationError } = await supabase
        .from('restaurant_delivery_locations')
        .upsert(
          {
            cook_profile_id: req.account!.profileId,
            label: cleanLabel(body.label),
            latitude: Number(latitude.toFixed(6)),
            longitude: Number(longitude.toFixed(6)),
            source,
            updated_at: now,
          },
          { onConflict: 'cook_profile_id' }
        );
      if (privateLocationError) throw privateLocationError;

      const { error } = await supabase.from('restaurant_discovery_locations').upsert(
        {
          cook_profile_id: req.account!.profileId,
          label: cleanLabel(body.label),
          // Discovery uses an intentionally approximate point (roughly a
          // 100-metre grid), never the exact private kitchen address.
          latitude: Number(latitude.toFixed(3)),
          longitude: Number(longitude.toFixed(3)),
          source,
          precision: 'approximate',
          updated_at: now,
        },
        { onConflict: 'cook_profile_id' }
      );
      if (error) throw error;
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Restaurant area could not be saved.',
      });
    }
  }
);

export default router;
