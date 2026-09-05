import express from 'express';
import { supabase } from '../supabaseClient';
import {
  notifyBuyerOrderPlaced,
  notifyBuyerOrderConfirmed,
  notifyBuyerOrderReady,
  notifyBuyerOrderCancelled,
  notifyBuyerReviewRequest,
  notifyCookNewOrder,
  notifyCookPayoutSent,
} from '../notifications';
import type { AccountRequest } from '../accountAccess';
import { requireActiveAccount, requireReadableAccount } from '../accountAccess';
import { getCookEligibilityByProfileId } from '../cookEligibility';
import {
  normalizeServiceDate,
  getDateKeyInTimeZone,
  releaseCapacityReservation,
  releaseListingCapacityForOrder,
  reserveListingCapacity,
  getListingAvailabilityBatch,
  type CapacityReservation,
} from '../availabilityService';
import {
  getListingOptionGroups,
  validateOptionSelections,
  type RequestedOptionGroup,
  type SelectedOptionSnapshot,
} from '../menuOptionService';
import {
  bookQuotedDeliveryJob,
  cancelDeliveryJob,
  cancelDeliveryJobWhenUnused,
} from '../deliveryService';

const router = express.Router();

router.get('/', requireReadableAccount, async (req: AccountRequest, res) => {
  const { status } = req.query;
  const today = new Date().toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format

  try {
    const { data: cookProfile, error: cookError } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', req.account!.userId)
      .single();
    if (cookError || !cookProfile)
      return res.status(403).json({ error: 'Cook profile not found.' });
    const { data: cookListings, error: listingsError } = await supabase
      .from('listings')
      .select('id')
      .eq('cook_id', cookProfile.id);
    if (listingsError) throw listingsError;
    const listingIds = (cookListings ?? []).map(listing => listing.id);
    if (listingIds.length === 0) return res.json([]);

    let query = supabase
      .from('orders')
      .select('*')
      .in('listing_id', listingIds)
      .eq('status', status)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)
      .order('created_at', { ascending: false });

    // For confirmed orders, also filter by pickup date
    if (status === 'confirmed') {
      query = query.eq('scheduled_date', today);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data ?? []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const FULFILLMENT_TYPES = ['pickup', 'delivery'];
const MAX_ADVANCE_ORDER_DAYS = 2;
const CART_STATUS_UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

const addServiceDays = (serviceDate: string, days: number): string => {
  const malaysiaMidday = new Date(`${serviceDate}T12:00:00+08:00`);
  malaysiaMidday.setUTCDate(malaysiaMidday.getUTCDate() + days);
  return getDateKeyInTimeZone(malaysiaMidday);
};

// Read-only validation for each independently saved restaurant basket in the
// global cart. No capacity is reserved until the buyer places that basket.
router.post('/cart-status', async (req, res) => {
  const items = req.body?.items as
    | Array<{
        listingId?: unknown;
        cookId?: unknown;
        quantity?: unknown;
        serviceDate?: unknown;
        pickupTime?: unknown;
      }>
    | undefined;
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > 200 ||
    items.some(
      item =>
        !CART_STATUS_UUID_PATTERN.test(String(item.listingId ?? '')) ||
        !CART_STATUS_UUID_PATTERN.test(String(item.cookId ?? '')) ||
        !Number.isInteger(item.quantity) ||
        Number(item.quantity) < 1
    )
  ) {
    return res.status(400).json({ error: 'The cart status request is invalid.' });
  }

  try {
    const listingIds = [...new Set(items.map(item => String(item.listingId)))];
    const cookIds = [...new Set(items.map(item => String(item.cookId)))];
    const [{ data: listings, error: listingsError }, { data: cooks, error: cooksError }] =
      await Promise.all([
        supabase
          .from('listings')
          .select('id, cook_id, title, image_url, status, is_active')
          .in('id', listingIds),
        supabase
          .from('profiles')
          .select('id, full_name, restaurant_name, profile_image, store_status, store_paused_until')
          .in('id', cookIds),
      ]);
    if (listingsError) throw listingsError;
    if (cooksError) throw cooksError;

    const listingById = new Map((listings ?? []).map(listing => [listing.id, listing]));
    const cookById = new Map((cooks ?? []).map(cook => [cook.id, cook]));
    const availabilityByListing = await getListingAvailabilityBatch(listingIds, 90);
    const eligibilityByCook = new Map<string, boolean>();
    for (const cookId of cookIds) {
      eligibilityByCook.set(cookId, (await getCookEligibilityByProfileId(cookId)).eligibleToSell);
    }

    const baskets = cookIds.map(cookId => {
      const cook = cookById.get(cookId);
      const cookItems = items.filter(item => String(item.cookId) === cookId);
      const pauseActive =
        cook?.store_status === 'paused' &&
        (!cook.store_paused_until || new Date(cook.store_paused_until).getTime() > Date.now());
      const storeUnavailable = !cook || !eligibilityByCook.get(cookId) || pauseActive;
      const itemStatuses = cookItems.map(item => {
        const listingId = String(item.listingId);
        const listing = listingById.get(listingId);
        const dishName = listing?.title || 'This dish';
        if (
          !listing ||
          listing.cook_id !== cookId ||
          listing.status !== 'approved' ||
          listing.is_active !== true
        ) {
          return {
            listingId,
            status: 'dish_unavailable',
            reason: `${dishName} is no longer available.`,
          };
        }
        if (storeUnavailable) {
          return {
            listingId,
            status: 'store_closed',
            reason: 'This home restaurant is unavailable right now.',
          };
        }
        const pickupTime = String(item.pickupTime ?? '');
        const serviceDate = normalizeServiceDate(String(item.serviceDate ?? ''));
        const pickupMs = new Date(pickupTime).getTime();
        if (!serviceDate || Number.isNaN(pickupMs) || pickupMs <= Date.now()) {
          return {
            listingId,
            status: 'time_unavailable',
            reason: `The selected order time for ${dishName} has passed.`,
          };
        }
        const matchingRecord = availabilityByListing[listingId]?.records.find(record => {
          const start = new Date(record.start_time).getTime();
          const end = new Date(record.end_time).getTime();
          return record.available_date === serviceDate && pickupMs >= start && pickupMs < end;
        });
        if (!matchingRecord) {
          return {
            listingId,
            status: 'time_unavailable',
            reason: `${dishName} is unavailable at the selected time.`,
          };
        }
        const quantityRequested = cookItems
          .filter(
            other =>
              String(other.listingId) === listingId &&
              String(other.serviceDate ?? '') === String(item.serviceDate ?? '') &&
              String(other.pickupTime ?? '') === String(item.pickupTime ?? '')
          )
          .reduce((sum, other) => sum + Number(other.quantity), 0);
        const remaining = matchingRecord.max_orders - matchingRecord.orders_taken;
        if (!matchingRecord.is_available || remaining < quantityRequested) {
          return {
            listingId,
            status: 'out_of_stock',
            reason: `${dishName} is sold out for the selected time.`,
          };
        }
        return { listingId, status: 'ready', reason: null };
      });
      const firstIssue = itemStatuses.find(item => item.status !== 'ready');
      return {
        cookId,
        restaurantName: cook?.restaurant_name || cook?.full_name || 'Home restaurant',
        restaurantImage: cook?.profile_image ?? null,
        status: firstIssue?.status ?? 'ready',
        message: firstIssue?.reason ?? null,
        items: itemStatuses,
      };
    });
    res.json({ baskets });
  } catch (error: unknown) {
    console.error('Cart status check failed:', error);
    res.status(500).json({ error: 'Cart availability could not be checked.' });
  }
});

// POST / - Place an order from the cart
router.post('/', requireActiveAccount, async (req: AccountRequest, res) => {
  const { userId, items, fulfillmentType, deliveryJobIds } = req.body as {
    userId?: string;
    items: {
      listingId: string;
      quantity: number;
      pickupDate: string;
      pickupTime?: string; // ISO of the restaurant-level slot start
      pickupWindowEnd?: string; // ISO of the restaurant-level slot end
      priceAtOrder?: number; // ignored by the server; retained for old clients
      customerNote?: string;
      selectedOptions?: RequestedOptionGroup[];
    }[];
    fulfillmentType?: string; // 'pickup' | 'delivery', applies to the whole order
    deliveryJobIds?: string[]; // one current Lalamove quote per cook
  };

  if (userId && userId !== req.account!.userId) {
    return res.status(403).json({ error: 'The order user does not match the signed-in account.' });
  }
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'No items in order.' });
  }
  // Backward compatibility for baskets created before explicit slot ends were stored.
  for (const item of items) {
    if (
      !item.pickupWindowEnd &&
      item.pickupTime &&
      !Number.isNaN(new Date(item.pickupTime).getTime())
    ) {
      item.pickupWindowEnd = new Date(
        new Date(item.pickupTime).getTime() + 30 * 60_000
      ).toISOString();
    }
  }
  if (
    Array.isArray(items) &&
    items.some(
      item =>
        item.customerNote != null &&
        (typeof item.customerNote !== 'string' || item.customerNote.trim().length > 500)
    )
  ) {
    return res.status(400).json({ error: 'Customer notes must be 500 characters or fewer.' });
  }
  if (
    !Array.isArray(items) ||
    items.some(
      item =>
        !item?.listingId ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        !normalizeServiceDate(item.pickupDate) ||
        !item.pickupTime ||
        Number.isNaN(new Date(item.pickupTime).getTime()) ||
        !item.pickupWindowEnd ||
        Number.isNaN(new Date(item.pickupWindowEnd).getTime()) ||
        new Date(item.pickupWindowEnd).getTime() <= new Date(item.pickupTime).getTime()
    )
  ) {
    return res.status(400).json({
      error: 'Every item needs a valid quantity, pickup date and pickup time.',
    });
  }
  const today = getDateKeyInTimeZone();
  const latestServiceDate = addServiceDays(today, MAX_ADVANCE_ORDER_DAYS);
  if (
    items.some(item => {
      const serviceDate = normalizeServiceDate(item.pickupDate)!;
      return serviceDate < today || serviceDate > latestServiceDate;
    })
  ) {
    return res.status(400).json({
      error: 'Orders can only be scheduled for today or the next two days.',
    });
  }
  if (fulfillmentType && !FULFILLMENT_TYPES.includes(fulfillmentType)) {
    return res.status(400).json({ error: "fulfillmentType must be 'pickup' or 'delivery'." });
  }

  const reservations: CapacityReservation[] = [];
  const rollbackReservations = async () => {
    const pending = reservations.splice(0, reservations.length).reverse();
    const results = await Promise.allSettled(pending.map(releaseCapacityReservation));
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Capacity rollback failed:', result.reason);
      }
    }
  };

  try {
    // orders.customer_id references profiles.id, not auth.users.id — look it up.
    const profile = { id: req.account!.profileId };

    const requestedListingIds = [...new Set(items.map(item => item.listingId))];
    const { data: requestedListings, error: requestedListingsError } = await supabase
      .from('listings')
      .select('id, cook_id, status, is_active, price')
      .in('id', requestedListingIds);
    if (requestedListingsError) throw requestedListingsError;
    if ((requestedListings ?? []).length !== requestedListingIds.length) {
      return res.status(404).json({ error: 'One or more dishes are no longer available.' });
    }
    for (const listing of requestedListings ?? []) {
      if (listing.status !== 'approved' || listing.is_active !== true) {
        return res.status(409).json({ error: 'One or more dishes are not currently available.' });
      }
      const eligibility = await getCookEligibilityByProfileId(listing.cook_id);
      if (!eligibility.eligibleToSell) {
        return res.status(409).json({
          error: 'This cook is not currently approved to accept new orders.',
        });
      }
    }
    const requestedListingById = new Map(
      (requestedListings ?? []).map(listing => [listing.id, listing])
    );

    // Respect the cook's self-set store status: paused stores take no new
    // orders, and busy stores need pickup times at least their stated prep
    // time away.
    const cookIds = [...new Set((requestedListings ?? []).map(listing => listing.cook_id))];
    if (cookIds.length !== 1) {
      return res.status(400).json({
        error:
          'Checkout supports one home restaurant at a time. Open a restaurant basket separately.',
      });
    }
    const { data: cookStores, error: cookStoresError } = await supabase
      .from('profiles')
      .select('id, restaurant_name, store_status, store_busy_prep_minutes, store_paused_until')
      .in('id', cookIds);
    if (cookStoresError) throw cookStoresError;
    const storeByCook = new Map((cookStores ?? []).map(store => [store.id, store]));
    const nowMs = Date.now();
    for (const item of items) {
      const store = storeByCook.get(requestedListingById.get(item.listingId)!.cook_id);
      if (!store) continue;
      const storeName = store.restaurant_name ?? 'This cook';
      if (
        store.store_status === 'paused' &&
        (!store.store_paused_until || new Date(store.store_paused_until).getTime() > nowMs)
      ) {
        return res.status(409).json({
          error: `${storeName} has paused new orders. Please try again later.`,
        });
      }
      if (store.store_status === 'busy' && item.pickupTime) {
        const prepMinutes = store.store_busy_prep_minutes ?? 15;
        if (new Date(item.pickupTime).getTime() < nowMs + prepMinutes * 60000) {
          return res.status(409).json({
            error: `${storeName} is busy and needs at least ${prepMinutes} minutes to prepare orders. Choose a later time.`,
          });
        }
      }
    }
    const optionGroupsByListing = await getListingOptionGroups(requestedListingIds);
    const validatedOptions: Array<{
      snapshot: SelectedOptionSnapshot[];
      surcharge: number;
    }> = [];
    for (const item of items) {
      const validation = validateOptionSelections(
        optionGroupsByListing[item.listingId] ?? [],
        item.selectedOptions
      );
      if ('error' in validation) {
        return res.status(409).json({ error: validation.error });
      }
      validatedOptions.push(validation);
    }

    // A checkout contains one restaurant basket and every dish in that basket
    // must use the same restaurant-wide slot.
    const scheduleByCook = new Map<string, string>();
    for (const item of items) {
      const cookId = requestedListingById.get(item.listingId)!.cook_id;
      const serviceDate = normalizeServiceDate(item.pickupDate)!;
      const scheduleKey = `${serviceDate}|${new Date(item.pickupWindowEnd!).toISOString()}`;
      const existingSchedule = scheduleByCook.get(cookId);
      if (existingSchedule && existingSchedule !== scheduleKey) {
        return res.status(400).json({
          error: 'All dishes from the same restaurant must use the same order time.',
        });
      }
      scheduleByCook.set(cookId, scheduleKey);
    }

    const deliveryJobByCook = new Map<
      string,
      { id: string; customer_delivery_fee: number | string }
    >();
    if ((fulfillmentType ?? 'pickup') === 'delivery') {
      const uniqueJobIds = [...new Set(deliveryJobIds ?? [])];
      if (uniqueJobIds.length !== cookIds.length) {
        return res
          .status(409)
          .json({ error: 'Request a fresh Lalamove quote before placing this delivery order.' });
      }
      const { data: jobs, error: jobsError } = await supabase
        .from('delivery_jobs')
        .select(
          'id, customer_id, cook_id, status, scheduled_at, quote_expires_at, customer_delivery_fee'
        )
        .in('id', uniqueJobIds);
      if (jobsError) throw jobsError;
      if ((jobs ?? []).length !== cookIds.length) {
        return res.status(409).json({ error: 'One or more Lalamove quotes could not be found.' });
      }
      for (const job of jobs ?? []) {
        if (
          job.customer_id !== profile.id ||
          !cookIds.includes(job.cook_id) ||
          job.status !== 'quoted' ||
          new Date(job.quote_expires_at).getTime() <= Date.now()
        ) {
          return res
            .status(409)
            .json({ error: 'A Lalamove quote expired or no longer matches this cart.' });
        }
        const schedule = scheduleByCook.get(job.cook_id)?.split('|')[1];
        if (!schedule || new Date(job.scheduled_at).toISOString() !== schedule) {
          return res
            .status(409)
            .json({ error: 'A delivery time changed. Request a fresh Lalamove quote.' });
        }
        if (deliveryJobByCook.has(job.cook_id)) {
          return res
            .status(409)
            .json({ error: 'Only one Lalamove quote may be used for each cook.' });
        }
        deliveryJobByCook.set(job.cook_id, job);
      }
    } else if ((deliveryJobIds?.length ?? 0) > 0) {
      return res
        .status(400)
        .json({ error: 'Delivery quotes cannot be attached to a pickup order.' });
    }

    const orderRows = items.map((item, index) => {
      const scheduled = normalizeServiceDate(item.pickupDate);
      if (!scheduled) {
        throw new Error('Each item must have a pickupDate.');
      }
      const unitPrice = Number(requestedListingById.get(item.listingId)?.price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error('A dish has an invalid configured price.');
      }
      const unitPriceWithOptions = unitPrice + validatedOptions[index].surcharge;
      return {
        customer_id: profile.id,
        listing_id: item.listingId,
        quantity: item.quantity,
        total_price: +(unitPriceWithOptions * item.quantity).toFixed(2),
        selected_options: validatedOptions[index].snapshot,
        scheduled_date: scheduled,
        pickup_time: item.pickupTime,
        pickup_window_end: item.pickupWindowEnd,
        customer_note: item.customerNote?.trim() || null,
        fulfillment_type: fulfillmentType ?? 'pickup',
        delivery_job_id:
          (fulfillmentType ?? 'pickup') === 'delivery'
            ? deliveryJobByCook.get(requestedListingById.get(item.listingId)!.cook_id)!.id
            : null,
        status: 'pending',
        payment_status: 'paid', // mock-paid via locally-saved card
      };
    });

    // Validate the effective recurring/legacy window and reserve its shared
    // capacity before inserting. Recurring counters use a conditional UPSERT
    // RPC, so competing customers cannot both claim the final quantity.
    for (const item of items) {
      const result = await reserveListingCapacity({
        listingId: item.listingId,
        serviceDate: normalizeServiceDate(item.pickupDate)!,
        pickupTime: item.pickupTime!,
        quantity: item.quantity,
      });
      if ('error' in result) {
        await rollbackReservations();
        return res.status(409).json({ error: result.error });
      }
      reservations.push(result.reservation);
    }

    const rowsWithCapacity = orderRows.map((row, index) => {
      const reservation = reservations[index];
      return {
        ...row,
        capacity_source: reservation.source,
        capacity_service_date: row.scheduled_date,
        capacity_window_start: reservation.source === 'recurring' ? reservation.windowStart : null,
        capacity_availability_id:
          reservation.source === 'legacy' ? reservation.availabilityId : null,
        capacity_quantity: reservation.quantity,
      };
    });
    const { data, error } = await supabase.from('orders').insert(rowsWithCapacity).select();

    if (error) {
      console.error('Error placing order:', error);
      await rollbackReservations();
      return res.status(400).json({ error: error.message });
    }
    // Book only after the order rows exist. If any fleet booking fails, undo
    // every row and reservation so the customer never receives a half-order.
    if ((fulfillmentType ?? 'pickup') === 'delivery') {
      try {
        for (const job of deliveryJobByCook.values()) await bookQuotedDeliveryJob(job.id);
      } catch (bookingError) {
        for (const order of data ?? []) {
          await releaseListingCapacityForOrder(order.id).catch(error =>
            console.error('Delivery rollback capacity release failed:', error)
          );
        }
        await supabase
          .from('orders')
          .delete()
          .in(
            'id',
            (data ?? []).map(order => order.id)
          );
        await Promise.allSettled(
          [...deliveryJobByCook.values()].map(job => cancelDeliveryJob(job.id))
        );
        reservations.splice(0, reservations.length);
        return res.status(409).json({
          error:
            bookingError instanceof Error
              ? `Lalamove could not be booked: ${bookingError.message}`
              : 'Lalamove could not be booked. Request a new quote and try again.',
        });
      }
    }
    // The order rows now own these reservations.
    reservations.splice(0, reservations.length);

    // Notify everyone involved (best-effort — the order is already placed).
    // Buyer gets one payment-received summary; each cook gets one
    // notification per order row so they can act on it from Today.
    try {
      const createdOrders = data ?? [];
      const foodTotal = createdOrders.reduce((sum, o) => sum + Number(o.total_price), 0);
      const deliveryTotal = [...deliveryJobByCook.values()].reduce(
        (sum, job) => sum + Number(job.customer_delivery_fee),
        0
      );
      const total = foodTotal + deliveryTotal;
      await notifyBuyerOrderPlaced(
        req.account!.userId,
        total,
        createdOrders.length,
        createdOrders.map(o => o.id)
      );

      const listingIds = [...new Set(createdOrders.map(o => o.listing_id))];
      const { data: listingRows } = await supabase
        .from('listings')
        .select('id, title, profiles(user_id)')
        .in('id', listingIds);
      const listingById = new Map((listingRows ?? []).map(l => [l.id, l]));

      for (const order of createdOrders) {
        const listing = listingById.get(order.listing_id) as any;
        const cookUserId = listing?.profiles?.user_id;
        if (!cookUserId) continue;
        await notifyCookNewOrder(cookUserId, {
          orderId: order.id,
          listingTitle: listing.title ?? 'your dish',
          quantity: order.quantity,
          totalPrice: order.total_price,
          scheduledDate: order.scheduled_date,
          pickupTime: order.pickup_time,
        });
      }
    } catch (notifyErr: any) {
      console.error('Order notifications failed:', notifyErr.message ?? notifyErr);
    }

    res.status(201).json({ success: true, orders: data });
  } catch (err: any) {
    console.error('Error placing order:', err);
    await rollbackReservations();
    res.status(500).json({ error: err.message });
  }
});

