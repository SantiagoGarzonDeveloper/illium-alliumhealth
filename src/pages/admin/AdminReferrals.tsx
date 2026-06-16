import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, limit as fLimit, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/I18nContext';
import {
  Share2,
  Users,
  TrendingUp,
  Eye,
  ShoppingBag,
  Search,
  Crown,
  Briefcase,
} from 'lucide-react';

type SharedCartDoc = {
  id: string;
  status: 'active' | 'used' | 'expired';
  openCount?: number;
  total?: number;
  subtotal?: number;
  referredBy?: { uid: string; role: 'admin' | 'worker'; displayName: string; email: string };
  createdAt?: { seconds: number };
  expiresAtMs?: number;
  usedOrderId?: string | null;
};

type OrderDoc = {
  id: string;
  total?: number;
  status?: string;
  customer?: { name?: string; email?: string };
  sharedFromShareId?: string | null;
  referredBy?: { uid: string; role: 'admin' | 'worker'; displayName: string; email: string } | null;
  createdAt?: { seconds: number };
};

interface ReferrerStats {
  uid: string;
  role: 'admin' | 'worker';
  displayName: string;
  email: string;
  linksCreated: number;
  totalOpens: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
}

export function AdminReferrals() {
  const { locale } = useI18n();
  const es = locale === 'es';

  const [shares, setShares] = useState<SharedCartDoc[]>([]);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [period, setPeriod] = useState<'all' | '7d' | '30d' | '90d'>('all');

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, 'sharedCarts'), fLimit(2000)), (snap) => {
      setShares(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SharedCartDoc, 'id'>) })));
    });
    const u2 = onSnapshot(query(collection(db, 'orders'), fLimit(2000)), (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderDoc, 'id'>) })));
    });
    return () => {
      u1();
      u2();
    };
  }, []);

  const cutoffSec = useMemo(() => {
    const now = Date.now() / 1000;
    if (period === '7d') return now - 7 * 86400;
    if (period === '30d') return now - 30 * 86400;
    if (period === '90d') return now - 90 * 86400;
    return 0;
  }, [period]);

  const stats = useMemo<ReferrerStats[]>(() => {
    const byUid = new Map<string, ReferrerStats>();
    const ensureRow = (rb: NonNullable<SharedCartDoc['referredBy']>): ReferrerStats => {
      const existing = byUid.get(rb.uid);
      if (existing) return existing;
      const row: ReferrerStats = {
        uid: rb.uid,
        role: rb.role,
        displayName: rb.displayName,
        email: rb.email,
        linksCreated: 0,
        totalOpens: 0,
        conversions: 0,
        revenue: 0,
        conversionRate: 0,
      };
      byUid.set(rb.uid, row);
      return row;
    };

    for (const s of shares) {
      if (!s.referredBy?.uid) continue;
      if (cutoffSec > 0 && (s.createdAt?.seconds || 0) < cutoffSec) continue;
      const row = ensureRow(s.referredBy);
      row.linksCreated += 1;
      row.totalOpens += s.openCount || 0;
    }
    for (const o of orders) {
      if (!o.referredBy?.uid) continue;
      if (cutoffSec > 0 && (o.createdAt?.seconds || 0) < cutoffSec) continue;
      const row = ensureRow(o.referredBy);
      row.conversions += 1;
      row.revenue += Number(o.total) || 0;
    }
    for (const row of byUid.values()) {
      row.conversionRate = row.linksCreated > 0
        ? Math.round((row.conversions / row.linksCreated) * 1000) / 10
        : 0;
      row.revenue = Math.round(row.revenue * 100) / 100;
    }
    const arr = Array.from(byUid.values());
    arr.sort((a, b) => b.revenue - a.revenue || b.conversions - a.conversions);
    if (!searchQ.trim()) return arr;
    const q = searchQ.toLowerCase();
    return arr.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q),
    );
  }, [shares, orders, cutoffSec, searchQ]);

  const totals = useMemo(() => {
    const linksCreated = stats.reduce((s, r) => s + r.linksCreated, 0);
    const opens = stats.reduce((s, r) => s + r.totalOpens, 0);
    const conversions = stats.reduce((s, r) => s + r.conversions, 0);
    const revenue = stats.reduce((s, r) => s + r.revenue, 0);
    return {
      linksCreated,
      opens,
      conversions,
      revenue: Math.round(revenue * 100) / 100,
      conversionRate: linksCreated > 0 ? Math.round((conversions / linksCreated) * 1000) / 10 : 0,
    };
  }, [stats]);

  const recentShares = useMemo(() => {
    const filtered = cutoffSec > 0
      ? shares.filter((s) => (s.createdAt?.seconds || 0) >= cutoffSec)
      : shares;
    return [...filtered]
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 30);
  }, [shares, cutoffSec]);

  const formatDate = (ts?: { seconds: number }) => {
    if (!ts) return '—';
    return new Date(ts.seconds * 1000).toLocaleDateString(es ? 'es-CO' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {es ? 'Ventas Referidas (Carrito Compartido)' : 'Referred Sales (Shared Cart)'}
          </h1>
          <p className="text-sm text-slate-500">
            {es
              ? 'Quién comparte links de carrito, cuántos se abren y cuáles convierten en compras.'
              : 'Who shares cart links, how many are opened, and which convert into purchases.'}
          </p>
        </div>
        <div className="flex gap-2">
          {(['all', '7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold border ${
                period === p
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {p === 'all' ? (es ? 'Todo' : 'All') : p}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={Share2} label={es ? 'Links creados' : 'Links created'} value={totals.linksCreated} />
        <KpiCard icon={Eye} label={es ? 'Aperturas' : 'Opens'} value={totals.opens} />
        <KpiCard icon={ShoppingBag} label={es ? 'Conversiones' : 'Conversions'} value={totals.conversions} />
        <KpiCard
          icon={TrendingUp}
          label={es ? 'Tasa de conversión' : 'Conversion rate'}
          value={`${totals.conversionRate}%`}
        />
        <KpiCard
          icon={Users}
          label={es ? 'Ingresos referidos' : 'Referred revenue'}
          value={`$${totals.revenue.toFixed(2)}`}
          accent
        />
      </div>

      {/* Ranking */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">{es ? 'Ranking por persona' : 'Ranking by person'}</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder={es ? 'Buscar nombre o correo…' : 'Search name or email…'}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {stats.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              {es
                ? 'Aún nadie ha compartido carritos en este periodo.'
                : 'Nobody has shared a cart in this period yet.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {stats.map((row, idx) => (
                <div key={row.uid} className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
                  <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-600">
                    #{idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-900 truncate">{row.displayName || row.email}</p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          row.role === 'admin'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-brand-100 text-brand-700'
                        }`}
                      >
                        {row.role === 'admin' ? <Crown className="h-3 w-3" /> : <Briefcase className="h-3 w-3" />}
                        {row.role === 'admin' ? 'Admin' : 'Partner'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{row.email}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-6 text-xs">
                    <StatCell label={es ? 'Links' : 'Links'} value={row.linksCreated} />
                    <StatCell label={es ? 'Aperturas' : 'Opens'} value={row.totalOpens} />
                    <StatCell label={es ? 'Ventas' : 'Sales'} value={row.conversions} />
                    <StatCell label={es ? 'Conv.' : 'Conv.'} value={`${row.conversionRate}%`} />
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-black text-slate-900">${row.revenue.toFixed(2)}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                      {es ? 'Referido' : 'Referred'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent shares */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{es ? 'Últimos links compartidos' : 'Recent shared links'}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentShares.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              {es ? 'Nada por aquí todavía.' : 'Nothing here yet.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentShares.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-3 text-xs">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      s.status === 'used'
                        ? 'bg-emerald-100 text-emerald-700'
                        : s.status === 'expired'
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-brand-100 text-brand-700'
                    }`}
                  >
                    {s.status === 'used'
                      ? es
                        ? 'Vendido'
                        : 'Sold'
                      : s.status === 'expired'
                        ? es
                          ? 'Expirado'
                          : 'Expired'
                        : es
                          ? 'Activo'
                          : 'Active'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-700 truncate">
                      {s.referredBy?.displayName || s.referredBy?.email || '—'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {formatDate(s.createdAt)} · {s.openCount || 0} {es ? 'aperturas' : 'opens'}
                    </p>
                  </div>
                  <p className="font-bold text-slate-800">${(s.total || 0).toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent
          ? 'border-brand-200 bg-gradient-to-br from-brand-50 to-white'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500">{label}</p>
        <Icon className={`h-4 w-4 ${accent ? 'text-brand-600' : 'text-slate-400'}`} />
      </div>
      <p className={`text-2xl font-black tracking-tight ${accent ? 'text-brand-700' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-center">
      <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">{label}</p>
      <p className="text-sm font-bold text-slate-700">{value}</p>
    </div>
  );
}
