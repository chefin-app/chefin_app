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

/** Short human-friendly code shown in place of the raw UUID, e.g. CF-3A9. */
export const shortOrderCode = (id: string): string =>
  `CF-${id.replace(/-/g, '').slice(0, 3).toUpperCase()}`;

/** e.g. "Pickup in 1h 20m", "Delivery due now", "Pickup time TBC". */
export function formatEta(
  fulfillmentType: FulfillmentType | null,
  pickupTime: string | null
): string {
  const verb = fulfillmentType === 'delivery' ? 'Delivery' : 'Pickup';
  if (!pickupTime) return `${verb} time TBC`;

  const target = new Date(pickupTime).getTime();
  const diffMinutes = Math.round((target - Date.now()) / 60_000);

  if (diffMinutes <= 0) return `${verb} due now`;
  if (diffMinutes < 60) return `${verb} in ${diffMinutes} min`;

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `${verb} in ${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
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
