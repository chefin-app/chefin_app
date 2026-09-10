import express from 'express';

import { getAdminDateBounds } from '../adminDateFilter';
import {
  canAdminCancelCheckout,
  canAdminCompleteCheckout,
  compactOrderId,
  deriveCheckoutStatus,
  formatFullAddress,
  isLiveCheckoutStatus,
  maskPhoneNumber,
  summarizeAddress,
  type AdminCheckoutStatus,
} from '../adminOrderMonitoring';
import { writeAdminAudit } from '../adminAudit';
import { releaseListingCapacityForOrder } from '../availabilityService';
import { cancelDeliveryJobWhenUnused } from '../deliveryService';
import type { AdminRequest } from '../middleware/requireAdmin';
import {
  notifyBuyerCheckoutFulfilled,
  notifyBuyerOrderCancelledByAdmin,
  notifyCookCheckoutFulfilled,
  notifyCookDeliveryPayout,
} from '../notifications';
import { supabase } from '../supabaseClient';

const router = express.Router();
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const FILTERS = new Set([
  'all',
  'live',
  'pending',
  'completed',
  'cancelled',
  'attention',
  'disputed',
]);
const SORTS = new Set(['newest', 'oldest', 'value_desc', 'value_asc', 'pickup_soonest']);
const DATE_RANGES = new Set(['all', 'today', '7d', '30d', '90d']);
const OPEN_DISPUTE_STATUSES = ['open', 'reviewing'];
const PAGE_CHUNK_SIZE = 1000;

type Relation<T> = T | T[] | null;

interface PersonProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  profile_image: string | null;
  phone_number: string | null;
}

interface CookProfile extends PersonProfile {
  restaurant_name: string | null;
  address_country: string | null;
  address_flat: string | null;
  address_property_name: string | null;
  address_street: string | null;
  address_locality: string | null;
  address_town: string | null;
  address_postcode: string | null;
}

interface ListingRelation {
  id: string;
  cook_id: string;
  title: string | null;
  image_url: string | null;
  profiles: Relation<CookProfile>;
}

interface DeliveryRelation {
  id: string;
  provider: string;
  provider_order_id: string | null;
  provider_status: string | null;
  status: string;
  quoted_fee: number | string;
  customer_delivery_fee: number | string;
  cook_delivery_charge: number | string;
  free_delivery_applied: boolean;
  distance_meters: number | null;
  scheduled_at: string;
  pickup_address: Record<string, unknown> | null;
  dropoff_address: Record<string, unknown> | null;
  driver_name: string | null;
  driver_phone: string | null;
  driver_plate_number: string | null;
  share_link: string | null;
  proof_of_delivery_url: string | null;
  booked_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  estimated_arrival_start: string | null;
  estimated_arrival_end: string | null;
}

interface OrderLineRow {
  id: string;
  checkout_id: string;
  customer_id: string;
  listing_id: string;
  quantity: number;
  total_price: number | string;
  scheduled_date: string;
  pickup_time: string | null;
  pickup_window_end: string | null;
  customer_note: string | null;
  selected_options: unknown;
  fulfillment_type: string;
  status: string | null;
  payment_status: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  completed_at: string | null;
  proof_of_prep_url: string | null;
  delivery_job_id: string | null;
  refund_status: string;
  refund_required_at: string | null;
  refund_note: string | null;
  created_at: string | null;
  profiles: Relation<PersonProfile>;
  listings: Relation<ListingRelation>;
  delivery_jobs: Relation<DeliveryRelation>;
}

