import { create } from "zustand";
import { persist } from "zustand/middleware";

type ProductType = "coffee" | "equipment";

export interface CartItemMetadata {
  brand?: string;
  [key: string]: unknown;
}

export interface CartItem {
  metadata?: CartItemMetadata;
  id: string;
  name: string;
  price: number;
  quantity: number;
  productType: ProductType;
  img?: string;
  slug?: string;
  size?: string;
  grind?: string;
  roastType?: string;
  stock?: number;
  /** Parent product id (e.g. the Coffee document's _id) — id above is the variant's _id for coffee */
  productId?: string;
  variantId?: string;
  sku?: string;
  /** Subscribe & save — the basket can hold one subscription alongside normal one-off items;
   *  checkout charges them as two separate payments (Stripe can't bill a recurring
   *  subscription and a one-off purchase in a single payment). */
  isSubscription?: boolean;
  frequencyWeeks?: number;
  /** The standard subscribe & save discount % baked into `price` — shown on checkout
   *  as "Delivery every N weeks with X% discount", separate from any coupon/intro offer. */
  subscriptionDiscountPercent?: number;
}

interface CartStore {
  items: CartItem[];
  isOpen: boolean;

  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;

  open: () => void;
  close: () => void;
  toggle: () => void;

  getTotalItems: () => number;
  getTotalPrice: () => number; // subtotal
  getItemsByType: (type: ProductType) => CartItem[];
}

const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      addItem: (item, quantity = 1) => {
        set((state) => {
          // Subscription cart keys already encode variant + frequency (see CoffeeClient), so
          // the same lookup-by-id below naturally keeps "1kg every week" and "1kg every 2
          // weeks" as separate lines, while re-subscribing to the exact same combo just bumps
          // its quantity like any other item — no special-casing needed here.
          const existingItem = state.items.find((i) => i.id === item.id);

          if (existingItem) {
            const newQuantity = existingItem.quantity + quantity;
            const stockLimit = item.stock ?? 999;

            if (newQuantity > stockLimit) {
              console.warn(`Cannot add more. Only ${stockLimit} in stock.`);
              return state;
            }

            return {
              items: state.items.map((i) =>
                i.id === item.id
                  ? { ...i, quantity: Math.min(newQuantity, stockLimit) }
                  : i
              ),
              isOpen: true,
            };
          }

          return {
            items: [...state.items, { ...item, quantity }],
            isOpen: true,
          };
        });
      },

      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      },

      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(id);
          return;
        }

        set((state) => ({
          items: state.items.map((item) => {
            if (item.id === id) {
              const stockLimit = item.stock ?? 999;
              return { ...item, quantity: Math.min(quantity, stockLimit) };
            }
            return item;
          }),
        }));
      },

      clearCart: () => {
        set({ items: [], isOpen: false });
      },

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),

      getTotalItems: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },

      getTotalPrice: () => {
        return get().items.reduce(
          (total, item) => total + item.price * item.quantity,
          0
        );
      },

      getItemsByType: (type) => {
        return get().items.filter((item) => item.productType === type);
      },
    }),
    {
      name: "universal-cart-storage",
      version: 3,
      partialize: (state) => ({ items: state.items }),
    }
  )
);

export default useCart;