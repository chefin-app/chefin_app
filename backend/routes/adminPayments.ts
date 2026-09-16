import express from 'express';

import { getAdminDateBounds } from '../adminDateFilter';
import { writeAdminAudit } from '../adminAudit';
import type { AdminRequest } from '../middleware/requireAdmin';
import { getRefundWindowMinutes, REFUND_REASON_CODES } from '../paymentPolicy';
import { createNotification } from '../notifications';
import { supabase } from '../supabaseClient';

const router = express.Router();
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const FILTERS = new Set(['all', 'payouts', 'refunds', 'failed', 'held']);
const SORTS = new Set(['newest', 'oldest', 'amount_desc', 'amount_asc']);
const DATE_RANGES = new Set(['all', 'today', '7d', '30d', '90d']);
const ACTIVE_REFUND_STATUSES = ['pending', 'reviewing', 'approved', 'processing'];
const REVIEW_ACTIONS = new Set(['review', 'approve', 'reject', 'processing', 'complete', 'fail']);

type PaymentRow = {
  id: string;
  transaction_code: string;
  checkout_id: string;
  representative_order_id: string;
  customer_id: string;
  cook_id: string;
  food_subtotal: number | string;
  delivery_fee: number | string;
  gross_amount: number | string;
  processing_fee: number | string;
  cook_payout: number | string;
  currency: string;
  payment_method: string;
  gateway: string;
  gateway_reference: string | null;
  status: string;
  payout_status: string;
  payout_available_at: string | null;
  payout_hold_reason: string | null;
  payout_released_at: string | null;
  payout_paid_at: string | null;
  created_at: string;
  updated_at: string;
};

type RefundRow = {
  id: string;
  transaction_id: string;
  checkout_id: string;
  representative_order_id: string;
  customer_id: string;
  requested_by: string;
  source: string;
  reason_code: string;
  reason_details: string;
  evidence_paths: string[] | null;
  requested_amount: number | string;
  eligibility_deadline: string;
  status: string;
  decision_note: string | null;
  gateway_refund_reference: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  restaurant_name: string | null;
  profile_image: string | null;
};

type OrderRow = {
  id: string;
  checkout_id: string;
  listing_id: string;
  quantity: number;
  total_price: number | string;
  fulfillment_type: string;
  status: string | null;
  completed_at: string | null;
  delivery_job_id: string | null;
  created_at: string | null;
  listings:
    | { title: string | null; image_url: string | null }
    | Array<{ title: string | null; image_url: string | null }>
    | null;
};

const money = (value: number | string | null | undefined): number => Number(value ?? 0) || 0;
const relation = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
const compactId = (value: string): string => value.split('-')[0].toUpperCase();

const dateRangeStart = (range: string, now = new Date()): number | null => {
  if (range === 'all') return null;
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const days = range === 'today' ? 1 : Number.parseInt(range, 10);
  return new Date(`${dateKey}T00:00:00+08:00`).getTime() - (days - 1) * 86_400_000;
};

async function loadPaymentContext(id: string) {
  if (!UUID_PATTERN.test(id)) return null;
  const { data: payment, error } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!payment) return null;
  const [profilesResult, ordersResult, refundsResult, handoffResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, user_id, full_name, restaurant_name, profile_image')
      .in('id', [payment.customer_id, payment.cook_id]),
    supabase
      .from('orders')
      .select(
        'id, checkout_id, listing_id, quantity, total_price, fulfillment_type, status, completed_at, delivery_job_id, created_at, listings(title, image_url)'
      )
      .eq('checkout_id', payment.checkout_id)
      .order('created_at', { ascending: true }),
    supabase
      .from('refund_requests')
      .select('*')
      .eq('transaction_id', payment.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('pickup_handoffs')
      .select('checkout_id, verified_at, verified_by, created_at')
      .eq('checkout_id', payment.checkout_id)
      .maybeSingle(),
  ]);
  const firstError =
    profilesResult.error || ordersResult.error || refundsResult.error || handoffResult.error;
  if (firstError) throw firstError;
  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const orders = (ordersResult.data ?? []) as unknown as OrderRow[];
  const deliveryJobId = orders.find(order => order.delivery_job_id)?.delivery_job_id;
  const { data: delivery, error: deliveryError } = deliveryJobId
    ? await supabase
        .from('delivery_jobs')
        .select(
          'id, provider, provider_order_id, provider_status, status, proof_of_delivery_url, delivered_at, driver_name, driver_plate_number'
        )
        .eq('id', deliveryJobId)
        .maybeSingle()
    : { data: null, error: null };
  if (deliveryError) throw deliveryError;
  return {
    payment: payment as PaymentRow,
    customer: profiles.find(profile => profile.id === payment.customer_id) ?? null,
    cook: profiles.find(profile => profile.id === payment.cook_id) ?? null,
    orders,
    refunds: (refundsResult.data ?? []) as RefundRow[],
    delivery,
    pickupHandoff: handoffResult.data,
  };
}