interface DisputeRow {
  id: string;
  checkout_id: string;
  representative_order_id: string;
  created_by: string;
  source: 'admin';
  complainant_type: 'customer' | 'cook' | 'other';
  reason: string;
  details: string;
  evidence_urls: string[] | null;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  resolution: string | null;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AlertRow {
  id: string;
  checkout_id: string;
  alert_type: string;
  severity: 'warning' | 'critical';
  status: 'open' | 'resolved';
  due_at: string;
  triggered_at: string;
  details: Record<string, unknown>;
}

interface CheckoutGroup {
  checkoutId: string;
  lines: OrderLineRow[];
  representative: OrderLineRow;
  customer: PersonProfile | null;
  cook: CookProfile | null;
  delivery: DeliveryRelation | null;
  disputes: DisputeRow[];
  alerts: AlertRow[];
  status: AdminCheckoutStatus;
  createdAt: string;
  orderValue: number;
  foodSubtotal: number;
  deliveryFee: number;
  cookDeliveryCharge: number;
}

const relation = <T>(value: Relation<T> | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

const dateKeyInMalaysia = (date = new Date()): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const dateRangeStart = (range: string, now = new Date()): number | null => {
  if (range === 'all') return null;
  const days = range === 'today' ? 1 : Number.parseInt(range, 10);
  const todayStart = new Date(`${dateKeyInMalaysia(now)}T00:00:00+08:00`).getTime();
  return todayStart - Math.max(0, days - 1) * 86_400_000;
};

const fullCookAddress = (cook: CookProfile | null): string | null =>
  cook
    ? [
        cook.address_flat,
        cook.address_property_name,
        cook.address_street,
        cook.address_locality,
        cook.address_postcode,
        cook.address_town,
        cook.address_country,
      ]
        .filter(Boolean)
        .join(', ') || null
    : null;

const maskedCookAddress = (cook: CookProfile | null): string | null =>
  cook
    ? [cook.address_locality, cook.address_town, cook.address_postcode]
        .filter(Boolean)
        .join(', ') || null
    : null;

async function fetchAllPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_CHUNK_SIZE) {
    const { data, error } = await loadPage(from, from + PAGE_CHUNK_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_CHUNK_SIZE) return rows;
  }
}

const orderSelect = `
  id,
  checkout_id,
  customer_id,
  listing_id,
  quantity,
  total_price,
  scheduled_date,
  pickup_time,
  pickup_window_end,
  customer_note,
  selected_options,
  fulfillment_type,
  status,
  payment_status,
  cancelled_by,
  cancelled_at,
  cancellation_reason,
  completed_at,
  proof_of_prep_url,
  delivery_job_id,
  refund_status,
  refund_required_at,
  refund_note,
  created_at,
  profiles(id, user_id, full_name, profile_image, phone_number),
  listings(id, cook_id, title, image_url, profiles(id, user_id, full_name, restaurant_name, profile_image, phone_number, address_country, address_flat, address_property_name, address_street, address_locality, address_town, address_postcode)),
  delivery_jobs(id, provider, provider_order_id, provider_status, status, quoted_fee, customer_delivery_fee, cook_delivery_charge, free_delivery_applied, distance_meters, scheduled_at, pickup_address, dropoff_address, driver_name, driver_phone, driver_plate_number, share_link, proof_of_delivery_url, booked_at, picked_up_at, delivered_at, cancelled_at, estimated_arrival_start, estimated_arrival_end)
`;

const buildCheckoutGroups = (
  rows: OrderLineRow[],
  disputes: DisputeRow[],
  alerts: AlertRow[] = []
): CheckoutGroup[] => {
  const disputesByCheckout = new Map<string, DisputeRow[]>();
  disputes.forEach(dispute =>
    disputesByCheckout.set(dispute.checkout_id, [
      ...(disputesByCheckout.get(dispute.checkout_id) ?? []),
      dispute,
    ])
  );
  const alertsByCheckout = new Map<string, AlertRow[]>();
  alerts.forEach(alert =>
    alertsByCheckout.set(alert.checkout_id, [
      ...(alertsByCheckout.get(alert.checkout_id) ?? []),
      alert,
    ])
  );
  const linesByCheckout = new Map<string, OrderLineRow[]>();
  rows.forEach(row =>
    linesByCheckout.set(row.checkout_id, [...(linesByCheckout.get(row.checkout_id) ?? []), row])
  );

  return [...linesByCheckout.entries()].map(([checkoutId, lines]) => {
    const orderedLines = [...lines].sort(
      (left, right) =>
        new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime()
    );
    const representative = orderedLines[0];
    const listing = relation(representative.listings);
    const delivery = relation(representative.delivery_jobs);
    const foodSubtotal = orderedLines.reduce((sum, line) => sum + Number(line.total_price || 0), 0);
    const deliveryFee = Number(delivery?.customer_delivery_fee ?? 0);
    return {
      checkoutId,
      lines: orderedLines,
      representative,
      customer: relation(representative.profiles),
      cook: relation(listing?.profiles),
      delivery,
      disputes: disputesByCheckout.get(checkoutId) ?? [],
      alerts: alertsByCheckout.get(checkoutId) ?? [],
      status: deriveCheckoutStatus(orderedLines.map(line => line.status)),
      createdAt: representative.created_at ?? new Date(0).toISOString(),
      foodSubtotal,
      deliveryFee,
      cookDeliveryCharge: Number(delivery?.cook_delivery_charge ?? 0),
      orderValue: foodSubtotal + deliveryFee,
    };
  });
};

