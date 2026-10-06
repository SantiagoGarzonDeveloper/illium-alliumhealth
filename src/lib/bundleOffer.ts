/**
 * «BUILD YOUR ULTIMATE RESEARCH BUNDLE» — 6-oct-2026 (pedido del cliente).
 *
 *   · Compra 2 péptidos → el 3.º con 25% de descuento
 *   · Compra 3 péptidos → el 4.º con 50% de descuento   (MOST POPULAR)
 *   · Compra 6 péptidos → el 7.º GRATIS                 (BEST VALUE)
 *
 * Reglas (letra pequeña del cliente):
 *   · El descuento se aplica al producto elegible de MENOR precio.
 *   · Las ofertas no se combinan: se aplica solo el mejor nivel alcanzado.
 *   · Cuentan los péptidos individuales (las cajas al por mayor ya tienen precio
 *     de volumen y no suman al combo).
 */
import type { CartItem, Product } from '@/store';
import { getEffectivePrice } from '@/lib/pricing';
import { isWholesale } from '@/lib/catalogCategories';

export interface BundleTier {
  /** Unidades que hay que llevar en total para activar el nivel (3, 4 o 7). */
  units: number;
  /** % de descuento sobre la unidad elegible más barata. */
  percent: number;
}

/** De mayor a menor: se queda el primero que se alcance. */
export const BUNDLE_TIERS: BundleTier[] = [
  { units: 7, percent: 100 },
  { units: 4, percent: 50 },
  { units: 3, percent: 25 },
];

export interface BundleResult {
  /** Péptidos elegibles en el carrito (unidades). */
  eligibleUnits: number;
  tier: BundleTier | null;
  /** Dólares que se descuentan (0 si no hay nivel). */
  discount: number;
  /** Siguiente nivel por desbloquear y cuántas unidades faltan. */
  next: { tier: BundleTier; missing: number } | null;
}

export function isBundleEligible(p: Pick<Product, 'category'>): boolean {
  return !isWholesale(p);
}

/**
 * Calcula el combo sobre el carrito. `liveProducts` (catálogo en vivo) manda
 * sobre la copia guardada en el carrito para saber la categoría y el precio.
 */
export function computeBundle(cart: CartItem[], liveProducts: Product[] = []): BundleResult {
  const unitPrices: number[] = [];
  for (const item of cart) {
    const live = liveProducts.find((p) => p.id === item.product.id) || item.product;
    if (!isBundleEligible(live)) continue;
    // El precio que se cobra es el de la copia del carrito (igual que el subtotal).
    const price = getEffectivePrice(item.product).finalPrice;
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    for (let i = 0; i < qty; i++) unitPrices.push(price);
  }
  const eligibleUnits = unitPrices.length;
  const tier = BUNDLE_TIERS.find((t) => eligibleUnits >= t.units) || null;
  const cheapest = unitPrices.length ? Math.min(...unitPrices) : 0;
  const discount = tier ? Math.round(cheapest * (tier.percent / 100) * 100) / 100 : 0;
  const nextTier = [...BUNDLE_TIERS].reverse().find((t) => eligibleUnits < t.units) || null;
  return {
    eligibleUnits,
    tier,
    discount,
    next: nextTier ? { tier: nextTier, missing: nextTier.units - eligibleUnits } : null,
  };
}

/** Texto corto del nivel alcanzado, p. ej. «Combo: 4.º péptido −50%». */
export function bundleTierLabel(tier: BundleTier, locale: string): string {
  const es = locale === 'es';
  const nth = ordinal(tier.units, es);
  if (tier.percent >= 100) return es ? `Combo: ${nth} péptido GRATIS` : `Bundle: ${nth} peptide FREE`;
  return es ? `Combo: ${nth} péptido −${tier.percent}%` : `Bundle: ${nth} peptide ${tier.percent}% OFF`;
}

/** Mensaje de «te faltan N para…». */
export function bundleNextHint(next: NonNullable<BundleResult['next']>, locale: string): string {
  const es = locale === 'es';
  const n = next.missing;
  const nth = ordinal(next.tier.units, es);
  const prize = next.tier.percent >= 100
    ? (es ? `tu ${nth} péptido GRATIS` : `your ${nth} peptide FREE`)
    : (es ? `${next.tier.percent}% de descuento en tu ${nth} péptido` : `${next.tier.percent}% OFF your ${nth} peptide`);
  return es
    ? `Agrega ${n} péptido${n === 1 ? '' : 's'} más y obtén ${prize}.`
    : `Add ${n} more peptide${n === 1 ? '' : 's'} and get ${prize}.`;
}

function ordinal(n: number, es: boolean): string {
  if (es) return `${n}.º`;
  const s = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  return `${n}${s}`;
}

/** Compra mínima del producto (1 si no está configurada). */
export function minQtyOf(p: Pick<Product, 'minQty'> | undefined | null): number {
  const n = Math.floor(Number(p?.minQty) || 0);
  return n > 1 ? n : 1;
}
