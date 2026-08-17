import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { CartSelectedOption } from '@/src/types/menuOptions';

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
  /** Optional request sent to the cook with this dish. */
  customerNote?: string;
  /** Orders left in that slot at the time it was added — caps the cart's
   *  quantity stepper so a customer can't raise it past what the cook
   *  actually has capacity for. Undefined when no slot was chosen. */
  maxQuantity?: number;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (
    item: Omit<CartItem, 'quantity' | 'lineId'> & { quantity?: number; lineId?: string }
  ) => void;
  removeFromCart: (lineId: string) => void;
  clearCookCart: (cookId: string) => void;
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
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

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
        addToCart,
        removeFromCart,
        clearCookCart,
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