const presentPayment = (
  payment: PaymentRow,
  profiles: Map<string, ProfileRow>,
  refund: RefundRow | null
) => {
  const customer = profiles.get(payment.customer_id);
  const cook = profiles.get(payment.cook_id);
  return {
    id: payment.id,
    transactionCode: payment.transaction_code,
    checkoutId: payment.checkout_id,
    representativeOrderId: payment.representative_order_id,
    orderDisplayId: compactId(payment.checkout_id),
    customerId: customer?.user_id ?? '',
    customerName: customer?.full_name?.trim() || 'Unknown customer',
    customerAvatarUrl: customer?.profile_image ?? null,
    cookId: cook?.user_id ?? '',
    cookName: cook?.restaurant_name?.trim() || cook?.full_name?.trim() || 'Unknown cook',
    cookAvatarUrl: cook?.profile_image ?? null,
    grossAmount: money(payment.gross_amount),
    cookPayout: money(payment.cook_payout),
    paymentMethod: payment.payment_method,
    paymentStatus: payment.status,
    payoutStatus: payment.payout_status,
    payoutAvailableAt: payment.payout_available_at,
    payoutHoldReason: payment.payout_hold_reason,
    refundStatus: refund?.status ?? null,
    refundId: refund?.id ?? null,
    createdAt: payment.created_at,
  };
};