type CookOrderStatus = 'pending' | 'confirmed' | 'ready' | 'completed' | 'cancelled';

const ORDER_STATUSES = new Set<CookOrderStatus>([
  'pending',
  'confirmed',
  'ready',
  'completed',
  'cancelled',
]);
const COOK_STATUS_TRANSITIONS: Record<CookOrderStatus, readonly CookOrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['ready', 'cancelled'],
  ready: ['completed'],
  completed: [],
  cancelled: [],
};
const ORDER_ID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

type OrderRelation<T> = T | T[] | null;
const orderRelation = <T>(value: OrderRelation<T>): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

// GET /:id/pickup-coordination - Exact pickup details and the other party's
// phone number are disclosed only while an accepted pickup order is active.
router.get('/:id/pickup-coordination', requireReadableAccount, async (req: AccountRequest, res) => {
  const { id } = req.params;
  if (!ORDER_ID_PATTERN.test(id)) {
    return res.status(400).json({ error: 'Order ID is invalid.' });
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, customer_id, fulfillment_type, status, profiles(full_name, phone_number), listings(cook_id, profiles(full_name, restaurant_name, phone_number, address_country, address_flat, address_property_name, address_street, address_locality, address_town, address_postcode))'
      )
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Order not found.' });

    const listing = orderRelation(
      data.listings as OrderRelation<{
        cook_id: string;
        profiles: OrderRelation<{
          full_name: string;
          restaurant_name: string | null;
          phone_number: string | null;
          address_country: string | null;
          address_flat: string | null;
          address_property_name: string | null;
          address_street: string | null;
          address_locality: string | null;
          address_town: string | null;
          address_postcode: string | null;
        }>;
      }>
    );
    const buyer = orderRelation(
      data.profiles as OrderRelation<{ full_name: string; phone_number: string | null }>
    );
    const cook = orderRelation(listing?.profiles ?? null);
    const requesterIsBuyer = data.customer_id === req.account!.profileId;
    const requesterIsCook = listing?.cook_id === req.account!.profileId;
    if (!requesterIsBuyer && !requesterIsCook) {
      return res.status(403).json({ error: 'You do not have access to this pickup.' });
    }
    if (data.fulfillment_type !== 'pickup') {
      return res.status(409).json({ error: 'Pickup coordination is unavailable for delivery.' });
    }
    if (!['confirmed', 'ready'].includes(data.status ?? '')) {
      return res.status(409).json({
        error: 'Pickup details are available only after acceptance and before completion.',
      });
    }
    if (!cook?.address_street || !cook.address_town || !cook.address_postcode) {
      return res.status(409).json({ error: 'The registered pickup address is incomplete.' });
    }

    res.json({
      pickupPoint: {
        name: cook.restaurant_name || cook.full_name || 'Home restaurant',
        address: [
          cook.address_flat,
          cook.address_property_name,
          cook.address_street,
          cook.address_locality,
          cook.address_postcode,
          cook.address_town,
          cook.address_country,
        ]
          .filter(Boolean)
          .join(', '),
      },
      contact: requesterIsBuyer
        ? { name: cook.full_name || 'Cook', phoneNumber: cook.phone_number }
        : { name: buyer?.full_name || 'Customer', phoneNumber: buyer?.phone_number ?? null },
      sender: requesterIsBuyer
        ? { name: buyer?.full_name || 'Customer', role: 'buyer' }
        : { name: cook.full_name || 'Cook', role: 'cook' },
    });
  } catch (error: unknown) {
    console.error('Error loading pickup coordination:', error);
    res.status(500).json({ error: 'Pickup coordination details could not be loaded.' });
  }
});

