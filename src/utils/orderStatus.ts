export type OrderStatus = 'pending' | 'confirmed' | 'ready' | 'completed' | 'cancelled';

export type FulfillmentType = 'pickup' | 'delivery';

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'ready'];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Order placed',
  confirmed: 'Being prepared',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

interface BuyerOrderTimingInput {
  status: OrderStatus | null;
  fulfillmentType: FulfillmentType | null;
  pickupTime: string | null;
  estimatedArrivalStart?: string | null;
  estimatedArrivalEnd?: string | null;
}

/** Short human-friendly code shown in place of the raw UUID, e.g. CF-3A9. */
export const shortOrderCode = (id: string): string =>
  `CF-${id.replace(/-/g, '').slice(0, 3).toUpperCase()}`;

/** Pickup-only countdown. Delivery timing must use `formatArrivalWindow`. */
export function formatPickupEta(pickupTime: string | null): string {
  if (!pickupTime) return 'Pickup time TBC';

  const target = new Date(pickupTime).getTime();
  const diffMinutes = Math.round((target - Date.now()) / 60_000);

  if (diffMinutes <= 0) return 'Pickup due now';
  if (diffMinutes < 60) return `Pickup in ${diffMinutes} min`;

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `Pickup in ${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
}

/** e.g. "Today, 6:30 PM" or "21 Aug, 6:30 PM". */
export function formatScheduledSlot(pickupTime: string | null): string | null {
  if (!pickupTime) return null;
  const date = new Date(pickupTime);
  const today = new Date();
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const day = isToday
    ? 'Today'
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${day}, ${time}`;
}

/** e.g. "Today, 12:00–12:30 PM". */
export function formatScheduledWindow(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  if (!endDate || Number.isNaN(endDate.getTime())) return formatScheduledSlot(start);
  const dayAndStart = formatScheduledSlot(start);
  const endTime = endDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const startTime = startDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return dayAndStart?.replace(startTime, `${startTime}–${endTime}`) ?? null;
}

/** Buyer-facing delivery range calculated from the preparation deadline. */
export function formatArrivalWindow(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  const startText = startDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const endText = endDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${startText}–${endText}`;
}

/**
 * Buyer-facing timing copy for an order's current state. Pending orders never
 * expose an ETA because the cook has not accepted the order yet, even when a
 * delivery quote or requested pickup slot already exists.
 */
export function getBuyerOrderTimingLabel({
  status,
  fulfillmentType,
  pickupTime,
  estimatedArrivalStart = null,
  estimatedArrivalEnd = null,
}: BuyerOrderTimingInput): string {
  const isDelivery = fulfillmentType === 'delivery';
  const arrivalWindow = formatArrivalWindow(estimatedArrivalStart, estimatedArrivalEnd);

  if (status === 'pending') return 'Waiting for the cook to accept';
  if (status === 'cancelled') return 'Order cancelled';
  if (status === 'completed') return isDelivery ? 'Order delivered' : 'Order collected';

  if (status === 'ready') {
    if (!isDelivery) return 'Ready for pickup';
    return arrivalWindow
      ? `Estimated arrival ${arrivalWindow}`
      : 'Food is ready · delivery being arranged';
  }

  if (status === 'confirmed') {
    if (!isDelivery) return formatPickupEta(pickupTime);
    return arrivalWindow ? `Estimated arrival ${arrivalWindow}` : 'Delivery time being confirmed';
  }

  return 'Order timing unavailable';
}