const hasOpenDispute = (group: CheckoutGroup): boolean =>
  group.disputes.some(dispute => OPEN_DISPUTE_STATUSES.includes(dispute.status));

const openAlerts = (group: CheckoutGroup): AlertRow[] =>
  group.alerts.filter(alert => alert.status === 'open');

const listItem = (group: CheckoutGroup) => ({
  checkoutId: group.checkoutId,
  representativeOrderId: group.representative.id,
  displayId: compactOrderId(group.checkoutId),
  customerName: group.customer?.full_name?.trim() || 'Unknown customer',
  customerAvatarUrl: group.customer?.profile_image ?? null,
  cookName: group.cook?.restaurant_name?.trim() || group.cook?.full_name?.trim() || 'Unknown cook',
  cookAvatarUrl: group.cook?.profile_image ?? null,
  items: group.lines.map(line => ({
    id: line.id,
    title: relation(line.listings)?.title ?? 'Deleted dish',
    quantity: line.quantity,
  })),
  orderValue: group.orderValue,
  fulfillmentType: group.representative.fulfillment_type,
  status: group.status,
  hasOpenDispute: hasOpenDispute(group),
  openAlertCount: openAlerts(group).length,
  alertSeverity: openAlerts(group).some(alert => alert.severity === 'critical')
    ? 'critical'
    : openAlerts(group).length > 0
      ? 'warning'
      : null,
  openDisputeCount: group.disputes.filter(dispute => OPEN_DISPUTE_STATUSES.includes(dispute.status))
    .length,
  paymentStatus: group.representative.payment_status ?? 'unknown',
  refundStatus:
    group.lines.find(line => line.refund_status !== 'not_required')?.refund_status ??
    'not_required',
  pickupTime: group.representative.pickup_time,
  createdAt: group.createdAt,
  canCancel: canAdminCancelCheckout(group.lines.map(line => line.status)),
  canComplete: canAdminCompleteCheckout(
    group.lines.map(line => ({
      status: line.status,
      paymentStatus: line.payment_status,
      refundStatus: line.refund_status,
    }))
  ),
});

