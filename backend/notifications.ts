/**
 * In-app transactional notifications.
 *
 * Every notification is a row in `notifications`, inserted with the service
 * role and delivered to the app live via Supabase realtime. All emitters are
 * best-effort: an order write must never fail because a notification insert
 * did, so errors are logged and swallowed.
 *
 * MVP scope is the order lifecycle only — no promotional notifications.
 */
import { supabase } from './supabaseClient';

export type NotificationType =
  | 'order_placed' // buyer: payment collected, order sent to cook
  | 'new_order' // cook: a paid order came in
  | 'order_confirmed' // buyer: cook confirmed and is preparing
  | 'order_ready' // buyer: ready for pickup
  | 'order_cancelled' // buyer: cook cancelled the order
  | 'payout_sent' // cook: earnings for a completed order are on the way
  | 'verification_approved' // cook: food-safety document approved → badge granted
  | 'verification_rejected' // cook: food-safety document rejected, resubmit
  | 'dish_approved' // cook: admin approved a dish, it's now live
  | 'dish_rejected' // cook: admin rejected a dish
  | 'favourite_new_dish' // buyer: a favourited cook has a new dish live
  | 'favourite_new_slots' // buyer: a favourited cook opened new pickup times
  | 'review_request'; // buyer: order completed — rate the dish

/**
 * One account can act as both customer and cook; every type belongs to
 * exactly one of those modes so the app can keep the two feeds and unread
 * badges separate.
 */
const ROLE_BY_TYPE: Record<NotificationType, 'customer' | 'cook'> = {
  order_placed: 'customer',
  new_order: 'cook',
  order_confirmed: 'customer',
  order_ready: 'customer',
  order_cancelled: 'customer',
  payout_sent: 'cook',
  verification_approved: 'cook',
  verification_rejected: 'cook',
  dish_approved: 'cook',
  dish_rejected: 'cook',
  favourite_new_dish: 'customer',
  favourite_new_slots: 'customer',
  review_request: 'customer',
};

interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  /** Extra context for deep-linking later (order ids etc.). */
  data?: Record<string, unknown>;
}

/** `userId` is the auth user id (profiles.user_id), not the profile row id. */
export async function createNotification(
  userId: string,
  { type, title, body, data }: NotificationPayload
): Promise<void> {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      recipient_role: ROLE_BY_TYPE[type],
      type,
      title,
      body,
      data: data ?? {},
    });
    if (error) throw error;
  } catch (e: any) {
    console.error(`Failed to create ${type} notification for ${userId}:`, e.message ?? e);
  }
}

const formatRM = (amount: number | string): string => `RM ${Number(amount).toFixed(2)}`;

/** "16 Jul" — scheduled_date arrives as YYYY-MM-DD. */
const formatDate = (isoDate: string): string =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
  });

/** "12:00 pm" in Malaysian time — pickup_time is a full ISO timestamp. */
const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-MY', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kuala_Lumpur',
  });

interface OrderContext {
  orderId: string;
  listingTitle: string;
  quantity: number;
  totalPrice: number | string;
  scheduledDate: string;
  pickupTime: string | null;
}

const pickupPhrase = (o: OrderContext): string =>
  `${formatDate(o.scheduledDate)}${o.pickupTime ? ` at ${formatTime(o.pickupTime)}` : ''}`;

// ── Buyer notifications ─────────────────────────────────────────────

export function notifyBuyerOrderPlaced(
  buyerUserId: string,
  totalPaid: number,
  itemCount: number,
  orderIds: string[]
) {
  return createNotification(buyerUserId, {
    type: 'order_placed',
    title: 'Payment received',
    body: `${formatRM(totalPaid)} paid for ${itemCount} item${itemCount === 1 ? '' : 's'}. Your order has been sent to the cook to confirm.`,
    data: { order_ids: orderIds },
  });
}

export function notifyBuyerOrderConfirmed(buyerUserId: string, o: OrderContext) {
  return createNotification(buyerUserId, {
    type: 'order_confirmed',
    title: 'Order confirmed',
    body: `The cook has confirmed your order for ${o.quantity}× ${o.listingTitle} and will start preparing it. Pickup: ${pickupPhrase(o)}.`,
    data: { order_id: o.orderId },
  });
}

export function notifyBuyerOrderReady(buyerUserId: string, o: OrderContext) {
  return createNotification(buyerUserId, {
    type: 'order_ready',
    title: 'Order ready for pickup',
    body: `Your ${o.quantity}× ${o.listingTitle} is ready! Head over to pick it up.`,
    data: { order_id: o.orderId },
  });
}

export function notifyBuyerOrderCancelled(buyerUserId: string, o: OrderContext) {
  return createNotification(buyerUserId, {
    type: 'order_cancelled',
    title: 'Order cancelled',
    body: `Your order for ${o.quantity}× ${o.listingTitle} was cancelled by the cook. Your payment of ${formatRM(o.totalPrice)} will be refunded.`,
    data: { order_id: o.orderId },
  });
}

