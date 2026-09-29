/**
 * 29-sep-2026 — el cliente pidió dejar SOLO dos categorías:
 *   · «Shop All Peptides» (todos los productos)  → slug `peptides`
 *   · «Wholesale / Al por mayor»                 → slug `wholesale`
 *
 * Las categorías viejas (metabolic, recovery, nootropics, nad, blends…) se
 * tratan como la general. Así la tienda muestra solo esas dos opciones aunque
 * algún producto conserve un slug antiguo en Firestore.
 */
import type { Product } from '@/store';

export const GENERAL_CATEGORY = 'peptides';
export const WHOLESALE_CATEGORY = 'wholesale';

export type ShopFilter = 'all' | 'wholesale';

export function isWholesale(p: Pick<Product, 'category'>): boolean {
  return String(p.category || '').trim().toLowerCase() === WHOLESALE_CATEGORY;
}

/** `?category=` → filtro de la tienda. Cualquier slug viejo cae en «all». */
export function shopFilterFromParam(param: string | null | undefined): ShopFilter {
  return String(param || '').trim().toLowerCase() === WHOLESALE_CATEGORY ? 'wholesale' : 'all';
}

export function filterByShopFilter<T extends Pick<Product, 'category'>>(products: T[], filter: ShopFilter): T[] {
  return filter === 'wholesale' ? products.filter(isWholesale) : products.filter((p) => !isWholesale(p));
}

/** Etiqueta visible de la categoría de un producto (solo dos posibles). */
export function productCategoryLabel(p: Pick<Product, 'category'>, locale: string): string {
  const es = locale === 'es';
  if (isWholesale(p)) return es ? 'Al por mayor' : 'Wholesale';
  return es ? 'Péptidos de investigación' : 'Research Peptides';
}

export function shopFilterLabel(filter: ShopFilter, locale: string): string {
  const es = locale === 'es';
  if (filter === 'wholesale') return es ? 'Al por mayor' : 'Wholesale';
  return es ? 'Todos los péptidos' : 'Shop All Peptides';
}

export function shopFilterPath(filter: ShopFilter): string {
  return filter === 'wholesale' ? `/shop?category=${WHOLESALE_CATEGORY}` : '/shop';
}
