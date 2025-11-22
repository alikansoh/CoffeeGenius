"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  img?: string;
};

type CartState = {
  items: CartItem[];
  isOpen: boolean;

  addItem: (item: Omit<CartItem, "qty">, qty?: number) => void;
  removeItem: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;

  open: () => void;
  close: () => void;
  toggle: () => void;

  subtotal: () => number;
  totalCount: () => number;
};

const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      addItem: (item, qty = 1) => {
        set((state) => {
          const idx = state.items.findIndex((i) => i.id === item.id);

          if (idx >= 0) {
            const items = [...state.items];
            items[idx] = { ...items[idx], qty: items[idx].qty + qty };
            return { items };
          }

          return { items: [...state.items, { ...item, qty }] };
        });
      },

      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        })),

      setQty: (id, qty) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, qty: Math.max(1, qty) } : i
          ),
        })),

      clear: () => set({ items: [] }),

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),

      subtotal: () =>
        get().items.reduce((sum, item) => sum + item.price * item.qty, 0),

      totalCount: () =>
        get().items.reduce((sum, item) => sum + item.qty, 0),
    }),
    {
      name: "cart-storage", // key in localStorage
      partialize: (state) => ({ items: state.items }), // only save items
    }
  )
);

export default useCart;
