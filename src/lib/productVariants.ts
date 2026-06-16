import type { Product } from '@/store';

/**
 * Extracts a "variant label" (e.g., "20mg", "40mg") from a product name and the
 * "base name" (e.g., "NAC" from "NAC 20mg"). Used to group product variants on
 * the storefront so that customers don't see the same product duplicated by dose.
 */
export interface VariantParts {
  baseName: string;
  variantLabel: string | null;
}

const DOSE_REGEX = /\b(\d+(?:\.\d+)?)\s?(mg|mcg|iu|ui|g|ml)\b/i;

export function parseVariant(name: string): VariantParts {
  const m = name.match(DOSE_REGEX);
  if (!m) return { baseName: name.trim(), variantLabel: null };
  const variantLabel = `${m[1]}${m[2].toLowerCase()}`;
  const baseName = (name.slice(0, m.index) + name.slice((m.index || 0) + m[0].length))
    .replace(/\s+/g, ' ')
    .replace(/[\s\-·,]+$/g, '')
    .trim();
  return { baseName: baseName || name.trim(), variantLabel };
}

export interface ProductVariantGroup {
  baseName: string;
  category: string;
  /** representative product to display in lists (cheapest one) */
  representative: Product;
  variants: Array<{ product: Product; label: string }>;
}

/** Groups products by base name (within the same category). Single-product groups stay as is. */
export function groupProductVariants(products: Product[]): ProductVariantGroup[] {
  const map = new Map<string, ProductVariantGroup>();
  for (const p of products) {
    const { baseName, variantLabel } = parseVariant(p.name);
    const key = `${p.category}::${baseName.toLowerCase()}`;
    const label = variantLabel || '—';
    if (!map.has(key)) {
      map.set(key, {
        baseName,
        category: p.category,
        representative: p,
        variants: [{ product: p, label }],
      });
    } else {
      const g = map.get(key)!;
      g.variants.push({ product: p, label });
      // Use the cheapest variant as the representative
      if (p.price < g.representative.price) g.representative = p;
    }
  }
  // Sort variants inside each group by numeric dose ascending
  for (const g of map.values()) {
    g.variants.sort((a, b) => {
      const na = parseFloat(a.label) || 0;
      const nb = parseFloat(b.label) || 0;
      return na - nb;
    });
  }
  return Array.from(map.values());
}

/** Returns sibling variants for a given product (same base name + category, excluding same id). */
export function findSiblingVariants(product: Product, all: Product[]): Array<{ product: Product; label: string }> {
  const { baseName } = parseVariant(product.name);
  const key = baseName.toLowerCase();
  return all
    .filter((p) => p.id !== product.id && p.category === product.category && parseVariant(p.name).baseName.toLowerCase() === key)
    .map((p) => ({ product: p, label: parseVariant(p.name).variantLabel || '—' }))
    .sort((a, b) => (parseFloat(a.label) || 0) - (parseFloat(b.label) || 0));
}
