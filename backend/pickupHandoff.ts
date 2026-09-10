import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

import {
  notifyBuyerCheckoutFulfilled,
  notifyCookCheckoutFulfilled,
  notifyBuyerPickupCode,
} from './notifications';
import { supabase } from './supabaseClient';

const PIN_PATTERN = /^\d{4}$/;

const secret = (): string => {
  const value =
    process.env.PICKUP_HANDOFF_SECRET ??
    (process.env.NODE_ENV === 'production' ? '' : process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!value) throw new Error('PICKUP_HANDOFF_SECRET is not configured.');
  return value;
};

const key = () => createHash('sha256').update(secret()).digest();
const hashCode = (checkoutId: string, code: string): string =>
  createHmac('sha256', secret()).update(`${checkoutId}:${code}`).digest('hex');

const encryptCode = (code: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
};

const decryptCode = (value: string): string => {
  const [ivValue, tagValue, encryptedValue] = value.split('.');
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Pickup PIN evidence is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

type HandoffOrder = {
  id: string;
  checkout_id: string;
  customer_id: string;
  listing_id: string;
  quantity: number;
  total_price: number | string;
  scheduled_date: string;
  pickup_time: string | null;
  pickup_window_end: string | null;
  fulfillment_type: string;
  status: string | null;
  listings:
    | {
        cook_id: string;
        title: string | null;
        profiles: { user_id: string } | { user_id: string }[] | null;
      }
    | Array<{
        cook_id: string;
        title: string | null;
        profiles: { user_id: string } | { user_id: string }[] | null;
      }>
    | null;
  profiles: { user_id: string } | { user_id: string }[] | null;
};

const relation = <T>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

export async function loadPickupCheckout(orderId: string): Promise<HandoffOrder[]> {
  const { data: anchor, error: anchorError } = await supabase
    .from('orders')
    .select('checkout_id')
    .eq('id', orderId)
    .maybeSingle();
  if (anchorError) throw anchorError;
  if (!anchor) return [];
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, checkout_id, customer_id, listing_id, quantity, total_price, scheduled_date, pickup_time, pickup_window_end, fulfillment_type, status, profiles(user_id), listings(cook_id, title, profiles(user_id))'
    )
    .eq('checkout_id', anchor.checkout_id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as HandoffOrder[];
}

export async function ensurePickupHandoff(
  orderId: string
): Promise<{ checkoutId: string; code: string }> {
  const lines = await loadPickupCheckout(orderId);
  if (lines.length === 0) throw new Error('Order not found.');
  const representative = lines[0];
  const listing = relation(representative.listings);
  if (representative.fulfillment_type !== 'pickup' || !listing) {
    throw new Error('Pickup verification is unavailable for this order.');
  }
  const { data: existing, error: existingError } = await supabase
    .from('pickup_handoffs')
    .select('checkout_id, code_ciphertext')
    .eq('checkout_id', representative.checkout_id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing)
    return { checkoutId: existing.checkout_id, code: decryptCode(existing.code_ciphertext) };

  const code = String(randomInt(0, 10_000)).padStart(4, '0');
  const windowEnd = representative.pickup_window_end
    ? new Date(representative.pickup_window_end).getTime()
    : Date.now();
  const expiresAt = new Date(Math.max(Date.now(), windowEnd) + 2 * 60 * 60_000).toISOString();
  const { error: insertError } = await supabase.from('pickup_handoffs').insert({
    checkout_id: representative.checkout_id,
    representative_order_id: representative.id,
    customer_id: representative.customer_id,
    cook_id: listing.cook_id,
    code_hash: hashCode(representative.checkout_id, code),
    code_ciphertext: encryptCode(code),
    expires_at: expiresAt,
  });
  if (insertError) {
    // Another ready-line request may have created the checkout PIN first.
    const { data: raced, error: racedError } = await supabase
      .from('pickup_handoffs')
      .select('checkout_id, code_ciphertext')
      .eq('checkout_id', representative.checkout_id)
      .single();
    if (racedError) throw insertError;
    return { checkoutId: raced.checkout_id, code: decryptCode(raced.code_ciphertext) };
  }
  const buyer = relation(representative.profiles);
  if (buyer?.user_id) await notifyBuyerPickupCode(buyer.user_id, representative.id, code);
  await supabase.from('pickup_handoff_events').insert({
    checkout_id: representative.checkout_id,
    event_type: 'pin_created',
    details: { representativeOrderId: representative.id, expiresAt },
  });
  return { checkoutId: representative.checkout_id, code };
}

export async function getPickupHandoffForAccount(orderId: string, userId: string) {
  const lines = await loadPickupCheckout(orderId);
  if (lines.length === 0) throw new Error('Order not found.');
  const representative = lines[0];
  const listing = relation(representative.listings);
  const buyer = relation(representative.profiles);
  const cook = listing ? relation(listing.profiles) : null;
  const isBuyer = buyer?.user_id === userId;
  const isCook = cook?.user_id === userId;
  if (!isBuyer && !isCook) throw new Error('You do not have access to this pickup.');
  const { data: handoff, error } = await supabase
    .from('pickup_handoffs')
    .select(
      'code_ciphertext, expires_at, failed_attempts, regeneration_count, locked_until, verified_at'
    )
    .eq('checkout_id', representative.checkout_id)
    .maybeSingle();
  if (error) throw error;
  return {
    checkoutId: representative.checkout_id,
    available: Boolean(handoff),
    code: isBuyer && handoff && !handoff.verified_at ? decryptCode(handoff.code_ciphertext) : null,
    expiresAt: handoff?.expires_at ?? null,
    lockedUntil: isCook ? (handoff?.locked_until ?? null) : null,
    verifiedAt: handoff?.verified_at ?? null,
    canRegenerate:
      isBuyer &&
      Boolean(handoff) &&
      !handoff?.verified_at &&
      Number(handoff?.regeneration_count) < 1,
  };
}

export async function regeneratePickupCode(orderId: string, buyerUserId: string) {
  const lines = await loadPickupCheckout(orderId);
  if (lines.length === 0) throw new Error('Order not found.');
  const representative = lines[0];
  const buyer = relation(representative.profiles);
  if (buyer?.user_id !== buyerUserId) throw new Error('You do not have access to this pickup.');
  const code = String(randomInt(0, 10_000)).padStart(4, '0');
  const windowEnd = representative.pickup_window_end
    ? new Date(representative.pickup_window_end).getTime()
    : Date.now();
  const expiresAt = new Date(Math.max(Date.now(), windowEnd) + 2 * 60 * 60_000).toISOString();
  const { data, error } = await supabase
    .from('pickup_handoffs')
    .update({
      code_hash: hashCode(representative.checkout_id, code),
      code_ciphertext: encryptCode(code),
      expires_at: expiresAt,
      regeneration_count: 1,
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('checkout_id', representative.checkout_id)
    .eq('regeneration_count', 0)
    .is('verified_at', null)
    .select('checkout_id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This pickup code cannot be regenerated again.');
  await supabase.from('pickup_handoff_events').insert({
    checkout_id: representative.checkout_id,
    actor_user_id: buyerUserId,
    event_type: 'pin_regenerated',
    details: { expiresAt },
  });
  await notifyBuyerPickupCode(buyerUserId, representative.id, code);
  return { code, expiresAt };
}

export async function verifyPickupCode(orderId: string, cookUserId: string, code: string) {
  if (!PIN_PATTERN.test(code)) throw new Error('Enter the four-digit pickup code.');
  const lines = await loadPickupCheckout(orderId);
  if (lines.length === 0) throw new Error('Order not found.');
  const representative = lines[0];
  const listing = relation(representative.listings);
  const cook = listing ? relation(listing.profiles) : null;
  if (!listing || cook?.user_id !== cookUserId)
    throw new Error('You do not have access to this pickup.');
  if (lines.some(line => line.fulfillment_type !== 'pickup'))
    throw new Error('This is not a pickup checkout.');
  if (lines.some(line => line.status !== 'ready')) {
    throw new Error('Mark every dish in this checkout ready before completing the pickup.');
  }
  const { data: handoff, error } = await supabase
    .from('pickup_handoffs')
    .select('*')
    .eq('checkout_id', representative.checkout_id)
    .maybeSingle();
  if (error) throw error;
  if (!handoff) throw new Error('The buyer pickup code is not ready yet.');
  if (handoff.verified_at) return completePickupCheckout(representative.checkout_id, cookUserId);
  if (new Date(handoff.expires_at).getTime() < Date.now())
    throw new Error('This pickup code has expired. Ask Chefin support for help.');
  if (handoff.locked_until && new Date(handoff.locked_until).getTime() > Date.now()) {
    throw new Error('Too many incorrect attempts. Try again in 15 minutes.');
  }

  const expected = Buffer.from(handoff.code_hash, 'hex');
  const supplied = Buffer.from(hashCode(representative.checkout_id, code), 'hex');
  const valid = expected.length === supplied.length && timingSafeEqual(expected, supplied);
  if (!valid) {
    const failedAttempts = Number(handoff.failed_attempts ?? 0) + 1;
    const lockedUntil =
      failedAttempts >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
    await supabase
      .from('pickup_handoffs')
      .update({
        failed_attempts: lockedUntil ? 0 : failedAttempts,
        locked_until: lockedUntil,
        updated_at: new Date().toISOString(),
      })
      .eq('checkout_id', representative.checkout_id)
      .is('verified_at', null);
    await supabase.from('pickup_handoff_events').insert({
      checkout_id: representative.checkout_id,
      actor_user_id: cookUserId,
      event_type: 'pin_failed',
      details: { locked: Boolean(lockedUntil) },
    });
    throw new Error(
      lockedUntil
        ? 'Too many incorrect attempts. Try again in 15 minutes.'
        : 'That pickup code is incorrect.'
    );
  }

  const now = new Date().toISOString();
  const { data: verified, error: verifyError } = await supabase
    .from('pickup_handoffs')
    .update({
      verified_at: now,
      verified_by: cookUserId,
      failed_attempts: 0,
      locked_until: null,
      updated_at: now,
    })
    .eq('checkout_id', representative.checkout_id)
    .is('verified_at', null)
    .select('checkout_id')
    .maybeSingle();
  if (verifyError) throw verifyError;
  if (verified) {
    await supabase.from('pickup_handoff_events').insert({
      checkout_id: representative.checkout_id,
      actor_user_id: cookUserId,
      event_type: 'pin_verified',
    });
  }
  return completePickupCheckout(representative.checkout_id, cookUserId);
}

async function completePickupCheckout(checkoutId: string, actorUserId: string) {
  const { data: rawLines, error } = await supabase
    .from('orders')
    .select(
      'id, listing_id, quantity, total_price, scheduled_date, pickup_time, status, profiles(user_id), listings(title, profiles(user_id))'
    )
    .eq('checkout_id', checkoutId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const lines = (rawLines ?? []) as unknown as HandoffOrder[];
  if (lines.length === 0) throw new Error('Order not found.');
  if (lines.some(line => line.status !== 'ready')) {
    throw new Error('Every dish must be ready before this pickup can be completed.');
  }
  const now = new Date().toISOString();
  const { error: completionError } = await supabase
    .from('orders')
    .update({
      status: 'completed',
      completed_at: now,
      cancelled_by: null,
      cancelled_at: null,
      cancellation_reason: null,
    })
    .eq('checkout_id', checkoutId)
    .eq('fulfillment_type', 'pickup')
    .in('status', ['ready']);
  if (completionError) throw completionError;
  await supabase
    .from('order_alerts')
    .update({ status: 'resolved', resolved_at: now, updated_at: now })
    .eq('checkout_id', checkoutId)
    .eq('status', 'open');
  await supabase.from('pickup_handoff_events').insert({
    checkout_id: checkoutId,
    actor_user_id: actorUserId,
    event_type: 'checkout_completed',
  });

  const representative = lines[0];
  const listing = relation(representative.listings);
  const buyer = relation(representative.profiles);
  const cook = listing ? relation(listing.profiles) : null;
  const orderIds = lines.map(line => line.id);
  await Promise.all([
    buyer?.user_id
      ? notifyBuyerCheckoutFulfilled(buyer.user_id, {
          checkoutId,
          representativeOrderId: representative.id,
          itemCount: lines.reduce((sum, line) => sum + Number(line.quantity), 0),
        })
      : Promise.resolve(),
    cook?.user_id
      ? notifyCookCheckoutFulfilled(cook.user_id, {
          checkoutId,
          orderIds,
          creditedAmount: lines.reduce((sum, line) => sum + Number(line.total_price), 0),
        })
      : Promise.resolve(),
  ]);
  return { checkoutId, orderIds, completedAt: now };
}
