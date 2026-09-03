import express from 'express';

import type { AccountRequest } from '../accountAccess';
import { requireActiveAccount, requireReadableAccount } from '../accountAccess';
import {
  formatDeliveryAddress,
  isInKlangValley,
  normalizeMalaysianPhone,
  type DeliveryAddressSnapshot,
  type PickupAddressSnapshot,
} from '../deliveryService';
import {
  createLalamoveQuotation,
  getLalamoveDriver,
  LalamoveApiError,
  verifyLalamoveWebhook,
} from '../lalamove';
import { estimateDeliveryArrival, normalizeDistanceMeters } from '../deliveryEta';
import {
  getListingOptionGroups,
  validateOptionSelections,
  type RequestedOptionGroup,
} from '../menuOptionService';
import {
  notifyBuyerDeliveryUpdate,
  notifyBuyerReviewRequest,
  notifyCookDeliveryUpdate,
  notifyCookDeliveryPayout,
} from '../notifications';
import { supabase } from '../supabaseClient';

const router = express.Router();
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

type QuoteItem = {
  listingId: string;
  quantity: number;
  pickupTime: string;
  pickupWindowEnd: string;
  selectedOptions?: RequestedOptionGroup[];
};

const textField = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const parseAddress = (value: unknown): DeliveryAddressSnapshot | null => {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const phoneNumber = normalizeMalaysianPhone(textField(input.phoneNumber, 30));
  const address: DeliveryAddressSnapshot = {
    recipientName: textField(input.recipientName, 120),
    phoneNumber: phoneNumber ?? '',
    addressLine1: textField(input.addressLine1, 200),
    addressLine2: textField(input.addressLine2, 200) || null,
    locality: textField(input.locality, 120) || null,
    city: textField(input.city, 120),
    state: textField(input.state, 120),
    postcode: textField(input.postcode, 10),
    countryCode: 'MY',
    latitude,
    longitude,
    deliveryInstructions: textField(input.deliveryInstructions, 500) || null,
  };
  if (
    !address.recipientName ||
    !address.phoneNumber ||
    !address.addressLine1 ||
    !address.city ||
    !address.state ||
    !/^\d{5}$/.test(address.postcode) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  )
    return null;
  return address;
};

router.get('/address', requireReadableAccount, async (req: AccountRequest, res) => {
  try {
    const [{ data: saved, error: savedError }, { data: profile, error: profileError }] =
      await Promise.all([
        supabase
          .from('customer_delivery_addresses')
          .select('*')
          .eq('user_id', req.account!.userId)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('full_name, phone_number')
          .eq('id', req.account!.profileId)
          .single(),
      ]);
    if (savedError) throw savedError;
    if (profileError) throw profileError;
    res.json({
      address: saved
        ? {
            recipientName: saved.recipient_name,
            phoneNumber: saved.phone_number,
            addressLine1: saved.address_line_1,
            addressLine2: saved.address_line_2,
            locality: saved.locality,
            city: saved.city,
            state: saved.state,
            postcode: saved.postcode,
            countryCode: saved.country_code,
            latitude: Number(saved.latitude),
            longitude: Number(saved.longitude),
            deliveryInstructions: saved.delivery_instructions,
          }
        : null,
      defaults: { recipientName: profile.full_name, phoneNumber: profile.phone_number },
    });
  } catch (error: unknown) {
    console.error('Could not load delivery address:', error);
    res.status(500).json({ error: 'Your delivery address could not be loaded.' });
  }
});

