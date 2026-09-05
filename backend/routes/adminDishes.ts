import express from 'express';

import {
  deriveDishManagementStatus,
  getDishActionTransition,
  type DishManagementAction,
} from '../adminDishManagement';
import { writeAdminAudit } from '../adminAudit';
import { getAdminDateBounds } from '../adminDateFilter';
import { getOpeningHoursForCook, getSellingSchedulesForCook } from '../availabilityService';
import { getCookEligibilityByProfileId } from '../cookEligibility';
import { getListingOptionGroups } from '../menuOptionService';
import {
  notifyCookDishRepublished,
  notifyCookDishReviewReopened,
  notifyCookDishReviewed,
  notifyCookDishUnpublished,
  notifyFavouritersNewDish,
} from '../notifications';
import { supabase } from '../supabaseClient';
import type { AdminRequest } from '../middleware/requireAdmin';

const router = express.Router();
const FILTERS = new Set(['all', 'active', 'inactive', 'pending', 'flagged', 'rejected']);
const SORTS = new Set([
  'newest',
  'oldest',
  'title_asc',
  'title_desc',
  'price_asc',
  'price_desc',
  'orders_desc',
  'rating_desc',
]);
const DATE_RANGES = new Set(['all', 'today', '7d', '30d', '90d']);
const ACTIONS = new Set<DishManagementAction>([
  'approve',
  'reject',
  'unpublish',
  'republish',
  'clear_rejection',
]);
const PAGE_CHUNK_SIZE = 1000;
const ADMIN_TIME_ZONE = 'Asia/Kuala_Lumpur';

type Relation<T> = T | T[] | null;
type CookProfile = {
  user_id: string;
  full_name: string | null;
  restaurant_name: string | null;
  profile_image: string | null;
  address_locality?: string | null;
  address_town?: string | null;
  address_postcode?: string | null;
  free_delivery_threshold?: number | string | null;
};
type ListingRow = {
  id: string;
  cook_id: string;
  title: string;
  description: string | null;
  price: number | string;
  image_url: string | null;
  cuisine: string | null;
  dietary_tags: string[] | null;
  ingredients: string[] | null;
  menu_category: string | null;
  status: string;
  is_active: boolean | null;
  created_at: string | null;
  profiles: Relation<CookProfile>;
};
type OrderSummaryRow = { id: string; listing_id: string; quantity: number; status: string | null };
type RatingSummaryRow = { id: string; listing_id: string; rating: number };
type OpenReportRow = { id: string; target_id: string; status: string };

const relation = <T>(value: Relation<T> | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

const compactId = (id: string): string => id.split('-')[0].toUpperCase();

async function fetchAllPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_CHUNK_SIZE) {
    const { data, error } = await loadPage(from, from + PAGE_CHUNK_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_CHUNK_SIZE) break;
  }
  return rows;
}

