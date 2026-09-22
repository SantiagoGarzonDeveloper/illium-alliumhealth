import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, getDoc, onSnapshot, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getEffectivePrice } from '@/lib/pricing';
import { findCouponByCode, validateCoupon, applyCouponToTotal, incrementCouponUsage, type Coupon } from '@/lib/coupons';
import { buildNewOrderCommissionFields } from '@/lib/orderCommission';
import { buildSharedCartPayload, createSharedCart } from '@/lib/sharedCart';
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
 * Dos formas de cobro, y solo dos: **Zelle** (el cliente paga al número de
 * Zelle y la venta queda pendiente de confirmar) o **link de pago** (se le
 * manda al cliente un enlace con el carrito ya armado para que pague online).
 */
export function WorkerSaleForm({ uid, email, locale, showToast }: Props) {
  const es = locale === 'es';
  const [products, setProducts] = useState<Product[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerWhatsApp, setCustomerWhatsApp] = useState('');
  const [notes, setNotes] = useState('');
  /** Solo dos métodos: 'zelle' o 'link' (mandarle un link de pago al cliente). */
  const [paymentMethod, setPaymentMethod] = useState<'zelle' | 'link'>('zelle');
  const [lines, setLines] = useState<Line[]>([{ name: '', price: 0, quantity: 1 }]);
  const [saving, setSaving] = useState(false);

  // Coupon support — same engine the public checkout uses.
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  // Link de pago generado para el cliente.
  const [payLink, setPayLink] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  /** Número de Zelle configurado en ajustes, para mostrárselo al vendedor. */
  const [zelleNumber, setZelleNumber] = useState('');

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

  // Número de Zelle configurado en el panel (se le muestra al vendedor).
  useEffect(() => {
    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'general'));
        const data = snap.exists() ? snap.data() : {};
        if (typeof data.zelleNumber === 'string' && data.zelleNumber.trim()) {
          setZelleNumber(data.zelleNumber.trim());
        }
      } catch { /* si falla, simplemente no se muestra el número */ }
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
  const saleReady = customerName.trim().length > 0 && validLines.length > 0 && total > 0;

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
    setPayLink('');
  }

  /**
   * Crea la orden. Siempre queda en 'pending': tanto con Zelle como con link de
   * pago, el dinero se confirma después (el admin la marca como pagada).
   */
  async function createSaleOrder() {
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
      status: 'pending',
      fulfillmentStatus: 'unfulfilled',
      channel: 'partner_direct',
      registeredByUid: uid,
      registeredByEmail: email,
      paymentMethod,
      stripePaymentIntentId: null,
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
      await createSaleOrder();
      showToast(es ? 'Venta registrada' : 'Sale registered');
      resetForm();
    } catch (e) {
      console.error(e);
      showToast(es ? 'Error al registrar la venta' : 'Error registering sale');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Genera el link de pago: congela el carrito de esta venta en un enlace que
   * se le manda al cliente para que pague en la web (el vendedor queda como
   * referido, así la comisión se respeta).
   */
  async function generatePaymentLink() {
    if (!saleReady) {
      showToast(es ? 'Agrega cliente y productos primero' : 'Add customer and items first');
      return;
    }
    setLinkLoading(true);
    try {
      const cart: CartItem[] = validLines.map((l) => ({
        product: {
          id: l.productId || '',
          name: l.name.trim(),
          description: '',
          price: Math.max(0, Number(l.price) || 0),
          stock: 999,
          category: '',
          img: '',
        },
        quantity: Math.max(1, Math.round(l.quantity)),
      }));
      const payload = buildSharedCartPayload({
        cart,
        appliedCoupon,
        couponDiscountAmount: couponDiscount,
        referredBy: { uid, email, displayName: email.split('@')[0], role: 'worker' },
        note: customerName.trim() ? `Venta de ${customerName.trim()}` : '',
      });
      const id = await createSharedCart(payload);
      const url = `${window.location.origin}/c/${id}`;
      setPayLink(url);
      showToast(es ? 'Link de pago generado' : 'Payment link generated');
    } catch (e) {
      console.error(e);
      showToast(es ? 'No se pudo generar el link de pago' : 'Could not generate the payment link');
    } finally {
      setLinkLoading(false);
    }
  }

  const isLink = paymentMethod === 'link';

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
              onChange={(e) => { setPaymentMethod(e.target.value as 'zelle' | 'link'); setPayLink(''); }}
            >
              <option value="zelle">Zelle</option>
              <option value="link">{es ? 'Mandarle un link de pago' : 'Send a payment link'}</option>
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

        {/* Cobro: Zelle o link de pago */}
        {isLink ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              {es
                ? 'Se crea un enlace con esta venta ya armada. El cliente lo abre, paga en la web y tu comisión queda registrada a tu nombre.'
                : 'A link with this sale pre-loaded is created. The customer opens it, pays on the site, and your commission is recorded under your name.'}
            </div>
            <Button
              type="button"
              disabled={linkLoading || !saleReady}
              className="w-full bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50"
              onClick={() => void generatePaymentLink()}
            >
              {linkLoading
                ? (es ? 'Generando…' : 'Generating…')
                : saleReady
                  ? (es ? `Generar link de pago · $${total.toFixed(2)}` : `Generate payment link · $${total.toFixed(2)}`)
                  : (es ? 'Agrega cliente y productos' : 'Add customer and items')}
            </Button>

            {payLink && (
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-700">
                  {es ? 'Link listo para enviar' : 'Link ready to send'}
                </p>
                <p className="break-all font-mono text-xs text-slate-700">{payLink}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-slate-900 text-white hover:bg-slate-800"
                    onClick={() => {
                      void navigator.clipboard?.writeText(payLink);
                      showToast(es ? 'Link copiado' : 'Link copied');
                    }}
                  >
                    {es ? 'Copiar link' : 'Copy link'}
                  </Button>
                  {customerWhatsApp.replace(/\D/g, '').length >= 7 && (
                    <a
                      href={`https://wa.me/1${customerWhatsApp.replace(/\D/g, '')}?text=${encodeURIComponent(
                        (es ? 'Aquí está tu link de pago ILLIUM: ' : 'Here is your ILLIUM payment link: ') + payLink
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button type="button" size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500">
                        {es ? 'Enviar por WhatsApp' : 'Send on WhatsApp'}
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              {es ? 'El cliente paga por Zelle' : 'The customer pays by Zelle'}
              {zelleNumber ? <> · <span className="font-mono font-bold text-slate-900">{zelleNumber}</span></> : null}
              {es
                ? '. La venta queda pendiente hasta que el admin confirme el pago.'
                : '. The sale stays pending until the admin confirms the payment.'}
            </div>
            <Button
              type="button"
              disabled={saving}
              className="w-full bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => void submitManual()}
            >
              {saving ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Registrar venta con Zelle' : 'Register Zelle sale')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