router.get('/', async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const filter = FILTERS.has(String(req.query.filter)) ? String(req.query.filter) : 'all';
  const sort = SORTS.has(String(req.query.sort)) ? String(req.query.sort) : 'newest';
  const dateRange = DATE_RANGES.has(String(req.query.dateRange))
    ? String(req.query.dateRange)
    : 'all';
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? 1), 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(5, Number.parseInt(String(req.query.pageSize ?? 25), 10) || 25)
  );
  try {
    const [paymentsResult, refundsResult, profilesResult] = await Promise.all([
      supabase.from('payment_transactions').select('*').order('created_at', { ascending: false }),
      supabase.from('refund_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, user_id, full_name, restaurant_name, profile_image'),
    ]);
    const firstError = paymentsResult.error || refundsResult.error || profilesResult.error;
    if (firstError) throw firstError;
    const payments = (paymentsResult.data ?? []) as PaymentRow[];
    const refunds = (refundsResult.data ?? []) as RefundRow[];
    const profiles = new Map(
      ((profilesResult.data ?? []) as ProfileRow[]).map(profile => [profile.id, profile])
    );
    const latestRefund = new Map<string, RefundRow>();
    refunds.forEach(refund => {
      if (!latestRefund.has(refund.transaction_id)) latestRefund.set(refund.transaction_id, refund);
    });

    const activeRefundTransactionIds = new Set(
      refunds
        .filter(refund => ACTIVE_REFUND_STATUSES.includes(refund.status))
        .map(refund => refund.transaction_id)
    );
    const releasable = payments.filter(
      payment =>
        payment.payout_status === 'held' &&
        payment.payout_hold_reason === 'Refund request window is still open' &&
        payment.payout_available_at &&
        new Date(payment.payout_available_at).getTime() <= Date.now() &&
        !activeRefundTransactionIds.has(payment.id)
    );
    if (releasable.length > 0) {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('payment_transactions')
        .update({
          payout_status: 'pending',
          payout_hold_reason: null,
          payout_released_at: now,
          updated_at: now,
        })
        .in(
          'id',
          releasable.map(payment => payment.id)
        );
      if (error) throw error;
      releasable.forEach(payment => {
        payment.payout_status = 'pending';
        payment.payout_hold_reason = null;
        payment.payout_released_at = now;
      });
    }

    const exactDate = getAdminDateBounds(req.query.date);
    const rangeStart = exactDate ? null : dateRangeStart(dateRange);
    let items = payments.map(payment =>
      presentPayment(payment, profiles, latestRefund.get(payment.id) ?? null)
    );
    items = items.filter(item => {
      const created = new Date(item.createdAt).getTime();
      if (exactDate && (created < exactDate.start || created >= exactDate.end)) return false;
      if (rangeStart != null && created < rangeStart) return false;
      if (
        search &&
        ![
          item.transactionCode,
          item.orderDisplayId,
          item.customerName,
          item.cookName,
          item.paymentMethod,
        ].some(value => value.toLowerCase().includes(search))
      )
        return false;
      if (filter === 'payouts') return ['pending', 'paid'].includes(item.payoutStatus);
      if (filter === 'refunds') return Boolean(item.refundStatus);
      if (filter === 'failed')
        return item.paymentStatus === 'failed' || item.refundStatus === 'failed';
      if (filter === 'held') return item.payoutStatus === 'held';
      return true;
    });
    items.sort((left, right) => {
      if (sort === 'oldest') return Date.parse(left.createdAt) - Date.parse(right.createdAt);
      if (sort === 'amount_desc') return right.grossAmount - left.grossAmount;
      if (sort === 'amount_asc') return left.grossAmount - right.grossAmount;
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    });

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);
    const succeeded = payments.filter(payment => payment.status !== 'failed');
    res.json({
      payments: pageItems,
      stats: {
        grossRevenue: Number(
          succeeded.reduce((sum, row) => sum + money(row.gross_amount), 0).toFixed(2)
        ),
        cookPayoutsDue: Number(
          succeeded
            .filter(row => ['held', 'pending'].includes(row.payout_status))
            .reduce((sum, row) => sum + money(row.cook_payout), 0)
            .toFixed(2)
        ),
        heldFunds: Number(
          succeeded
            .filter(row => row.payout_status === 'held')
            .reduce((sum, row) => sum + money(row.cook_payout), 0)
            .toFixed(2)
        ),
        failedPayments: payments.filter(row => row.status === 'failed').length,
        pendingRefunds: refunds.filter(row => ['pending', 'reviewing'].includes(row.status)).length,
      },
      counts: {
        all: payments.length,
        payouts: payments.filter(row => ['pending', 'paid'].includes(row.payout_status)).length,
        refunds: new Set(refunds.map(row => row.transaction_id)).size,
        failed:
          payments.filter(row => row.status === 'failed').length +
          refunds.filter(row => row.status === 'failed').length,
        held: payments.filter(row => row.payout_status === 'held').length,
      },
      pagination: { page: safePage, pageSize, total, totalPages },
      generatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('Could not load admin payments:', error);
    res.status(500).json({ error: 'Payment records could not be loaded.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const context = await loadPaymentContext(req.params.id);
    if (!context) return res.status(404).json({ error: 'Transaction not found.' });
    res.set('Cache-Control', 'no-store');
    res.json({
      payment: presentPayment(
        context.payment,
        new Map(
          [context.customer, context.cook]
            .filter((profile): profile is ProfileRow => Boolean(profile))
            .map(profile => [profile.id, profile])
        ),
        context.refunds[0] ?? null
      ),
      breakdown: {
        foodSubtotal: money(context.payment.food_subtotal),
        deliveryFee: money(context.payment.delivery_fee),
        grossAmount: money(context.payment.gross_amount),
        processingFee: money(context.payment.processing_fee),
        cookPayout: money(context.payment.cook_payout),
      },
      transaction: context.payment,
      customer: context.customer,
      cook: context.cook,
      orders: context.orders.map(order => ({
        id: order.id,
        title: relation(order.listings)?.title ?? 'Deleted dish',
        imageUrl: relation(order.listings)?.image_url ?? null,
        quantity: order.quantity,
        totalPrice: money(order.total_price),
        status: order.status,
      })),
      fulfillmentType: context.orders[0]?.fulfillment_type ?? 'pickup',
      completedAt:
        context.orders
          .map(order => order.completed_at)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
      delivery: context.delivery,
      pickupHandoff: context.pickupHandoff,
      refunds: context.refunds,
      policy: { refundWindowMinutes: getRefundWindowMinutes() },
    });
  } catch (error: unknown) {
    console.error('Could not load transaction details:', error);
    res.status(500).json({ error: 'Transaction details could not be loaded.' });
  }
});

router.post('/:id/hold', async (req: AdminRequest, res) => {
  const reason = String(req.body?.reason ?? '').trim();
  if (reason.length < 5 || reason.length > 500) {
    return res.status(400).json({ error: 'Enter a hold reason of 5 to 500 characters.' });
  }
  try {
    const context = await loadPaymentContext(req.params.id);
    if (!context) return res.status(404).json({ error: 'Transaction not found.' });
    if (context.payment.payout_status === 'paid') {
      return res.status(409).json({ error: 'A paid payout can no longer be held.' });
    }
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('payment_transactions')
      .update({ payout_status: 'held', payout_hold_reason: reason, updated_at: now })
      .eq('id', context.payment.id);
    if (error) throw error;
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: context.cook?.user_id,
      action: 'payment_payout_held',
      details: {
        transactionId: context.payment.id,
        checkoutId: context.payment.checkout_id,
        reason,
      },
    });
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Could not hold payout:', error);
    res.status(500).json({ error: 'The payout could not be held.' });
  }
});

