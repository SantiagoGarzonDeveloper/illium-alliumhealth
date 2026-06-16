import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import { useAppStore, useToastStore, type CartItem, type Product } from '@/store';
import { useI18n } from '@/i18n/I18nContext';
import { bumpSharedCartOpen, loadSharedCart } from '@/lib/sharedCart';

/**
 * Route: /c/:id
 * Hydrates the local cart store with the snapshot items + coupon from a
 * shared cart link, then forwards the visitor to /cart so they can review
 * and proceed to checkout. The frozen referral attribution stays in
 * `sharedFrom` until the order is placed (then it is cleared on clearCart).
 */
export function SharedCartLoader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { locale } = useI18n();
  const es = locale === 'es';
  const showToast = useToastStore((s) => s.showToast);
  const products = useAppStore((s) => s.products);
  const hydrateFromShared = useAppStore((s) => s.hydrateFromShared);

  const [error, setError] = useState<'missing' | 'expired' | 'used' | null>(null);

  useEffect(() => {
    if (!id) {
      setError('missing');
      return;
    }
    let cancelled = false;
    void (async () => {
      const shared = await loadSharedCart(id);
      if (cancelled) return;
      if (!shared) {
        setError('expired');
        return;
      }
      if (shared.status === 'used') {
        setError('used');
        return;
      }
      // Map shared snapshot to CartItem[] — prefer the live product (so name/img
      // stay current) but always trust the snapshot price + quantity.
      const productById = new Map<string, Product>(products.map((p) => [p.id, p]));
      const items: CartItem[] = shared.items
        .map((it) => {
          const live = productById.get(it.productId);
          if (!live) {
            // Fall back to a minimal product if the live record vanished.
            return {
              product: {
                id: it.productId,
                name: it.name,
                description: '',
                price: it.unitPrice,
                stock: 999,
                category: '',
                img: it.img || '',
                discountType: it.discountType ?? undefined,
                discountValue: it.discountValue || 0,
              } as Product,
              quantity: it.quantity,
            };
          }
          // Force the live product to honor the snapshotted price by overriding
          // its discount fields so getEffectivePrice resolves to the saved price.
          const priceFrozen: Product = {
            ...live,
            price: it.originalPrice,
            discountType: it.discountType ?? undefined,
            discountValue: it.discountValue || 0,
          };
          return { product: priceFrozen, quantity: it.quantity };
        })
        .filter((ci) => ci.quantity > 0);

      if (items.length === 0) {
        setError('expired');
        return;
      }

      hydrateFromShared({
        items,
        meta: {
          shareId: shared.id,
          referredBy: shared.referredBy,
          coupon: shared.coupon,
          snapshotSubtotal: shared.subtotal,
          snapshotTotal: shared.total,
          expiresAtMs: shared.expiresAtMs,
          loadedAtMs: Date.now(),
        },
      });
      void bumpSharedCartOpen(shared.id);
      showToast(
        es
          ? `Carrito compartido por ${shared.referredBy.displayName}`
          : `Cart shared by ${shared.referredBy.displayName}`,
      );
      navigate('/cart', { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [id, products, hydrateFromShared, navigate, showToast, es]);

  if (error) {
    const msg =
      error === 'used'
        ? es
          ? 'Este carrito compartido ya fue utilizado.'
          : 'This shared cart has already been used.'
        : es
          ? 'Este link expiró o no es válido.'
          : 'This link has expired or is not valid.';
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="h-16 w-16 rounded-full bg-amber-500/10 ring-1 ring-amber-500/30 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-7 w-7 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {es ? 'Link no disponible' : 'Link unavailable'}
          </h1>
          <p className="text-sm text-slate-400 mb-6">{msg}</p>
          <button
            type="button"
            onClick={() => navigate('/shop', { replace: true })}
            className="rounded-full bg-brand-500 hover:bg-brand-400 px-6 py-2.5 text-sm font-bold text-white"
          >
            {es ? 'Ir a la tienda' : 'Go to shop'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
      <div className="text-center">
        <ShieldCheck className="h-10 w-10 text-brand-400 mx-auto mb-4 animate-pulse" />
        <p className="text-sm text-slate-400">
          {es ? 'Preparando tu carrito…' : 'Loading your cart…'}
        </p>
      </div>
    </div>
  );
}
