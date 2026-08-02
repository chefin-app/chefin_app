import express from 'express';
import type { AdminRequest } from '../middleware/requireAdmin';
import { requireAdmin } from '../middleware/requireAdmin';
import { supabase } from '../supabaseClient';

const router = express.Router();

const ADMIN_TIME_ZONE = 'Asia/Kuala_Lumpur';
const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 } as const;
type OverviewPeriod = keyof typeof PERIOD_DAYS;

type ProfileRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  profile_image: string | null;
  restaurant_name: string | null;
  is_verified: boolean | null;
  created_at: string | null;
};

type ListingRow = {
  id: string;
  cook_id: string;
  title: string;
  cuisine: string | null;
  image_url: string | null;
  status: string;
  is_active: boolean | null;
};

type OrderRow = {
  id: string;
  listing_id: string;
  quantity: number;
  total_price: number | string;
  fulfillment_type: string | null;
  status: string | null;
  payment_status: string | null;
  created_at: string | null;
  profiles: { full_name: string | null; profile_image: string | null } | null;
  listings:
    | (ListingRow & {
        profiles: {
          full_name: string | null;
          restaurant_name: string | null;
          profile_image: string | null;
        } | null;
      })
    | null;
};

type ReviewRow = { rating: number; listings: { cook_id: string } | null };

const relation = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

const malaysiaDateKey = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ADMIN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const periodStart = (days: number, now = new Date()): Date => {
  const anchor = new Date(now.getTime() - (days - 1) * 86400000);
  return new Date(`${malaysiaDateKey(anchor)}T00:00:00+08:00`);
};

const compactId = (id: string): string => id.split('-')[0].toUpperCase();

const buildSalesSeries = (orders: OrderRow[], days: number, now = new Date()) => {
  const start = periodStart(days, now);
  const bucketCount = days <= 7 ? days : 12;
  const rangeMilliseconds = Math.max(1, now.getTime() - start.getTime());
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketDate = new Date(start.getTime() + (index / bucketCount) * rangeMilliseconds);
    return {
      label: new Intl.DateTimeFormat('en-MY', {
        timeZone: ADMIN_TIME_ZONE,
        day: 'numeric',
        month: 'short',
      }).format(bucketDate),
      value: 0,
      orders: 0,
    };
  });

  for (const order of orders) {
    if (!order.created_at || order.status === 'cancelled' || order.payment_status !== 'paid') {
      continue;
    }
    const elapsed = new Date(order.created_at).getTime() - start.getTime();
    const index = Math.min(
      bucketCount - 1,
      Math.floor((elapsed / rangeMilliseconds) * bucketCount)
    );
    if (index < 0 || index >= buckets.length) continue;
    buckets[index].value += Number(order.total_price) || 0;
    buckets[index].orders += 1;
  }

  return buckets.map(bucket => ({ ...bucket, value: Number(bucket.value.toFixed(2)) }));
};

router.use(requireAdmin);

router.get('/session', (req: AdminRequest, res) => {
  res.json({ admin: req.admin });
});