const detailItem = (group: CheckoutGroup) => ({
  ...listItem(group),
  customer: {
    profileId: group.customer?.id ?? '',
    userId: group.customer?.user_id ?? '',
    name: group.customer?.full_name?.trim() || 'Unknown customer',
    avatarUrl: group.customer?.profile_image ?? null,
    phoneNumber: maskPhoneNumber(group.customer?.phone_number),
  },
  cook: {
    profileId: group.cook?.id ?? '',
    userId: group.cook?.user_id ?? '',
    name: group.cook?.full_name?.trim() || 'Unknown cook',
    restaurantName: group.cook?.restaurant_name ?? null,
    avatarUrl: group.cook?.profile_image ?? null,
    phoneNumber: maskPhoneNumber(group.cook?.phone_number),
  },
  lines: group.lines.map(line => ({
    id: line.id,
    listingId: line.listing_id,
    title: relation(line.listings)?.title ?? 'Deleted dish',
    imageUrl: relation(line.listings)?.image_url ?? null,
    quantity: line.quantity,
    totalPrice: Number(line.total_price),
    selectedOptions: Array.isArray(line.selected_options) ? line.selected_options : [],
    customerNote: line.customer_note,
    status: line.status ?? 'unknown',
    proofOfPreparationUrl: line.proof_of_prep_url,
  })),
  foodSubtotal: group.foodSubtotal,
  deliveryFee: group.deliveryFee,
  cookDeliveryCharge: group.cookDeliveryCharge,
  scheduledDate: group.representative.scheduled_date,
  pickupWindowEnd: group.representative.pickup_window_end,
  cancelledBy: group.representative.cancelled_by,
  cancelledAt: group.representative.cancelled_at,
  cancellationReason: group.representative.cancellation_reason,
  completedAt: group.representative.completed_at,
  refundRequiredAt: group.lines.find(line => line.refund_required_at)?.refund_required_at ?? null,
  refundNote: group.lines.find(line => line.refund_note)?.refund_note ?? null,
  contact: {
    revealed: false,
    pickupAddress: maskedCookAddress(group.cook),
    deliveryAddress: summarizeAddress(group.delivery?.dropoff_address),
    driverPhone: maskPhoneNumber(group.delivery?.driver_phone),
  },
  delivery: group.delivery
    ? {
        id: group.delivery.id,
        provider: group.delivery.provider,
        providerOrderId: group.delivery.provider_order_id,
        providerStatus: group.delivery.provider_status,
        status: group.delivery.status,
        quotedFee: Number(group.delivery.quoted_fee),
        freeDeliveryApplied: group.delivery.free_delivery_applied,
        distanceMeters: group.delivery.distance_meters,
        scheduledAt: group.delivery.scheduled_at,
        driverName: group.delivery.driver_name,
        driverPlateNumber: group.delivery.driver_plate_number,
        shareLink: group.delivery.share_link,
        proofOfDeliveryUrl: group.delivery.proof_of_delivery_url,
        bookedAt: group.delivery.booked_at,
        pickedUpAt: group.delivery.picked_up_at,
        deliveredAt: group.delivery.delivered_at,
        cancelledAt: group.delivery.cancelled_at,
        estimatedArrivalStart: group.delivery.estimated_arrival_start,
        estimatedArrivalEnd: group.delivery.estimated_arrival_end,
      }
    : null,
  disputes: group.disputes,
  alerts: group.alerts,
});