router.post('/quote', requireActiveAccount, async (req: AccountRequest, res) => {
  const address = parseAddress(req.body?.address);
  const items = req.body?.items as QuoteItem[] | undefined;
  if (!address) {
    return res.status(400).json({
      error: 'Enter a complete Malaysian address, phone number, and precise map location.',
    });
  }
  if (!isInKlangValley(address.latitude, address.longitude)) {
    return res
      .status(409)
      .json({ error: 'Lalamove delivery is currently available in Klang Valley only.' });
  }
  // Clients may still have a pre-window cart in memory after Fast Refresh. All
  // current restaurant slots are 30 minutes, so migrate those requests safely.
  if (Array.isArray(items)) {
    for (const item of items) {
      if (
        item &&
        !item.pickupWindowEnd &&
        item.pickupTime &&
        !Number.isNaN(new Date(item.pickupTime).getTime())
      ) {
        item.pickupWindowEnd = new Date(
          new Date(item.pickupTime).getTime() + 30 * 60_000
        ).toISOString();
      }
    }
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'The cart is missing a valid item or delivery time.' });
  }
  const invalidItemIndex = items.findIndex(
    item =>
      !item ||
      !UUID_PATTERN.test(item.listingId) ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      !item.pickupTime ||
      Number.isNaN(new Date(item.pickupTime).getTime()) ||
      !item.pickupWindowEnd ||
      Number.isNaN(new Date(item.pickupWindowEnd).getTime()) ||
      new Date(item.pickupWindowEnd).getTime() <= new Date(item.pickupTime).getTime()
  );
  if (invalidItemIndex >= 0) {
    const invalidItem = items[invalidItemIndex];
    const invalidSchedule =
      !invalidItem?.pickupTime ||
      Number.isNaN(new Date(invalidItem.pickupTime).getTime()) ||
      !invalidItem?.pickupWindowEnd ||
      Number.isNaN(new Date(invalidItem.pickupWindowEnd).getTime()) ||
      new Date(invalidItem.pickupWindowEnd).getTime() <= new Date(invalidItem.pickupTime).getTime();
    return res.status(400).json({
      error: invalidSchedule
        ? 'This basket has an invalid delivery window. Choose the order time again.'
        : 'This basket contains an invalid dish or quantity.',
    });
  }
  const now = Date.now();
  const latestLalamoveSchedule = now + 30 * 24 * 60 * 60_000;
  if (items.some(item => new Date(item.pickupWindowEnd).getTime() <= now)) {
    return res.status(409).json({ error: 'This delivery window has passed. Choose a later time.' });
  }
  if (items.some(item => new Date(item.pickupWindowEnd).getTime() > latestLalamoveSchedule)) {
    return res
      .status(409)
      .json({ error: 'Lalamove deliveries can only be scheduled up to 30 days ahead.' });
  }

  const insertedJobIds: string[] = [];
  try {
    const listingIds = [...new Set(items.map(item => item.listingId))];
    const { data: listings, error: listingError } = await supabase
      .from('listings')
      .select('id, cook_id, price, status, is_active')
      .in('id', listingIds);
    if (listingError) throw listingError;
    if ((listings ?? []).length !== listingIds.length)
      return res.status(404).json({ error: 'One or more dishes are no longer available.' });
    const listingById = new Map((listings ?? []).map(listing => [listing.id, listing]));
    if (
      (listings ?? []).some(listing => listing.status !== 'approved' || listing.is_active !== true)
    ) {
      return res.status(409).json({ error: 'One or more dishes are not currently available.' });
    }
    if (new Set((listings ?? []).map(listing => listing.cook_id)).size !== 1) {
      return res.status(400).json({
        error: 'Request delivery for one home restaurant basket at a time.',
      });
    }

    const optionGroups = await getListingOptionGroups(listingIds);
    const subtotalByCook = new Map<string, number>();
    const scheduleByCook = new Map<string, string>();
    for (const item of items) {
      const listing = listingById.get(item.listingId)!;
      const validation = validateOptionSelections(
        optionGroups[item.listingId] ?? [],
        item.selectedOptions
      );
      if ('error' in validation) return res.status(409).json({ error: validation.error });
      const unitPrice = Number(listing.price) + validation.surcharge;
      subtotalByCook.set(
        listing.cook_id,
        (subtotalByCook.get(listing.cook_id) ?? 0) + unitPrice * item.quantity
      );
      // The courier should arrive after the cook's preparation window, not at its start.
      const schedule = new Date(item.pickupWindowEnd).toISOString();
      const prior = scheduleByCook.get(listing.cook_id);
      if (prior && prior !== schedule)
        return res
          .status(400)
          .json({ error: 'All dishes from the same restaurant must use the same delivery time.' });
      scheduleByCook.set(listing.cook_id, schedule);
    }

    const cookIds = [...subtotalByCook.keys()];
    const [{ data: cooks, error: cooksError }, { data: locations, error: locationsError }] =
      await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, full_name, restaurant_name, phone_number, free_delivery_threshold, address_flat, address_property_name, address_street, address_locality, address_town, address_postcode'
          )
          .in('id', cookIds),
        supabase
          .from('restaurant_delivery_locations')
          .select('cook_profile_id, latitude, longitude')
          .in('cook_profile_id', cookIds),
      ]);
    if (cooksError) throw cooksError;
    if (locationsError) throw locationsError;
    const cookById = new Map((cooks ?? []).map(cook => [cook.id, cook]));
    const locationByCook = new Map(
      (locations ?? []).map(location => [location.cook_profile_id, location])
    );

    await supabase
      .from('delivery_jobs')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('customer_id', req.account!.profileId)
      .eq('status', 'quoted')
      .lt('quote_expires_at', new Date().toISOString());
    const { error: addressError } = await supabase.from('customer_delivery_addresses').upsert({
      user_id: req.account!.userId,
      recipient_name: address.recipientName,
      phone_number: address.phoneNumber,
      address_line_1: address.addressLine1,
      address_line_2: address.addressLine2,
      locality: address.locality,
      city: address.city,
      state: address.state,
      postcode: address.postcode,
      country_code: 'MY',
      latitude: address.latitude,
      longitude: address.longitude,
      delivery_instructions: address.deliveryInstructions,
      updated_at: new Date().toISOString(),
    });
    if (addressError) throw addressError;

    const quotes: Array<Record<string, string | number | boolean | null>> = [];
    for (const cookId of cookIds) {
      const cook = cookById.get(cookId);
      const location = locationByCook.get(cookId);
      if (!cook || !location || !cook.phone_number)
        throw new Error(
          `${cook?.restaurant_name ?? 'A cook'} has not finished setting up delivery.`
        );
      const latitude = Number(location.latitude);
      const longitude = Number(location.longitude);
      if (!isInKlangValley(latitude, longitude))
        throw new Error(
          `${cook.restaurant_name ?? cook.full_name} is outside the current Klang Valley delivery area.`
        );
      const pickupAddress = [
        cook.address_flat,
        cook.address_property_name,
        cook.address_street,
        cook.address_locality,
        cook.address_postcode,
        cook.address_town,
        'Malaysia',
      ]
        .filter(Boolean)
        .join(', ');
      if (!pickupAddress)
        throw new Error(`${cook.restaurant_name ?? cook.full_name} has no pickup address.`);
      const scheduledAt = scheduleByCook.get(cookId)!;
      const quotation = await createLalamoveQuotation({
        pickup: {
          coordinates: { lat: latitude.toFixed(6), lng: longitude.toFixed(6) },
          address: pickupAddress,
        },
        dropoff: {
          coordinates: { lat: address.latitude.toFixed(6), lng: address.longitude.toFixed(6) },
          address: formatDeliveryAddress(address),
        },
        scheduleAt: scheduledAt,
      });
      const quotedFee = Number(quotation.priceBreakdown?.total);
      if (!Number.isFinite(quotedFee) || quotedFee < 0)
        throw new Error('Lalamove returned an invalid quote.');
      const distanceMeters = normalizeDistanceMeters(quotation.distance);
      if (distanceMeters == null)
        throw new Error('Lalamove did not return a usable delivery distance.');
      const estimate = estimateDeliveryArrival(scheduledAt, distanceMeters);
      const subtotal = subtotalByCook.get(cookId)!;
      const threshold =
        cook.free_delivery_threshold == null ? null : Number(cook.free_delivery_threshold);
      const freeDeliveryApplied = threshold != null && subtotal >= threshold;
      const pickupSnapshot: PickupAddressSnapshot = {
        name: cook.restaurant_name || cook.full_name,
        phoneNumber: cook.phone_number,
        address: pickupAddress,
        latitude,
        longitude,
      };
      const { data: job, error: jobError } = await supabase
        .from('delivery_jobs')
        .insert({
          customer_id: req.account!.profileId,
          cook_id: cookId,
          provider_quotation_id: quotation.quotationId,
          status: 'quoted',
          quoted_fee: quotedFee,
          customer_delivery_fee: freeDeliveryApplied ? 0 : quotedFee,
          cook_delivery_charge: freeDeliveryApplied ? quotedFee : 0,
          free_delivery_applied: freeDeliveryApplied,
          distance_meters: distanceMeters,
          preparation_ready_at: scheduledAt,
          estimated_arrival_start: estimate.estimatedArrivalStart,
          estimated_arrival_end: estimate.estimatedArrivalEnd,
          estimated_travel_min_minutes: estimate.travelMinMinutes,
          estimated_travel_max_minutes: estimate.travelMaxMinutes,
          scheduled_at: scheduledAt,
          quote_expires_at: quotation.expiresAt,
          pickup_address: pickupSnapshot,
          dropoff_address: address,
          provider_quote: quotation,
          provider_payload: {},
        })
        .select('id')
        .single();
      if (jobError || !job) throw jobError ?? new Error('Could not save delivery quote.');
      insertedJobIds.push(job.id);
      quotes.push({
        jobId: job.id,
        cookId,
        cookName: pickupSnapshot.name,
        subtotal: +subtotal.toFixed(2),
        quotedFee: +quotedFee.toFixed(2),
        customerFee: freeDeliveryApplied ? 0 : +quotedFee.toFixed(2),
        freeDeliveryApplied,
        freeDeliveryThreshold: threshold,
        expiresAt: quotation.expiresAt,
        distanceMeters,
        preparationReadyAt: scheduledAt,
        estimatedArrivalStart: estimate.estimatedArrivalStart,
        estimatedArrivalEnd: estimate.estimatedArrivalEnd,
        estimatedTravelMinMinutes: estimate.travelMinMinutes,
        estimatedTravelMaxMinutes: estimate.travelMaxMinutes,
        distanceBand: estimate.distanceBand,
      });
    }
    res.status(201).json({
      quotes,
      totalCustomerFee: +quotes
        .reduce((sum, quote) => sum + Number(quote.customerFee), 0)
        .toFixed(2),
      expiresAt: quotes.map(quote => String(quote.expiresAt)).sort()[0],
    });
  } catch (error: unknown) {
    if (insertedJobIds.length)
      await supabase.from('delivery_jobs').delete().in('id', insertedJobIds);
    console.error('Delivery quote failed:', error);
    res.status(error instanceof LalamoveApiError ? 502 : 409).json({
      error: error instanceof Error ? error.message : 'A live delivery quote could not be created.',
    });
  }
});

