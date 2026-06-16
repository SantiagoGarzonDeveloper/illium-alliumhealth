import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, getDoc, onSnapshot, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getEffectivePrice } from '@/lib/pricing';
import { findCouponByCode, validateCoupon, applyCouponToTotal, incrementCouponUsage, type Coupon } from '@/lib/coupons';
import { buildNewOrderCommissionFields } from '@/lib/orderCommission';
import { StripeCardForm } from '@/components/cart/StripeCardForm';
import type { CartItem } from '@/store';

type Product = {
  id: string;
  name: string;
  nameEs?: string;
  price: number;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
};

type Line = { productId?: string; name: string; price: number; quantity: number };

type Props = {
  uid: string;
  email: string;
  locale: 'es' | 'en';
  showToast: (msg: string) => void;
};

/**
 * Lets a partner/worker record a sale they closed directly (off the website).
 * Creates an order doc with channel='partner_direct' so it shows up in the
 * admin Orders tab and in the worker's own commission rollup automatically.
 *
 * Supports manual payment methods (cash/Zelle/transfer) AND charging a card
 * on the spot via Stripe when "Card" is selected.
 */
export function WorkerSaleForm({ uid, email, locale, showToast }: Props) {
  const es = locale === 'es';
  const [products, setProducts] = useState<Product[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerWhatsApp, setCustomerWhatsApp] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [lines, setLines] = useState<Line[]>([{ name: '', price: 0, quantity: 1 }]);
  const [saving, setSaving] = useState(false);

  // Coupon support — same engine the public checkout uses.
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  // Stripe card-on-the-spot support.
  const [stripePublishableKey, setStripePublishableKey] = useState<string | null>(null);
  const [cardPaymentsEnabled, setCardPaymentsEnabled] = useState(false);
  /** When set, we're in the secure card-payment step with this frozen snapshot. */
  const [cardCheckout, setCardCheckout] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snap) => {
      const rows: Product[] = snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          name: String(x.name || ''),
          nameEs: x.nameEs as string | undefined,
          price: Number(x.price) || 0,
          discountType: x.discountType as 'percent' | 'fixed' | undefined,
          discountValue: typeof x.discountValue === 'number' ? x.discountValue : undefined,
        };
      });
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setProducts(rows);
    });
    return () => unsub();
  }, []);

  // Load Stripe config so the partner can charge a card directly.
  useEffect(() => {
    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'general'));
        const data = snap.exists() ? snap.data() : {};
        setCardPaymentsEnabled(Boolean(data.cardPaymentsEnabled));
        if (typeof data.stripePublishableKey === 'string' && data.stripePublishableKey.trim().startsWith('pk_')) {
          setStripePublishableKey(data.stripePublishableKey.trim());
        }
      } catch { /* ignore — card option just won't render */ }
    })();
  }, []);

  const subtotal = useMemo(
    () => lines.reduce((acc, l) => acc + (Number(l.price) || 0) * (Number(l.quantity) || 0), 0),
    [lines]
  );
  const couponDiscount = appliedCoupon ? applyCouponToTotal(appliedCoupon, subtotal).discountAmount : 0;
  const total = Math.max(0, Math.round((subtotal - couponDiscount) * 100) / 100);

  const validLines = useMemo(
    () => lines.filter((l) => l.name.trim() && l.quantity > 0),
    [lines]
  );
  const cardReady = customerName.trim().length > 0 && validLines.length > 0 && total > 0;

  function pickProduct(idx: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    // Use the discounted (effective) price so the POS matches the website price.
    const ep = getEffectivePrice(p);
    setLines((curr) => {
      const next = [...curr];
      next[idx] = {
        productId: p.id,
        name: es ? p.nameEs || p.name : p.name,
        price: ep.finalPrice,
        quantity: next[idx].quantity || 1,
      };
      return next;
    });
  }

  async function applyCoupon() {
    setCouponError('');
    const code = couponInput.trim().toUpperCase();
    if (!code) { setCouponError(es ? 'Ingresa un código' : 'Enter a code'); return; }
    setCouponLoading(true);
    try {
      const c = await findCouponByCode(code);
      if (!c) { setCouponError(es ? 'Código no encontrado' : 'Code not found'); setAppliedCoupon(null); return; }
      const v = validateCoupon(c);
      if (!v.ok) {
        const map: Record<string, string> = es
          ? { inactive: 'Cupón inactivo', expired: 'Cupón expirado', maxed: 'Cupón ya usado al máximo' }
          : { inactive: 'Coupon inactive', expired: 'Coupon expired', maxed: 'Coupon usage limit reached' };
        setCouponError(map[v.reason] || 'Invalid'); setAppliedCoupon(null); return;
      }
      setAppliedCoupon(c);
      showToast(es ? '¡Cupón aplicado!' : 'Coupon applied!');
    } catch {
      setCouponError(es ? 'Error al validar' : 'Validation error');
    } finally {
      setCouponLoading(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError('');
  }

  function resetForm() {
    setCustomerName('');
    setCustomerEmail('');
    setCustomerWhatsApp('');
    setNotes('');
    setLines([{ name: '', price: 0, quantity: 1 }]);
    removeCoupon();
    setCardCheckout(false);
  }

  /**
   * Create the order doc. paymentMode 'manual' → status pending with the chosen
   * method. 'stripe' → status paid (card already captured) with the intent id.
   */
  async function createSaleOrder(paymentMode: 'manual' | 'stripe', stripeIntentId?: string) {
    const cleanLines = validLines.map((l) => ({
      ...(l.productId ? { productId: l.productId } : {}),
      name: l.name.trim(),
      price: Math.max(0, Number(l.price) || 0),
      quantity: Math.max(1, Math.round(l.quantity)),
    }));

    // Resolve the seller's upline so commissions flow correctly
    let uplineReferrerId: string | null = null;
    try {
      const meSnap = await getDoc(doc(db, 'users', uid));
      if (meSnap.exists()) {
        uplineReferrerId = (meSnap.data().referrerId as string | null) || null;
      }
    } catch { /* ignore */ }

    // Compute the seller's commission up-front (respecting their $/unit, per-product
    // or % mode) so payouts are correct even if the backend trigger doesn't run.
    const commItems: CartItem[] = cleanLines.map((cl) => ({
      product: { id: cl.productId || '', name: cl.name, description: '', price: cl.price, stock: 0, category: '', img: '' },
      quantity: cl.quantity,
    }));
    const commission = await buildNewOrderCommissionFields(total, uid, uplineReferrerId, commItems);

    const ref = await addDoc(collection(db, 'orders'), {
      items: cleanLines,
      subtotal: Math.round(subtotal * 100) / 100,
      couponCode: appliedCoupon?.code || null,
      couponDiscount: Math.round(couponDiscount * 100) / 100,
      total,
      ...commission,
      status: paymentMode === 'stripe' ? 'paid' : 'pending',
      fulfillmentStatus: 'unfulfilled',
      channel: 'partner_direct',
      registeredByUid: uid,
      registeredByEmail: email,
      paymentMethod: paymentMode === 'stripe' ? 'stripe' : paymentMethod,
      stripePaymentIntentId: stripeIntentId || null,
      checkoutLocale: locale,
      referrerId: uid,
      uplineReferrerId,
      customer: {
        name: customerName.trim(),
        email: customerEmail.trim().toLowerCase(),
        whatsappLocalNumber: customerWhatsApp.replace(/\D/g, ''),
        whatsappCountryCode: '+1',
      },
      adminInternalNotes: notes.trim(),
      createdAt: serverTimestamp(),
    });
    if (appliedCoupon) void incrementCouponUsage(appliedCoupon.id);
    return ref.id;
  }

  async function submitManual() {
    if (validLines.length === 0) {
      showToast(es ? 'Agrega al menos un producto' : 'Add at least one product');
      return;
    }
    if (!customerName.trim()) {
      showToast(es ? 'Falta el nombre del cliente' : 'Customer name is required');
      return;
    }
    setSaving(true);
    try {
      await createSaleOrder('manual');
      showToast(es ? 'Venta registrada' : 'Sale registered');
      resetForm();
    } catch (e) {
      console.error(e);
      showToast(es ? 'Error al registrar la venta' : 'Error registering sale');
    } finally {
      setSaving(false);
    }
  }

  async function onCardPaid(intentId: string) {
    setSaving(true);
    try {
      await createSaleOrder('stripe', intentId);
      showToast(es ? '¡Pago cobrado y venta registrada!' : 'Payment captured and sale registered!');
      resetForm();
    } catch (e) {
      console.error(e);
      showToast(es ? 'Pago cobrado pero falló al guardar la venta. Avisa al admin.' : 'Payment captured but saving the sale failed. Notify admin.');
    } finally {
      setSaving(false);
    }
  }

  const isCard = paymentMethod === 'card';
  const stripeAvailable = cardPaymentsEnabled && Boolean(stripePublishableKey);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{es ? 'Registrar una venta directa' : 'Register a direct sale'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-slate-500">
          {es
            ? 'Usa este formulario cuando vendas en persona o por WhatsApp. La venta aparece en tu panel de finanzas y en el panel del admin con tu comisión calculada automáticamente.'
            : 'Use this form for in-person or WhatsApp sales. The sale shows up in your finance panel and in the admin panel with your commission calculated automatically.'}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">{es ? 'Cliente — nombre' : 'Customer name'}</label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={es ? 'Juan Pérez' : 'John Doe'} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">{es ? 'Cliente — email (opcional)' : 'Customer email (optional)'}</label>
            <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="cliente@correo.com" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">{es ? 'WhatsApp del cliente (solo dígitos)' : 'Customer WhatsApp (digits only)'}</label>
            <Input value={customerWhatsApp} onChange={(e) => setCustomerWhatsApp(e.target.value)} placeholder="3001234567" inputMode="numeric" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">{es ? 'Método de pago' : 'Payment method'}</label>
            <select
              className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
              value={paymentMethod}
              onChange={(e) => { setPaymentMethod(e.target.value); setCardCheckout(false); }}
            >
              <option value="cash">{es ? 'Efectivo' : 'Cash'}</option>
              <option value="zelle">Zelle</option>
              <option value="transfer">{es ? 'Transferencia' : 'Bank transfer'}</option>
              <option value="card">{es ? 'Tarjeta' : 'Card'}</option>
              <option value="other">{es ? 'Otro' : 'Other'}</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-900">{es ? 'Productos vendidos' : 'Items sold'}</h4>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center rounded-md border border-slate-200 bg-white p-2">
              <select
                className="col-span-5 text-xs rounded border border-slate-200 px-1 py-2"
                value={l.productId || ''}
                onChange={(e) => pickProduct(i, e.target.value)}
              >
                <option value="">{es ? '— Producto del catálogo —' : '— Catalog product —'}</option>
                {products.map((p) => {
                  const ep = getEffectivePrice(p);
                  return (
                    <option key={p.id} value={p.id}>
                      {es ? p.nameEs || p.name : p.name} — ${ep.finalPrice.toFixed(2)}
                      {ep.hasDiscount ? ` (-${ep.percentOff}%)` : ''}
                    </option>
                  );
                })}
              </select>
              <Input
                className="col-span-3 text-xs"
                value={l.name}
                onChange={(e) => setLines((curr) => { const n = [...curr]; n[i] = { ...n[i], name: e.target.value }; return n; })}
                placeholder={es ? 'O nombre libre' : 'Or free text'}
              />
              <Input
                className="col-span-1 text-xs"
                type="number"
                min={1}
                value={l.quantity}
                onChange={(e) => setLines((curr) => { const n = [...curr]; n[i] = { ...n[i], quantity: parseInt(e.target.value || '0', 10) }; return n; })}
              />
              <Input
                className="col-span-2 text-xs"
                type="number"
                step="0.01"
                value={l.price}
                onChange={(e) => setLines((curr) => { const n = [...curr]; n[i] = { ...n[i], price: parseFloat(e.target.value || '0') }; return n; })}
              />
              <button
                type="button"
                className="col-span-1 text-red-600 text-xs font-bold hover:bg-red-50 rounded py-1"
                onClick={() => setLines((curr) => curr.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => setLines((curr) => [...curr, { name: '', price: 0, quantity: 1 }])}
          >
            + {es ? 'Agregar producto' : 'Add item'}
          </Button>
        </div>

        {/* Coupon / discount code */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">{es ? 'Código de descuento (opcional)' : 'Discount code (optional)'}</label>
          {appliedCoupon ? (
            <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
              <span className="font-semibold text-emerald-700">
                {appliedCoupon.code} · −${couponDiscount.toFixed(2)}
              </span>
              <button type="button" className="text-xs font-bold text-red-600 hover:underline" onClick={removeCoupon}>
                {es ? 'Quitar' : 'Remove'}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                placeholder={es ? 'EJ: BIENVENIDO10' : 'E.G. WELCOME10'}
                className="text-sm uppercase"
              />
              <Button type="button" variant="outline" size="sm" disabled={couponLoading} onClick={() => void applyCoupon()}>
                {couponLoading ? '…' : (es ? 'Aplicar' : 'Apply')}
              </Button>
            </div>
          )}
          {couponError && <p className="text-xs text-red-600">{couponError}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">{es ? 'Notas (opcional)' : 'Notes (optional)'}</label>
          <textarea
            className="w-full min-h-[60px] rounded-md border border-slate-200 p-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={es ? 'Forma de entrega, detalles, etc.' : 'Delivery details, etc.'}
          />
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 space-y-1">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>{es ? 'Subtotal' : 'Subtotal'}</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          {couponDiscount > 0 && (
            <div className="flex items-center justify-between text-sm text-emerald-600">
              <span>{es ? 'Descuento' : 'Discount'} ({appliedCoupon?.code})</span>
              <span>−${couponDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1 border-t border-slate-200">
            <div className="text-sm text-slate-600">{es ? 'Total a cobrar:' : 'Sale total:'}</div>
            <div className="text-2xl font-bold text-slate-900">${total.toFixed(2)}</div>
          </div>
        </div>

        {/* Payment action */}
        {isCard ? (
          stripeAvailable ? (
            !cardCheckout ? (
              <Button
                type="button"
                disabled={!cardReady}
                className="w-full bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
                onClick={() => setCardCheckout(true)}
              >
                {cardReady
                  ? (es ? `Cobrar $${total.toFixed(2)} con tarjeta` : `Charge $${total.toFixed(2)} by card`)
                  : (es ? 'Agrega cliente y productos para cobrar' : 'Add customer and items to charge')}
              </Button>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">
                    {es ? 'Pago seguro con tarjeta' : 'Secure card payment'}
                  </p>
                  <button type="button" className="text-xs font-bold text-slate-500 hover:underline" onClick={() => setCardCheckout(false)}>
                    {es ? 'Editar venta' : 'Edit sale'}
                  </button>
                </div>
                <StripeCardForm
                  publishableKey={stripePublishableKey as string}
                  items={validLines.map((l) => ({
                    productId: l.productId,
                    name: l.name.trim(),
                    quantity: Math.max(1, Math.round(l.quantity)),
                    unitPrice: Math.max(0, Number(l.price) || 0),
                  }))}
                  couponCode={appliedCoupon?.code || null}
                  claimedTotal={total}
                  shippingCost={0}
                  customerEmail={customerEmail.trim()}
                  locale={locale}
                  onPaymentSuccess={({ intentId }) => void onCardPaid(intentId)}
                />
              </div>
            )
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              {es
                ? 'El pago con tarjeta no está activado. Pídele al administrador que configure Stripe, o elige otro método de pago (efectivo, Zelle, transferencia).'
                : 'Card payments are not enabled. Ask the administrator to set up Stripe, or pick another payment method (cash, Zelle, transfer).'}
            </div>
          )
        ) : (
          <Button
            type="button"
            disabled={saving}
            className="w-full bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => void submitManual()}
          >
            {saving ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Registrar venta' : 'Register sale')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
