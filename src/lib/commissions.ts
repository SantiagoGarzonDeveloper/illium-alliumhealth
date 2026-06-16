import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/** Default Direct checkout commission: partner whose ?ref= was used */
export const COMMISSION_DIRECT_RATE_DEFAULT = 0.4;
/** Default Upline commission: immediate referrer of the selling partner */
export const COMMISSION_UPLINE_RATE_DEFAULT = 0.1;

/**
 * Current commission rates — read from Firestore settings/general when possible.
 * Module-level mutable so order code picks up the latest values.
 */
let directRate: number = COMMISSION_DIRECT_RATE_DEFAULT;
let uplineRate: number = COMMISSION_UPLINE_RATE_DEFAULT;

/** Hydrate rates from Firestore (call on app boot). */
export async function loadCommissionRates(): Promise<{ direct: number; upline: number }> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'general'));
    if (snap.exists()) {
      const data = snap.data();
      const d = typeof data.commissionDirectRate === 'number' ? data.commissionDirectRate : null;
      const u = typeof data.commissionUplineRate === 'number' ? data.commissionUplineRate : null;
      if (d !== null && d >= 0 && d <= 1) directRate = d;
      if (u !== null && u >= 0 && u <= 1) uplineRate = u;
    }
  } catch {
    /* fall back to defaults */
  }
  return { direct: directRate, upline: uplineRate };
}

export function getCommissionRates(): { direct: number; upline: number } {
  return { direct: directRate, upline: uplineRate };
}

export function getDirectRate(): number {
  return directRate;
}

export function getUplineRate(): number {
  return uplineRate;
}

/** Back-compat plain number exports — these carry the DEFAULT values only.
 *  UI code that needs the live rate should call getDirectRate() / getUplineRate(). */
export const COMMISSION_DIRECT_RATE: number = COMMISSION_DIRECT_RATE_DEFAULT;
export const COMMISSION_UPLINE_RATE: number = COMMISSION_UPLINE_RATE_DEFAULT;

export function directCommission(total: number, rate?: number): number {
  const r = typeof rate === 'number' ? rate : directRate;
  return Math.round(total * r * 100) / 100;
}

export function uplineCommission(total: number, rate?: number): number {
  const r = typeof rate === 'number' ? rate : uplineRate;
  return Math.round(total * r * 100) / 100;
}