// PATCH /:id/status - Cook advances/cancels an order.
// Runs through the service-role client because orders are owned (RLS-wise) by
// the customer, not the cook — a cook updating status has no row-level grant
// from the client, so this has to be a privileged, server-verified write.
router.patch('/:id/status', requireActiveAccount, async (req: AccountRequest, res) => {
  const { id } = req.params;
  const { status, userId, cancellationReason } = (req.body ?? {}) as {
    status?: string;
    userId?: string;
    cancellationReason?: string;
  };

  if (!ORDER_ID_PATTERN.test(id)) {
    return res.status(400).json({ error: 'Order ID is invalid.' });
  }
  if (userId && userId !== req.account!.userId) {
    return res
      .status(403)
      .json({ error: 'The request user does not match the signed-in account.' });
  }
  if (!status || !ORDER_STATUSES.has(status as CookOrderStatus)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  if (cancellationReason !== undefined && typeof cancellationReason !== 'string') {
    return res.status(400).json({ error: 'cancellationReason must be text.' });
  }

  try {
    const profile = { id: req.account!.profileId };

    // Verify the order belongs to a listing owned by the requesting cook
    // before allowing the write.
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select(
        'id, quantity, total_price, scheduled_date, pickup_time, customer_id, listing_id, fulfillment_type, delivery_job_id, status, completed_at, cancelled_at, cancellation_reason, listings(cook_id, title)'
      )
      .eq('id', id)
      .single();
    if (orderErr || !order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const orderListing = Array.isArray(order.listings) ? order.listings[0] : order.listings;
    const cookId = orderListing?.cook_id;
    if (cookId !== profile.id) {
      return res.status(403).json({ error: 'You do not have permission to update this order.' });
    }

    const currentStatus = order.status as CookOrderStatus | null;
    const requestedStatus = status as CookOrderStatus;
    if (!currentStatus || !ORDER_STATUSES.has(currentStatus)) {
      return res.status(409).json({ error: 'This order is not in a recognised workflow state.' });
    }
    // Safe retries should not repeat notifications or alter the original
    // completion/cancellation evidence. The capacity RPC is independently
    // idempotent, so a cancellation retry can finish work interrupted after
    // the original status compare-and-set.
    if (currentStatus === requestedStatus) {
      if (requestedStatus === 'cancelled') {
        await releaseListingCapacityForOrder(order.id);
        await cancelDeliveryJobWhenUnused(order.delivery_job_id).catch(deliveryError =>
          console.error('Cancelled-order delivery reconciliation failed:', deliveryError)
        );
      }
      return res.json({ success: true, order, unchanged: true });
    }
    if (currentStatus === 'ready' && requestedStatus === 'cancelled') {
      return res.status(409).json({
        error: 'A ready order can no longer be cancelled. Complete the pickup or delivery instead.',
      });
    }
    if (!COOK_STATUS_TRANSITIONS[currentStatus].includes(requestedStatus)) {
      return res.status(409).json({
        error: `An order cannot move from ${currentStatus} to ${requestedStatus}. Refresh and try again.`,
      });
    }
    if (order.fulfillment_type === 'delivery' && requestedStatus === 'completed') {
      return res.status(409).json({
        error: 'Lalamove marks delivery orders complete automatically after proof of delivery.',
      });
    }
    if (order.delivery_job_id && requestedStatus === 'cancelled') {
      const { data: deliveryJob, error: deliveryJobError } = await supabase
        .from('delivery_jobs')
        .select('status')
        .eq('id', order.delivery_job_id)
        .single();
      if (deliveryJobError) throw deliveryJobError;
      if (deliveryJob && ['picked_up', 'delivered'].includes(deliveryJob.status)) {
        return res.status(409).json({
          error: 'This order cannot be cancelled after the Lalamove rider has collected it.',
        });
      }
    }

    const now = new Date().toISOString();
    const statusMetadata =
      requestedStatus === 'completed'
        ? {
            completed_at: order.completed_at ?? now,
            cancelled_by: null,
            cancelled_at: null,
            cancellation_reason: null,
          }
        : requestedStatus === 'cancelled'
          ? {
              completed_at: null,
              cancelled_by: 'cook',
              cancelled_at: order.cancelled_at ?? now,
              cancellation_reason:
                cancellationReason?.trim().slice(0, 500) || order.cancellation_reason || null,
            }
          : {};

    const { data, error } = await supabase
      .from('orders')
      .update({ status: requestedStatus, ...statusMetadata })
      .eq('id', id)
      .eq('status', currentStatus)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return res.status(409).json({
        error: 'This order changed on another device. Refresh and try again.',
      });
    }

    // The database releases the exact persisted reservation under an order-row
    // lock and records the release, so this call is safe to retry.
    if (requestedStatus === 'cancelled') {
      try {
        await releaseListingCapacityForOrder(order.id);
      } catch (capacityError: unknown) {
        // Cancellation is authoritative even if capacity reconciliation needs
        // a later retry; never reopen a cancelled order as a repair strategy.
        console.error('Cancelled-order capacity release failed:', capacityError);
      }
      await cancelDeliveryJobWhenUnused(order.delivery_job_id).catch(deliveryError =>
        console.error('Cancelled-order delivery reconciliation failed:', deliveryError)
      );
    }

    // Notify the affected party (best-effort — the status change already
    // landed). Buyer hears about confirm/ready/cancel; the cook hears about
    // their payout when the order completes.
    try {
      const orderCtx = {
        orderId: order.id,
        listingTitle: orderListing?.title ?? 'your order',
        quantity: order.quantity,
        totalPrice: order.total_price,
        scheduledDate: order.scheduled_date,
        pickupTime: order.pickup_time,
      };

      if (requestedStatus === 'completed') {
        // The requester is the verified cook — userId is their auth id.
        await notifyCookPayoutSent(req.account!.userId, orderCtx);
      }

      const { data: buyer } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('id', order.customer_id)
        .single();
      if (buyer?.user_id) {
        if (requestedStatus === 'confirmed')
          await notifyBuyerOrderConfirmed(buyer.user_id, orderCtx);
        else if (requestedStatus === 'ready') await notifyBuyerOrderReady(buyer.user_id, orderCtx);
        else if (requestedStatus === 'cancelled')
          await notifyBuyerOrderCancelled(buyer.user_id, orderCtx);
        else if (requestedStatus === 'completed') {
          // Ask for a review — the notification deep-links to the review screen.
          await notifyBuyerReviewRequest(buyer.user_id, {
            ...orderCtx,
            listingId: order.listing_id,
          });
        }
      }
    } catch (notificationError: unknown) {
      console.error('Status notification failed:', notificationError);
    }

    res.json({ success: true, order: data });
  } catch (error: unknown) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'The order status could not be updated.' });
  }
});

