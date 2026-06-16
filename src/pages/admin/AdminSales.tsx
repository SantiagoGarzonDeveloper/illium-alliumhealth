import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection, onSnapshot, query, addDoc, serverTimestamp,
  limit as fLimit, doc, deleteDoc, updateDoc, getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/I18nContext';
import { useAppStore } from '@/store';
import { Combobox } from '@/components/ui/combobox';
import { getEffectivePrice } from '@/lib/pricing';
import {
  Plus, Trash2, DollarSign, TrendingUp, ShoppingBag, Users,
  Calendar, Filter, Download, Search, ArrowUpRight, ArrowDownRight,
  Receipt, Tag, Clock, ChevronDown, Sparkles,
} from 'lucide-react';
import { OrderProtocolModal } from '@/components/orders/OrderProtocolModal';
import { findCouponByCode, validateCoupon, applyCouponToTotal, incrementCouponUsage, type Coupon } from '@/lib/coupons';

type SaleRecord = {
  id: string;
  items: Array<{ productId: string; productName: string; quantity: number; unitPrice: number; unitCost: number }>;
  total: number;
  totalCost: number;
  profit: number;
  customerName?: string;
  customerEmail?: string;
  channel: 'online' | 'direct' | 'wholesale' | 'other';
  note?: string;
  createdAt?: { seconds: number };
  referredBy?: { uid: string; role: 'admin' | 'worker'; displayName: string; email: string } | null;
};

type OrderDoc = {
  id: string;
  total?: number;
  status?: string;
  customer?: { name?: string; email?: string };
  items?: Array<{ productId?: string; name?: string; quantity?: number; price?: number }>;
  createdAt?: { seconds: number };
  referrerId?: string | null;
  sharedFromShareId?: string | null;
  referredBy?: { uid: string; role: 'admin' | 'worker'; displayName: string; email: string } | null;
};

