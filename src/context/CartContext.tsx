import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface CartItem {
  listingId: string;
  cookId: string;
  title: string;
  price: number;
  imageUrl?: string;
  cookName?: string;
  quantity: number;
  selectedDate: Date;
  /** ISO string of the customer's 1-hour pickup slot start. */
  pickupSlotStart?: string;
  /** Orders left in that slot at the time it was added — caps the cart's
   *  quantity stepper so a customer can't raise it past what the cook
   *  actually has capacity for. Undefined when no slot was chosen. */
  maxQuantity?: number;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  removeFromCart: (listingId: string) => void;
  updateQuantity: (listingId: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
  cartCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const addToCart = useCallback((item: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
    setCartItems(prev => {
      const existing = prev.find(c => c.listingId === item.listingId);
      const cap = item.maxQuantity ?? existing?.maxQuantity;
      if (existing) {
        const nextQuantity = existing.quantity + (item.quantity ?? 1);
        return prev.map(c =>
          c.listingId === item.listingId
            ? { ...c, ...item, quantity: cap != null ? Math.min(nextQuantity, cap) : nextQuantity }
            : c
        );
      }
      const quantity = item.quantity ?? 1;
      return [...prev, { ...item, quantity: cap != null ? Math.min(quantity, cap) : quantity }];
    });
  }, []);

  const removeFromCart = useCallback((listingId: string) => {
    setCartItems(prev => prev.filter(c => c.listingId !== listingId));
  }, []);

  const updateQuantity = useCallback((listingId: string, quantity: number) => {
    if (quantity < 1) {
      setCartItems(prev => prev.filter(c => c.listingId !== listingId));
      return;
    }
    setCartItems(prev =>
      prev.map(c =>
        c.listingId === listingId
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
