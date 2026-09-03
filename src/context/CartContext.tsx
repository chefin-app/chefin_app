import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '@/src/services/auth-context';
import type { CartSelectedOption } from '@/src/types/menuOptions';

const CART_STORAGE_PREFIX = 'chefin.cart.v1';
const GUEST_CART_OWNER = 'guest';

const storageKey = (ownerId: string) => `${CART_STORAGE_PREFIX}.${ownerId}`;

const parseStoredCart = (value: string | null): CartItem[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(item => {
      const candidate = item as Record<string, unknown>;
      if (
        !item ||
        typeof item !== 'object' ||
        typeof candidate.lineId !== 'string' ||
        typeof candidate.listingId !== 'string' ||
        typeof candidate.cookId !== 'string' ||
        typeof candidate.title !== 'string' ||
        typeof candidate.price !== 'number' ||
        typeof candidate.quantity !== 'number' ||
        typeof candidate.selectedDate !== 'string'
      ) {
        return [];
      }
      const selectedDate = new Date(candidate.selectedDate);
      if (Number.isNaN(selectedDate.getTime())) return [];
      const restored = {
        ...(candidate as unknown as Omit<CartItem, 'selectedDate'>),
        selectedDate,
      };
      // Cart v1 entries created before window-end support used standard 30-minute slots.
      if (!restored.pickupSlotEnd && restored.pickupSlotStart) {
        restored.pickupSlotEnd = new Date(
          new Date(restored.pickupSlotStart).getTime() + 30 * 60_000
        ).toISOString();
      }
      return [restored];
    });
  } catch {
    return [];
  }
};

export interface CartItem {
  /** Stable cart-line identity; the same dish with different choices is separate. */
  lineId: string;
  listingId: string;
  cookId: string;
  title: string;
  price: number;
  basePrice?: number;
  selectedOptions?: CartSelectedOption[];
  imageUrl?: string;
  cookName?: string;
  quantity: number;
  selectedDate: Date;
  /** Malaysian YYYY-MM-DD service date sent independently of the UTC slot. */
  serviceDate?: string;
  /** ISO string of the customer's selected restaurant pickup-slot start. */
  pickupSlotStart?: string;
  /** ISO string of the selected slot end; delivery estimates start here. */
  pickupSlotEnd?: string;
  /** Optional request sent to the cook with this dish. */
  customerNote?: string;
  /** Orders left in that slot at the time it was added — caps the cart's
   *  quantity stepper so a customer can't raise it past what the cook
   *  actually has capacity for. Undefined when no slot was chosen. */
  maxQuantity?: number;
}

