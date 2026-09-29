/**
 * Imagen que se MUESTRA de un producto (no cambia nada en la base de datos).
 * · Si el producto tiene foto válida → esa.
 * · Si no (p. ej. los paquetes al por mayor «(10 vials)» que se crearon sin foto)
 *   → la foto del frasco individual del mismo compuesto.
 * · Si tampoco hay → la tarjeta genérica de ILLIUM.
 */
import type { Product } from '@/store';
import { isDeadStorageUrl } from '@/lib/uploadMedia';

export const GENERIC_PRODUCT_IMG = '/product-images/illium-generico.png';

const base = (name: string) => String(name || '').split('(')[0].trim().toLowerCase();
const valid = (img?: string) => !!img && !!img.trim() && !isDeadStorageUrl(img);

export function displayImage(p: Pick<Product, 'img' | 'name' | 'id'>, all: Pick<Product, 'img' | 'name' | 'id'>[] = []): string {
  if (valid(p.img)) return p.img;
  const b = base(p.name);
  if (b) {
    const twin = all.find((o) => o.id !== p.id && valid(o.img) && String(o.name || '').trim().toLowerCase().startsWith(b));
    if (twin) return twin.img;
  }
  return GENERIC_PRODUCT_IMG;
}