router.get('/overview', async (req, res) => {
  const requestedPeriod = typeof req.query.period === 'string' ? req.query.period : '30d';
  const period: OverviewPeriod =
    requestedPeriod in PERIOD_DAYS ? (requestedPeriod as OverviewPeriod) : '30d';
  const days = PERIOD_DAYS[period];
  const start = periodStart(days).toISOString();

  try {
    const [
      profilesResult,
      rolesResult,
      listingsResult,
      ordersResult,
      reviewsResult,
      docsResult,
      reportsResult,
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, user_id, full_name, profile_image, restaurant_name, is_verified, created_at'),
      supabase.from('user_roles').select('user_id, role').eq('role', 'cook'),
      supabase.from('listings').select('id, cook_id, title, cuisine, image_url, status, is_active'),
      supabase
        .from('orders')
        .select(
          'id, listing_id, quantity, total_price, fulfillment_type, status, payment_status, created_at, profiles(full_name, profile_image), listings(id, cook_id, title, cuisine, image_url, status, is_active, profiles(full_name, restaurant_name, profile_image))'
        )
        .gte('created_at', start)
        .order('created_at', { ascending: false }),
      supabase.from('reviews').select('rating, listings(cook_id)'),
      supabase
        .from('verification_documents')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('content_reports')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'reviewing']),
    ]);

    const firstError = [
      profilesResult.error,
      rolesResult.error,
      listingsResult.error,
      ordersResult.error,
      reviewsResult.error,
      docsResult.error,
      reportsResult.error,
    ].find(Boolean);
    if (firstError) throw firstError;

    const profiles = (profilesResult.data ?? []) as ProfileRow[];
    const listings = (listingsResult.data ?? []) as ListingRow[];
    const orders = (ordersResult.data ?? []).map(raw => {
      const row = raw as unknown as Omit<OrderRow, 'profiles' | 'listings'> & {
        profiles: OrderRow['profiles'] | OrderRow['profiles'][];
        listings: OrderRow['listings'] | OrderRow['listings'][];
      };
      const listing = relation(row.listings);
      return {
        ...row,
        profiles: relation(row.profiles),
        listings: listing ? { ...listing, profiles: relation(listing.profiles) } : null,
      } satisfies OrderRow;
    });
    const reviews = (reviewsResult.data ?? []).map(raw => {
      const row = raw as unknown as {
        rating: number;
        listings: ReviewRow['listings'] | ReviewRow['listings'][];
      };
      return { rating: row.rating, listings: relation(row.listings) } satisfies ReviewRow;
    });

    const cookUserIds = new Set((rolesResult.data ?? []).map(role => role.user_id));
    const paidOrders = orders.filter(
      order => order.payment_status === 'paid' && order.status !== 'cancelled'
    );
    const recordedOrderValue = paidOrders.reduce(
      (sum, order) => sum + (Number(order.total_price) || 0),
      0
    );

    const orderStatsByCook = new Map<string, { orders: number; revenue: number }>();
    for (const order of paidOrders) {
      const cookId = order.listings?.cook_id;
      if (!cookId) continue;
      const current = orderStatsByCook.get(cookId) ?? { orders: 0, revenue: 0 };
      current.orders += 1;
      current.revenue += Number(order.total_price) || 0;
      orderStatsByCook.set(cookId, current);
    }

    const ratingsByCook = new Map<string, { sum: number; count: number }>();
    for (const review of reviews) {
      const cookId = review.listings?.cook_id;
      if (!cookId || !Number.isFinite(review.rating)) continue;
      const current = ratingsByCook.get(cookId) ?? { sum: 0, count: 0 };
      current.sum += review.rating;
      current.count += 1;
      ratingsByCook.set(cookId, current);
    }

    const listingsByCook = new Map<string, ListingRow[]>();
    for (const listing of listings) {
      const current = listingsByCook.get(listing.cook_id) ?? [];
      current.push(listing);
      listingsByCook.set(listing.cook_id, current);
    }

    const topCooks = profiles
      .filter(profile => cookUserIds.has(profile.user_id))
      .map(profile => {
        const stats = orderStatsByCook.get(profile.id) ?? { orders: 0, revenue: 0 };
        const rating = ratingsByCook.get(profile.id) ?? { sum: 0, count: 0 };
        const cuisines = (listingsByCook.get(profile.id) ?? [])
          .map(listing => listing.cuisine?.trim())
          .filter((value): value is string => Boolean(value));
        const cuisineCounts = new Map<string, number>();
        cuisines.forEach(cuisine =>
          cuisineCounts.set(cuisine, (cuisineCounts.get(cuisine) ?? 0) + 1)
        );
        const dominantCuisine = [...cuisineCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        return {
          id: profile.id,
          displayId: compactId(profile.id),
          name: profile.restaurant_name?.trim() || profile.full_name?.trim() || 'Unnamed cook',
          ownerName: profile.full_name?.trim() || 'Unknown',
          avatarUrl: profile.profile_image,
          cuisine: dominantCuisine ?? 'Mixed',
          totalOrders: stats.orders,
          averageRating: rating.count > 0 ? Number((rating.sum / rating.count).toFixed(1)) : null,
          recordedOrderValue: Number(stats.revenue.toFixed(2)),
        };
      })
      .filter(cook => cook.totalOrders > 0)
      .sort((a, b) => b.recordedOrderValue - a.recordedOrderValue || b.totalOrders - a.totalOrders)
      .slice(0, 5);

    const fulfillment = orders.reduce(
      (result, order) => {
        if (order.fulfillment_type === 'delivery') result.delivery += 1;
        else result.pickup += 1;
        return result;
      },
      { pickup: 0, delivery: 0 }
    );
    const orderStatus = orders.reduce<Record<string, number>>((result, order) => {
      const status = order.status ?? 'unknown';
      result[status] = (result[status] ?? 0) + 1;
      return result;
    }, {});
    const dishStatus = listings.reduce<Record<string, number>>((result, listing) => {
      result[listing.status] = (result[listing.status] ?? 0) + 1;
      return result;
    }, {});

    const recentOrders = orders.slice(0, 8).map(order => ({
      id: order.id,
      displayId: compactId(order.id),
      mealName: order.listings?.title ?? 'Deleted dish',
      imageUrl: order.listings?.image_url ?? null,
      customerName: order.profiles?.full_name ?? 'Unknown customer',
      cookName:
        order.listings?.profiles?.restaurant_name ??
        order.listings?.profiles?.full_name ??
        'Unknown cook',
      fulfillmentType: order.fulfillment_type === 'delivery' ? 'Delivery' : 'Self-collection',
      orderValue: Number(order.total_price) || 0,
      status: order.status ?? 'pending',
      createdAt: order.created_at,
    }));

    res.json({
      period,
      generatedAt: new Date().toISOString(),
      summary: {
        totalUsers: profiles.length,
        totalCooks: cookUserIds.size,
        totalDishes: listings.length,
        totalOrders: orders.length,
        recordedOrderValue: Number(recordedOrderValue.toFixed(2)),
        pendingActions:
          (docsResult.count ?? 0) + (reportsResult.count ?? 0) + (dishStatus.pending ?? 0),
      },
      salesSeries: buildSalesSeries(orders, days),
      breakdowns: {
        accounts: { users: profiles.length, cooks: cookUserIds.size },
        fulfillment,
        orderStatus,
        dishStatus,
      },
      topCooks,
      recentOrders,
    });
  } catch (error: unknown) {
    console.error('Could not build admin overview:', error);
    res.status(500).json({ error: 'The overview data could not be loaded.' });
  }
});