const malaysiaDateKey = (date = new Date()): string => {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ADMIN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .map(part => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
};

const dateRangeStart = (range: string, now = new Date()): number | null => {
  if (range === 'all') return null;
  const days = range === 'today' ? 1 : Number.parseInt(range, 10);
  const todayStart = new Date(`${malaysiaDateKey(now)}T00:00:00+08:00`).getTime();
  if (days === 1) return todayStart;
  return todayStart - (days - 1) * 86_400_000;
};

const average = (values: number[]): number | null =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const mapDish = (
  listing: ListingRow,
  orderCountByDish: Map<string, number>,
  ratingsByDish: Map<string, number[]>,
  openReportsByDish: Map<string, number>
) => {
  const cook = relation(listing.profiles);
  const ratings = ratingsByDish.get(listing.id) ?? [];
  return {
    id: listing.id,
    displayId: compactId(listing.id),
    cookId: listing.cook_id,
    cookUserId: cook?.user_id ?? '',
    title: listing.title,
    cookName: cook?.full_name || 'Unknown cook',
    restaurantName: cook?.restaurant_name ?? null,
    cuisine: listing.cuisine,
    price: Number(listing.price),
    imageUrl: listing.image_url,
    reviewStatus: listing.status,
    isActive: listing.is_active === true,
    status: deriveDishManagementStatus({
      status: listing.status,
      isActive: listing.is_active === true,
    }),
    createdAt: listing.created_at ?? new Date(0).toISOString(),
    totalOrders: orderCountByDish.get(listing.id) ?? 0,
    averageRating: average(ratings),
    ratingCount: ratings.length,
    openReportCount: openReportsByDish.get(listing.id) ?? 0,
  };
};

router.get('/', async (req, res) => {
  const search = String(req.query.search ?? '')
    .trim()
    .toLowerCase();
  const filter = FILTERS.has(String(req.query.filter)) ? String(req.query.filter) : 'all';
  const sort = SORTS.has(String(req.query.sort)) ? String(req.query.sort) : 'newest';
  const dateRange = DATE_RANGES.has(String(req.query.dateRange))
    ? String(req.query.dateRange)
    : 'all';
  const exactDateBounds = getAdminDateBounds(req.query.date);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));

  try {
    const [listings, orders, ratings, openReports] = await Promise.all([
      fetchAllPages<ListingRow>((from, to) =>
        supabase
          .from('listings')
          .select(
            'id, cook_id, title, description, price, image_url, cuisine, dietary_tags, ingredients, menu_category, status, is_active, created_at, profiles!inner(user_id, full_name, restaurant_name, profile_image)'
          )
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchAllPages<OrderSummaryRow>((from, to) =>
        supabase
          .from('orders')
          .select('id, listing_id, quantity, status')
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchAllPages<RatingSummaryRow>((from, to) =>
        supabase
          .from('reviews')
          .select('id, listing_id, rating')
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchAllPages<OpenReportRow>((from, to) =>
        supabase
          .from('content_reports')
          .select('id, target_id, status')
          .eq('target_type', 'listing')
          .in('status', ['pending', 'reviewing'])
          .order('id', { ascending: true })
          .range(from, to)
      ),
    ]);

    const orderCountByDish = new Map<string, number>();
    for (const order of orders.filter(row => row.status !== 'cancelled')) {
      orderCountByDish.set(order.listing_id, (orderCountByDish.get(order.listing_id) ?? 0) + 1);
    }
    const ratingsByDish = new Map<string, number[]>();
    for (const review of ratings) {
      ratingsByDish.set(review.listing_id, [
        ...(ratingsByDish.get(review.listing_id) ?? []),
        Number(review.rating),
      ]);
    }
    const openReportsByDish = new Map<string, number>();
    for (const report of openReports) {
      openReportsByDish.set(report.target_id, (openReportsByDish.get(report.target_id) ?? 0) + 1);
    }

    const allDishes = listings.map(listing =>
      mapDish(listing, orderCountByDish, ratingsByDish, openReportsByDish)
    );
    const startAt = dateRangeStart(dateRange);
    const dishes = allDishes.filter(dish => {
      const createdAt = new Date(dish.createdAt).getTime();
      if (
        exactDateBounds &&
        (createdAt < exactDateBounds.start || createdAt >= exactDateBounds.end)
      ) {
        return false;
      }
      if (!exactDateBounds && startAt != null && createdAt < startAt) return false;
      if (filter === 'flagged') {
        if (dish.openReportCount === 0) return false;
      } else if (filter !== 'all' && dish.status !== filter) {
        return false;
      }
      if (!search) return true;
      return [
        dish.id,
        dish.displayId,
        dish.title,
        dish.cookName,
        dish.restaurantName ?? '',
        dish.cuisine ?? '',
      ].some(value => value.toLowerCase().includes(search));
    });

    dishes.sort((left, right) => {
      if (sort === 'oldest') return +new Date(left.createdAt) - +new Date(right.createdAt);
      if (sort === 'title_asc') return left.title.localeCompare(right.title);
      if (sort === 'title_desc') return right.title.localeCompare(left.title);
      if (sort === 'price_asc') return left.price - right.price;
      if (sort === 'price_desc') return right.price - left.price;
      if (sort === 'orders_desc') return right.totalOrders - left.totalOrders;
      if (sort === 'rating_desc') return (right.averageRating ?? -1) - (left.averageRating ?? -1);
      return +new Date(right.createdAt) - +new Date(left.createdAt);
    });

    const total = dishes.length;
    const offset = (page - 1) * pageSize;
    const prices = allDishes.map(dish => dish.price).filter(Number.isFinite);
    res.json({
      stats: {
        totalDishes: allDishes.length,
        activeDishes: allDishes.filter(dish => dish.status === 'active').length,
        inactiveDishes: allDishes.filter(dish => dish.status === 'inactive').length,
        pendingReview: allDishes.filter(dish => dish.status === 'pending').length,
        flaggedDishes: allDishes.filter(dish => dish.openReportCount > 0).length,
        averagePrice: average(prices) ?? 0,
      },
      dishes: dishes.slice(offset, offset + pageSize),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error: unknown) {
    console.error('Could not load Dish Management:', error);
    res.status(500).json({ error: 'Dish management data could not be loaded.' });
  }
});

router.get('/:dishId', async (req, res) => {
  try {
    const { dishId } = req.params;
    const { data: listingData, error: listingError } = await supabase
      .from('listings')
      .select(
        'id, cook_id, title, description, price, image_url, cuisine, dietary_tags, ingredients, menu_category, status, is_active, created_at, profiles!inner(user_id, full_name, restaurant_name, profile_image, address_locality, address_town, address_postcode, free_delivery_threshold)'
      )
      .eq('id', dishId)
      .maybeSingle();
    if (listingError) throw listingError;
    if (!listingData) return res.status(404).json({ error: 'Dish not found.' });
    const listing = listingData as unknown as ListingRow;

    const [
      ordersResult,
      reviewsResult,
      reportsResult,
      settingsResult,
      optionGroups,
      hours,
      schedules,
    ] = await Promise.all([
      supabase
        .from('orders')
        .select('id, quantity, status, total_price, created_at')
        .eq('listing_id', dishId),
      supabase
        .from('reviews')
        .select('id, rating, comment, created_at, profiles(full_name, profile_image)')
        .eq('listing_id', dishId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('content_reports')
        .select(
          'id, reporter_id, target_label, reason, details, status, created_at, reviewed_by, resolved_at, resolution_note'
        )
        .eq('target_type', 'listing')
        .eq('target_id', dishId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('listing_availability_settings')
        .select(
          'enabled, schedule_mode, max_orders_per_window, daily_stock_limit, configured_at, updated_at'
        )
        .eq('listing_id', dishId)
        .maybeSingle(),
      getListingOptionGroups([dishId]),
      getOpeningHoursForCook(listing.cook_id),
      getSellingSchedulesForCook(listing.cook_id),
    ]);
    const firstError = [
      ordersResult.error,
      reviewsResult.error,
      reportsResult.error,
      settingsResult.error,
    ].find(Boolean);
    if (firstError) throw firstError;

    const { data: auditRows, error: auditError } = await supabase
      .from('admin_audit_logs')
      .select('id, actor_user_id, action, details, created_at')
      .contains('details', { listingId: dishId })
      .order('created_at', { ascending: false })
      .limit(50);
    if (auditError) throw auditError;
    const actorIds = [...new Set((auditRows ?? []).map(row => row.actor_user_id))];
    const { data: actorProfiles, error: actorError } = actorIds.length
      ? await supabase.from('profiles').select('user_id, full_name').in('user_id', actorIds)
      : { data: [], error: null };
    if (actorError) throw actorError;
    const actorNameById = new Map((actorProfiles ?? []).map(row => [row.user_id, row.full_name]));

    const orders = (ordersResult.data ?? []).filter(order => order.status !== 'cancelled');
    const reviews = (reviewsResult.data ?? []) as Array<{
      id: string;
      rating: number;
      comment: string | null;
      created_at: string | null;
      profiles: Relation<{ full_name: string | null; profile_image: string | null }>;
    }>;
    const ratings = reviews.map(review => Number(review.rating));
    const reports = reportsResult.data ?? [];
    const summary = mapDish(
      listing,
      new Map([[dishId, orders.length]]),
      new Map([[dishId, ratings]]),
      new Map([
        [dishId, reports.filter(report => ['pending', 'reviewing'].includes(report.status)).length],
      ])
    );
    const cook = relation(listing.profiles);
    const assignedSchedule =
      schedules.find(schedule => schedule.listingIds.includes(dishId)) ?? null;

    res.json({
      dish: {
        ...summary,
        description: listing.description,
        dietaryTags: listing.dietary_tags ?? [],
        ingredients: listing.ingredients ?? [],
        menuCategory: listing.menu_category ?? 'Uncategorised',
        cookAddress:
          [cook?.address_locality, cook?.address_town, cook?.address_postcode]
            .filter(Boolean)
            .join(', ') || 'Not provided',
        freeDeliveryThreshold:
          cook?.free_delivery_threshold == null ? null : Number(cook.free_delivery_threshold),
        portionsSold: orders.reduce((sum, order) => sum + Number(order.quantity ?? 0), 0),
      },
      optionGroups: optionGroups[dishId] ?? [],
      availability: {
        settings: settingsResult.data
          ? {
              enabled: settingsResult.data.enabled,
              scheduleMode: settingsResult.data.schedule_mode,
              maxOrdersPerWindow: Number(settingsResult.data.max_orders_per_window),
              dailyStockLimit:
                settingsResult.data.daily_stock_limit == null
                  ? null
                  : Number(settingsResult.data.daily_stock_limit),
            }
          : null,
        openingHours: hours,
        sellingSchedule: assignedSchedule,
      },
      reviews: reviews.map(review => ({
        id: review.id,
        rating: Number(review.rating),
        comment: review.comment,
        createdAt: review.created_at,
        customerName: relation(review.profiles)?.full_name ?? 'Customer',
        customerImageUrl: relation(review.profiles)?.profile_image ?? null,
      })),
      reports,
      reviewHistory: (auditRows ?? []).map(row => ({
        id: row.id,
        action: row.action,
        details: row.details,
        createdAt: row.created_at,
        actorName: actorNameById.get(row.actor_user_id) ?? 'Administrator',
      })),
    });
  } catch (error: unknown) {
    console.error('Could not load dish details:', error);
    res.status(500).json({ error: 'Dish details could not be loaded.' });
  }
});

router.post('/:dishId/action', async (req: AdminRequest, res) => {
  const action = String(req.body.action ?? '') as DishManagementAction;
  const reason = String(req.body.reason ?? '').trim();
  if (!ACTIONS.has(action)) return res.status(400).json({ error: 'Unknown dish action.' });

  try {
    const { data: rawListing, error: fetchError } = await supabase
      .from('listings')
      .select(
        'id, title, status, is_active, cook_id, profiles!inner(user_id, full_name, restaurant_name)'
      )
      .eq('id', req.params.dishId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!rawListing) return res.status(404).json({ error: 'Dish not found.' });
    const listing = rawListing as unknown as {
      id: string;
      title: string;
      status: string;
      is_active: boolean | null;
      cook_id: string;
      profiles: Relation<Pick<CookProfile, 'user_id' | 'full_name' | 'restaurant_name'>>;
    };
    const transition = getDishActionTransition(
      { status: listing.status, isActive: listing.is_active === true },
      action,
      reason
    );
    if ('error' in transition) return res.status(409).json({ error: transition.error });

    if (action === 'approve' || action === 'republish') {
      const eligibility = await getCookEligibilityByProfileId(listing.cook_id);
      if (!eligibility.eligibleToSell) {
        return res.status(409).json({
          error: 'This cook is not approved to sell yet, so the dish cannot be published.',
          cookApplicationStatus: eligibility.status,
        });
      }
    }

    let updateQuery = supabase
      .from('listings')
      .update({ status: transition.next.status, is_active: transition.next.isActive })
      .eq('id', listing.id)
      .eq('status', listing.status);
    updateQuery =
      listing.is_active == null
        ? updateQuery.is('is_active', null)
        : updateQuery.eq('is_active', listing.is_active);
    const { data: updated, error: updateError } = await updateQuery
      .select('id, status, is_active')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      return res
        .status(409)
        .json({ error: 'The dish changed while you were reviewing it. Refresh and try again.' });
    }

    const cook = relation(listing.profiles);
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: cook?.user_id,
      action: `dish_${action}`,
      details: {
        listingId: listing.id,
        title: listing.title,
        previousStatus: listing.status,
        previousIsActive: listing.is_active === true,
        nextStatus: transition.next.status,
        nextIsActive: transition.next.isActive,
        reason: transition.reason,
      },
    });

    if (cook?.user_id) {
      if (action === 'approve') {
        await notifyCookDishReviewed(cook.user_id, listing.title, true, null, listing.id);
        await notifyFavouritersNewDish(
          listing.cook_id,
          cook.restaurant_name || cook.full_name || 'A cook you favourited',
          listing.title,
          listing.id
        );
      } else if (action === 'reject') {
        await notifyCookDishReviewed(
          cook.user_id,
          listing.title,
          false,
          transition.reason,
          listing.id
        );
      } else if (action === 'unpublish') {
        await notifyCookDishUnpublished(cook.user_id, listing.title, transition.reason ?? reason);
      } else if (action === 'republish') {
        await notifyCookDishRepublished(cook.user_id, listing.title);
      } else {
        await notifyCookDishReviewReopened(cook.user_id, listing.title);
      }
    }

    res.json({ success: true, listing: updated });
  } catch (error: unknown) {
    console.error('Dish management action failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'The dish action could not be completed.',
    });
  }
});

export default router;