const loadCheckout = async (id: string): Promise<CheckoutGroup | null> => {
  const { data: rows, error } = await supabase
    .from('orders')
    .select(orderSelect)
    .or(`id.eq.${id},checkout_id.eq.${id}`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const typedRows = (rows ?? []) as unknown as OrderLineRow[];
  if (typedRows.length === 0) return null;
  const checkoutId = typedRows[0].checkout_id;
  const { data: siblingRows, error: siblingsError } = await supabase
    .from('orders')
    .select(orderSelect)
    .eq('checkout_id', checkoutId)
    .order('created_at', { ascending: true });
  if (siblingsError) throw siblingsError;
  const [disputeResult, alertResult] = await Promise.all([
    supabase
      .from('order_disputes')
      .select('*')
      .eq('checkout_id', checkoutId)
      .order('created_at', { ascending: false }),
    supabase
      .from('order_alerts')
      .select('id, checkout_id, alert_type, severity, status, due_at, triggered_at, details')
      .eq('checkout_id', checkoutId)
      .order('triggered_at', { ascending: false }),
  ]);
  if (disputeResult.error) throw disputeResult.error;
  if (alertResult.error) throw alertResult.error;
  return buildCheckoutGroups(
    (siblingRows ?? []) as unknown as OrderLineRow[],
    (disputeResult.data ?? []) as DisputeRow[],
    (alertResult.data ?? []) as AlertRow[]
  )[0];
};

router.get('/', async (req, res) => {
  const filter = FILTERS.has(String(req.query.filter)) ? String(req.query.filter) : 'all';
  const sort = SORTS.has(String(req.query.sort)) ? String(req.query.sort) : 'newest';
  const dateRange = DATE_RANGES.has(String(req.query.dateRange))
    ? String(req.query.dateRange)
    : 'all';
  const exactDateBounds = getAdminDateBounds(req.query.date);
  const search = String(req.query.search ?? '')
    .trim()
    .toLowerCase();
  const cookId = typeof req.query.cookId === 'string' ? req.query.cookId : null;
  const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : null;
  if ((cookId && !UUID_PATTERN.test(cookId)) || (customerId && !UUID_PATTERN.test(customerId))) {
    return res.status(400).json({ error: 'The profile filter is invalid.' });
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));

  try {
    const [orders, disputesResult, alertsResult] = await Promise.all([
      fetchAllPages<OrderLineRow>((from, to) =>
        supabase
          .from('orders')
          .select(orderSelect)
          .order('created_at', { ascending: false })
          .range(from, to)
      ),
      supabase.from('order_disputes').select('*').order('created_at', { ascending: false }),
      supabase
        .from('order_alerts')
        .select('id, checkout_id, alert_type, severity, status, due_at, triggered_at, details')
        .order('triggered_at', { ascending: false }),
    ]);
    if (disputesResult.error) throw disputesResult.error;
    if (alertsResult.error) throw alertsResult.error;
    const allGroups = buildCheckoutGroups(
      orders,
      (disputesResult.data ?? []) as DisputeRow[],
      (alertsResult.data ?? []) as AlertRow[]
    );
    const scopedGroups = allGroups.filter(
      group =>
        (!cookId || group.cook?.user_id === cookId) &&
        (!customerId || group.customer?.user_id === customerId)
    );
    const thirtyDayStart = dateRangeStart('30d') ?? 0;
    const recentGroups = scopedGroups.filter(
      group => new Date(group.createdAt).getTime() >= thirtyDayStart
    );
    const terminalRecent = recentGroups.filter(group =>
      ['completed', 'cancelled'].includes(group.status)
    );
    const completedRecent = terminalRecent.filter(group => group.status === 'completed').length;
    const cancelledRecent = recentGroups.filter(group => group.status === 'cancelled').length;
    const stats = {
      totalOrders: scopedGroups.length,
      activeNow: scopedGroups.filter(group => isLiveCheckoutStatus(group.status)).length,
      completionRate:
        terminalRecent.length > 0 ? Math.round((completedRecent / terminalRecent.length) * 100) : 0,
      cancellationRate:
        recentGroups.length > 0 ? Math.round((cancelledRecent / recentGroups.length) * 100) : 0,
      openDisputes: scopedGroups.filter(hasOpenDispute).length,
      needsAttention: scopedGroups.filter(group => openAlerts(group).length > 0).length,
    };
    const counts = {
      all: scopedGroups.length,
      live: scopedGroups.filter(group => isLiveCheckoutStatus(group.status)).length,
      pending: scopedGroups.filter(group => group.status === 'pending').length,
      completed: scopedGroups.filter(group => group.status === 'completed').length,
      cancelled: scopedGroups.filter(group => group.status === 'cancelled').length,
      disputed: scopedGroups.filter(hasOpenDispute).length,
      attention: scopedGroups.filter(group => openAlerts(group).length > 0).length,
    };

    const startAt = dateRangeStart(dateRange);
    const filtered = scopedGroups.filter(group => {
      const createdAt = new Date(group.createdAt).getTime();
      if (
        exactDateBounds &&
        (createdAt < exactDateBounds.start || createdAt >= exactDateBounds.end)
      ) {
        return false;
      }
      if (!exactDateBounds && startAt !== null && createdAt < startAt) return false;
      if (filter === 'live' && !isLiveCheckoutStatus(group.status)) return false;
      if (filter === 'pending' && group.status !== 'pending') return false;
      if (filter === 'completed' && group.status !== 'completed') return false;
      if (filter === 'cancelled' && group.status !== 'cancelled') return false;
      if (filter === 'disputed' && !hasOpenDispute(group)) return false;
      if (filter === 'attention' && openAlerts(group).length === 0) return false;
      if (!search) return true;
      const searchable = [
        group.checkoutId,
        compactOrderId(group.checkoutId),
        group.customer?.full_name ?? '',
        group.cook?.full_name ?? '',
        group.cook?.restaurant_name ?? '',
        ...group.lines.map(line => relation(line.listings)?.title ?? ''),
      ];
      return searchable.some(value => value.toLowerCase().includes(search));
    });
    filtered.sort((left, right) => {
      if (sort === 'oldest') return +new Date(left.createdAt) - +new Date(right.createdAt);
      if (sort === 'value_desc') return right.orderValue - left.orderValue;
      if (sort === 'value_asc') return left.orderValue - right.orderValue;
      if (sort === 'pickup_soonest') {
        return (
          +new Date(left.representative.pickup_time ?? 8640000000000000) -
          +new Date(right.representative.pickup_time ?? 8640000000000000)
        );
      }
      return +new Date(right.createdAt) - +new Date(left.createdAt);
    });

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;
    res.set('Cache-Control', 'no-store');
    res.json({
      orders: filtered.slice(offset, offset + pageSize).map(listItem),
      stats,
      counts,
      pagination: { page: safePage, pageSize, totalItems, totalPages },
      generatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('Could not load admin orders:', error);
    res.status(500).json({ error: 'Order monitoring could not be loaded.' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!UUID_PATTERN.test(id)) return res.status(400).json({ error: 'Order ID is invalid.' });
  try {
    const checkout = await loadCheckout(id);
    if (!checkout) return res.status(404).json({ error: 'Order not found.' });
    const { data: history, error: historyError } = await supabase
      .from('admin_audit_logs')
      .select('id, actor_user_id, action, details, created_at')
      .contains('details', { checkoutId: checkout.checkoutId })
      .order('created_at', { ascending: false })
      .limit(100);
    if (historyError) throw historyError;
    res.set('Cache-Control', 'no-store');
    res.json({ order: detailItem(checkout), history: history ?? [] });
  } catch (error: unknown) {
    console.error('Could not load admin order details:', error);
    res.status(500).json({ error: 'Order details could not be loaded.' });
  }
});

router.post('/:id/reveal', async (req: AdminRequest, res) => {
  const { id } = req.params;
  if (!UUID_PATTERN.test(id)) return res.status(400).json({ error: 'Order ID is invalid.' });
  try {
    const checkout = await loadCheckout(id);
    if (!checkout) return res.status(404).json({ error: 'Order not found.' });
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      action: 'order_sensitive_details_revealed',
      targetUserId: checkout.customer?.user_id,
      details: { checkoutId: checkout.checkoutId, orderIds: checkout.lines.map(line => line.id) },
    });
    const dropoff = checkout.delivery?.dropoff_address ?? null;
    res.json({
      contact: {
        revealed: true,
        customerPhone: checkout.customer?.phone_number ?? null,
        cookPhone: checkout.cook?.phone_number ?? null,
        pickupAddress:
          checkout.representative.fulfillment_type === 'delivery'
            ? formatFullAddress(checkout.delivery?.pickup_address)
            : fullCookAddress(checkout.cook),
        deliveryAddress: formatFullAddress(dropoff),
        deliveryInstructions:
          dropoff && typeof dropoff.deliveryInstructions === 'string'
            ? dropoff.deliveryInstructions
            : null,
        driverPhone: checkout.delivery?.driver_phone ?? null,
      },
    });
  } catch (error: unknown) {
    console.error('Could not reveal admin order contact details:', error);
    res.status(500).json({ error: 'Sensitive order details could not be revealed.' });
  }
});

router.get('/:id/handoff-evidence', async (req: AdminRequest, res) => {
  if (!UUID_PATTERN.test(req.params.id)) {
    return res.status(400).json({ error: 'Order ID is invalid.' });
  }
  try {
    const checkout = await loadCheckout(req.params.id);
    if (!checkout) return res.status(404).json({ error: 'Order not found.' });
    const evidencePath = checkout.alerts
      .map(alert => alert.details?.evidenceStoragePath)
      .find(value => typeof value === 'string');
    if (typeof evidencePath !== 'string' || !evidencePath.startsWith(`${checkout.checkoutId}/`)) {
      return res.status(404).json({ error: 'No handoff evidence photo is attached.' });
    }
    const { data, error } = await supabase.storage
      .from('pickup-handoff-evidence')
      .createSignedUrl(evidencePath, 10 * 60);
    if (error || !data?.signedUrl) throw error ?? new Error('Signed evidence URL failed.');
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: checkout.customer?.user_id,
      action: 'pickup_handoff_evidence_viewed',
      details: { checkoutId: checkout.checkoutId, evidencePath },
    });
    res.json({ fileUrl: data.signedUrl, expiresInSeconds: 600 });
  } catch (error: unknown) {
    console.error('Could not open pickup handoff evidence:', error);
    res.status(500).json({ error: 'The handoff evidence could not be opened.' });
  }
});