export function AdminSales() {
  const { locale } = useI18n();
  const es = locale === 'es';
  const products = useAppStore((s) => s.products);

  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [manualSales, setManualSales] = useState<SaleRecord[]>([]);
  const [tab, setTab] = useState<'all' | 'online' | 'manual' | 'register'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | '7d' | '30d' | '90d'>('all');
  const [searchQ, setSearchQ] = useState('');

  // Register sale form
  const [formItems, setFormItems] = useState<Array<{ productId: string; qty: number; unitPrice?: number }>>([]);
  const [formCouponCode, setFormCouponCode] = useState('');
  /** Coupon resolved + validated from the typed code (debounced). */
  const [formCoupon, setFormCoupon] = useState<Coupon | null>(null);
  const [formCouponStatus, setFormCouponStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [formCustomer, setFormCustomer] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formChannel, setFormChannel] = useState<'direct' | 'wholesale' | 'other'>('direct');
  /** Optional vendor attribution — admin records this sale on behalf of a worker. */
  const [formVendorId, setFormVendorId] = useState<string>('');
  const [vendors, setVendors] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
  const [formNote, setFormNote] = useState('');
  const [formError, setFormError] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [protocolOrder, setProtocolOrder] = useState<OrderDoc | null>(null);
  const [editManualId, setEditManualId] = useState<string | null>(null);

  useEffect(() => {
    const u1 = onSnapshot(
      query(collection(db, 'orders'), fLimit(2000)),
      (snap) => setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderDoc)))
    );
    const u2 = onSnapshot(
      query(collection(db, 'manualSales'), fLimit(2000)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SaleRecord));
        rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setManualSales(rows);
      }
    );
    // Load workers/admins for the "Attribute to vendor" picker on manual sales.
    const u3 = onSnapshot(
      query(collection(db, 'users'), fLimit(2000)),
      (snap) => {
        const rows: Array<{ id: string; name: string; email: string; role: string }> = [];
        snap.forEach((d) => {
          const x = d.data() as { name?: string; email?: string; role?: string };
          if (x.role === 'worker' || x.role === 'admin' || x.role === 'subadmin') {
            rows.push({ id: d.id, name: String(x.name || ''), email: String(x.email || ''), role: String(x.role || '') });
          }
        });
        rows.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
        setVendors(rows);
      },
    );
    return () => { u1(); u2(); u3(); };
  }, []);

  // Unified sales list
  const allSales = useMemo(() => {
    const productCostMap = new Map<string, number>();
    for (const p of products) productCostMap.set(p.id, p.cost || 0);

    const fromOrders: SaleRecord[] = orders.map((o) => {
      const items = (o.items || []).map((it) => ({
        productId: it.productId || '',
        productName: it.name || '',
        quantity: it.quantity || 1,
        unitPrice: it.price || 0,
        unitCost: productCostMap.get(it.productId || '') || 0,
      }));
      const total = Number(o.total) || 0;
      const totalCost = items.reduce((s, i) => s + i.unitCost * i.quantity, 0);
      return {
        id: `order-${o.id}`,
        items,
        total,
        totalCost,
        profit: total - totalCost,
        customerName: o.customer?.name || '',
        customerEmail: o.customer?.email || '',
        channel: 'online' as const,
        createdAt: o.createdAt,
        referredBy: o.referredBy || null,
      };
    });

    const all = [...fromOrders, ...manualSales];
    all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    // Date filter
    const now = Date.now() / 1000;
    const cutoffs: Record<string, number> = {
      '7d': now - 7 * 86400,
      '30d': now - 30 * 86400,
      '90d': now - 90 * 86400,
      'all': 0,
    };
    const cutoff = cutoffs[dateFilter] || 0;
    const filtered = cutoff > 0
      ? all.filter((s) => (s.createdAt?.seconds || 0) >= cutoff)
      : all;

    // Search filter
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      return filtered.filter((s) =>
        (s.customerName || '').toLowerCase().includes(q) ||
        (s.customerEmail || '').toLowerCase().includes(q) ||
        s.items.some((i) => i.productName.toLowerCase().includes(q)) ||
        (s.note || '').toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [orders, manualSales, products, dateFilter, searchQ]);

  // Filter by tab
  const displaySales = useMemo(() => {
    if (tab === 'online') return allSales.filter((s) => s.channel === 'online');
    if (tab === 'manual') return allSales.filter((s) => s.channel !== 'online');
    if (tab === 'register') return [];
    return allSales;
  }, [allSales, tab]);

  // Metrics
  const metrics = useMemo(() => {
    const sales = allSales;
    const revenue = sales.reduce((s, r) => s + r.total, 0);
    const cost = sales.reduce((s, r) => s + r.totalCost, 0);
    const profit = revenue - cost;
    return {
      count: sales.length,
      revenue: Math.round(revenue * 100) / 100,
      cost: Math.round(cost * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      margin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0,
    };
  }, [allSales]);

  // Debounced coupon lookup as the admin types the code.
  useEffect(() => {
    const code = formCouponCode.trim().toUpperCase();
    if (!code) {
      setFormCoupon(null);
      setFormCouponStatus('idle');
      return;
    }
    setFormCouponStatus('checking');
    const handle = window.setTimeout(async () => {
      try {
        const c = await findCouponByCode(code);
        if (!c) {
          setFormCoupon(null);
          setFormCouponStatus('invalid');
          return;
        }
        const v = validateCoupon(c);
        if (!v.ok) {
          setFormCoupon(null);
          setFormCouponStatus('invalid');
          return;
        }
        setFormCoupon(c);
        setFormCouponStatus('valid');
      } catch {
        setFormCoupon(null);
        setFormCouponStatus('invalid');
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [formCouponCode]);

  // Register manual sale (validates contact + applies coupon discount).
  const handleRegister = async () => {
    setFormError('');
    if (formItems.length === 0) return;
    const cleanEmail = formEmail.trim();
    const cleanPhone = formPhone.trim();
    if (!cleanEmail && !cleanPhone) {
      setFormError(es ? 'Ingresa al menos un correo o un teléfono del cliente.' : 'Enter at least an email or a phone number.');
      return;
    }
    setSaving(true);
    try {
      const items = formItems.map((fi) => {
        const p = products.find((x) => x.id === fi.productId);
        const defaultPrice = p ? getEffectivePrice(p).finalPrice : 0;
        return {
          productId: fi.productId,
          productName: p?.name || '',
          quantity: fi.qty,
          unitPrice: typeof fi.unitPrice === 'number' ? fi.unitPrice : defaultPrice,
          unitCost: p?.cost || 0,
        };
      }).filter((i) => i.productId);

      const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      const totalCost = items.reduce((s, i) => s + i.unitCost * i.quantity, 0);
      const couponDiscount = formCoupon ? applyCouponToTotal(formCoupon, subtotal).discountAmount : 0;
      const total = Math.max(0, subtotal - couponDiscount);

      // Resolve upline (referrer of the vendor) so the 10% commission can fire.
      let uplineReferrerId: string | null = null;
      if (formVendorId) {
        try {
          const metaSnap = await getDoc(doc(db, 'publicReferralMeta', formVendorId));
          if (metaSnap.exists()) {
            const ancestors = (metaSnap.data().referralAncestors as string[]) || [];
            uplineReferrerId = ancestors.length > 0 ? ancestors[0] : null;
          }
        } catch { /* ignore */ }
      }

      await addDoc(collection(db, 'manualSales'), {
        items,
        subtotal,
        couponCode: formCoupon ? formCoupon.code : (formCouponCode.trim().toUpperCase() || null),
        couponDiscount,
        total,
        totalCost,
        profit: total - totalCost,
        // Attribute this manual sale to a vendor (if admin picked one).
        referrerId: formVendorId || null,
        uplineReferrerId,
        attributedToVendorId: formVendorId || null,
        customerName: formCustomer || null,
        customerEmail: cleanEmail || null,
        customerPhone: cleanPhone || null,
        channel: formChannel,
        note: formNote || null,
        createdAt: serverTimestamp(),
      });
      if (formCoupon) { void incrementCouponUsage(formCoupon.id); }

      setFormItems([]);
      setFormCustomer('');
      setFormEmail('');
      setFormVendorId('');
      setFormPhone('');
      setFormNote('');
      setFormCouponCode('');
      setFormCoupon(null);
      setFormCouponStatus('idle');
      setTab('all');
    } catch (e) {
      console.error(e);
      setFormError(es ? 'No se pudo guardar la venta.' : 'Could not save the sale.');
    } finally {
      setSaving(false);
    }
  };

  const executeDelete = async (saleId: string) => {
    try {
      if (saleId.startsWith('order-')) {
        await deleteDoc(doc(db, 'orders', saleId.replace('order-', '')));
      } else {
        await deleteDoc(doc(db, 'manualSales', saleId));
      }
    } catch (e) {
      console.error(e);
    }
    setConfirmDeleteId(null);
  };

  const formatDate = (ts?: { seconds: number }) => {
    if (!ts) return '—';
    return new Date(ts.seconds * 1000).toLocaleDateString(es ? 'es-CO' : 'en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const channelLabel = (ch: string) => {
    const map: Record<string, string> = es
      ? { online: '🌐 Web', direct: '🤝 Directa', wholesale: '📦 Mayoreo', other: '📋 Otro' }
      : { online: '🌐 Online', direct: '🤝 Direct', wholesale: '📦 Wholesale', other: '📋 Other' };
    return map[ch] || ch;
  };

  const exportCSV = () => {
    const header = 'Date,Customer,Email,Channel,Products,Qty,Revenue,Cost,Profit\n';
    const rows = allSales.map((s) => {
      const prods = s.items.map((i) => `${i.productName}×${i.quantity}`).join(' + ');
      const qty = s.items.reduce((sum, i) => sum + i.quantity, 0);
      const date = s.createdAt ? new Date(s.createdAt.seconds * 1000).toISOString().slice(0, 16) : '';
      return `${date},"${s.customerName || ''}","${s.customerEmail || ''}",${s.channel},"${prods}",${qty},${s.total.toFixed(2)},${s.totalCost.toFixed(2)},${s.profit.toFixed(2)}`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `illium-sales-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const productOptions = products.map((p) => {
    const ep = getEffectivePrice(p);
    const sub = ep.hasDiscount
      ? `$${ep.finalPrice.toFixed(2)} (-${ep.percentOff}%) · Stock: ${p.stock}`
      : `$${p.price.toFixed(2)} · Stock: ${p.stock}`;
    return { value: p.id, label: p.name, sublabel: sub };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {es ? 'Registro de Ventas' : 'Sales Register'}
          </h1>
          <p className="text-sm text-slate-500">
            {es ? 'Todas tus ventas (web + directas) en un solo lugar.' : 'All your sales (online + direct) in one place.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setTab('register')} className="bg-brand-600 hover:bg-brand-500 text-white rounded-lg h-9 px-4 text-xs font-bold">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {es ? 'Registrar venta' : 'Register sale'}
          </Button>
          <Button onClick={exportCSV} variant="outline" className="rounded-lg h-9 px-3 text-xs">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            CSV
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: es ? 'Ventas' : 'Sales', value: metrics.count.toString(), icon: ShoppingBag, color: 'bg-brand-100 text-brand-700' },
          { label: es ? 'Ingresos' : 'Revenue', value: `$${metrics.revenue.toLocaleString()}`, icon: DollarSign, color: 'bg-brand-100 text-brand-700' },
          { label: es ? 'Costo' : 'Cost', value: `$${metrics.cost.toLocaleString()}`, icon: ArrowDownRight, color: 'bg-red-100 text-red-700' },
          { label: es ? 'Ganancia' : 'Profit', value: `$${metrics.profit.toLocaleString()}`, icon: TrendingUp, color: metrics.profit >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700' },
          { label: es ? 'Margen' : 'Margin', value: `${metrics.margin}%`, icon: ArrowUpRight, color: 'bg-amber-100 text-amber-700' },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${k.color}`}>
                <k.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{k.label}</p>
                <p className="text-lg font-black text-slate-900">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs + Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'online', 'manual', 'register'] as const).map((t) => {
          const labels: Record<string, string> = es
            ? { all: 'Todas', online: 'Web', manual: 'Directas', register: '+ Nueva' }
            : { all: 'All', online: 'Online', manual: 'Direct', register: '+ New' };
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                tab === t
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {labels[t]}
            </button>
          );
        })}

        <div className="ml-auto flex gap-2">
          {/* Date filter */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(['all', '7d', '30d', '90d'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDateFilter(d)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  dateFilter === d ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {d === 'all' ? (es ? 'Todo' : 'All') : d}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder={es ? 'Buscar...' : 'Search...'}
              className="rounded-lg bg-slate-100 border-0 pl-8 pr-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-500/30 w-44"
            />
          </div>
        </div>
      </div>

      {/* ─── REGISTER SALE FORM ─── */}
      {tab === 'register' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-5 w-5 text-brand-600" />
              {es ? 'Registrar venta manual' : 'Register manual sale'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Product items */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">{es ? 'Productos' : 'Products'}</p>
              {formItems.map((fi, idx) => {
                const p = products.find((x) => x.id === fi.productId);
                const ep = p ? getEffectivePrice(p) : null;
                const defaultPrice = ep ? ep.finalPrice : 0;
                const currentPrice = typeof fi.unitPrice === 'number' ? fi.unitPrice : defaultPrice;
                return (
                  <div key={idx} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 p-3">
                    <div className="flex-1 min-w-[160px] basis-full sm:basis-auto">
                      <Combobox
                        value={fi.productId}
                        onChange={(v) => {
                          const arr = [...formItems];
                          const np = products.find((x) => x.id === v);
                          const npPrice = np ? getEffectivePrice(np).finalPrice : 0;
                          arr[idx] = { ...fi, productId: v, unitPrice: npPrice };
                          setFormItems(arr);
                        }}
                        options={productOptions}
                        placeholder={es ? 'Seleccionar producto' : 'Select product'}
                      />
                    </div>
                    <div className="w-16">
                      <Input
                        type="number"
                        min={1}
                        value={fi.qty}
                        onChange={(e) => {
                          const arr = [...formItems];
                          arr[idx] = { ...fi, qty: parseInt(e.target.value, 10) || 1 };
                          setFormItems(arr);
                        }}
                        className="text-center"
                      />
                    </div>
                    <div className="w-28">
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block leading-none mb-0.5">{es ? 'Precio U.' : 'Unit price'}</label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">$</span>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={Number.isFinite(currentPrice) ? currentPrice : 0}
                          onChange={(e) => {
                            const arr = [...formItems];
                            const v = parseFloat(e.target.value);
                            arr[idx] = { ...fi, unitPrice: Number.isFinite(v) ? v : 0 };
                            setFormItems(arr);
                          }}
                          className="pl-5 text-right"
                          title={ep && ep.hasDiscount ? `${es ? 'Original' : 'Original'}: $${ep.originalPrice.toFixed(2)}` : undefined}
                        />
                      </div>
                      {ep && ep.hasDiscount && (
                        <p className="text-[9px] text-emerald-600 font-semibold leading-none mt-0.5">-{ep.percentOff}% (orig ${ep.originalPrice.toFixed(2)})</p>
                      )}
                    </div>
                    <div className="text-right min-w-[70px]">
                      <p className="text-sm font-bold text-slate-900">${(currentPrice * fi.qty).toFixed(2)}</p>
                      <p className="text-[10px] text-slate-400">{es ? 'costo' : 'cost'}: ${((p?.cost || 0) * fi.qty).toFixed(2)}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 h-8 w-8 p-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFormItems([...formItems, { productId: '', qty: 1 }])}
                className="w-full rounded-lg border-dashed text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {es ? 'Agregar producto' : 'Add product'}
              </Button>
            </div>

            {/* Totals preview */}
            {formItems.length > 0 && (() => {
              const subtotal = formItems.reduce((s, fi) => {
                const p = products.find((pp) => pp.id === fi.productId);
                const def = p ? getEffectivePrice(p).finalPrice : 0;
                const u = typeof fi.unitPrice === 'number' ? fi.unitPrice : def;
                return s + u * fi.qty;
              }, 0);
              const cost = formItems.reduce((s, fi) => s + (products.find((p) => p.id === fi.productId)?.cost || 0) * fi.qty, 0);
              const discount = formCoupon ? applyCouponToTotal(formCoupon, subtotal).discountAmount : 0;
              const total = Math.max(0, subtotal - discount);
              return (
                <div className="rounded-xl bg-gradient-to-r from-brand-50 to-emerald-50 border border-brand-200 p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{es ? 'Venta' : 'Sale'}</p>
                      <p className="text-xl font-black text-slate-900">${total.toFixed(2)}</p>
                      {discount > 0 && (
                        <p className="text-[10px] text-slate-500 line-through">${subtotal.toFixed(2)}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{es ? 'Costo' : 'Cost'}</p>
                      <p className="text-xl font-black text-red-700">${cost.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{es ? 'Ganancia' : 'Profit'}</p>
                      <p className="text-xl font-black text-emerald-700">${(total - cost).toFixed(2)}</p>
                    </div>
                  </div>
                  {discount > 0 && (
                    <p className="text-center text-xs font-semibold text-emerald-700">
                      <Tag className="h-3 w-3 inline mr-1" />
                      {es ? 'Cupón' : 'Coupon'} <span className="font-mono">{formCoupon?.code}</span>:
                      −${discount.toFixed(2)}
                      {formCoupon?.discountType === 'percent' && ` (${formCoupon.discountValue}%)`}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Customer + channel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">{es ? 'Cliente (opcional)' : 'Customer (optional)'}</label>
                <Input value={formCustomer} onChange={(e) => setFormCustomer(e.target.value)} placeholder="Juan Pérez" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">{es ? 'Canal' : 'Channel'}</label>
                <Combobox
                  value={formChannel}
                  onChange={(v) => setFormChannel(v as 'direct' | 'wholesale' | 'other')}
                  options={[
                    { value: 'direct', label: es ? '🤝 Venta directa' : '🤝 Direct sale' },
                    { value: 'wholesale', label: es ? '📦 Mayoreo' : '📦 Wholesale' },
                    { value: 'other', label: es ? '📋 Otro' : '📋 Other' },
                  ]}
                  searchable={false}
                />
              </div>
            </div>

            {/* Vendor attribution (optional) — admin records this sale on behalf of a worker. */}
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
              <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                {es ? 'Atribuir a un vendedor (opcional)' : 'Attribute to a vendor (optional)'}
              </p>
              <p className="text-[11px] text-slate-600">
                {es
                  ? 'Si esta venta fue gestionada por uno de tus trabajadores, escógelo aquí. La comisión 40% se le atribuirá igual que en una venta por su link.'
                  : 'If this sale was handled by one of your workers, pick them here. The 40% commission will be attributed to them just like a link-referred sale.'}
              </p>
              <Combobox
                value={formVendorId}
                onChange={(v) => setFormVendorId(v)}
                options={[
                  { value: '', label: es ? '— Sin vendedor (venta propia) —' : '— No vendor (own sale) —' },
                  ...vendors.map((v) => ({
                    value: v.id,
                    label: `${v.name || v.email} · ${v.role}`,
                    sublabel: v.email,
                  })),
                ]}
                searchable
                placeholder={es ? 'Buscar trabajador…' : 'Search worker…'}
              />
              {formVendorId && (() => {
                const v = vendors.find((x) => x.id === formVendorId);
                return v ? (
                  <p className="text-[11px] text-emerald-700 font-semibold">
                    ✓ {es ? 'Atribuida a' : 'Attributed to'} <strong>{v.name || v.email}</strong>
                  </p>
                ) : null;
              })()}
            </div>

            {/* Contact — at least one of email / phone required */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-2">
              <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                {es ? 'Contacto del cliente (al menos uno)' : 'Customer contact (at least one)'}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Email</label>
                  <Input type="email" value={formEmail} onChange={(e) => { setFormEmail(e.target.value); setFormError(''); }} placeholder="email@..." />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">{es ? 'Teléfono' : 'Phone'}</label>
                  <Input type="tel" value={formPhone} onChange={(e) => { setFormPhone(e.target.value); setFormError(''); }} placeholder="+1 555 123 4567" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">{es ? 'Código de cupón / link (opcional)' : 'Coupon / link code (optional)'}</label>
                <Input
                  value={formCouponCode}
                  onChange={(e) => setFormCouponCode(e.target.value.toUpperCase())}
                  placeholder={es ? 'Ej: MAMA20' : 'e.g. MOM20'}
                  className="uppercase font-mono"
                />
                {formCouponCode.trim() && (
                  <p className={`text-[11px] font-semibold mt-1 ${
                    formCouponStatus === 'valid' ? 'text-emerald-700'
                    : formCouponStatus === 'invalid' ? 'text-red-600'
                    : 'text-slate-500'
                  }`}>
                    {formCouponStatus === 'checking' && (es ? 'Validando…' : 'Checking…')}
                    {formCouponStatus === 'valid' && formCoupon && (
                      <>✓ {formCoupon.code} {formCoupon.discountType === 'percent' ? `(-${formCoupon.discountValue}%)` : `(-$${formCoupon.discountValue})`}</>
                    )}
                    {formCouponStatus === 'invalid' && (es ? 'Cupón no válido o expirado' : 'Coupon invalid or expired')}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">{es ? 'Nota' : 'Note'}</label>
                <Input value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder={es ? 'Detalles...' : 'Details...'} />
              </div>
            </div>

            {formError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-semibold">
                {formError}
              </div>
            )}

            <Button
              onClick={handleRegister}
              disabled={saving || formItems.length === 0}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white rounded-xl h-11 font-bold"
            >
              {saving ? '...' : (es ? 'Registrar venta' : 'Register sale')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── SALES LIST ─── */}
      {tab !== 'register' && (
        <Card>
          <CardContent className="p-0">
            {displaySales.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">
                {es ? 'No hay ventas en este periodo.' : 'No sales in this period.'}
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {displaySales.map((sale) => (
                  <div key={sale.id} className="p-4 hover:bg-slate-50 transition-colors">
                    {/* Top row: icon + info + amount (stacks safely on mobile) */}
                    <div className="flex items-start gap-3 sm:gap-4">
                      {/* Channel icon */}
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                        sale.channel === 'online' ? 'bg-brand-100' : sale.channel === 'direct' ? 'bg-amber-100' : 'bg-slate-100'
                      }`}>
                        {sale.channel === 'online' ? <ShoppingBag className="h-5 w-5 text-brand-700" /> :
                         sale.channel === 'direct' ? <Users className="h-5 w-5 text-amber-700" /> :
                         <Tag className="h-5 w-5 text-slate-600" />}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {sale.customerName || (es ? 'Sin cliente' : 'No customer')}
                          </p>
                          <span className="text-[10px] rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 font-semibold">
                            {channelLabel(sale.channel)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 break-words">
                          {sale.items.map((i) => `${i.productName} ×${i.quantity}`).join(' · ')}
                        </p>
                        {sale.note && <p className="text-xs text-slate-400 italic mt-0.5 break-words">{sale.note}</p>}
                        {sale.referredBy && (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                            {es ? 'Compartido por' : 'Shared by'}: {sale.referredBy.displayName}
                            <span className="text-brand-500 uppercase ml-1">{sale.referredBy.role}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400">
                          <Clock className="h-3 w-3" />
                          {formatDate(sale.createdAt)}
                        </div>
                      </div>

                      {/* Numbers */}
                      <div className="text-right shrink-0">
                        <p className="text-base sm:text-lg font-black text-slate-900">${sale.total.toFixed(2)}</p>
                        <p className={`text-[11px] sm:text-xs font-bold ${sale.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {sale.profit >= 0 ? '+' : ''}${sale.profit.toFixed(2)} {es ? 'ganancia' : 'profit'}
                        </p>
                        {sale.totalCost > 0 && (
                          <p className="text-[10px] text-slate-400">{es ? 'costo' : 'cost'}: ${sale.totalCost.toFixed(2)}</p>
                        )}
                      </div>
                    </div>

                    {/* Action bar: own row, wraps on mobile so nothing gets clipped */}
                    <div className="flex flex-wrap items-center gap-2 mt-3 sm:pl-[52px]">
                      {sale.channel === 'online' && (() => {
                        const oid = sale.id.replace(/^order-/, '');
                        const ord = orders.find((o) => o.id === oid);
                        if (!ord) return null;
                        return (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setProtocolOrder(ord)}
                              className="text-brand-600 border-brand-200 hover:bg-brand-50 h-9 px-3 text-xs font-bold"
                              title={es ? 'Ver protocolo IA' : 'View AI protocol'}
                            >
                              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                              {es ? 'Protocolo' : 'Protocol'}
                            </Button>
                            {/* Edit/manage the order via Finance page (pre-expanded). */}
                            <Link
                              to={`/admin/finance?expand=${oid}`}
                              className="inline-flex items-center gap-1 text-emerald-700 border border-emerald-200 hover:bg-emerald-50 h-9 px-3 text-xs font-bold rounded-md"
                              title={es ? 'Gestionar pedido' : 'Manage order'}
                            >
                              ✎ {es ? 'Gestionar' : 'Manage'}
                            </Link>
                          </>
                        );
                      })()}
                      {sale.channel !== 'online' && !sale.id.startsWith('order-') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditManualId(sale.id)}
                          className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 h-9 px-3 text-xs font-bold"
                          title={es ? 'Editar venta manual' : 'Edit manual sale'}
                        >
                          ✎ {es ? 'Editar' : 'Edit'}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteId(sale.id)}
                        className="text-slate-400 hover:text-red-500 hover:bg-red-50 h-9 px-3 text-xs font-bold ml-auto"
                        title={es ? 'Eliminar' : 'Delete'}
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:mr-1.5" />
                        <span className="hidden sm:inline">{es ? 'Eliminar' : 'Delete'}</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {/* ── AI Protocol modal ── */}
      {protocolOrder && (
        <OrderProtocolModal
          open={!!protocolOrder}
          onClose={() => setProtocolOrder(null)}
          order={protocolOrder}
        />
      )}

      {/* ── Edit Manual Sale modal ── */}
      {editManualId && (() => {
        const manual = manualSales.find((m) => m.id === editManualId);
        if (!manual) return null;
        return (
          <EditManualSaleModal
            sale={manual}
            es={es}
            vendors={vendors}
            products={products}
            onClose={() => setEditManualId(null)}
          />
        );
      })()}

      {/* ── Delete confirmation popup ── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 animate-scale-in mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">
                  {es ? '¿Eliminar esta venta?' : 'Delete this sale?'}
                </h3>
                <p className="text-xs text-slate-500">
                  {es ? 'Esta acción es irreversible.' : 'This action is irreversible.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg"
              >
                {es ? 'Cancelar' : 'Cancel'}
              </Button>
              <Button
                size="sm"
                onClick={() => void executeDelete(confirmDeleteId)}
                className="bg-red-600 hover:bg-red-500 text-white rounded-lg"
              >
                {es ? 'Sí, eliminar' : 'Yes, delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Suppress unused
void Filter;
void Calendar;
void ChevronDown;

interface EditManualSaleModalProps {
  sale: SaleRecord;
  es: boolean;
  vendors: Array<{ id: string; name: string; email: string; role: string }>;
  products: Array<{ id: string; name: string; nameEs?: string; category: string; price: number; discountType?: 'percent' | 'fixed'; discountValue?: number }>;
  onClose: () => void;
}

function EditManualSaleModal({ sale, es, vendors, products, onClose }: EditManualSaleModalProps) {
  const [customer, setCustomer] = useState(sale.customerName || '');
  const [email, setEmail] = useState(sale.customerEmail || '');
  const [phone, setPhone] = useState((sale as { customerPhone?: string }).customerPhone || '');
  const [channel, setChannel] = useState<'direct' | 'wholesale' | 'other'>(
    (sale.channel === 'direct' || sale.channel === 'wholesale' || sale.channel === 'other')
      ? sale.channel
      : 'direct',
  );
  const [note, setNote] = useState(sale.note || '');
  const [vendorId, setVendorId] = useState<string>(
    String((sale as { referrerId?: string | null }).referrerId || ''),
  );
  const [items, setItems] = useState(sale.items.map((it) => ({ ...it })));
  const [saving, setSaving] = useState(false);

  const subtotal = items.reduce((s, i) => s + (i.unitPrice || 0) * (i.quantity || 0), 0);
  const totalCost = items.reduce((s, i) => s + (i.unitCost || 0) * (i.quantity || 0), 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Recompute upline (referrer's referrer) when changing vendor attribution.
      let newUpline: string | null = null;
      if (vendorId) {
        try {
          const metaSnap = await getDoc(doc(db, 'publicReferralMeta', vendorId));
          if (metaSnap.exists()) {
            const ancestors = (metaSnap.data().referralAncestors as string[]) || [];
            newUpline = ancestors.length > 0 ? ancestors[0] : null;
          }
        } catch { /* ignore */ }
      }

      await updateDoc(doc(db, 'manualSales', sale.id), {
        customerName: customer.trim() || null,
        customerEmail: email.trim() || null,
        customerPhone: phone.trim() || null,
        channel,
        note: note.trim() || null,
        // Attribute / re-attribute this sale to a vendor.
        referrerId: vendorId || null,
        uplineReferrerId: newUpline,
        attributedToVendorId: vendorId || null,
        items,
        subtotal,
        total: subtotal,
        totalCost,
        profit: subtotal - totalCost,
        updatedAt: serverTimestamp(),
      });
      onClose();
    } catch (e) {
      console.error(e);
      window.alert(es ? 'No se pudo guardar' : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold">
              {es ? 'Editar venta manual' : 'Edit manual sale'}
            </p>
            <h2 className="text-lg font-bold text-slate-900">{customer || (es ? 'Sin cliente' : 'No customer')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none p-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">{es ? 'Cliente' : 'Customer'}</label>
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Juan Pérez" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">{es ? 'Canal' : 'Channel'}</label>
              <Combobox
                value={channel}
                onChange={(v) => setChannel(v as 'direct' | 'wholesale' | 'other')}
                options={[
                  { value: 'direct', label: es ? '🤝 Venta directa' : '🤝 Direct sale' },
                  { value: 'wholesale', label: es ? '📦 Mayoreo' : '📦 Wholesale' },
                  { value: 'other', label: es ? '📋 Otro' : '📋 Other' },
                ]}
                searchable={false}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@..." />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">{es ? 'Teléfono' : 'Phone'}</label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 1234567" />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">{es ? 'Nota' : 'Note'}</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={es ? 'Detalles…' : 'Details…'} />
          </div>

          {/* Vendor attribution (re-)assignment */}
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
            <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
              {es ? 'Atribuir a un vendedor' : 'Attribute to a vendor'}
            </p>
            <Combobox
              value={vendorId}
              onChange={(v) => setVendorId(v)}
              options={[
                { value: '', label: es ? '— Sin vendedor (venta propia) —' : '— No vendor (own sale) —' },
                ...vendors.map((v) => ({
                  value: v.id,
                  label: `${v.name || v.email} · ${v.role}`,
                  sublabel: v.email,
                })),
              ]}
              searchable
              placeholder={es ? 'Buscar trabajador…' : 'Search worker…'}
            />
            {vendorId && (() => {
              const v = vendors.find((x) => x.id === vendorId);
              return v ? (
                <p className="text-[11px] text-emerald-700 font-semibold">
                  ✓ {es ? 'Atribuida a' : 'Attributed to'} <strong>{v.name || v.email}</strong>
                </p>
              ) : null;
            })()}
          </div>

          <div>
            <p className="text-xs font-bold text-slate-600 mb-2">{es ? 'Productos' : 'Items'}</p>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center rounded-lg border border-slate-200 p-2">
                  <div className="col-span-6">
                    <EditManualProductPicker
                      value={it.productName}
                      products={products}
                      onChange={(name, _productId, suggestedPrice) => {
                        const next = [...items];
                        next[idx] = {
                          ...next[idx],
                          productName: name,
                          productId: _productId || next[idx].productId,
                          unitPrice: suggestedPrice ?? next[idx].unitPrice,
                        };
                        setItems(next);
                      }}
                    />
                  </div>
                  {false && (
                  <Input
                    className="col-span-6 text-xs"
                    value={it.productName}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], productName: e.target.value };
                      setItems(next);
                    }}
                    placeholder={es ? 'Producto' : 'Product'}
                  />
                  )}
                  <Input
                    className="col-span-2 text-xs"
                    type="number"
                    min={0}
                    value={it.quantity}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], quantity: Math.max(0, parseInt(e.target.value || '0', 10)) };
                      setItems(next);
                    }}
                  />
                  <Input
                    className="col-span-3 text-xs"
                    type="number"
                    step="0.01"
                    min={0}
                    value={it.unitPrice}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], unitPrice: Math.max(0, parseFloat(e.target.value || '0')) };
                      setItems(next);
                    }}
                  />
                  <button
                    type="button"
                    className="col-span-1 text-red-500 hover:text-red-700 text-sm"
                    onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    title={es ? 'Quitar' : 'Remove'}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-xs text-slate-400 italic">{es ? 'Sin productos.' : 'No items.'}</p>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 grid grid-cols-3 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{es ? 'Venta' : 'Sale'}</p>
              <p className="text-lg font-black text-slate-900">${subtotal.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{es ? 'Costo' : 'Cost'}</p>
              <p className="text-lg font-black text-red-700">${totalCost.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{es ? 'Ganancia' : 'Profit'}</p>
              <p className="text-lg font-black text-emerald-700">${(subtotal - totalCost).toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 px-5 py-3 flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-600">
            {es ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold"
          >
            {saving ? '...' : (es ? 'Guardar cambios' : 'Save changes')}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface EditPickerProps {
  value: string;
  products: Array<{ id: string; name: string; nameEs?: string; category: string; price: number; discountType?: 'percent' | 'fixed'; discountValue?: number }>;
  onChange: (name: string, productId?: string, suggestedPrice?: number) => void;
}

function EditManualProductPicker({ value, products, onChange }: EditPickerProps) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const q = (value || '').trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products
      .filter((p) => (p.name || '').toLowerCase().includes(q) || (p.nameEs || '').toLowerCase().includes(q))
      .slice(0, 10);
  }, [products, value]);
  return (
    <div className="relative">
      <Input
        className="text-xs"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 200)}
        placeholder="Buscar producto o escribir nombre…"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-30 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg text-xs">
          {filtered.map((p) => {
            const base = p.price;
            let final = base;
            if (p.discountType === 'percent' && Number(p.discountValue) > 0) final = base * (1 - Number(p.discountValue) / 100);
            else if (p.discountType === 'fixed' && Number(p.discountValue) > 0) final = Math.max(0, base - Number(p.discountValue));
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(p.name, p.id, final);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-brand-50 border-b border-slate-100 last:border-0"
                >
                  <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{p.category}</span>
                    <span className="font-mono">${final.toFixed(2)}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