router.post('/:id/release', async (req: AdminRequest, res) => {
  const reason = String(req.body?.reason ?? '').trim();
  if (reason.length < 5 || reason.length > 500) {
    return res.status(400).json({ error: 'Enter a release reason of 5 to 500 characters.' });
  }
  try {
    const context = await loadPaymentContext(req.params.id);
    if (!context) return res.status(404).json({ error: 'Transaction not found.' });
    if (context.refunds.some(refund => ACTIVE_REFUND_STATUSES.includes(refund.status))) {
      return res
        .status(409)
        .json({ error: 'Resolve the active refund request before releasing payout.' });
    }
    if (
      !context.payment.payout_available_at ||
      new Date(context.payment.payout_available_at).getTime() > Date.now()
    ) {
      return res.status(409).json({
        error: context.payment.payout_available_at
          ? 'The customer refund window is still open.'
          : 'Payout cannot be released before order completion.',
      });
    }
    if (context.payment.status !== 'succeeded') {
      return res.status(409).json({ error: 'Only a successful payment can be released.' });
    }
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('payment_transactions')
      .update({
        payout_status: 'pending',
        payout_hold_reason: null,
        payout_released_at: now,
        updated_at: now,
      })
      .eq('id', context.payment.id);
    if (error) throw error;
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: context.cook?.user_id,
      action: 'payment_payout_released',
      details: {
        transactionId: context.payment.id,
        checkoutId: context.payment.checkout_id,
        reason,
      },
    });
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Could not release payout:', error);
    res.status(500).json({ error: 'The payout could not be released.' });
  }
});

router.post('/:id/refunds', async (req: AdminRequest, res) => {
  const reasonCode = String(req.body?.reasonCode ?? 'other');
  const reasonDetails = String(req.body?.reasonDetails ?? '').trim();
  if (
    !REFUND_REASON_CODES.has(reasonCode) ||
    reasonDetails.length < 10 ||
    reasonDetails.length > 2000
  ) {
    return res.status(400).json({ error: 'Choose a reason and enter 10 to 2000 characters.' });
  }
  try {
    const context = await loadPaymentContext(req.params.id);
    if (!context) return res.status(404).json({ error: 'Transaction not found.' });
    if (context.refunds.some(refund => ACTIVE_REFUND_STATUSES.includes(refund.status))) {
      return res.status(409).json({ error: 'This transaction already has an active refund case.' });
    }
    const completedAt = context.orders
      .map(order => order.completed_at)
      .filter(Boolean)
      .sort()
      .at(-1);
    const deadline = completedAt
      ? new Date(new Date(completedAt).getTime() + getRefundWindowMinutes() * 60_000)
      : new Date();
    const now = new Date().toISOString();
    const { data: refund, error } = await supabase
      .from('refund_requests')
      .insert({
        transaction_id: context.payment.id,
        checkout_id: context.payment.checkout_id,
        representative_order_id: context.payment.representative_order_id,
        customer_id: context.payment.customer_id,
        requested_by: req.admin!.userId,
        source: 'admin',
        reason_code: reasonCode,
        reason_details: reasonDetails,
        requested_amount: context.payment.gross_amount,
        eligibility_deadline: deadline.toISOString(),
        status: 'pending',
      })
      .select('*')
      .single();
    if (error) throw error;
    await Promise.all([
      supabase
        .from('payment_transactions')
        .update({
          payout_status: 'held',
          payout_hold_reason: 'Admin-created refund case under manual review',
          updated_at: now,
        })
        .eq('id', context.payment.id),
      supabase
        .from('orders')
        .update({
          refund_status: 'refund_required',
          refund_required_at: now,
          refund_note: reasonDetails.slice(0, 500),
        })
        .eq('checkout_id', context.payment.checkout_id),
    ]);
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: context.customer?.user_id,
      action: 'refund_case_created',
      details: { transactionId: context.payment.id, refundId: refund.id, reasonCode },
    });
    res.status(201).json({ success: true, refund });
  } catch (error: unknown) {
    console.error('Could not create refund case:', error);
    res.status(500).json({ error: 'The refund case could not be created.' });
  }
});

