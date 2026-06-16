import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CartItem } from '@/store';
import type { Coupon } from '@/lib/coupons';
import { getEffectivePrice } from '@/lib/pricing';

export type SharedCartRole = 'admin' | 'worker';

export interface SharedCartItem {
  productId: string;
  name: string;
  unitPrice: number;
  originalPrice: number;
  discountType: 'percent' | 'fixed' | null;
  discountValue: number;
  quantity: number;
  img?: string;
}

export interface SharedCartCoupon {
  id: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  discountAmount: number;
}

export interface SharedCartReferredBy {
  uid: string;
  role: SharedCartRole;
  displayName: string;
  email: string;
}

export interface SharedCartDoc {
  items: SharedCartItem[];
  coupon: SharedCartCoupon | null;
  subtotal: number;
  total: number;
  referredBy: SharedCartReferredBy;
  status: 'active' | 'used' | 'expired';
  openCount: number;
  usedOrderId: string | null;
  /** ms since epoch — convenient for client-side checks */
  expiresAtMs: number;
  createdAt: ReturnType<typeof serverTimestamp>;
  expiresAt: Date;
  note: string | null;
}

const DEFAULT_TTL_DAYS = 7;

/** Build a snapshot of the current cart suitable for a shared link. */
export function buildSharedCartPayload(args: {
  cart: CartItem[];
  appliedCoupon: Coupon | null;
  couponDiscountAmount: number;
  referredBy: SharedCartReferredBy;
  ttlDays?: number;
  note?: string;
}): Omit<SharedCartDoc, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> } {
  const items: SharedCartItem[] = args.cart.map((ci) => {
    const eff = getEffectivePrice(ci.product);
    // Firestore rejects undefined — every field must be a concrete value.
    return {
      productId: ci.product.id,
      name: ci.product.name,
      unitPrice: eff.finalPrice,
      originalPrice: eff.originalPrice,
      discountType: eff.hasDiscount ? eff.discountType ?? null : null,
      discountValue: eff.hasDiscount ? eff.discountValue ?? 0 : 0,
      quantity: ci.quantity,
      img: ci.product.img || '',
    };
  });
  const subtotal = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
  const couponDiscountAmount = Math.max(0, args.couponDiscountAmount || 0);
  const total = Math.max(0, subtotal - couponDiscountAmount);
  const coupon: SharedCartCoupon | null = args.appliedCoupon
    ? {
        id: args.appliedCoupon.id,
        code: args.appliedCoupon.code,
        discountType: args.appliedCoupon.discountType,
        discountValue: args.appliedCoupon.discountValue,
        discountAmount: couponDiscountAmount,
      }
    : null;
  const ttl = args.ttlDays && args.ttlDays > 0 ? args.ttlDays : DEFAULT_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttl * 24 * 60 * 60 * 1000);
  // Important: no `undefined` fields — Firestore would reject the write.
  const note = (args.note || '').trim();
  return {
    items,
    coupon,
    subtotal,
    total,
    referredBy: args.referredBy,
    status: 'active',
    openCount: 0,
    usedOrderId: null,
    expiresAtMs: expiresAt.getTime(),
    createdAt: serverTimestamp(),
    expiresAt,
    note: note || null,
  };
}

/** Create a sharedCarts doc and return its id. */
export async function createSharedCart(payload: ReturnType<typeof buildSharedCartPayload>): Promise<string> {
  const ref = await addDoc(collection(db, 'sharedCarts'), payload);
  return ref.id;
}

/** Read a sharedCart by id. Returns null if missing or expired. */
export async function loadSharedCart(id: string): Promise<(SharedCartDoc & { id: string }) | null> {
  const snap = await getDoc(doc(db, 'sharedCarts', id));
  if (!snap.exists()) return null;
  const data = snap.data() as SharedCartDoc;
  if (data.status === 'expired') return null;
  if (typeof data.expiresAtMs === 'number' && data.expiresAtMs < Date.now()) {
    try {
      await updateDoc(doc(db, 'sharedCarts', id), { status: 'expired' });
    } catch {
      /* ignore */
    }
    return null;
  }
  return { id: snap.id, ...data };
}

/** Track that a link was opened (best-effort, non-blocking). */
export async function bumpSharedCartOpen(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'sharedCarts', id), { openCount: increment(1) });
  } catch {
    /* ignore */
  }
}

/** Mark a shared cart as used by a given order. */
export async function markSharedCartUsed(id: string, orderId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'sharedCarts', id), { status: 'used', usedOrderId: orderId });
  } catch {
    /* ignore */
  }
}

/** Build the public share URL for a given id. */
export function buildShareUrl(id: string): string {
  const base =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://alliumhealth.net';
  return `${base}/c/${id}`;
}
