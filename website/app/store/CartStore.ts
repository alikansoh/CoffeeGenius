import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ProductType = "coffee" | "equipment" | "accessory" | "subscription";

export interface CartItem {
  id: string;
  productType: ProductType;
  productId: string;
  variantId?: string;
  name: string;
  price: number;
  quantity: number;
  img: string;
  
  // Coffee-specific fields (optional)
  size?: string;
  grind?: string;
  sku?: string;
  
  // Equipment/general fields (optional)
  color?: string;
  model?: string;
  
  // Stock info
  stock?: number;
  
  // Metadata - use string indexing for safety
  metadata?: {
    brand?: string;
    category?: string;
    [key: string]: string | number | boolean | undefined;
  };
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
  getTotalPrice: () => number;
  getItemsByType: (type: ProductType) => CartItem[];
}

const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      addItem: (item, quantity = 1) => {
        set((state) => {
          const existingItem = state.items. find((i) => i.id === item.id);

          if (existingItem) {
            const newQuantity = existingItem. quantity + quantity;
            const stockLimit = item.stock ?? 999;

            if (newQuantity > stockLimit) {
              console.warn(`Cannot add more.  Only ${stockLimit} in stock. `);
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
          items: state.items. filter((item) => item.id !== id),
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
      version: 1,
      partialize: (state) => ({ items: state.items }),
    }
  )
);

export default useCart;