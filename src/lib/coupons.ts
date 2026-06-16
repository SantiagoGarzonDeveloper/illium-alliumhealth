import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, updateDoc, increment, limit } from 'firebase/firestore';

export interface Coupon {
  id: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  active: boolean;
  expiresAt?: { seconds: number } | null;
  maxUses?: number | null;
  usedCount?: number;
  note?: string | null;
}

export interface AppliedCoupon {
  coupon: Coupon;
  discountAmount: number;
  finalTotal: number;
}

export async function findCouponByCode(rawCode: string): Promise<Coupon | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  const q = query(collection(db, 'coupons'), where('code', '==', code), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as Omit<Coupon, 'id'>) };
}

export function validateCoupon(c: Coupon): { ok: true } | { ok: false; reason: string } {
  if (!c.active) return { ok: false, reason: 'inactive' };
  if (c.expiresAt && c.expiresAt.seconds * 1000 < Date.now()) return { ok: false, reason: 'expired' };
  if (typeof c.maxUses === 'number' && c.maxUses > 0 && (c.usedCount || 0) >= c.maxUses) {
    return { ok: false, reason: 'maxed' };
  }
  return { ok: true };
}

export function applyCouponToTotal(c: Coupon, subtotal: number): AppliedCoupon {
  let discountAmount = 0;
  if (c.discountType === 'percent') {
    discountAmount = subtotal * (Math.min(c.discountValue, 100) / 100);
  } else {
    discountAmount = Math.min(c.discountValue, subtotal);
  }
  if (discountAmount < 0) discountAmount = 0;
  const finalTotal = Math.max(0, subtotal - discountAmount);
  return { coupon: c, discountAmount, finalTotal };
}

export async function incrementCouponUsage(couponId: string) {
  try {
    await updateDoc(doc(db, 'coupons', couponId), { usedCount: increment(1) });
  } catch (e) {
    console.warn('Could not increment coupon usage:', e);
  }
}