type WebhookPayload = {
  apiKey?: unknown;
  timestamp?: unknown;
  signature?: unknown;
  data?: {
    order?: { orderId?: string; status?: string; driverId?: string; shareLink?: string };
    orderId?: string;
    status?: string;
    driverId?: string;
    shareLink?: string;
    proofOfDelivery?: { url?: string };
  };
};

router.post('/lalamove/webhook', async (req, res) => {
  const payload = req.body as WebhookPayload;
  if (!payload || Object.keys(payload).length === 0) return res.sendStatus(200);
  if (!verifyLalamoveWebhook(payload)) return res.status(401).json({ error: 'Invalid signature.' });
  const event = payload.data ?? {};
  const orderId = event.order?.orderId ?? event.orderId;
  const providerStatus = (event.order?.status ?? event.status ?? '').toUpperCase();
  if (!orderId || !providerStatus) return res.sendStatus(200);
  try {
    const { data: job, error } = await supabase
      .from('delivery_jobs')
      .select(
        '*, customer:profiles!delivery_jobs_customer_id_fkey(user_id), cook:profiles!delivery_jobs_cook_id_fkey(user_id)'
      )
      .eq('provider_order_id', orderId)
      .maybeSingle();
    if (error) throw error;
    if (!job) return res.sendStatus(200);
    const timestamp = Number(payload.timestamp);
    const eventAt = new Date(
      timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp
    ).toISOString();
    if (
      job.provider_event_at &&
      new Date(job.provider_event_at).getTime() >= new Date(eventAt).getTime()
    )
      return res.sendStatus(200);
    const statusMap: Record<string, string> = {
      ASSIGNING_DRIVER: 'assigning_driver',
      ON_GOING: 'on_going',
      PICKED_UP: 'picked_up',
      COMPLETED: 'delivered',
      CANCELED: 'cancelled',
      REJECTED: 'failed',
      EXPIRED: 'expired',
    };
    const status = statusMap[providerStatus] ?? job.status;
    const driverId = event.order?.driverId ?? event.driverId ?? job.driver_id;
    const driver =
      driverId && driverId !== job.driver_id
        ? await getLalamoveDriver(orderId, driverId).catch(() => null)
        : null;
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('delivery_jobs')
      .update({
        status,
        provider_status: providerStatus,
        provider_event_at: eventAt,
        provider_payload: payload.data,
        driver_id: driverId || null,
        driver_name: driver?.name ?? job.driver_name,
        driver_phone: driver?.phone ?? job.driver_phone,
        driver_plate_number: driver?.plateNumber ?? job.driver_plate_number,
        share_link: event.order?.shareLink ?? event.shareLink ?? job.share_link,
        proof_of_delivery_url: event.proofOfDelivery?.url ?? job.proof_of_delivery_url,
        picked_up_at: status === 'picked_up' ? (job.picked_up_at ?? now) : job.picked_up_at,
        delivered_at: status === 'delivered' ? (job.delivered_at ?? now) : job.delivered_at,
        cancelled_at: status === 'cancelled' ? (job.cancelled_at ?? now) : job.cancelled_at,
        updated_at: now,
      })
      .eq('id', job.id);
    if (updateError) throw updateError;
    const customerUserId = Array.isArray(job.customer)
      ? job.customer[0]?.user_id
      : job.customer?.user_id;
    const cookUserId = Array.isArray(job.cook) ? job.cook[0]?.user_id : job.cook?.user_id;
    const { data: linkedOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('delivery_job_id', job.id)
      .neq('status', 'cancelled')
      .limit(1)
      .maybeSingle();
    if (['assigning_driver', 'on_going', 'picked_up', 'delivered', 'failed'].includes(status)) {
      await Promise.all([
        customerUserId
          ? notifyBuyerDeliveryUpdate(customerUserId, status, job.id, linkedOrder?.id)
          : Promise.resolve(),
        cookUserId
          ? notifyCookDeliveryUpdate(cookUserId, status, job.id, linkedOrder?.id)
          : Promise.resolve(),
      ]);
    }
    if (status === 'delivered') {
      const { data: orders, error: orderError } = await supabase
        .from('orders')
        .update({ status: 'completed', completed_at: now })
        .eq('delivery_job_id', job.id)
        .neq('status', 'cancelled')
        .select(
          'id, listing_id, quantity, total_price, scheduled_date, pickup_time, listings(title)'
        );
      if (orderError) throw orderError;
      await supabase
        .from('cook_payout_ledger')
        .update({ status: 'applied', updated_at: now })
        .eq('delivery_job_id', job.id)
        .eq('status', 'pending');
      for (const order of orders ?? []) {
        const listing = Array.isArray(order.listings) ? order.listings[0] : order.listings;
        const context = {
          orderId: order.id,
          listingTitle: listing?.title ?? 'your order',
          quantity: order.quantity,
          totalPrice: order.total_price,
          scheduledDate: order.scheduled_date,
          pickupTime: order.pickup_time,
        };
        if (customerUserId)
          await notifyBuyerReviewRequest(customerUserId, {
            ...context,
            listingId: order.listing_id,
          });
      }
      if (cookUserId) {
        await notifyCookDeliveryPayout(
          cookUserId,
          (orders ?? []).reduce((sum, order) => sum + Number(order.total_price), 0),
          Number(job.cook_delivery_charge ?? 0),
          (orders ?? []).map(order => order.id)
        );
      }
    }
    res.sendStatus(200);
  } catch (error: unknown) {
    console.error('Lalamove webhook failed:', error);
    res.status(500).json({ error: 'Webhook could not be processed.' });
  }
});

export default router;
