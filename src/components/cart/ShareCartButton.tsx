import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import QRCode from 'qrcode';
import { Share2, Copy as CopyIcon, X, Check, Link2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { auth, db } from '@/lib/firebase';
import { useAppStore, useToastStore } from '@/store';
import { useI18n } from '@/i18n/I18nContext';
import type { Coupon } from '@/lib/coupons';
import { applyCouponToTotal } from '@/lib/coupons';
import {
  buildShareUrl,
  buildSharedCartPayload,
  createSharedCart,
  type SharedCartReferredBy,
} from '@/lib/sharedCart';

interface Props {
  appliedCoupon: Coupon | null;
}

/**
 * Visible only for users with role admin/worker. Generates a sharable
 * checkout link that snapshots the current cart + coupon, so the recipient
 * can complete the purchase with the exact same items, quantities and price.
 */
export function ShareCartButton({ appliedCoupon }: Props) {
  const { locale } = useI18n();
  const es = locale === 'es';
  const showToast = useToastStore((s) => s.showToast);
  const cart = useAppStore((s) => s.cart);
  const cartTotal = useAppStore((s) => s.cartTotal);

  const [referredBy, setReferredBy] = useState<SharedCartReferredBy | null>(null);
  const [eligible, setEligible] = useState(false);
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setEligible(false);
        setReferredBy(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        const role = snap.exists() ? (snap.data().role as string) : '';
        const displayName = snap.exists()
          ? (snap.data().name as string) || u.displayName || u.email || ''
          : u.displayName || u.email || '';
        if (role === 'admin' || role === 'subadmin' || role === 'worker') {
          const normalizedRole: 'admin' | 'worker' = role === 'worker' ? 'worker' : 'admin';
          setReferredBy({
            uid: u.uid,
            role: normalizedRole,
            displayName,
            email: u.email || '',
          });
          setEligible(true);
        } else {
          setEligible(false);
          setReferredBy(null);
        }
      } catch {
        setEligible(false);
      }
    });
    return () => unsub();
  }, []);

  if (!eligible || cart.length === 0) return null;

  const couponDiscount = appliedCoupon
    ? applyCouponToTotal(appliedCoupon, cartTotal()).discountAmount
    : 0;

  const handleGenerate = async () => {
    if (!referredBy) return;
    setGenerating(true);
    setShareUrl('');
    setQrDataUrl('');
    try {
      const payload = buildSharedCartPayload({
        cart,
        appliedCoupon,
        couponDiscountAmount: couponDiscount,
        referredBy,
      });
      const id = await createSharedCart(payload);
      const url = buildShareUrl(id);
      setShareUrl(url);
      try {
        const qr = await QRCode.toDataURL(url, { width: 256, margin: 1 });
        setQrDataUrl(qr);
      } catch {
        /* QR is optional */
      }
    } catch (e) {
      console.error('Could not create shared cart', e);
      showToast(es ? 'No se pudo generar el link' : 'Could not generate link');
      setOpen(false);
    } finally {
      setGenerating(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    setCopied(false);
    void handleGenerate();
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      showToast(es ? '¡Link copiado!' : 'Link copied!');
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast(es ? 'No se pudo copiar' : 'Could not copy');
    }
  };

  const handleNativeShare = async () => {
    if (!shareUrl || typeof navigator === 'undefined' || !('share' in navigator)) return;
    try {
      await navigator.share({
        title: es ? 'Carrito Illium' : 'Illium Cart',
        text: es
          ? 'Te comparto este carrito listo para comprar en Illium.'
          : 'Here is a cart ready to checkout at Illium.',
        url: shareUrl,
      });
    } catch {
      /* user cancelled */
    }
  };

  const handleWhatsapp = () => {
    if (!shareUrl) return;
    const text = encodeURIComponent(
      es
        ? `Te comparto este carrito listo para comprar en Illium: ${shareUrl}`
        : `Here is a cart ready to checkout at Illium: ${shareUrl}`,
    );
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <Button
        type="button"
        onClick={handleOpen}
        className="w-full mt-3 bg-slate-800 hover:bg-slate-700 text-white rounded-full h-11 text-sm font-bold ring-1 ring-brand-400/40"
      >
        <Share2 className="h-4 w-4 mr-2" />
        {es ? 'Compartir carrito' : 'Share cart'}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-full text-slate-500 hover:text-white hover:bg-slate-800"
              aria-label={es ? 'Cerrar' : 'Close'}
            >
              <X className="h-4 w-4" />
            </button>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-400 mb-1">
              {referredBy?.role === 'admin' ? 'ADMIN' : 'PARTNER'}
            </p>
            <h2 className="text-xl font-bold text-white tracking-tight mb-1">
              {es ? 'Compartir este carrito' : 'Share this cart'}
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              {es
                ? `Quien abra el link verá los mismos productos, cantidades, cupón y precio ($${(cartTotal() - couponDiscount).toFixed(2)}). La venta queda atribuida a ${referredBy?.displayName}.`
                : `Whoever opens the link sees the same items, quantities, coupon and price ($${(cartTotal() - couponDiscount).toFixed(2)}). Sale is attributed to ${referredBy?.displayName}.`}
            </p>

            {generating && (
              <div className="py-8 text-center text-sm text-slate-400">
                {es ? 'Generando link…' : 'Generating link…'}
              </div>
            )}

            {!generating && shareUrl && (
              <>
                <div className="flex items-center gap-2 bg-slate-950/70 border border-slate-700 rounded-xl p-3 mb-4">
                  <Link2 className="h-4 w-4 text-brand-400 shrink-0" />
                  <input
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 bg-transparent text-xs text-white font-mono outline-none truncate"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-500 hover:bg-brand-400 px-3 py-1.5 text-[11px] font-bold text-white shrink-0 transition-colors"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <CopyIcon className="h-3 w-3" />}
                    {copied ? (es ? 'Copiado' : 'Copied') : es ? 'Copiar' : 'Copy'}
                  </button>
                </div>

                {qrDataUrl && (
                  <div className="flex justify-center mb-4">
                    <div className="rounded-2xl bg-white p-3">
                      <img src={qrDataUrl} alt="QR" className="h-40 w-40" />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    onClick={handleWhatsapp}
                    className="bg-emerald-500 hover:bg-emerald-400 text-white rounded-full h-10 text-xs font-bold"
                  >
                    <MessageCircle className="h-4 w-4 mr-1.5" /> WhatsApp
                  </Button>
                  {typeof navigator !== 'undefined' && 'share' in navigator ? (
                    <Button
                      type="button"
                      onClick={handleNativeShare}
                      className="bg-slate-800 hover:bg-slate-700 text-white rounded-full h-10 text-xs font-bold ring-1 ring-slate-700"
                    >
                      <Share2 className="h-4 w-4 mr-1.5" />
                      {es ? 'Más' : 'More'}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleCopy}
                      className="bg-slate-800 hover:bg-slate-700 text-white rounded-full h-10 text-xs font-bold ring-1 ring-slate-700"
                    >
                      <CopyIcon className="h-4 w-4 mr-1.5" />
                      {es ? 'Copiar' : 'Copy'}
                    </Button>
                  )}
                </div>

                <p className="mt-4 text-[10px] text-slate-500 text-center">
                  {es
                    ? 'Expira en 7 días o cuando el cliente complete la compra.'
                    : 'Expires in 7 days or once the customer completes the order.'}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
