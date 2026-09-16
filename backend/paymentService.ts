import { randomUUID } from 'node:crypto';

import { calculateProcessingFee, getPayoutAvailability } from './paymentPolicy';
import { supabase } from './supabaseClient';

const money = (value: number): number => Number(Math.max(0, value).toFixed(2));

export async function recordCheckoutPayment(input: {
  checkoutId: string;
  representativeOrderId: string;
  customerId: string;
  cookId: string;
  foodSubtotal: number;
  deliveryFee: number;
  cookDeliveryCharge: number;
  createdAt?: string | null;
}) {
  const grossAmount = money(input.foodSubtotal + input.deliveryFee);
  const processingFee = calculateProcessingFee(grossAmount);
  const cookPayout = money(input.foodSubtotal - processingFee - input.cookDeliveryCharge);
  const token = randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  const { data, error } = await supabase
    .from('payment_transactions')
    .upsert(
      {
        transaction_code: `TXN-${token}`,
        checkout_id: input.checkoutId,
        representative_order_id: input.representativeOrderId,
        customer_id: input.customerId,
        cook_id: input.cookId,
        food_subtotal: money(input.foodSubtotal),
        delivery_fee: money(input.deliveryFee),
        gross_amount: grossAmount,
        processing_fee: processingFee,
        cook_payout: cookPayout,
        payment_method: 'demo_card',
        gateway: 'demo',
        gateway_reference: `DEMO-${token}`,
        status: 'succeeded',
        payout_status: 'held',
        payout_hold_reason: 'Held until order completion and refund window expiry',
        created_at: input.createdAt ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'checkout_id', ignoreDuplicates: true }
    )
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function holdCheckoutPayout(checkoutId: string, reason: string) {
  const { error } = await supabase
    .from('payment_transactions')
    .update({
      payout_status: 'held',
      payout_hold_reason: reason.slice(0, 500),
      payout_released_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('checkout_id', checkoutId)
    .neq('payout_status', 'paid');
  if (error) throw error;
}

export async function scheduleCheckoutPayout(checkoutId: string, completedAt: string) {
  const { error } = await supabase
    .from('payment_transactions')
    .update({
      payout_status: 'held',
      payout_available_at: getPayoutAvailability(completedAt),
      payout_hold_reason: 'Refund request window is still open',
      updated_at: new Date().toISOString(),
    })
    .eq('checkout_id', checkoutId)
    .eq('status', 'succeeded')
    .neq('payout_status', 'paid');
  if (error) throw error;
}

export async function queueCancelledCheckoutRefund(input: {
  checkoutId: string;
  requestedBy: string;
  reason: string;
  source: 'admin' | 'system';
}) {
  const { data: payment, error: paymentError } = await supabase
    .from('payment_transactions')
    .select('id, representative_order_id, customer_id, gross_amount')
    .eq('checkout_id', input.checkoutId)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment) return null;
  const { data: existing, error: existingError } = await supabase
    .from('refund_requests')
    .select('id')
    .eq('checkout_id', input.checkoutId)
    .in('status', ['pending', 'reviewing', 'approved', 'processing'])
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;
  const now = new Date().toISOString();
  const { data: refund, error } = await supabase
    .from('refund_requests')
    .insert({
      transaction_id: payment.id,
      checkout_id: input.checkoutId,
      representative_order_id: payment.representative_order_id,
      customer_id: payment.customer_id,
      requested_by: input.requestedBy,
      source: input.source,
      reason_code: 'other',
      reason_details: input.reason.slice(0, 2000),
      requested_amount: payment.gross_amount,
      eligibility_deadline: now,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw error;
  await Promise.all([
    supabase
      .from('payment_transactions')
      .update({
        status: 'refund_pending',
        payout_status: 'held',
        payout_hold_reason: 'Cancelled order refund awaiting manual review',
        updated_at: now,
      })
      .eq('id', payment.id),
    supabase
      .from('orders')
      .update({
        refund_status: 'refund_required',
        refund_required_at: now,
        refund_note: 'Cancelled order refund awaiting manual admin review.',
      })
      .eq('checkout_id', input.checkoutId),
  ]);
  return refund;
}

/** Releases only automatic refund-window holds. Manual and disputed holds are
 * intentionally excluded and always require an administrator decision. */
export async function releaseEligiblePayouts(now = new Date()) {
  const { data: candidates, error } = await supabase
    .from('payment_transactions')
    .select('id')
    .eq('status', 'succeeded')
    .eq('payout_status', 'held')
    .eq('payout_hold_reason', 'Refund request window is still open')
    .lte('payout_available_at', now.toISOString());
  if (error) throw error;
  const ids = (candidates ?? []).map(candidate => candidate.id);
  if (ids.length === 0) return 0;
  const { data: activeRefunds, error: refundError } = await supabase
    .from('refund_requests')
    .select('transaction_id')
    .in('transaction_id', ids)
    .in('status', ['pending', 'reviewing', 'approved', 'processing']);
  if (refundError) throw refundError;
  const blocked = new Set((activeRefunds ?? []).map(refund => refund.transaction_id));
  const releasable = ids.filter(id => !blocked.has(id));
  if (releasable.length === 0) return 0;
  const { error: releaseError } = await supabase
    .from('payment_transactions')
    .update({
      payout_status: 'pending',
      payout_hold_reason: null,
      payout_released_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .in('id', releasable)
    .eq('payout_status', 'held');
  if (releaseError) throw releaseError;
  return releasable.length;
}
