import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getEffectivePrice } from '@/lib/pricing';

export interface Product {
  id: string;
  name: string;
  /** Spanish storefront title when locale is ES */
  nameEs?: string;
  description: string;
  descriptionEs?: string;
  price: number;
  /** Cost to acquire/produce this product (admin only) */
  cost?: number;
  stock: number;
  category: string;
  img: string;
  benefits?: string[];
  benefitsEs?: string[];
  protocol?: string;
  /** 'percent' = % off original price; 'fixed' = absolute amount subtracted */
  discountType?: 'percent' | 'fixed';
  /** Value of the discount (e.g. 10 = 10% or $10 off depending on discountType) */
  discountValue?: number;
  /** Who this product is best for. Used by Quiz AI to filter recommendations. */
  targetGender?: 'male' | 'female' | 'both';
  /** Free-text dosage / protocol guidance the AI uses verbatim (e.g. "0.25mg/week, titrate to 1mg"). */
  dosageNote?: string;
  /** How many months of supply a single vial covers at the typical dose. Defaults to 1. */
  monthsSupplyPerVial?: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

/**
 * Set when the user lands on the site via a shared cart link (`/c/:id`).
 * Persisted alongside the cart so that the eventual checkout can attribute
 * the resulting order to the worker/admin that built the link.
 */
export interface SharedCartFromMeta {
  shareId: string;
  referredBy: {
    uid: string;
    role: 'admin' | 'worker';
    displayName: string;
    email: string;
  };
  /** Locked coupon (id+code) snapshotted at share time, if any. */
  coupon: {
    id: string;
    code: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    discountAmount: number;
  } | null;
  /** Frozen subtotal/total from the share — informational, recomputed on changes. */
  snapshotSubtotal: number;
  snapshotTotal: number;
  /** ms since epoch */
  expiresAtMs: number;
  loadedAtMs: number;
}

interface AppState {
  cart: CartItem[];
  products: Product[];
  sharedFrom: SharedCartFromMeta | null;
  setProducts: (products: Product[]) => void;
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: () => number;
  /** Replace the cart with the contents of a shared cart link. */
  hydrateFromShared: (args: { items: CartItem[]; meta: SharedCartFromMeta }) => void;
  /** Drop the sharedFrom attribution (used after order completion or manual clear). */
  clearSharedFrom: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      cart: [],
      products: [],
      sharedFrom: null,
      setProducts: (products) => set({ products }),
      hydrateFromShared: ({ items, meta }) => set({ cart: items, sharedFrom: meta }),
      clearSharedFrom: () => set({ sharedFrom: null }),
      addToCart: (product, quantity) => set((state) => {
        const existing = state.cart.find(i => i.product.id === product.id);
        if (existing) {
          return {
            cart: state.cart.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + quantity } : i)
          };
        }
        return { cart: [...state.cart, { product, quantity }] };
      }),
      removeFromCart: (productId) => set((state) => ({
        cart: state.cart.filter(i => i.product.id !== productId)
      })),
      updateQuantity: (productId, quantity) => set((state) => ({
        cart: state.cart.map(i => i.product.id === productId ? { ...i, quantity } : i)
      })),
      clearCart: () => set({ cart: [], sharedFrom: null }),
      cartTotal: () => get().cart.reduce((total, item) => total + (getEffectivePrice(item.product).finalPrice * item.quantity), 0),
    }),
    {
      name: 'lab-cart-storage',
    }
  )
);

type ToastItem = { id: number; message: string };

export const useToastStore = create<{
  toasts: ToastItem[];
  showToast: (message: string) => void;
  dismissToast: (id: number) => void;
}>((set) => ({
  toasts: [],
  showToast: (message) =>
    set((s) => ({ toasts: [...s.toasts, { id: Date.now() + Math.random(), message }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