router.post('/:id/cancel', async (req: AdminRequest, res) => {
  const { id } = req.params;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!UUID_PATTERN.test(id)) return res.status(400).json({ error: 'Order ID is invalid.' });
  if (reason.length < 5 || reason.length > 500) {
    return res.status(400).json({ error: 'Enter a cancellation reason of 5–500 characters.' });
  }
  try {
    const checkout = await loadCheckout(id);
    if (!checkout) return res.status(404).json({ error: 'Order not found.' });
    if (!canAdminCancelCheckout(checkout.lines.map(line => line.status))) {
      return res.status(409).json({ error: 'Only pending or preparing orders can be cancelled.' });
    }
    if (checkout.delivery && ['picked_up', 'delivered'].includes(checkout.delivery.status)) {
      return res.status(409).json({ error: 'The rider has already collected this delivery.' });
    }
    const { data: affectedIds, error: cancelError } = await supabase.rpc('admin_cancel_checkout', {
      target_checkout_id: checkout.checkoutId,
      admin_user_id: req.admin!.userId,
      cancel_reason: reason,
    });
    if (cancelError) throw cancelError;
    const orderIds = Array.isArray(affectedIds) ? affectedIds.map(String) : [];
    const reconciliation = await Promise.allSettled([
      ...orderIds.map(orderId => releaseListingCapacityForOrder(orderId)),
      cancelDeliveryJobWhenUnused(checkout.representative.delivery_job_id),
    ]);
    const reconciliationWarnings = reconciliation.filter(
      result => result.status === 'rejected'
    ).length;
    if (reconciliationWarnings > 0) {
      console.error(
        `Admin checkout ${checkout.checkoutId} cancelled with ${reconciliationWarnings} reconciliation warning(s).`
      );
    }
    if (checkout.customer?.user_id) {
      await notifyBuyerOrderCancelledByAdmin(checkout.customer.user_id, {
        checkoutId: checkout.checkoutId,
        representativeOrderId: checkout.representative.id,
        totalPrice: checkout.orderValue,
        reason,
      }).catch(error => console.error('Admin cancellation notification failed:', error));
    }
    res.json({
      success: true,
      checkoutId: checkout.checkoutId,
      orderIds,
      reconciliationWarnings,
    });
  } catch (error: unknown) {
    console.error('Could not cancel checkout as admin:', error);
    res.status(500).json({ error: 'The order could not be cancelled.' });
  }
});