const PROOF_BUCKET = 'order-proofs';
const PROOF_MAX_BYTES = 5 * 1024 * 1024;
const PROOF_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
let proofBucketReady = false;

// POST /:id/proof - Cook attaches a proof-of-preparation photo to an order.
// Runs through the service-role client (same ownership rules as the status
// route): the requester must own the listing behind the order.
router.post('/:id/proof', requireActiveAccount, async (req: AccountRequest, res) => {
  const { id } = req.params;
  const { imageBase64, contentType } = (req.body ?? {}) as {
    imageBase64?: string;
    contentType?: string;
  };

  if (!ORDER_ID_PATTERN.test(id)) {
    return res.status(400).json({ error: 'Order ID is invalid.' });
  }
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'imageBase64 is required.' });
  }
  if (!contentType || !PROOF_CONTENT_TYPES.has(contentType)) {
    return res
      .status(400)
      .json({ error: 'contentType must be image/jpeg, image/png or image/webp.' });
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(imageBase64, 'base64');
  } catch {
    return res.status(400).json({ error: 'imageBase64 is not valid base64 data.' });
  }
  if (bytes.length === 0 || bytes.length > PROOF_MAX_BYTES) {
    return res.status(400).json({ error: 'The photo must be between 1 byte and 5 MB.' });
  }

  try {
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, status, listings(cook_id)')
      .eq('id', id)
      .single();
    if (orderErr || !order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const orderListing = Array.isArray(order.listings) ? order.listings[0] : order.listings;
    if (orderListing?.cook_id !== req.account!.profileId) {
      return res.status(403).json({ error: 'You do not have permission to update this order.' });
    }
    if (order.status === 'cancelled') {
      return res.status(409).json({ error: 'A cancelled order cannot receive a proof photo.' });
    }

    if (!proofBucketReady) {
      // Idempotent — createBucket errors if it already exists, which is fine.
      await supabase.storage
        .createBucket(PROOF_BUCKET, { public: true, fileSizeLimit: PROOF_MAX_BYTES })
        .catch(() => undefined);
      proofBucketReady = true;
    }

    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const path = `${id}/proof-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from(PROOF_BUCKET).getPublicUrl(path);
    const proofUrl = publicData.publicUrl;

    const { error: updateError } = await supabase
      .from('orders')
      .update({ proof_of_prep_url: proofUrl })
      .eq('id', id);
    if (updateError) throw updateError;

    res.json({ success: true, proofUrl });
  } catch (error: unknown) {
    console.error('Error uploading order proof:', error);
    res.status(500).json({ error: 'The proof photo could not be uploaded.' });
  }
});

export default router;