/**
 * Sent when the cook completes the order — the tap-through carries the order
 * and listing ids so the app can deep-link straight into the review screen.
 */
export function notifyBuyerReviewRequest(
  buyerUserId: string,
  o: OrderContext & { listingId: string }
) {
  return createNotification(buyerUserId, {
    type: 'review_request',
    title: 'How was your food?',
    body: `Enjoyed your ${o.quantity}× ${o.listingTitle}? Tap to leave a rating and help other foodies decide.`,
    data: { order_id: o.orderId, listing_id: o.listingId },
  });
}

// ── Cook notifications ──────────────────────────────────────────────

export function notifyCookNewOrder(cookUserId: string, o: OrderContext) {
  return createNotification(cookUserId, {
    type: 'new_order',
    title: 'New order received',
    body: `${o.quantity}× ${o.listingTitle} for ${pickupPhrase(o)} — ${formatRM(o.totalPrice)} already paid. Confirm it in Today.`,
    data: { order_id: o.orderId },
  });
}

export function notifyCookPayoutSent(cookUserId: string, o: OrderContext) {
  return createNotification(cookUserId, {
    type: 'payout_sent',
    title: 'Earnings on the way',
    body: `${formatRM(o.totalPrice)} for ${o.quantity}× ${o.listingTitle} will be transferred to your bank account.`,
    data: { order_id: o.orderId },
  });
}

export function notifyCookVerificationReviewed(
  cookUserId: string,
  docLabel: string,
  approved: boolean,
  reviewerNote?: string | null
) {
  if (approved) {
    return createNotification(cookUserId, {
      type: 'verification_approved',
      title: "You're a Verified Cook",
      body: `Your ${docLabel} was approved — the Verified badge now shows on your dishes and profile.`,
    });
  }
  return createNotification(cookUserId, {
    type: 'verification_rejected',
    title: 'Document not approved',
    body: `Your ${docLabel} couldn't be approved${reviewerNote ? `: ${reviewerNote}` : '.'} You can resubmit it from your food safety settings.`,
  });
}

export function notifyCookDishReviewed(
  cookUserId: string,
  dishTitle: string,
  approved: boolean,
  note?: string | null
) {
  if (approved) {
    return createNotification(cookUserId, {
      type: 'dish_approved',
      title: 'Your dish is live',
      body: `${dishTitle} was approved and is now visible to customers.`,
    });
  }
  return createNotification(cookUserId, {
    type: 'dish_rejected',
    title: 'Dish not approved',
    body: `${dishTitle} couldn't be approved${note ? `: ${note}` : '.'} Update the listing and it will be reviewed again.`,
  });
}

// ── Favouriter fan-out ──────────────────────────────────────────────

/** Everyone who has hearted this cook, as auth user ids. */
async function getFavouriterUserIds(cookProfileId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('favourites')
    .select('user_id')
    .eq('cook_profile_id', cookProfileId);
  if (error) {
    console.error('Failed to load favouriters for', cookProfileId, error.message);
    return [];
  }
  return (data ?? []).map(f => f.user_id);
}

/** One insert for the whole audience — best-effort like everything else. */
async function createNotificationsBulk(userIds: string[], payload: NotificationPayload) {
  if (userIds.length === 0) return;
  try {
    const { error } = await supabase.from('notifications').insert(
      userIds.map(user_id => ({
        user_id,
        recipient_role: ROLE_BY_TYPE[payload.type],
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
      }))
    );
    if (error) throw error;
  } catch (e: any) {
    console.error(`Failed bulk ${payload.type} notification:`, e.message ?? e);
  }
}

export async function notifyFavouritersNewDish(
  cookProfileId: string,
  restaurantName: string,
  dishTitle: string,
  listingId: string
) {
  const userIds = await getFavouriterUserIds(cookProfileId);
  await createNotificationsBulk(userIds, {
    type: 'favourite_new_dish',
    title: `New dish from ${restaurantName}`,
    body: `${restaurantName} just added ${dishTitle}. Take a look before it sells out!`,
    data: { listing_id: listingId, cook_profile_id: cookProfileId },
  });
}

/**
 * Throttled: skip if this cook already announced new slots in the last few
 * hours, so toggling several dates on doesn't spam their favouriters.
 */
const SLOT_ANNOUNCE_THROTTLE_HOURS = 6;

export async function notifyFavouritersNewSlots(cookProfileId: string, restaurantName: string) {
  const since = new Date(Date.now() - SLOT_ANNOUNCE_THROTTLE_HOURS * 3600 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('notifications')
    .select('id')
    .eq('type', 'favourite_new_slots')
    .eq('data->>cook_profile_id', cookProfileId)
    .gte('created_at', since)
    .limit(1);
  if (recent && recent.length > 0) return;

  const userIds = await getFavouriterUserIds(cookProfileId);
  await createNotificationsBulk(userIds, {
    type: 'favourite_new_slots',
    title: `${restaurantName} added new pickup times`,
    body: `New order slots just opened at ${restaurantName}. Grab yours before they fill up.`,
    data: { cook_profile_id: cookProfileId },
  });
}
