import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Product } from '@/store';
import { isDeadStorageUrl } from '@/lib/uploadMedia';

/** ¿El COA es un PDF? (si no, se trata como imagen). */
export function isPdfUrl(url: string): boolean {
  return /\.pdf($|[?#])/i.test(url) || /application\/pdf/i.test(url);
}

/**
 * Clave del compuesto + concentración, para que una caja «(10 vials)» y el frasco
 * individual compartan el mismo COA (es el mismo lote de laboratorio):
 *   «NAD+ (1000mg) (10 Vials)» y «NAD+ 1000mg»  → «nad+|1000mg»
 *   «GLOW (70mg) (10 vials)» y «Glow (BPC-157, TB-500 & GHK-Cu) 70MG» → «glow|70mg»
 */
function compoundKey(name: string): string {
  const clean = String(name || '')
    .toLowerCase()
    .replace(/\(\s*\d+\s*vials?\s*\)/g, ' ')
    .trim();
  const first = clean.split(/[\s(]/).filter(Boolean)[0] || '';
  const dose = clean.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|g)\b/g)?.pop()?.replace(/\s+/g, '') || '';
  return `${first}|${dose}`;
}

/** Productos del mismo compuesto y concentración (incluye el propio). */
export function sameCompoundProducts(product: Pick<Product, 'id' | 'name'>, all: Product[]): Product[] {
  const key = compoundKey(product.name);
  return all.filter((p) => p.id === product.id || compoundKey(p.name) === key);
}

/**
 * COA subido para este producto. Si el producto no lo tiene, usa el de su
 * «gemelo» (la caja al por mayor usa el del frasco individual y viceversa).
 */
export function resolveProductCoa(product: Product, all: Product[]): string | undefined {
  if (product.coaUrl) return product.coaUrl;
  return sameCompoundProducts(product, all).find((p) => p.coaUrl)?.coaUrl;
}

/** Datos del último lote registrado en Admin → Autenticidad (QR). */
export interface BatchCoa {
  lot: string;
  productName: string;
  purity: string | null;
  analysisDate: string | null;
  labName: string | null;
  methods: string | null;
  coaUrl: string | null;
}

/**
 * Busca en `authCodes` (los QR de Admin → Autenticidad) el lote más reciente de
 * estos productos que tenga datos de análisis (pureza o COA). Es lo que ya se ve
 * al escanear el QR (`/coa/:lote`), así la ficha muestra el mismo certificado.
 */
export function useBatchCoa(productIds: string[]): BatchCoa | null {
  const key = productIds.slice(0, 10).join(',');
  const [state, setState] = useState<{ key: string; batch: BatchCoa | null }>({ key: '', batch: null });
  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(',') : [];
    if (!ids.length) return;
    void (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'authCodes'), where('productId', 'in', ids), limit(300)));
        const lots = new Map<string, BatchCoa & { createdMs: number }>();
        snap.forEach((d) => {
          const x = d.data() as Record<string, unknown>;
          const lot = String(x.lot || '').trim();
          if (!lot || /^test/i.test(lot)) return; // lotes de prueba fuera
          const coaUrl = typeof x.coaUrl === 'string' && x.coaUrl && !isDeadStorageUrl(x.coaUrl) ? x.coaUrl : null;
          const purity = x.purity != null && String(x.purity).trim() ? String(x.purity).trim() : null;
          if (!coaUrl && !purity) return;
          const created = x.createdAt as { toMillis?: () => number } | undefined;
          const createdMs = typeof created?.toMillis === 'function' ? created.toMillis() : 0;
          const prev = lots.get(lot);
          if (!prev || createdMs > prev.createdMs) {
            lots.set(lot, {
              lot,
              productName: String(x.productName || ''),
              purity,
              analysisDate: (x.analysisDate as string) || null,
              labName: (x.labName as string) || null,
              methods: (x.methods as string) || null,
              coaUrl,
              createdMs,
            });
          }
        });
        // El más reciente; a igualdad, el que trae archivo de COA.
        const best = [...lots.values()].sort(
          (a, b) => b.createdMs - a.createdMs || Number(!!b.coaUrl) - Number(!!a.coaUrl),
        )[0];
        if (!cancelled && best) {
          const { createdMs: _ignored, ...rest } = best;
          void _ignored;
          setState({ key, batch: rest });
        }
      } catch (e) {
        console.warn('[coa] no se pudo leer el lote', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);
  return state.key === key ? state.batch : null;
}

/** «99.325» → «99.325%»; «99,25%» → «99,25%». */
export function formatPurity(p: string | null | undefined): string {
  const s = String(p || '').trim();
  if (!s) return '';
  return /%$/.test(s) ? s : `${s}%`;
}