router.post('/:id/complete', async (req: AdminRequest, res) => {
  const { id } = req.params;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!UUID_PATTERN.test(id)) return res.status(400).json({ error: 'Order ID is invalid.' });
  if (reason.length < 10 || reason.length > 500) {
    return res.status(400).json({ error: 'Enter an override reason of 10–500 characters.' });
  }
  try {
    const checkout = await loadCheckout(id);
    if (!checkout) return res.status(404).json({ error: 'Order not found.' });
    if (
      !canAdminCompleteCheckout(
        checkout.lines.map(line => ({
          status: line.status,
          paymentStatus: line.payment_status,
          refundStatus: line.refund_status,
        }))
      )
    ) {
      return res.status(409).json({
        error: 'Only fully ready, paid orders without refund processing can be completed.',
      });
    }
    const { data: affectedIds, error: completionError } = await supabase.rpc(
      'admin_complete_checkout',
      {
        target_checkout_id: checkout.checkoutId,
        admin_user_id: req.admin!.userId,
        override_reason: reason,
      }
    );
    if (completionError) throw completionError;
    const orderIds = Array.isArray(affectedIds) ? affectedIds.map(String) : [];
    if (orderIds.length === 0) throw new Error('The completion did not update any order lines.');

    const fulfillmentType = checkout.representative.fulfillment_type;
    const itemCount = checkout.lines.reduce((sum, line) => sum + Number(line.quantity), 0);
    const foodTotal = checkout.lines.reduce((sum, line) => sum + Number(line.total_price), 0);
    await Promise.all([
      checkout.customer?.user_id
        ? notifyBuyerCheckoutFulfilled(checkout.customer.user_id, {
            checkoutId: checkout.checkoutId,
            representativeOrderId: checkout.representative.id,
            itemCount,
          })
        : Promise.resolve(),
      checkout.cook?.user_id
        ? fulfillmentType === 'delivery'
          ? notifyCookDeliveryPayout(
              checkout.cook.user_id,
              foodTotal,
              checkout.cookDeliveryCharge,
              orderIds
            )
          : notifyCookCheckoutFulfilled(checkout.cook.user_id, {
              checkoutId: checkout.checkoutId,
              orderIds,
              creditedAmount: foodTotal,
            })
        : Promise.resolve(),
    ]).catch(error => {
      console.error('Admin completion notification failed:', error);
    });

    res.json({
      success: true,
      checkoutId: checkout.checkoutId,
      orderIds,
      fulfillmentType,
      completedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('Admin completion override failed:', error);
    res.status(500).json({ error: 'The completion override could not be completed.' });
  }
});

router.post('/:id/disputes', async (req: AdminRequest, res) => {
  const { id } = req.params;
  const complainantType = String(req.body?.complainantType ?? 'other');
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const details = typeof req.body?.details === 'string' ? req.body.details.trim() : '';
  const evidenceUrls = Array.isArray(req.body?.evidenceUrls)
    ? req.body.evidenceUrls.filter((value: unknown) => typeof value === 'string').slice(0, 10)
    : [];
  if (!UUID_PATTERN.test(id)) return res.status(400).json({ error: 'Order ID is invalid.' });
  if (!['customer', 'cook', 'other'].includes(complainantType)) {
    return res.status(400).json({ error: 'Choose who raised the dispute.' });
  }
  if (reason.length < 3 || reason.length > 100 || details.length < 5 || details.length > 2000) {
    return res.status(400).json({ error: 'Enter a reason and at least 5 characters of detail.' });
  }
  try {
    const checkout = await loadCheckout(id);
    if (!checkout) return res.status(404).json({ error: 'Order not found.' });
    if (hasOpenDispute(checkout)) {
      return res.status(409).json({ error: 'This order already has an open dispute.' });
    }
    const { data: dispute, error } = await supabase
      .from('order_disputes')
      .insert({
        checkout_id: checkout.checkoutId,
        representative_order_id: checkout.representative.id,
        created_by: req.admin!.userId,
        complainant_type: complainantType,
        reason,
        details,
        evidence_urls: evidenceUrls,
      })
      .select('*')
      .single();
    if (error) throw error;
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      action: 'order_dispute_created',
      targetUserId: checkout.customer?.user_id,
      details: { checkoutId: checkout.checkoutId, disputeId: dispute.id, complainantType, reason },
    });
    res.status(201).json({ success: true, dispute });
  } catch (error: unknown) {
    console.error('Could not create order dispute:', error);
    res.status(500).json({ error: 'The dispute could not be created.' });
  }
});