router.get('/activity', async (_req, res) => {
  try {
    const [reportsResult, documentsResult, ordersResult, profilesResult] = await Promise.all([
      supabase
        .from('content_reports')
        .select('id, target_label, reason, created_at')
        .in('status', ['pending', 'reviewing'])
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('verification_documents')
        .select('id, submitted_at, profiles(full_name, profile_image)')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false })
        .limit(5),
      supabase
        .from('orders')
        .select('id, created_at, listings(title)')
        .order('created_at', { ascending: false })
        .limit(4),
      supabase
        .from('profiles')
        .select('id, full_name, profile_image, restaurant_name, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const firstError = [
      reportsResult.error,
      documentsResult.error,
      ordersResult.error,
      profilesResult.error,
    ].find(Boolean);
    if (firstError) throw firstError;

    const reportActivity = (reportsResult.data ?? []).map(report => ({
      id: `report-${report.id}`,
      type: 'report' as const,
      title: `${report.target_label} was reported`,
      body: String(report.reason).replace(/_/g, ' '),
      createdAt: report.created_at,
      unread: true,
    }));
    const documentActivity = (documentsResult.data ?? []).map(document => {
      const profile = relation(
        document.profiles as unknown as
          | { full_name: string | null; profile_image: string | null }
          | Array<{ full_name: string | null; profile_image: string | null }>
      );
      return {
        id: `verification-${document.id}`,
        type: 'verification' as const,
        title: `${profile?.full_name ?? 'A cook'} is awaiting verification`,
        body: 'Food-safety document ready for review',
        imageUrl: profile?.profile_image ?? null,
        createdAt: document.submitted_at,
        unread: true,
      };
    });
    const orderActivity = (ordersResult.data ?? []).map(order => {
      const listing = relation(
        order.listings as unknown as { title: string | null } | Array<{ title: string | null }>
      );
      return {
        id: `order-${order.id}`,
        type: 'order' as const,
        title: `New order #${compactId(order.id)}`,
        body: listing?.title ?? 'Order placed',
        createdAt: order.created_at,
        unread: false,
      };
    });
    const profileActivity = (profilesResult.data ?? []).map(profile => ({
      id: `profile-${profile.id}`,
      type: profile.restaurant_name ? ('cook' as const) : ('user' as const),
      title: profile.restaurant_name
        ? `${profile.full_name || 'A new cook'} registered as a cook`
        : `${profile.full_name || 'A user'} created an account`,
      body: profile.restaurant_name ?? 'New Chefin account',
      imageUrl: profile.profile_image,
      createdAt: profile.created_at,
      unread: false,
    }));

    const activity = [...reportActivity, ...documentActivity, ...orderActivity, ...profileActivity]
      .filter(item => item.createdAt)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, 8);

    res.json({ activity });
  } catch (error: unknown) {
    console.error('Could not load admin activity:', error);
    res.status(500).json({ error: 'Admin activity could not be loaded.' });
  }
});

export default router;
