import type { CartItem } from '@/src/context/CartContext';

export type BasketAvailabilityStatus =
  | 'ready'
  | 'store_closed'
  | 'dish_unavailable'
  | 'time_unavailable'
  | 'out_of_stock';

export type BasketAvailability = {
  cookId: string;
  restaurantName: string;
  restaurantImage: string | null;
  status: BasketAvailabilityStatus;
  message: string | null;
  items: Array<{
    listingId: string;
    status: BasketAvailabilityStatus;
    reason: string | null;
  }>;
};

export async function checkCartAvailability(cartItems: CartItem[]): Promise<BasketAvailability[]> {
  if (cartItems.length === 0) return [];
  const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/orders/cart-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: cartItems.map(item => ({
        listingId: item.listingId,
        cookId: item.cookId,
        quantity: item.quantity,
        serviceDate: item.serviceDate,
        pickupTime: item.pickupSlotStart,
      })),
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    baskets?: BasketAvailability[];
    error?: string;
  };
  if (!response.ok || !Array.isArray(payload.baskets)) {
    throw new Error(payload.error ?? 'Cart availability could not be checked.');
  }
  return payload.baskets;
}