router.patch('/disputes/:disputeId', async (req: AdminRequest, res) => {
  const { disputeId } = req.params;
  const status = String(req.body?.status ?? '');
  const resolutionNote =
    typeof req.body?.resolutionNote === 'string' ? req.body.resolutionNote.trim() : '';
  if (!UUID_PATTERN.test(disputeId)) {
    return res.status(400).json({ error: 'Dispute ID is invalid.' });
  }
  if (!['reviewing', 'resolved', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: 'Dispute status is invalid.' });
  }
  if (['resolved', 'dismissed'].includes(status) && resolutionNote.length < 5) {
    return res.status(400).json({ error: 'Enter a resolution note of at least 5 characters.' });
  }
  try {
    const { data: existing, error: existingError } = await supabase
      .from('order_disputes')
      .select('id, checkout_id, status')
      .eq('id', disputeId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return res.status(404).json({ error: 'Dispute not found.' });
    if (!OPEN_DISPUTE_STATUSES.includes(existing.status)) {
      return res.status(409).json({ error: 'This dispute has already been closed.' });
    }
    const closing = status === 'resolved' || status === 'dismissed';
    const { data: dispute, error } = await supabase
      .from('order_disputes')
      .update({
        status,
        resolution: closing
          ? status === 'resolved'
            ? 'resolved_by_admin'
            : 'dismissed_no_action'
          : null,
        resolution_note: resolutionNote || null,
        resolved_by: closing ? req.admin!.userId : null,
        resolved_at: closing ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', disputeId)
      .in('status', OPEN_DISPUTE_STATUSES)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!dispute) return res.status(409).json({ error: 'The dispute changed. Refresh and retry.' });
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      action: `order_dispute_${status}`,
      details: { checkoutId: existing.checkout_id, disputeId, resolutionNote },
    });
    res.json({ success: true, dispute });
  } catch (error: unknown) {
    console.error('Could not update order dispute:', error);
    res.status(500).json({ error: 'The dispute could not be updated.' });
  }
});

export default router;
