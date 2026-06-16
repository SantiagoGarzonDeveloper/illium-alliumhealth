import { useState, useEffect } from 'react';
import { useAppStore, useToastStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Minus, Plus, Trash2, CheckCircle2, ArrowLeft, ShieldCheck, Lock, AlertCircle, Check, Copy, Tag, Truck } from 'lucide-react';
import { CountryPhoneInput } from '@/components/ui/country-phone-input';
import { Link } from 'react-router-dom';
import { auth, db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { useI18n } from '@/i18n/I18nContext';
import { getLocalizedProduct } from '@/lib/productLocale';
import { getEffectivePrice } from '@/lib/pricing';
import { buildNewOrderCommissionFields } from '@/lib/orderCommission';
import { validateEmailRemote, emailErrorMessage, validatePhone, phoneErrorMessage } from '@/lib/validation';
import { findCouponByCode, validateCoupon, applyCouponToTotal, incrementCouponUsage, type Coupon } from '@/lib/coupons';
import { ShareCartButton } from '@/components/cart/ShareCartButton';
import { markSharedCartUsed } from '@/lib/sharedCart';
import { StripeCardForm } from '@/components/cart/StripeCardForm';

export function Cart() {
  const { t, locale } = useI18n();
  const showToast = useToastStore((s) => s.showToast);
  const { cart, updateQuantity, removeFromCart, cartTotal, clearCart } = useAppStore();
  const products = useAppStore((s) => s.products);
  const sharedFrom = useAppStore((s) => s.sharedFrom);
  const subtotal = cartTotal();
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const couponDiscount = appliedCoupon ? applyCouponToTotal(appliedCoupon, subtotal).discountAmount : 0;
  /** Shipping method picked by the customer at checkout. Standard is the default.
   *  'pickup' = the customer comes to pick up the products in person (no shipping cost). */
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'express' | 'pickup'>('standard');
  /** Admin-configurable threshold above which Standard shipping is free. 0 = disabled. */
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number>(0);
  const subtotalAfterCoupon = Math.max(0, subtotal - couponDiscount);
  /** Standard shipping is FREE when the subtotal-after-coupon exceeds the configured threshold. */
  const freeShipApplies = freeShippingThreshold > 0 && subtotalAfterCoupon >= freeShippingThreshold;
  const shippingCost = shippingMethod === 'pickup' ? 0 : shippingMethod === 'express' ? 40 : (freeShipApplies ? 0 : 12);
  const total = subtotalAfterCoupon + shippingCost;

  /** Cart lines that exceed available live stock (out of stock or over the limit). */
  const stockIssues = cart
    .map((item) => {
      const live = products.find((p) => p.id === item.product.id);
      if (!live) return null; // catalog not loaded / product missing — don't flag
      const stock = Number(live.stock) || 0;
      const name = getLocalizedProduct(item.product, locale).name;
      if (stock <= 0) return { id: item.product.id, name, stock, kind: 'out' as const };
      if (item.quantity > stock) return { id: item.product.id, name, stock, kind: 'over' as const };
      return null;
    })
    .filter((x): x is { id: string; name: string; stock: number; kind: 'out' | 'over' } => x !== null);
  const hasStockIssue = stockIssues.length > 0;

  const handleApplyCoupon = async () => {
    setCouponError('');
    const code = couponInput.trim().toUpperCase();
    if (!code) { setCouponError(locale === 'es' ? 'Ingresa un código' : 'Enter a code'); return; }
    setCouponLoading(true);
    try {
      const c = await findCouponByCode(code);
      if (!c) {
        setCouponError(locale === 'es' ? 'Código no encontrado' : 'Code not found');
        setAppliedCoupon(null);
        return;
      }
      const v = validateCoupon(c);
      if (!v.ok) {
        const map: Record<string, string> = locale === 'es'
          ? { inactive: 'Cupón inactivo', expired: 'Cupón expirado', maxed: 'Cupón ya usado al máximo' }
          : { inactive: 'Coupon inactive', expired: 'Coupon expired', maxed: 'Coupon usage limit reached' };
        setCouponError(map[v.reason] || 'Invalid');
        setAppliedCoupon(null);
        return;
      }
      setAppliedCoupon(c);
      showToast(locale === 'es' ? '¡Cupón aplicado!' : 'Coupon applied!');
    } catch (e) {
      console.error(e);
      setCouponError(locale === 'es' ? 'Error al validar' : 'Validation error');
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError('');
  };

  // If the visitor arrived via a shared cart link with a coupon snapshot,
  // auto-apply that coupon (silently) so the displayed total matches what
  // the worker/admin promised when they shared the link.
  useEffect(() => {
    if (!sharedFrom?.coupon || appliedCoupon) return;
    let cancelled = false;
    void (async () => {
      try {
        const c = await findCouponByCode(sharedFrom.coupon!.code);
        if (cancelled || !c) return;
        const v = validateCoupon(c);
        if (!v.ok) return;
        setAppliedCoupon(c);
        setCouponInput(c.code);
      } catch {
        /* silent — user can apply manually */
      }
    })();
    return () => { cancelled = true; };
  }, [sharedFrom, appliedCoupon]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  /** Whether the success screen should show Zelle instructions or Stripe-paid confirmation. */
  const [successPaymentMode, setSuccessPaymentMode] = useState<'zelle' | 'stripe'>('zelle');
  const [loading, setLoading] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string>('');

  const CHECKOUT_DRAFT_KEY = 'illium_checkout_draft_v1';
  const defaultCheckout = {
    name: '',
    email: '',
    address: '',
    city: '',
    zip: '',
    whatsappCountryCode: '+1',
    whatsappLocalNumber: '',
  };
  const [checkoutData, setCheckoutData] = useState(() => {
    if (typeof window === 'undefined') return defaultCheckout;
    try {
      const raw = window.localStorage.getItem(CHECKOUT_DRAFT_KEY);
      if (!raw) return defaultCheckout;
      const parsed = JSON.parse(raw);
      return { ...defaultCheckout, ...parsed };
    } catch {
      return defaultCheckout;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(checkoutData));
    } catch {
      /* ignore quota/serialization errors */
    }
  }, [checkoutData]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [paymentMethods, setPaymentMethods] = useState('');
  /** Admin-configurable Zelle branding (with sensible defaults for current setup). */
  const [zelleQrUrl, setZelleQrUrl] = useState<string>('/zelle-qr.png');
  const [zelleNumber, setZelleNumber] = useState<string>('(786) 948-0879');
  /** Stripe (card payments) — pulled live from settings; null = not configured. */
  const [stripePublishableKey, setStripePublishableKey] = useState<string | null>(null);
  const [cardPaymentsEnabled, setCardPaymentsEnabled] = useState(false);
  const [orderErrorOpen, setOrderErrorOpen] = useState(false);
  const [orderErrorMsg, setOrderErrorMsg] = useState('');
  /** Payment method picked in the checkout. Default to Zelle (legacy behavior). */
  const [payMethod, setPayMethod] = useState<'zelle' | 'card'>('zelle');

  useEffect(() => {
    const fetchSettings = async () => {
      const docSnap = await getDoc(doc(db, 'settings', 'general'));
      if (!docSnap.exists()) {
        setPaymentMethods(t('cart.defaultPaymentHint'));
        return;
      }
      const data = docSnap.data();
      // Pull admin-configurable Zelle branding + Stripe keys.
      if (typeof data.zelleQrUrl === 'string' && data.zelleQrUrl.trim()) {
        setZelleQrUrl(data.zelleQrUrl.trim());
      }
      if (typeof data.zelleNumber === 'string' && data.zelleNumber.trim()) {
        setZelleNumber(data.zelleNumber.trim());
      }
      if (typeof data.stripePublishableKey === 'string' && data.stripePublishableKey.trim().startsWith('pk_')) {
        setStripePublishableKey(data.stripePublishableKey.trim());
      }
      setCardPaymentsEnabled(Boolean(data.cardPaymentsEnabled));
      const thr = Number(data.freeShippingThreshold);
      if (Number.isFinite(thr) && thr > 0) setFreeShippingThreshold(thr);
      const esBlock =
        typeof data.paymentMethodsEs === 'string' && data.paymentMethodsEs.trim() ? data.paymentMethodsEs : '';
      if (locale === 'es' && esBlock) {
        setPaymentMethods(esBlock);
        return;
      }
      if (data.paymentMethods) {
        setPaymentMethods(data.paymentMethods as string);
      } else {
        setPaymentMethods(t('cart.defaultPaymentHint'));
      }
    };
    void fetchSettings();
  }, [t, locale]);

  /**
   * Build the order document. Used by both the Zelle flow (status='pending')
   * and the Stripe flow (status='paid', after card capture).
   */
  const buildOrderDoc = async (paymentMode: 'zelle' | 'stripe', stripeIntentId?: string) => {
    // Recompute totals fresh here — defends against React closure capturing
    // a stale value when this runs from inside a Stripe Elements callback.
    const freshSubtotal = cart.reduce(
      (acc, ci) => acc + getEffectivePrice(ci.product).finalPrice * ci.quantity,
      0,
    );
    const freshCouponDiscount = appliedCoupon
      ? applyCouponToTotal(appliedCoupon, freshSubtotal).discountAmount
      : 0;
    const freshSubAfterCoupon = Math.max(0, freshSubtotal - freshCouponDiscount);
    const freshFreeShip = freeShippingThreshold > 0 && freshSubAfterCoupon >= freeShippingThreshold;
    const freshShippingCost = shippingMethod === 'pickup' ? 0 : shippingMethod === 'express' ? 40 : (freshFreeShip ? 0 : 12);
    const freshTotal = freshSubAfterCoupon + freshShippingCost;

    const cc = checkoutData.whatsappCountryCode.trim();
    const waLocal = checkoutData.whatsappLocalNumber.replace(/\D/g, '');
    const ccNorm = cc.startsWith('+') ? cc : `+${cc.replace(/\D/g, '')}`;
    let referrerId = localStorage.getItem('referrerId');
    if (referrerId) {
      try {
        const refSnap = await getDoc(doc(db, 'users', referrerId));
        if (refSnap.exists()) {
          const vs = String(refSnap.data().vendorStatus || 'pending_review');
          if (vs === 'blocked' || vs === 'inactive') referrerId = null;
        }
      } catch { /* ignore */ }
    }
    let uplineReferrerId: string | null = null;
    if (referrerId) {
      const metaSnap = await getDoc(doc(db, 'publicReferralMeta', referrerId));
      if (metaSnap.exists()) {
        const ancestors = (metaSnap.data().referralAncestors as string[]) || [];
        uplineReferrerId = ancestors.length > 0 ? ancestors[0] : null;
      }
    }
    const refForComm = referrerId || null;
    const comm = await buildNewOrderCommissionFields(freshTotal, refForComm, uplineReferrerId, cart);
    return {
      customer: { ...checkoutData, whatsappCountryCode: ccNorm, whatsappLocalNumber: waLocal },
      // Also remember the logged-in user's uid so /orders shows it even if the
      // typed email differs from the auth email (legacy + Stripe flows).
      customerUid: (typeof window !== 'undefined' && auth.currentUser?.uid) || null,
      checkoutLocale: locale,
      ...comm,
      items: cart.map((item) => {
        const { name } = getLocalizedProduct(item.product, locale);
        const ie = getEffectivePrice(item.product);
        return {
          productId: item.product.id,
          name,
          price: ie.finalPrice,
          originalPrice: ie.originalPrice,
          discountType: ie.hasDiscount ? ie.discountType ?? null : null,
          discountValue: ie.hasDiscount ? ie.discountValue ?? 0 : 0,
          quantity: item.quantity,
        };
      }),
      subtotal: freshSubtotal,
      couponCode: appliedCoupon?.code || null,
      couponDiscount: freshCouponDiscount,
      shippingMethod,
      shippingCost: freshShippingCost,
      shippingEta: shippingMethod === 'pickup' ? 'pickup' : shippingMethod === 'express' ? '24-48h' : '1-3 days',
      total: freshTotal,
      status: paymentMode === 'stripe' ? 'paid' : 'pending',
      fulfillmentStatus: 'unfulfilled',
      paymentMethod: paymentMode,
      stripePaymentIntentId: stripeIntentId || null,
      referrerId: refForComm,
      uplineReferrerId,
      sharedFromShareId: sharedFrom?.shareId || null,
      referredBy: sharedFrom?.referredBy || null,
      createdAt: serverTimestamp(),
    };
  };

  /** Common post-order-creation cleanup. */
  const finishOrder = (orderId: string) => {
    setPlacedOrderId(orderId);
    if (appliedCoupon) { void incrementCouponUsage(appliedCoupon.id); }
    if (sharedFrom?.shareId) { void markSharedCartUsed(sharedFrom.shareId, orderId); }
    clearCart();
    try { window.localStorage.removeItem(CHECKOUT_DRAFT_KEY); } catch { /* ignore */ }
    setIsSuccess(true);
    showToast(t('cart.orderSuccess'));
  };

  /**
   * Validate every cart line against the latest live stock before charging/placing.
   * Returns an error message (and toasts it) when something is out of stock, else null.
   */
  const validateStockOrToast = (): string | null => {
    const es = locale === 'es';
    for (const item of cart) {
      const live = products.find((p) => p.id === item.product.id);
      // Fail-open if the catalog hasn't loaded yet / product not found — never block
      // a legitimate checkout because of a loading race.
      if (!live) continue;
      const stock = Number(live.stock) || 0;
      if (stock <= 0) {
        const name = getLocalizedProduct(item.product, locale).name;
        const msg = es ? `"${name}" está agotado. Quítalo del carrito para continuar.` : `"${name}" is out of stock. Remove it to continue.`;
        showToast(msg);
        return msg;
      }
      if (item.quantity > stock) {
        const name = getLocalizedProduct(item.product, locale).name;
        const msg = es
          ? `Solo quedan ${stock} de "${name}". Ajusta la cantidad.`
          : `Only ${stock} of "${name}" left. Adjust the quantity.`;
        showToast(msg);
        return msg;
      }
    }
    return null;
  };

  /** Called by StripeCardForm when the card is successfully charged. */
  const handleStripeSuccess = async (args: { intentId: string }) => {
    // Final stock guard before writing the order (stock may have changed mid-payment).
    if (validateStockOrToast()) return;
    try {
      const order = await buildOrderDoc('stripe', args.intentId);
      const ref = await addDoc(collection(db, 'orders'), order);
      setSuccessPaymentMode('stripe');
      finishOrder(ref.id);
    } catch (error) {
      console.error('Stripe success → order create failed:', error);
      setOrderErrorMsg(error instanceof Error ? error.message : t('cart.orderErrorGeneric'));
      setOrderErrorOpen(true);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    // Block the order entirely if anything in the cart is out of/over stock.
    if (validateStockOrToast()) return;

    const errs: Record<string, string> = {};
    const es = locale === 'es';
    if (!checkoutData.name.trim() || checkoutData.name.trim().length < 2) {
      errs.name = es ? 'Nombre requerido' : 'Name required';
    }
    // Shipping address is only required when the order is actually shipped.
    // For in-person pickup we don't need a delivery address.
    if (shippingMethod !== 'pickup') {
      if (!checkoutData.address.trim() || checkoutData.address.trim().length < 5) {
        errs.address = es ? 'Dirección requerida' : 'Address required';
      }
      if (!checkoutData.city.trim()) {
        errs.city = es ? 'Ciudad requerida' : 'City required';
      }
      if (!checkoutData.zip.trim() || !/^[A-Za-z0-9\s-]{3,10}$/.test(checkoutData.zip.trim())) {
        errs.zip = es ? 'Código postal no válido' : 'Invalid postal code';
      }
    }

    // Phone via libphonenumber
    const phoneCheck = validatePhone(checkoutData.whatsappCountryCode, checkoutData.whatsappLocalNumber);
    if (!phoneCheck.valid) {
      errs.phone = phoneErrorMessage(phoneCheck.reason, locale);
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      showToast(Object.values(errs)[0]);
      return;
    }

    // Email via Cloud Function (MX lookup)
    setLoading(true);
    const emailCheck = await validateEmailRemote(checkoutData.email);
    if (!emailCheck.valid) {
      const msg = emailErrorMessage(emailCheck, locale);
      setFieldErrors({ email: msg });
      showToast(msg);
      setLoading(false);
      return;
    }
    setFieldErrors({});
    const cc = checkoutData.whatsappCountryCode.trim();
    const waLocal = checkoutData.whatsappLocalNumber.replace(/\D/g, '');
    const ccNorm = cc.startsWith('+') ? cc : `+${cc.replace(/\D/g, '')}`;
    try {
      let referrerId = localStorage.getItem('referrerId');
      // Check if referrer's account is active — if blocked/inactive, ignore the referral
      if (referrerId) {
        try {
          const refSnap = await getDoc(doc(db, 'users', referrerId));
          if (refSnap.exists()) {
            const vs = String(refSnap.data().vendorStatus || 'pending_review');
            if (vs === 'blocked' || vs === 'inactive') {
              referrerId = null; // Don't attribute commission
            }
          }
        } catch { /* ignore, proceed with referrer */ }
      }
      let uplineReferrerId: string | null = null;
      if (referrerId) {
        const metaSnap = await getDoc(doc(db, 'publicReferralMeta', referrerId));
        if (metaSnap.exists()) {
          const ancestors = (metaSnap.data().referralAncestors as string[]) || [];
          uplineReferrerId = ancestors.length > 0 ? ancestors[0] : null;
        }
      }
      const refForComm = referrerId || null;
      const comm = await buildNewOrderCommissionFields(total, refForComm, uplineReferrerId, cart);
      const order = {
        customer: {
          ...checkoutData,
          whatsappCountryCode: ccNorm,
          whatsappLocalNumber: waLocal,
        },
        checkoutLocale: locale,
        ...comm,
        items: cart.map((item) => {
          const { name } = getLocalizedProduct(item.product, locale);
          const ie = getEffectivePrice(item.product);
          return {
            productId: item.product.id,
            name,
            price: ie.finalPrice,
            originalPrice: ie.originalPrice,
            discountType: ie.hasDiscount ? ie.discountType ?? null : null,
            discountValue: ie.hasDiscount ? ie.discountValue ?? 0 : 0,
            quantity: item.quantity,
          };
        }),
        subtotal,
        couponCode: appliedCoupon?.code || null,
        couponDiscount: couponDiscount || 0,
        shippingMethod,
        shippingCost,
        shippingEta: shippingMethod === 'pickup' ? 'pickup' : shippingMethod === 'express' ? '24-48h' : '1-3 days',
        total,
        status: 'pending',
        fulfillmentStatus: 'unfulfilled',
        referrerId: refForComm,
        uplineReferrerId,
        // Shared-cart attribution: who built the cart link (admin/worker)
        sharedFromShareId: sharedFrom?.shareId || null,
        referredBy: sharedFrom?.referredBy || null,
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'orders'), order);
      setPlacedOrderId(ref.id);
      if (appliedCoupon) { void incrementCouponUsage(appliedCoupon.id); }
      if (sharedFrom?.shareId) { void markSharedCartUsed(sharedFrom.shareId, ref.id); }
      clearCart();
      try { window.localStorage.removeItem(CHECKOUT_DRAFT_KEY); } catch { /* ignore */ }
      setSuccessPaymentMode('zelle');
      setIsSuccess(true);
      showToast(t('cart.orderSuccess'));
    } catch (error) {
      console.error('Error placing order:', error);
      setOrderErrorMsg(error instanceof Error ? error.message : t('cart.orderErrorGeneric'));
      setOrderErrorOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Success
  if (isSuccess) {
    const es = locale === 'es';
    const paidByCard = successPaymentMode === 'stripe';
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 py-10">
        <div className="text-center max-w-lg animate-scale-in">
          <div className="flex justify-center mb-8">
            <div className="h-20 w-20 rounded-full bg-brand-500/15 ring-4 ring-brand-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-brand-400" />
            </div>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-400 mb-2">ILLIUM</p>
          <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">
            {paidByCard
              ? (es ? '¡Pago confirmado!' : 'Payment confirmed!')
              : t('cart.orderReceived')}
          </h1>
          <p className="text-slate-400 mb-5">
            {paidByCard
              ? (es
                  ? '¡Gracias por tu compra! Recibimos tu pago y te enviamos un correo de confirmación. Te avisaremos cuando tu pedido salga con su número de rastreo.'
                  : 'Thanks for your purchase! We received your payment and sent a confirmation email. We will let you know when your order ships with its tracking number.')
              : t('cart.orderReceivedBody')}
          </p>
          {placedOrderId && (
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 border border-brand-500/30 px-4 py-2 mb-8">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-400">
                {locale === 'es' ? 'Tu pedido' : 'Your order'}
              </span>
              <span className="font-mono font-bold text-white text-sm">#{placedOrderId.slice(0, 8).toUpperCase()}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(placedOrderId);
                  showToast(locale === 'es' ? '¡ID copiado!' : 'ID copied!');
                }}
                className="text-brand-400 hover:text-brand-300 text-xs underline"
              >
                {locale === 'es' ? 'Copiar' : 'Copy'}
              </button>
            </div>
          )}
          {!paidByCard && (
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-800 p-6 text-left mb-6">
            <h3 className="font-bold mb-4 text-white flex items-center gap-2">
              <Lock className="h-4 w-4 text-[#b388ff]" />
              {locale === 'es' ? 'Paga con Zelle' : 'Pay with Zelle'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-4 items-center">
              <div className="mx-auto sm:mx-0 h-32 w-32 rounded-xl bg-white p-2 flex items-center justify-center overflow-hidden">
                <img
                  src={zelleQrUrl}
                  alt="Zelle QR"
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                    const sib = (e.currentTarget.nextElementSibling as HTMLElement | null);
                    if (sib) sib.style.display = 'flex';
                  }}
                />
                <div className="hidden h-full w-full items-center justify-center text-center text-[10px] font-semibold text-slate-500 px-2">
                  {locale === 'es' ? 'QR Zelle' : 'Zelle QR'}
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-xs uppercase tracking-[0.25em] text-[#b388ff] font-bold">Zelle</p>
                <p className="text-slate-300">
                  {locale === 'es'
                    ? 'Escanea el QR o envía el pago al número:'
                    : 'Scan the QR or send payment to:'}
                </p>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold text-white tracking-wider">{zelleNumber}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(zelleNumber);
                      showToast(locale === 'es' ? '¡Número copiado!' : 'Number copied!');
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition-colors"
                  >
                    {locale === 'es' ? 'Copiar' : 'Copy'}
                  </button>
                </div>
                {placedOrderId && (
                  <p className="text-xs text-slate-400">
                    {locale === 'es' ? 'Memo: pedido #' : 'Memo: order #'}
                    <span className="font-mono font-bold text-white">{placedOrderId.slice(0, 8).toUpperCase()}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
          )}
          {!paidByCard && (
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-800 p-6 text-left mb-8 whitespace-pre-wrap text-sm text-slate-300">
            <h3 className="font-bold mb-3 text-white flex items-center gap-2">
              <Lock className="h-4 w-4 text-brand-400" />
              {t('cart.paymentInstructions')}
            </h3>
            {paymentMethods}
          </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/orders">
            <Button variant="outline" className="rounded-full h-12 px-8 text-sm font-bold border-brand-500/40 text-brand-300 hover:bg-brand-500/10 w-full">
              {es ? 'Ver mis pedidos' : 'View my orders'}
            </Button>
          </Link>
          <Link to="/shop">
            <Button className="btn-premium bg-gradient-to-r from-brand-500 to-brand-400 text-white hover:from-brand-400 hover:to-brand-300 rounded-full h-12 px-10 text-sm font-bold shadow-xl shadow-brand-500/30 w-full">
              {t('cart.continueShopping')}
            </Button>
          </Link>
          </div>
        </div>
      </div>
    );
  }

  // Empty cart
  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
        <div className="text-center max-w-lg animate-fade-in">
          <div className="h-20 w-20 rounded-full bg-brand-500/10 ring-1 ring-brand-500/20 flex items-center justify-center mx-auto mb-8">
            <ShieldCheck className="w-8 h-8 text-brand-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">{t('cart.emptyTitle')}</h1>
          <p className="text-slate-400 mb-8">{t('cart.emptyBody')}</p>
          <Link to="/shop">
            <Button className="btn-premium bg-gradient-to-r from-brand-500 to-brand-400 text-white hover:from-brand-400 hover:to-brand-300 rounded-full h-12 px-10 text-sm font-bold shadow-xl shadow-brand-500/30">
              {t('cart.startShopping')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Checkout form
  if (isCheckingOut) {
    const es = locale === 'es';
    const clearError = (field: string) => {
      if (fieldErrors[field]) {
        const next = { ...fieldErrors };
        delete next[field];
        setFieldErrors(next);
      }
    };
    const errClass = (field: string) =>
      fieldErrors[field] ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : '';

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="container mx-auto px-4 py-8 md:py-12 max-w-3xl">
          <Dialog open={orderErrorOpen} onOpenChange={setOrderErrorOpen} title={t('cart.orderErrorTitle')} description={orderErrorMsg} />
          <button
            type="button"
            onClick={() => setIsCheckingOut(false)}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> {t('cart.backToCart')}
          </button>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-400 mb-2">ILLIUM</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-8 tracking-tight">
            {es ? 'Completa tu pedido' : 'Complete your order'}
          </h1>

          {/* Order summary card — shows items */}
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-800 p-5 md:p-6 mb-6">
            <h2 className="text-sm font-bold text-white uppercase tracking-[0.2em] mb-4">
              {es ? 'Resumen de tu pedido' : 'Your order summary'}
            </h2>
            <ul className="space-y-3 mb-4">
              {cart.map((item) => {
                const lp = getLocalizedProduct(item.product, locale);
                const ie = getEffectivePrice(item.product);
                return (
                  <li key={item.product.id} className="flex items-center gap-3">
                    <div className="h-14 w-14 rounded-lg overflow-hidden bg-black shrink-0">
                      <img src={item.product.img} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{lp.name}</p>
                      <p className="text-xs text-slate-500">
                        × {item.quantity} ·{' '}
                        <span className="text-brand-300 font-semibold">
                          {locale === 'es'
                            ? `${item.quantity} ${item.quantity === 1 ? 'mes' : 'meses'} de suministro`
                            : `${item.quantity}-${item.quantity === 1 ? 'month' : 'month'} supply`}
                        </span>
                        {ie.hasDiscount && (
                          <span className="ml-2 text-emerald-400 font-semibold">-{ie.percentOff}%</span>
                        )}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-white shrink-0">${(ie.finalPrice * item.quantity).toFixed(2)}</p>
                  </li>
                );
              })}
            </ul>
            <div className="pt-4 border-t border-slate-700 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{t('cart.subtotal')}</span>
                <span className="text-slate-200">${subtotal.toFixed(2)}</span>
              </div>
              {couponDiscount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-400">
                    {es ? 'Cupón' : 'Coupon'} {appliedCoupon ? `(${appliedCoupon.code})` : ''}
                  </span>
                  <span className="text-emerald-400 font-semibold">−${couponDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">
                  {es ? 'Envío' : 'Shipping'} <span className="text-[10px] text-slate-500">({shippingMethod === 'pickup' ? (es ? 'recoge en persona' : 'in-person pickup') : shippingMethod === 'express' ? '24–48h' : (es ? '1–3 días' : '1–3 days')})</span>
                </span>
                <span className="text-slate-200">${shippingCost.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-700/60">
                <span className="text-sm text-white font-semibold">{t('cart.total')}</span>
                <span className="text-2xl font-black text-white">${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Shipping method selector */}
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-800 p-5 md:p-6 mb-6">
            <h2 className="text-sm font-bold text-white uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
              <Truck className="h-4 w-4 text-brand-400" />
              {es ? 'Tipo de envío' : 'Shipping method'}
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              {es
                ? 'Elige cómo quieres recibir tu pedido.'
                : 'Choose how you want to get your order.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setShippingMethod('standard')}
                className={`text-left rounded-xl p-4 border-2 transition ${
                  shippingMethod === 'standard'
                    ? 'border-brand-400 bg-brand-500/15 ring-2 ring-brand-500/30'
                    : 'border-slate-700 bg-slate-950/40 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-white">
                    {es ? 'Estándar' : 'Standard'}
                  </span>
                  {freeShipApplies ? (
                    <span className="text-lg font-black text-emerald-400">{es ? '¡GRATIS!' : 'FREE!'}</span>
                  ) : (
                    <span className="text-lg font-black text-white">$12</span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {es ? '1 a 3 días hábiles' : '1 to 3 business days'}
                </p>
                {freeShipApplies && (
                  <p className="text-[10px] mt-1 text-emerald-400 font-bold">
                    ✓ {es ? `Gratis en pedidos sobre $${freeShippingThreshold}` : `Free on orders over $${freeShippingThreshold}`}
                  </p>
                )}
                {!freeShipApplies && freeShippingThreshold > 0 && (
                  <p className="text-[10px] mt-1 text-amber-400">
                    {es
                      ? `Agrega $${(freeShippingThreshold - subtotalAfterCoupon).toFixed(2)} más para envío gratis`
                      : `Add $${(freeShippingThreshold - subtotalAfterCoupon).toFixed(2)} more for free shipping`}
                  </p>
                )}
                {shippingMethod === 'standard' && (
                  <p className="text-[10px] mt-1.5 text-brand-300 font-bold uppercase tracking-wider">
                    <Check className="h-3 w-3 inline mr-0.5" />
                    {es ? 'Seleccionado' : 'Selected'}
                  </p>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShippingMethod('express')}
                className={`text-left rounded-xl p-4 border-2 transition relative ${
                  shippingMethod === 'express'
                    ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-500/30'
                    : 'border-slate-700 bg-slate-950/40 hover:border-slate-600'
                }`}
              >
                <div className="absolute top-2 right-2 rounded-full bg-amber-500 text-[9px] font-bold text-white px-2 py-0.5 uppercase tracking-wider">
                  {es ? '⚡ Rápido' : '⚡ Fast'}
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-white">
                    Express
                  </span>
                  <span className="text-lg font-black text-white">$40</span>
                </div>
                <p className="text-xs text-slate-400">
                  {es ? '24 a 48 horas' : '24 to 48 hours'}
                </p>
                {shippingMethod === 'express' && (
                  <p className="text-[10px] mt-1.5 text-amber-300 font-bold uppercase tracking-wider">
                    <Check className="h-3 w-3 inline mr-0.5" />
                    {es ? 'Seleccionado' : 'Selected'}
                  </p>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShippingMethod('pickup')}
                className={`text-left rounded-xl p-4 border-2 transition ${
                  shippingMethod === 'pickup'
                    ? 'border-brand-400 bg-brand-500/15 ring-2 ring-brand-500/30'
                    : 'border-slate-700 bg-slate-950/40 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-white">
                    {es ? 'Recoger en persona' : 'In-person pickup'}
                  </span>
                  <span className="text-lg font-black text-emerald-400">{es ? 'GRATIS' : 'FREE'}</span>
                </div>
                <p className="text-xs text-slate-400">
                  {es ? 'Pasas tú por los productos' : 'You come pick up the products'}
                </p>
                <p className="text-[10px] mt-1 text-slate-500">
                  {es ? 'Sin costo de envío' : 'No shipping cost'}
                </p>
                {shippingMethod === 'pickup' && (
                  <p className="text-[10px] mt-1.5 text-brand-300 font-bold uppercase tracking-wider">
                    <Check className="h-3 w-3 inline mr-0.5" />
                    {es ? 'Seleccionado' : 'Selected'}
                  </p>
                )}
              </button>
            </div>
          </div>

          <form onSubmit={handlePlaceOrder} className="space-y-5">
            {/* Shipping info */}
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-800 p-6 md:p-8 space-y-5">
              <h2 className="text-lg font-bold text-white">{t('cart.shippingInfo')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">{t('cart.fullName')}</label>
                  <Input
                    required
                    value={checkoutData.name}
                    onChange={(e) => {
                      setCheckoutData({ ...checkoutData, name: e.target.value });
                      clearError('name');
                    }}
                    className={`input-premium bg-slate-950/50 border-slate-700 text-white placeholder:text-slate-500 ${errClass('name')}`}
                    placeholder={es ? 'Juan Pérez' : 'John Smith'}
                  />
                  {fieldErrors.name && (
                    <p className="flex items-center gap-1 text-xs text-red-400"><AlertCircle className="h-3 w-3" />{fieldErrors.name}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">{t('cart.email')}</label>
                  <Input
                    required
                    type="email"
                    value={checkoutData.email}
                    onChange={(e) => {
                      setCheckoutData({ ...checkoutData, email: e.target.value });
                      clearError('email');
                    }}
                    className={`input-premium bg-slate-950/50 border-slate-700 text-white placeholder:text-slate-500 ${errClass('email')}`}
                    placeholder="you@email.com"
                  />
                  {fieldErrors.email && (
                    <p className="flex items-center gap-1 text-xs text-red-400"><AlertCircle className="h-3 w-3" />{fieldErrors.email}</p>
                  )}
                </div>
                {shippingMethod === 'pickup' && (
                  <div className="md:col-span-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-xs text-brand-200">
                    {es
                      ? '🏬 Recoges en persona — no necesitamos tu dirección de envío. Coordinaremos el punto de entrega por WhatsApp.'
                      : "🏬 In-person pickup — we don't need a shipping address. We'll coordinate the pickup spot via WhatsApp."}
                  </div>
                )}
                {shippingMethod !== 'pickup' && (<>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium text-slate-300">{t('cart.address')}</label>
                  <Input
                    required
                    value={checkoutData.address}
                    onChange={(e) => {
                      setCheckoutData({ ...checkoutData, address: e.target.value });
                      clearError('address');
                    }}
                    className={`input-premium bg-slate-950/50 border-slate-700 text-white placeholder:text-slate-500 ${errClass('address')}`}
                    placeholder={es ? 'Calle 123, Apto 4' : '123 Main St, Apt 4'}
                  />
                  {fieldErrors.address && (
                    <p className="flex items-center gap-1 text-xs text-red-400"><AlertCircle className="h-3 w-3" />{fieldErrors.address}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">{t('cart.city')}</label>
                  <Input
                    required
                    value={checkoutData.city}
                    onChange={(e) => {
                      // Only letters, spaces, accents
                      const sanitized = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s.-]/g, '');
                      setCheckoutData({ ...checkoutData, city: sanitized });
                      clearError('city');
                    }}
                    className={`input-premium bg-slate-950/50 border-slate-700 text-white placeholder:text-slate-500 ${errClass('city')}`}
                  />
                  {fieldErrors.city && (
                    <p className="flex items-center gap-1 text-xs text-red-400"><AlertCircle className="h-3 w-3" />{fieldErrors.city}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">{t('cart.zip')}</label>
                  <Input
                    required
                    value={checkoutData.zip}
                    onChange={(e) => {
                      // Only alphanumeric and dashes (for international zip codes)
                      const sanitized = e.target.value.replace(/[^A-Za-z0-9\s-]/g, '').toUpperCase();
                      setCheckoutData({ ...checkoutData, zip: sanitized });
                      clearError('zip');
                    }}
                    className={`input-premium bg-slate-950/50 border-slate-700 text-white placeholder:text-slate-500 ${errClass('zip')}`}
                    placeholder="12345"
                  />
                  {fieldErrors.zip && (
                    <p className="flex items-center gap-1 text-xs text-red-400"><AlertCircle className="h-3 w-3" />{fieldErrors.zip}</p>
                  )}
                </div>
                </>)}
                <div className="md:col-span-2 rounded-xl border border-brand-700/30 bg-brand-500/5 p-5 space-y-3">
                  <p className="text-sm font-semibold text-white">
                    {locale === 'es' ? 'Teléfono de contacto' : 'Contact phone'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {locale === 'es'
                      ? 'Lo usaremos solo si necesitamos contactarte sobre este pedido.'
                      : 'We will only use it if we need to contact you about this order.'}
                  </p>
                  <CountryPhoneInput
                    countryCode={checkoutData.whatsappCountryCode}
                    phoneNumber={checkoutData.whatsappLocalNumber}
                    onCountryCodeChange={(code) => setCheckoutData({ ...checkoutData, whatsappCountryCode: code })}
                    onPhoneNumberChange={(num) => {
                      setCheckoutData({ ...checkoutData, whatsappLocalNumber: num });
                      clearError('phone');
                    }}
                    required
                  />
                  {fieldErrors.phone && (
                    <p className="flex items-center gap-1 text-xs text-red-400"><AlertCircle className="h-3 w-3" />{fieldErrors.phone}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Payment method selector — visible when Stripe is enabled. */}
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-800 p-6 md:p-8 space-y-5">
              <h2 className="text-lg font-bold text-white">{t('cart.paymentMethods')}</h2>

              {cardPaymentsEnabled && stripePublishableKey && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayMethod('zelle')}
                    className={`rounded-xl px-4 py-3 text-sm font-bold transition border-2 ${
                      payMethod === 'zelle'
                        ? 'border-[#b388ff] bg-[#6d1ed4]/15 text-white ring-2 ring-[#6d1ed4]/30'
                        : 'border-slate-700 bg-slate-950/40 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    Zelle
                    <p className="mt-0.5 text-[10px] font-normal opacity-80">
                      {es ? 'Transferencia bancaria' : 'Bank transfer'}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod('card')}
                    className={`rounded-xl px-4 py-3 text-sm font-bold transition border-2 ${
                      payMethod === 'card'
                        ? 'border-indigo-400 bg-indigo-500/15 text-white ring-2 ring-indigo-500/30'
                        : 'border-slate-700 bg-slate-950/40 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {es ? 'Tarjeta' : 'Card'}
                    <p className="mt-0.5 text-[10px] font-normal opacity-80">
                      {es ? 'Visa · Mastercard · Apple Pay' : 'Visa · Mastercard · Apple Pay'}
                    </p>
                  </button>
                </div>
              )}

              {/* Out-of-stock warning — blocks card payment until resolved */}
              {hasStockIssue && (
                <div className="rounded-xl bg-red-950/40 border border-red-700/60 p-4 text-sm text-red-200">
                  <p className="font-bold mb-1">
                    {locale === 'es' ? '⚠️ Revisa tu carrito' : '⚠️ Check your cart'}
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {stockIssues.map((s) => (
                      <li key={s.id}>
                        {s.kind === 'out'
                          ? (locale === 'es' ? `"${s.name}" está agotado` : `"${s.name}" is out of stock`)
                          : (locale === 'es' ? `"${s.name}": solo quedan ${s.stock}` : `"${s.name}": only ${s.stock} left`)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Card block (Stripe) */}
              {payMethod === 'card' && cardPaymentsEnabled && stripePublishableKey && !hasStockIssue && (
                <div className="rounded-xl bg-slate-950/50 border border-slate-700 p-5">
                  <StripeCardForm
                    publishableKey={stripePublishableKey}
                    items={cart.map((it) => {
                      const ep = getEffectivePrice(it.product);
                      return {
                        productId: it.product.id,
                        name: getLocalizedProduct(it.product, locale).name,
                        quantity: it.quantity,
                        unitPrice: ep.finalPrice,
                      };
                    })}
                    couponCode={appliedCoupon?.code || null}
                    claimedTotal={total}
                    shippingCost={shippingCost}
                    customerEmail={checkoutData.email}
                    locale={locale === 'es' ? 'es' : 'en'}
                    onPaymentSuccess={handleStripeSuccess}
                  />
                </div>
              )}

              {/* Zelle block (default / fallback) */}
              {payMethod === 'zelle' && (
              <>
              <div className="flex items-center gap-3 text-sm text-slate-300 bg-slate-950/50 border border-slate-700 p-4 rounded-xl">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6d1ed4]/20 ring-1 ring-[#6d1ed4]/40">
                  <Lock className="h-4 w-4 text-[#b388ff]" />
                </div>
                <span className="font-semibold">
                  {es ? 'Paga con Zelle' : 'Pay with Zelle'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-5 items-center bg-slate-950/50 border border-slate-700 rounded-xl p-5">
                <div className="mx-auto sm:mx-0 h-36 w-36 rounded-xl bg-white p-2 flex items-center justify-center overflow-hidden">
                  <img
                    src={zelleQrUrl}
                    alt="Zelle QR"
                    className="h-full w-full object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                      const sib = (e.currentTarget.nextElementSibling as HTMLElement | null);
                      if (sib) sib.style.display = 'flex';
                    }}
                  />
                  <div className="hidden h-full w-full items-center justify-center text-center text-[10px] font-semibold text-slate-500 px-2">
                    {es ? 'QR Zelle' : 'Zelle QR'}
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.25em] text-[#b388ff] font-bold">Zelle</p>
                  <p className="text-sm text-slate-300">
                    {es
                      ? 'Escanea el código QR o envía el pago al siguiente número:'
                      : 'Scan the QR code or send your payment to this number:'}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold text-white tracking-wider">{zelleNumber}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(zelleNumber);
                        showToast(es ? '¡Número copiado!' : 'Number copied!');
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                      {es ? 'Copiar' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">
                    {es
                      ? 'Incluye tu número de pedido en el memo tras confirmar.'
                      : 'Include your order number in the memo after confirming.'}
                  </p>
                </div>
              </div>

              </>
              )}
            </div>

            {/* Final CTA block — only for Zelle (card has its own pay button inside StripeCardForm) */}
            {payMethod === 'zelle' && (
            <div className="rounded-2xl bg-gradient-to-br from-brand-900 via-slate-900 to-slate-950 border border-brand-700/30 p-6 md:p-8 text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-300 ring-1 ring-brand-500/30 mb-3">
                <Check className="h-3 w-3" />
                {es ? 'Listo' : 'Ready'}
              </div>
              <h3 className="text-xl md:text-2xl font-bold text-white tracking-tight mb-1">
                {es ? 'Tu selección está lista' : 'Your selection is ready'}
              </h3>
              <div className="flex items-center justify-center gap-2 mb-6 text-sm">
                <span className="text-slate-400">{t('cart.totalToPay')}</span>
                <span className="font-bold text-white text-xl">${total.toFixed(2)}</span>
              </div>
              <Button
                type="submit"
                className="btn-premium w-full bg-gradient-to-r from-brand-500 to-brand-400 text-white hover:from-brand-400 hover:to-brand-300 rounded-full h-13 text-base font-bold shadow-xl shadow-brand-500/40"
                disabled={loading}
              >
                <Lock className="mr-2 h-4 w-4" />
                {loading
                  ? t('cart.processing')
                  : es
                    ? 'Finalizar pedido'
                    : 'Place Order'}
              </Button>
              <p className="mt-3 text-xs text-slate-400">
                {es
                  ? 'Recibirás los detalles de pago inmediatamente.'
                  : 'You will receive payment details immediately.'}
              </p>
            </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  // Cart view
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto px-4 py-10 md:py-14">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-400 mb-2">ILLIUM</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">{t('cart.shoppingCart')}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {cart.length} {locale === 'es' ? (cart.length === 1 ? 'producto' : 'productos') : (cart.length === 1 ? 'item' : 'items')}
          </p>
          {sharedFrom && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-500/10 border border-brand-500/30 px-4 py-2 text-xs text-brand-200">
              <ShieldCheck className="h-3.5 w-3.5 text-brand-400" />
              {locale === 'es' ? 'Carrito compartido por' : 'Cart shared by'}{' '}
              <span className="font-bold text-white">{sharedFrom.referredBy.displayName}</span>
              <span className="text-[10px] uppercase tracking-wider text-brand-400">
                {sharedFrom.referredBy.role === 'admin' ? 'Admin' : (locale === 'es' ? 'Partner' : 'Partner')}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items */}
          <div className="lg:col-span-2 space-y-4">
            {cart.map((item) => {
              const lp = getLocalizedProduct(item.product, locale);
              const ie = getEffectivePrice(item.product);
              return (
              <div key={item.product.id} className="group relative flex gap-4 sm:gap-5 p-4 sm:p-5 bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-800 rounded-2xl items-center transition-all hover:border-brand-700/50 hover:shadow-2xl hover:shadow-brand-600/10">
                {/* Image */}
                <div className="w-20 h-24 sm:w-24 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-black">
                  <img src={item.product.img} alt={lp.name} className="w-full h-full object-cover" />
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-brand-400 font-bold tracking-[0.2em] uppercase">
                    ILLIUM · {item.product.category}
                    {ie.hasDiscount && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 text-[9px] font-bold ring-1 ring-emerald-500/30">
                        -{ie.percentOff}%
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-white mt-1 truncate text-base">{lp.name}</h3>
                  <div className="mt-1 text-[11px] font-semibold text-brand-300">
                    {locale === 'es'
                      ? `Suministro: ${item.quantity} ${item.quantity === 1 ? 'mes' : 'meses'}`
                      : `Supply: ${item.quantity} ${item.quantity === 1 ? 'month' : 'months'}`}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="font-bold text-white text-lg">${(ie.finalPrice * item.quantity).toFixed(2)}</div>
                    <div className="text-xs text-slate-500">
                      ${ie.finalPrice.toFixed(2)} {locale === 'es' ? 'c/u' : 'ea.'}
                      {ie.hasDiscount && (
                        <span className="ml-1 line-through text-slate-600">${ie.originalPrice.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Qty + delete */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="flex items-center rounded-full bg-slate-950/60 border border-slate-700 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.product.id, Math.max(1, item.quantity - 1))}
                      className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <div className="w-8 text-center text-sm font-semibold text-white">{item.quantity}</div>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.product.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    aria-label={locale === 'es' ? 'Eliminar' : 'Remove'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              );
            })}

            <Link
              to="/shop"
              className="inline-flex items-center justify-center gap-2.5 mt-6 w-full md:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-white text-base md:text-lg font-extrabold tracking-tight shadow-xl shadow-emerald-500/40 ring-1 ring-emerald-300/40 transition-all hover:scale-[1.02]"
            >
              <ArrowLeft className="h-5 w-5" />
              {locale === 'es' ? 'Seguir explorando' : 'Keep shopping'}
            </Link>
          </div>

          {/* Summary */}
          <div>
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-slate-900 to-slate-950 border border-brand-700/30 p-6 sticky top-24 shadow-2xl shadow-brand-900/20">
              <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-transparent pointer-events-none" />
              <div className="relative">
                <h2 className="text-lg font-bold text-white mb-6 tracking-tight">{t('cart.orderSummary')}</h2>
                <div className="space-y-3 text-sm mb-4">
                  <div className="flex justify-between text-slate-400">
                    <span>{t('cart.subtotal')}</span>
                    <span className="font-medium text-white">${subtotal.toFixed(2)}</span>
                  </div>
                  {appliedCoupon && (
                    <div className="flex justify-between text-emerald-400">
                      <span className="flex items-center gap-1">
                        <Tag className="h-3.5 w-3.5" />
                        {locale === 'es' ? 'Cupón' : 'Coupon'} <span className="font-mono font-bold">{appliedCoupon.code}</span>
                      </span>
                      <span className="font-semibold">-${couponDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-400">
                    <span>{t('cart.shipping')}</span>
                    <span className="text-xs">{t('cart.shippingAtCheckout')}</span>
                  </div>
                  <div className="pt-4 border-t border-slate-700/50 flex justify-between font-bold text-xl text-white">
                    <span>{t('cart.total')}</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Coupon input */}
                <div className="mb-5 rounded-xl bg-slate-900/60 border border-slate-700/50 p-3">
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Tag className="h-4 w-4 text-emerald-400" />
                        <span className="text-emerald-300 font-bold font-mono">{appliedCoupon.code}</span>
                        <span className="text-xs text-emerald-400">
                          {appliedCoupon.discountType === 'percent' ? `-${appliedCoupon.discountValue}%` : `-$${appliedCoupon.discountValue}`}
                        </span>
                      </div>
                      <button onClick={removeCoupon} className="text-xs text-slate-400 hover:text-red-400 underline">
                        {locale === 'es' ? 'Quitar' : 'Remove'}
                      </button>
                    </div>
                  ) : (
                    <>
                      <label className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold flex items-center gap-1 mb-1.5">
                        <Tag className="h-3 w-3" />
                        {locale === 'es' ? '¿Tienes un cupón de descuento?' : 'Have a discount coupon?'}
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                          placeholder={locale === 'es' ? 'CÓDIGO' : 'CODE'}
                          className="bg-slate-950/60 border-slate-700 text-white placeholder:text-slate-500 uppercase font-mono h-9"
                        />
                        <Button
                          type="button"
                          onClick={handleApplyCoupon}
                          disabled={couponLoading}
                          className="bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg h-9 px-4 text-xs font-bold shrink-0"
                        >
                          {couponLoading ? '...' : (locale === 'es' ? 'Aplicar' : 'Apply')}
                        </Button>
                      </div>
                      {couponError && <p className="text-xs text-red-400 mt-1.5">{couponError}</p>}
                    </>
                  )}
                </div>
                <Button
                  className="btn-premium w-full bg-gradient-to-r from-brand-500 to-brand-400 text-white hover:from-brand-400 hover:to-brand-300 rounded-full h-13 text-base font-bold shadow-xl shadow-brand-500/40"
                  onClick={() => setIsCheckingOut(true)}
                >
                  {t('cart.proceedCheckout')}
                </Button>
                <ShareCartButton appliedCoupon={appliedCoupon} />
                <p className="text-xs text-slate-400 text-center mt-4 flex items-center justify-center gap-1.5">
                  <Lock className="h-3 w-3" /> {t('cart.secureLine')}
                </p>
                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-center gap-2 text-[11px] text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-brand-400" />
                  {locale === 'es' ? '99%+ Pureza · HPLC & MS Testeado' : '99%+ Purity · HPLC & MS Tested'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
