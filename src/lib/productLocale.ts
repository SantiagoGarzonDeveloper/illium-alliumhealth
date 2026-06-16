import type { Product } from '@/store';
import type { Locale } from '@/i18n/translations';

function parseBenefits(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Normalize Firestore document into a Product (EN + optional ES fields). */
export function normalizeProductFromFirestore(id: string, raw: Record<string, unknown>): Product {
  const benefits = parseBenefits(raw.benefits);
  const benefitsEs = parseBenefits(raw.benefitsEs);
  const nameEs = raw.nameEs != null ? String(raw.nameEs).trim() : '';
  const descriptionEs = raw.descriptionEs != null ? String(raw.descriptionEs).trim() : '';
  const targetGender =
    raw.targetGender === 'male' || raw.targetGender === 'female' || raw.targetGender === 'both'
      ? raw.targetGender
      : undefined;
  return {
    id,
    name: String(raw.name ?? ''),
    nameEs: nameEs || undefined,
    description: String(raw.description ?? ''),
    descriptionEs: descriptionEs || undefined,
    price: Number(raw.price) || 0,
    // Admin-only cost; kept so the editor can recover what was saved (incl. 0).
    cost: raw.cost != null && !Number.isNaN(Number(raw.cost)) ? Number(raw.cost) : undefined,
    stock: Number(raw.stock) || 0,
    category: String(raw.category ?? ''),
    img: String(raw.img ?? ''),
    benefits: benefits.length ? benefits : undefined,
    benefitsEs: benefitsEs.length ? benefitsEs : undefined,
    protocol: raw.protocol != null ? String(raw.protocol) : undefined,
    // Quiz/protocol AI metadata — without these the dosage note never re-loads in
    // the editor and never reaches the order protocol.
    targetGender,
    dosageNote: raw.dosageNote != null && String(raw.dosageNote).trim() ? String(raw.dosageNote) : undefined,
    monthsSupplyPerVial:
      raw.monthsSupplyPerVial != null && !Number.isNaN(Number(raw.monthsSupplyPerVial))
        ? Number(raw.monthsSupplyPerVial)
        : undefined,
    discountType:
      raw.discountType === 'percent' || raw.discountType === 'fixed'
        ? raw.discountType
        : undefined,
    discountValue:
      raw.discountValue != null && !Number.isNaN(Number(raw.discountValue))
        ? Number(raw.discountValue)
        : undefined,
  };
}

export function getLocalizedProduct(product: Product, locale: Locale) {
  const benefitsEn = product.benefits ?? [];
  const benefitsEs = product.benefitsEs?.length ? product.benefitsEs : benefitsEn;
  if (locale === 'es') {
    return {
      name: product.nameEs?.trim() ? product.nameEs : product.name,
      description: product.descriptionEs?.trim() ? product.descriptionEs : product.description,
      benefits: benefitsEs,
    };
  }
  return {
    name: product.name,
    description: product.description,
    benefits: benefitsEn,
  };
}
