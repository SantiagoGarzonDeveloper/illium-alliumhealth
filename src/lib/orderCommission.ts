import { directCommission, uplineCommission } from '@/lib/commissions';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CartItem } from '@/store';

export type CommissionPayoutStatus = 'pending' | 'paid' | 'na';

export type OrderCommissionFields = {
  referrerCommissionAmount: number;
  uplineCommissionAmount: number;
  referrerPayoutStatus: CommissionPayoutStatus;
  uplinePayoutStatus: CommissionPayoutStatus;
};

/**
 * Calculate referrer commission respecting vendor-specific config.
 * Reads users/{referrerId} for commissionMode, commissionPercentage, etc.
 * Falls back to global rate if no custom config.
 */
async function calcVendorCommission(
  referrerId: string,
  total: number,
  cartItems: CartItem[]
): Promise<number> {
  try {
    const snap = await getDoc(doc(db, 'users', referrerId));
    if (!snap.exists()) return directCommission(total);
    const d = snap.data();
    const mode = String(d.commissionMode || 'percentage');

    if (mode === 'fixed_global') {
      const fixedAmt = Number(d.commissionFixedAmount) || 0;
      const totalUnits = cartItems.reduce((s, ci) => s + ci.quantity, 0);
      return Math.round(fixedAmt * totalUnits * 100) / 100;
    }

    if (mode === 'fixed_per_product') {
      const perProduct = (d.commissionFixedPerProduct || {}) as Record<string, number>;
      let sum = 0;
      for (const ci of cartItems) {
        const amt = Number(perProduct[ci.product.id]) || 0;
        sum += amt * ci.quantity;
      }
      return Math.round(sum * 100) / 100;
    }

    // percentage mode (default)
    const pct = typeof d.commissionPercentage === 'number' ? d.commissionPercentage : null;
    if (pct !== null) {
      return Math.round(total * pct * 100) / 100;
    }
    return directCommission(total);
  } catch {
    return directCommission(total);
  }
}

/** Values to write on new orders (Cart). Now async to read vendor config. */
export async function buildNewOrderCommissionFields(
  total: number,
  referrerId: string | null,
  uplineReferrerId: string | null,
  cartItems?: CartItem[]
): Promise<OrderCommissionFields> {
  const hasRef = Boolean(referrerId);
  const hasUpline = Boolean(uplineReferrerId);

  let refAmt = 0;
  if (hasRef && referrerId) {
    refAmt = await calcVendorCommission(referrerId, total, cartItems || []);
  }

  return {
    referrerCommissionAmount: refAmt,
    // Upline earns the upline rate on the DIRECT seller's commission (their net
    // earnings), NOT on the order total. The backend recomputes this on create
    // with the same rule; this keeps the initially-written value consistent.
    uplineCommissionAmount: hasUpline ? uplineCommission(refAmt) : 0,
    referrerPayoutStatus: hasRef ? 'pending' : 'na',
    uplinePayoutStatus: hasUpline ? 'pending' : 'na',
  };
}

/** Read from Firestore with backward compatibility for older documents. */
export function resolveOrderCommissions(data: Record<string, unknown>): OrderCommissionFields & {
  referrerPayoutPaidAt?: unknown;
  uplinePayoutPaidAt?: unknown;
} {
  const total = Number(data.total) || 0;
  const referrerId = (data.referrerId as string | null | undefined) || null;
  const uplineReferrerId = (data.uplineReferrerId as string | null | undefined) || null;
  const hasRef = Boolean(referrerId);
  const hasUpline = Boolean(uplineReferrerId);

  const referrerCommissionAmount =
    typeof data.referrerCommissionAmount === 'number'
      ? data.referrerCommissionAmount
      : hasRef
        ? directCommission(total)
        : 0;
  const uplineCommissionAmount =
    typeof data.uplineCommissionAmount === 'number'
      ? data.uplineCommissionAmount
      : hasUpline
        ? uplineCommission(referrerCommissionAmount)
        : 0;

  const rStatus = data.referrerPayoutStatus as CommissionPayoutStatus | undefined;
  const uStatus = data.uplinePayoutStatus as CommissionPayoutStatus | undefined;

  return {
    referrerCommissionAmount,
    uplineCommissionAmount,
    referrerPayoutStatus: rStatus ?? (hasRef ? 'pending' : 'na'),
    uplinePayoutStatus: uStatus ?? (hasUpline ? 'pending' : 'na'),
    referrerPayoutPaidAt: data.referrerPayoutPaidAt,
    uplinePayoutPaidAt: data.uplinePayoutPaidAt,
  };
}