interface CartContextType {
  cartItems: CartItem[];
  hydrated: boolean;
  addToCart: (
    item: Omit<CartItem, 'quantity' | 'lineId'> & { quantity?: number; lineId?: string }
  ) => void;
  removeFromCart: (lineId: string) => void;
  clearCookCart: (cookId: string) => void;
  rescheduleCookCart: (
    cookId: string,
    schedule: {
      selectedDate: Date;
      serviceDate: string;
      pickupSlotStart: string;
      pickupSlotEnd: string;
      maxQuantityByListing: Record<string, number>;
    }
  ) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
  cartCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const buildCartLineId = (
  listingId: string,
  selectedOptions: CartSelectedOption[] | undefined
): string => {
  const optionKey = (selectedOptions ?? [])
    .map(option => option.optionId)
    .sort()
    .join(',');
  return optionKey ? `${listingId}:${optionKey}` : listingId;
};

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, initializing } = useAuth();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const activeOwnerRef = useRef<string | null>(null);

  useEffect(() => {
    if (initializing) return;

    // Signing out keeps the current account's cart in memory. If a different
    // account signs in, its own persisted cart replaces it. This preserves a
    // cart through logout without leaking it into another signed-in account.
    const nextOwner = user?.id ?? activeOwnerRef.current ?? GUEST_CART_OWNER;
    if (activeOwnerRef.current === nextOwner) return;

    let current = true;
    setHydrated(false);
    AsyncStorage.getItem(storageKey(nextOwner))
      .then(value => {
        if (!current) return;
        activeOwnerRef.current = nextOwner;
        setCartItems(parseStoredCart(value));
        setHydrated(true);
      })
      .catch(error => {
        console.warn('Failed to restore cart', error);
        if (!current) return;
        activeOwnerRef.current = nextOwner;
        setCartItems([]);
        setHydrated(true);
      });
    return () => {
      current = false;
    };
  }, [initializing, user?.id]);

  useEffect(() => {
    const owner = activeOwnerRef.current;
    if (!hydrated || !owner) return;
    AsyncStorage.setItem(storageKey(owner), JSON.stringify(cartItems)).catch(error =>
      console.warn('Failed to save cart', error)
    );
  }, [cartItems, hydrated]);

  const addToCart = useCallback(
    (item: Omit<CartItem, 'quantity' | 'lineId'> & { quantity?: number; lineId?: string }) => {
      setCartItems(prev => {
        const lineId = item.lineId ?? buildCartLineId(item.listingId, item.selectedOptions);
        const normalizedItem = { ...item, lineId };
        const existing = prev.find(c => c.lineId === lineId);
        const cap = item.maxQuantity ?? existing?.maxQuantity;
        if (existing) {
          // A listing is a single cart line. If its restaurant schedule changed,
          // replace that line rather than incrementing the old quantity while
          // silently overwriting its date/time.
          if (existing.pickupSlotStart !== item.pickupSlotStart) {
            const quantity = item.quantity ?? 1;
            return prev.map(c =>
              c.lineId === lineId
                ? { ...normalizedItem, quantity: cap != null ? Math.min(quantity, cap) : quantity }
                : c
            );
          }
          const nextQuantity = existing.quantity + (item.quantity ?? 1);
          return prev.map(c =>
            c.lineId === lineId
              ? {
                  ...c,
                  ...normalizedItem,
                  quantity: cap != null ? Math.min(nextQuantity, cap) : nextQuantity,
                }
              : c
          );
        }
        const quantity = item.quantity ?? 1;
        return [
          ...prev,
          { ...normalizedItem, quantity: cap != null ? Math.min(quantity, cap) : quantity },
        ];
      });
    },
    []
  );

  const removeFromCart = useCallback((lineId: string) => {
    setCartItems(prev => prev.filter(c => c.lineId !== lineId));
  }, []);

  const clearCookCart = useCallback((cookId: string) => {
    setCartItems(prev => prev.filter(item => item.cookId !== cookId));
  }, []);

  const rescheduleCookCart = useCallback(
    (
      cookId: string,
      schedule: {
        selectedDate: Date;
        serviceDate: string;
        pickupSlotStart: string;
        pickupSlotEnd: string;
        maxQuantityByListing: Record<string, number>;
      }
    ) => {
      setCartItems(current =>
        current.map(item =>
          item.cookId === cookId
            ? {
                ...item,
                selectedDate: schedule.selectedDate,
                serviceDate: schedule.serviceDate,
                pickupSlotStart: schedule.pickupSlotStart,
                pickupSlotEnd: schedule.pickupSlotEnd,
                maxQuantity: schedule.maxQuantityByListing[item.listingId] ?? item.maxQuantity,
              }
            : item
        )
      );
    },
    []
  );

  const updateQuantity = useCallback((lineId: string, quantity: number) => {
    if (quantity < 1) {
      setCartItems(prev => prev.filter(c => c.lineId !== lineId));
      return;
    }
    setCartItems(prev =>
      prev.map(c =>
        c.lineId === lineId
          ? { ...c, quantity: c.maxQuantity != null ? Math.min(quantity, c.maxQuantity) : quantity }
          : c
      )
    );
  }, []);

  const clearCart = useCallback(() => setCartItems([]), []);

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems]
  );

  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );

  return (
    <CartContext.Provider
      value={{
        cartItems,
        hydrated,
        addToCart,
        removeFromCart,
        clearCookCart,
        rescheduleCookCart,
        updateQuantity,
        clearCart,
        cartTotal,
        cartCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
};