router.patch('/refunds/:refundId', async (req: AdminRequest, res) => {
  const action = String(req.body?.action ?? '');
  const note = String(req.body?.note ?? '').trim();
  const gatewayReference = String(req.body?.gatewayReference ?? '').trim();
  if (!UUID_PATTERN.test(req.params.refundId) || !REVIEW_ACTIONS.has(action)) {
    return res.status(400).json({ error: 'Refund action is invalid.' });
  }
  if (action !== 'review' && note.length < 5) {
    return res.status(400).json({ error: 'Enter a decision note of at least 5 characters.' });
  }
  if (action === 'complete' && gatewayReference.length < 3) {
    return res.status(400).json({ error: 'A gateway refund reference is required.' });
  }
  try {
    const { data: refund, error: refundError } = await supabase
      .from('refund_requests')
      .select('*')
      .eq('id', req.params.refundId)
      .maybeSingle();
    if (refundError) throw refundError;
    if (!refund) return res.status(404).json({ error: 'Refund request not found.' });
    const allowed: Record<string, string[]> = {
      pending: ['review', 'approve', 'reject'],
      reviewing: ['approve', 'reject'],
      approved: ['processing', 'complete'],
      processing: ['complete', 'fail'],
      failed: ['processing', 'complete'],
    };
    if (!(allowed[refund.status] ?? []).includes(action)) {
      return res.status(409).json({ error: `A ${refund.status} refund cannot be ${action}ed.` });
    }
    const statusByAction: Record<string, string> = {
      review: 'reviewing',
      approve: 'approved',
      reject: 'rejected',
      processing: 'processing',
      complete: 'completed',
      fail: 'failed',
    };
    const nextStatus = statusByAction[action];
    const now = new Date().toISOString();
    const terminal = ['rejected', 'completed'].includes(nextStatus);
    const { data: updated, error } = await supabase
      .from('refund_requests')
      .update({
        status: nextStatus,
        decision_note: note || refund.decision_note,
        gateway_refund_reference:
          action === 'complete' ? gatewayReference : refund.gateway_refund_reference,
        reviewed_by: req.admin!.userId,
        reviewed_at: ['approve', 'reject'].includes(action) ? now : refund.reviewed_at,
        completed_at: terminal ? now : null,
        updated_at: now,
      })
      .eq('id', refund.id)
      .eq('status', refund.status)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!updated) return res.status(409).json({ error: 'The refund changed. Refresh and retry.' });

    if (nextStatus === 'rejected') {
      const { data: payment } = await supabase
        .from('payment_transactions')
        .select('payout_available_at')
        .eq('id', refund.transaction_id)
        .single();
      const windowOpen =
        payment?.payout_available_at &&
        new Date(payment.payout_available_at).getTime() > Date.now();
      await Promise.all([
        supabase
          .from('payment_transactions')
          .update({
            status: 'succeeded',
            payout_status: windowOpen ? 'held' : 'pending',
            payout_hold_reason: windowOpen ? 'Refund request window is still open' : null,
            payout_released_at: windowOpen ? null : now,
            updated_at: now,
          })
          .eq('id', refund.transaction_id),
        supabase
          .from('orders')
          .update({ refund_status: 'not_required', refund_note: note.slice(0, 500) })
          .eq('checkout_id', refund.checkout_id),
      ]);
    } else if (nextStatus === 'completed') {
      await Promise.all([
        supabase
          .from('payment_transactions')
          .update({ status: 'refunded', payout_status: 'cancelled', updated_at: now })
          .eq('id', refund.transaction_id),
        supabase
          .from('orders')
          .update({ refund_status: 'refunded', refund_note: note.slice(0, 500) })
          .eq('checkout_id', refund.checkout_id),
      ]);
    } else {
      await Promise.all([
        supabase
          .from('payment_transactions')
          .update({
            status: ['approved', 'processing', 'failed'].includes(nextStatus)
              ? 'refund_pending'
              : 'succeeded',
            payout_status: 'held',
            payout_hold_reason: `Refund ${nextStatus}`,
            updated_at: now,
          })
          .eq('id', refund.transaction_id),
        nextStatus === 'failed'
          ? supabase
              .from('orders')
              .update({ refund_status: 'refund_failed', refund_note: note.slice(0, 500) })
              .eq('checkout_id', refund.checkout_id)
          : Promise.resolve(),
      ]);
    }
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      action: `refund_${nextStatus}`,
      details: {
        refundId: refund.id,
        transactionId: refund.transaction_id,
        checkoutId: refund.checkout_id,
        note,
        gatewayReference: action === 'complete' ? gatewayReference : undefined,
      },
    });
    if (['approved', 'rejected', 'completed', 'failed'].includes(nextStatus)) {
      const { data: customer } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('id', refund.customer_id)
        .maybeSingle();
      if (customer?.user_id) {
        const messages: Record<string, { title: string; body: string }> = {
          approved: {
            title: 'Refund request approved',
            body: 'Chefin approved your request. The refund still needs to be processed by the payment gateway.',
          },
          rejected: {
            title: 'Refund request reviewed',
            body: `Chefin could not approve this request.${note ? ` ${note}` : ''}`,
          },
          completed: {
            title: 'Refund processed',
            body: 'Your refund was recorded as completed. Your bank or wallet may need additional time to show it.',
          },
          failed: {
            title: 'Refund processing delayed',
            body: 'The payment gateway did not complete your refund. Chefin support will retry it.',
          },
        };
        await createNotification(customer.user_id, {
          type: 'admin_message',
          ...messages[nextStatus],
          data: { order_id: refund.representative_order_id, refund_id: refund.id },
        });
      }
    }
    res.json({ success: true, refund: updated });
  } catch (error: unknown) {
    console.error('Could not update refund request:', error);
    res.status(500).json({ error: 'The refund request could not be updated.' });
  }
});

