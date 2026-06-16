import type { Product } from '@/store';

export interface EffectivePrice {
  finalPrice: number;
  originalPrice: number;
  hasDiscount: boolean;
  /** Percent off as integer (e.g. 25). 0 if no discount. */
  percentOff: number;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
}

export function getEffectivePrice(product: Pick<Product, 'price' | 'discountType' | 'discountValue'>): EffectivePrice {
  const original = Number(product.price) || 0;
  const type = product.discountType;
  const value = Number(product.discountValue) || 0;

  if (!type || value <= 0 || original <= 0) {
    return { finalPrice: original, originalPrice: original, hasDiscount: false, percentOff: 0 };
  }

  let final = original;
  if (type === 'percent') {
    final = original * (1 - Math.min(value, 100) / 100);
  } else if (type === 'fixed') {
    final = original - value;
  }
  if (final < 0) final = 0;
  if (final >= original) {
    return { finalPrice: original, originalPrice: original, hasDiscount: false, percentOff: 0 };
  }
  const percentOff = Math.round(((original - final) / original) * 100);
  return {
    finalPrice: final,
    originalPrice: original,
    hasDiscount: true,
    percentOff,
    discountType: type,
    discountValue: value,
  };
}
