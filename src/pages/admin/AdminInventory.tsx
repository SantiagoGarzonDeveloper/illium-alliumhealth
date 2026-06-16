import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, updateDoc, limit as fLimit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/I18nContext';
import { useAppStore } from '@/store';
import {
  DollarSign,
  TrendingUp,
  Package,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Minus,
  History,
  AlertTriangle,
  Truck,
} from 'lucide-react';

type InventoryLog = {
  id: string;
  productId: string;
  productName: string;
  type: 'restock' | 'adjustment' | 'sale';
  quantity: number;
  previousStock: number;
  newStock: number;
  note?: string;
  createdAt?: { seconds: number };
};

type OrderDoc = {
  id: string;
  total?: number;
  items?: Array<{ productId?: string; name?: string; quantity?: number; price?: number }>;
  createdAt?: { seconds: number };
  status?: string;
};

export function AdminInventory() {
  const { locale } = useI18n();
  const es = locale === 'es';
  const products = useAppStore((s) => s.products);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);
  const [adjustProductId, setAdjustProductId] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustType, setAdjustType] = useState<'restock' | 'adjustment'>('restock');
  const [saving, setSaving] = useState(false);
  const [freeShipThreshold, setFreeShipThreshold] = useState(300);
  const [savingThreshold, setSavingThreshold] = useState(false);

  useEffect(() => {
    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), fLimit(2000)),
      (snap) => setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderDoc)))
    );
    const unsubLogs = onSnapshot(
      query(collection(db, 'inventoryLogs'), fLimit(500)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryLog));
        rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setInventoryLogs(rows);
      }
    );
    // Load free shipping threshold
    const unsubSettings = onSnapshot(doc(db, 'settings', 'general'), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (typeof d.freeShippingThreshold === 'number') setFreeShipThreshold(d.freeShippingThreshold);
      }
    });
    return () => { unsubOrders(); unsubLogs(); unsubSettings(); };
  }, []);

  // ─── Computed metrics ───
  const metrics = useMemo(() => {
    let totalInvested = 0;
    let currentInventoryValue = 0;
    let totalRevenue = 0;
    let totalCogs = 0; // cost of goods sold
    let totalUnitsSold = 0;

    // Inventory value
    for (const p of products) {
      const cost = p.cost || 0;
      totalInvested += cost * (p.stock || 0); // rough: current stock × cost
      currentInventoryValue += (p.price || 0) * (p.stock || 0); // retail value
    }

    // Revenue & COGS from orders
    const productCostMap = new Map<string, number>();
    for (const p of products) {
      productCostMap.set(p.id, p.cost || 0);
    }

    for (const o of orders) {
      totalRevenue += Number(o.total) || 0;
      for (const item of o.items || []) {
        const qty = item.quantity || 1;
        const cost = productCostMap.get(item.productId || '') || 0;
        totalCogs += cost * qty;
        totalUnitsSold += qty;
      }
    }

    const grossProfit = totalRevenue - totalCogs;
    const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return {
      totalInvested: Math.round(totalInvested * 100) / 100,
      currentInventoryValue: Math.round(currentInventoryValue * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCogs: Math.round(totalCogs * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      margin: Math.round(margin * 10) / 10,
      totalUnitsSold,
      totalOrders: orders.length,
    };
  }, [products, orders]);

  // Per-product breakdown
  const productBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; cost: number; price: number; stock: number; sold: number; revenue: number; cogs: number }>();
    for (const p of products) {
      map.set(p.id, { name: p.name, cost: p.cost || 0, price: p.price, stock: p.stock, sold: 0, revenue: 0, cogs: 0 });
    }
    for (const o of orders) {
      for (const item of o.items || []) {
        const row = map.get(item.productId || '');
        if (row) {
          const qty = item.quantity || 1;
          row.sold += qty;
          row.revenue += (item.price || 0) * qty;
          row.cogs += row.cost * qty;
        }
      }
    }
    return Array.from(map.entries())
      .map(([id, r]) => ({ id, ...r, profit: r.revenue - r.cogs, margin: r.revenue > 0 ? ((r.revenue - r.cogs) / r.revenue * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [products, orders]);

  // ─── Save inventory adjustment ───
  const handleAdjust = async () => {
    if (!adjustProductId || !adjustQty) return;
    setSaving(true);
    const product = products.find((p) => p.id === adjustProductId);
    if (!product) { setSaving(false); return; }
    const delta = adjustType === 'restock' ? Math.abs(parseInt(adjustQty, 10) || 0) : -(Math.abs(parseInt(adjustQty, 10) || 0));
    const newStock = Math.max(0, product.stock + delta);

    try {
      await addDoc(collection(db, 'inventoryLogs'), {
        productId: product.id,
        productName: product.name,
        type: adjustType,
        quantity: delta,
        previousStock: product.stock,
        newStock,
        note: adjustNote || null,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'products', product.id), { stock: newStock });
      setAdjustProductId(null);
      setAdjustQty('');
      setAdjustNote('');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const saveThreshold = async () => {
    setSavingThreshold(true);
    try {
      await updateDoc(doc(db, 'settings', 'general'), { freeShippingThreshold: freeShipThreshold });
    } finally {
      setSavingThreshold(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* ─── PROFIT DASHBOARD ─── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">
          {es ? 'Inventario y Ganancias' : 'Inventory & Profits'}
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          {es ? 'Control de costos, stock y margen de ganancia por producto.' : 'Cost control, stock and profit margin per product.'}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-brand-100 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-brand-700" />
              </div>
            </div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              {es ? 'Ingresos totales' : 'Total Revenue'}
            </p>
            <p className="text-2xl font-black text-slate-900 mt-1">${metrics.totalRevenue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
                <ArrowDownRight className="h-5 w-5 text-red-700" />
              </div>
            </div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              {es ? 'Costo de ventas (COGS)' : 'Cost of Goods Sold'}
            </p>
            <p className="text-2xl font-black text-red-700 mt-1">-${metrics.totalCogs.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-700" />
              </div>
            </div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              {es ? 'Ganancia bruta' : 'Gross Profit'}
            </p>
            <p className={`text-2xl font-black mt-1 ${metrics.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              ${metrics.grossProfit.toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{metrics.margin}% {es ? 'margen' : 'margin'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <Package className="h-5 w-5 text-amber-700" />
              </div>
            </div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              {es ? 'Valor inventario (costo)' : 'Inventory Value (cost)'}
            </p>
            <p className="text-2xl font-black text-slate-900 mt-1">${metrics.totalInvested.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-0.5">{products.length} {es ? 'productos' : 'products'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-white border border-brand-200 p-5 text-center">
          <p className="text-4xl font-black text-brand-900">{metrics.totalOrders}</p>
          <p className="text-xs text-slate-600 mt-1 font-semibold">{es ? 'Pedidos' : 'Orders'}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-white border border-brand-200 p-5 text-center">
          <p className="text-4xl font-black text-brand-900">{metrics.totalUnitsSold}</p>
          <p className="text-xs text-slate-600 mt-1 font-semibold">{es ? 'Unidades vendidas' : 'Units sold'}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-white border border-brand-200 p-5 text-center">
          <p className="text-4xl font-black text-brand-900">${metrics.currentInventoryValue.toLocaleString()}</p>
          <p className="text-xs text-slate-600 mt-1 font-semibold">{es ? 'Valor retail del stock' : 'Retail stock value'}</p>
        </div>
      </div>

      {/* ─── FREE SHIPPING THRESHOLD ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-5 w-5 text-brand-600" />
            {es ? 'Umbral de envío gratis' : 'Free shipping threshold'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                {es ? 'Monto mínimo para envío gratis (USD)' : 'Minimum order for free shipping (USD)'}
              </label>
              <Input
                type="number"
                min={0}
                step={10}
                value={freeShipThreshold}
                onChange={(e) => setFreeShipThreshold(Number(e.target.value) || 0)}
              />
            </div>
            <Button
              onClick={saveThreshold}
              disabled={savingThreshold}
              className="bg-brand-600 hover:bg-brand-500 text-white h-10 px-5 text-sm font-semibold rounded-lg"
            >
              {savingThreshold ? '...' : (es ? 'Guardar' : 'Save')}
            </Button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {es
              ? `Actualmente: envío gratis en pedidos de $${freeShipThreshold}+. Se muestra en la barra superior del sitio.`
              : `Currently: free shipping on orders $${freeShipThreshold}+. Shown in the top bar.`}
          </p>
        </CardContent>
      </Card>

      {/* ─── PER-PRODUCT TABLE ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5 text-brand-600" />
            {es ? 'Desglose por producto' : 'Per-product breakdown'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">{es ? 'Producto' : 'Product'}</th>
                <th className="px-4 py-3 text-right">{es ? 'Costo' : 'Cost'}</th>
                <th className="px-4 py-3 text-right">{es ? 'Precio' : 'Price'}</th>
                <th className="px-4 py-3 text-right">{es ? 'Margen' : 'Margin'}</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">{es ? 'Vendidos' : 'Sold'}</th>
                <th className="px-4 py-3 text-right">{es ? 'Ingreso' : 'Revenue'}</th>
                <th className="px-4 py-3 text-right">{es ? 'Ganancia' : 'Profit'}</th>
                <th className="px-4 py-3 text-center">{es ? 'Ajustar' : 'Adjust'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productBreakdown.map((p) => {
                const unitMargin = p.price > 0 && p.cost > 0 ? ((p.price - p.cost) / p.price * 100) : 0;
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{p.name}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {p.cost > 0 ? `$${p.cost.toFixed(2)}` : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold">${p.price.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      {p.cost > 0 ? (
                        <span className={`inline-flex items-center gap-1 text-xs font-bold ${unitMargin >= 50 ? 'text-emerald-700' : unitMargin >= 30 ? 'text-amber-700' : 'text-red-700'}`}>
                          <ArrowUpRight className="h-3 w-3" />
                          {unitMargin.toFixed(0)}%
                        </span>
                      ) : <span className="text-slate-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${p.stock < 20 ? 'text-red-600' : 'text-slate-900'}`}>
                        {p.stock}
                      </span>
                      {p.stock < 20 && <AlertTriangle className="inline h-3 w-3 text-red-500 ml-1" />}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{p.sold}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">${p.revenue.toFixed(0)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${p.profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        ${p.profit.toFixed(0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAdjustProductId(adjustProductId === p.id ? null : p.id)}
                        className="text-xs h-7 px-2"
                      >
                        {adjustProductId === p.id ? '✕' : (es ? '± Stock' : '± Stock')}
                      </Button>
                      {adjustProductId === p.id && (
                        <div className="absolute z-10 mt-2 right-4 w-72 rounded-2xl bg-white border border-slate-200 shadow-elevated p-4 space-y-3">
                          <p className="text-xs font-bold text-slate-900">{p.name}</p>
                          <p className="text-xs text-slate-500">Stock: {p.stock}</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setAdjustType('restock')}
                              className={`flex-1 text-xs font-semibold py-2 rounded-lg transition ${adjustType === 'restock' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                            >
                              <Plus className="h-3 w-3 inline mr-1" />{es ? 'Agregar' : 'Add'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAdjustType('adjustment')}
                              className={`flex-1 text-xs font-semibold py-2 rounded-lg transition ${adjustType === 'adjustment' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                            >
                              <Minus className="h-3 w-3 inline mr-1" />{es ? 'Quitar' : 'Remove'}
                            </button>
                          </div>
                          <Input
                            type="number"
                            min={1}
                            placeholder={es ? 'Cantidad' : 'Quantity'}
                            value={adjustQty}
                            onChange={(e) => setAdjustQty(e.target.value)}
                          />
                          <Input
                            type="text"
                            placeholder={es ? 'Nota (opcional)' : 'Note (optional)'}
                            value={adjustNote}
                            onChange={(e) => setAdjustNote(e.target.value)}
                          />
                          <Button
                            onClick={handleAdjust}
                            disabled={saving || !adjustQty}
                            className="w-full bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold h-9 rounded-lg"
                          >
                            {saving ? '...' : (es ? 'Confirmar ajuste' : 'Confirm adjustment')}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ─── INVENTORY HISTORY ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-brand-600" />
            {es ? 'Historial de inventario' : 'Inventory history'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {inventoryLogs.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              {es ? 'Aún no hay movimientos de inventario. Usa "± Stock" para registrar ajustes.' : 'No inventory movements yet. Use "± Stock" to record adjustments.'}
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {inventoryLogs.map((log) => {
                const isPositive = log.quantity > 0;
                const date = log.createdAt?.seconds
                  ? new Date(log.createdAt.seconds * 1000).toLocaleString(es ? 'es-CO' : 'en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '';
                return (
                  <div key={log.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${isPositive ? 'bg-emerald-100' : 'bg-red-100'}`}>
                      {isPositive ? <Plus className="h-4 w-4 text-emerald-700" /> : <Minus className="h-4 w-4 text-red-700" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{log.productName}</p>
                      <p className="text-xs text-slate-500">
                        {log.previousStock} → {log.newStock} ({isPositive ? '+' : ''}{log.quantity})
                        {log.note && <span className="ml-1 text-slate-400">· {log.note}</span>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        log.type === 'restock' ? 'bg-emerald-100 text-emerald-700' : log.type === 'sale' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {log.type === 'restock' ? (es ? 'Restock' : 'Restock') : log.type === 'sale' ? (es ? 'Venta' : 'Sale') : (es ? 'Ajuste' : 'Adjust')}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-0.5">{date}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