router.get('/refunds/:refundId/evidence/:index', async (req: AdminRequest, res) => {
  const index = Number.parseInt(req.params.index, 10);
  if (!UUID_PATTERN.test(req.params.refundId) || !Number.isInteger(index) || index < 0) {
    return res.status(400).json({ error: 'Evidence request is invalid.' });
  }
  try {
    const { data: refund, error } = await supabase
      .from('refund_requests')
      .select('id, customer_id, evidence_paths')
      .eq('id', req.params.refundId)
      .maybeSingle();
    if (error) throw error;
    const path = refund?.evidence_paths?.[index];
    if (!refund || !path) return res.status(404).json({ error: 'Evidence not found.' });
    const { data, error: signedError } = await supabase.storage
      .from('refund-evidence')
      .createSignedUrl(path, 10 * 60);
    if (signedError || !data?.signedUrl) throw signedError ?? new Error('Signing failed.');
    const { data: customer } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('id', refund.customer_id)
      .maybeSingle();
    await writeAdminAudit({
      actorUserId: req.admin!.userId,
      targetUserId: customer?.user_id,
      action: 'refund_evidence_viewed',
      details: { refundId: refund.id, evidenceIndex: index },
    });
    res.json({ fileUrl: data.signedUrl, expiresInSeconds: 600 });
  } catch (error: unknown) {
    console.error('Could not open refund evidence:', error);
    res.status(500).json({ error: 'Refund evidence could not be opened.' });
  }
});

export default router;
