import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, addDoc, serverTimestamp, limit as fLimit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/I18nContext';
import {
  DollarSign, CheckCircle2, Clock, Users, Search, ChevronDown, ChevronUp,
  ArrowUpRight, CreditCard, Wallet, History,
} from 'lucide-react';

type UserDoc = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  vendorStatus?: string;
  commissionMode?: string;
  commissionPercentage?: number;
  commissionFixedAmount?: number;
};

type OrderDoc = {
  id: string;
  total?: number;
  referrerId?: string;
  uplineReferrerId?: string;
  referrerCommissionAmount?: number;
  uplineCommissionAmount?: number;
  referrerPayoutStatus?: string;
  uplinePayoutStatus?: string;
  items?: Array<{ productId?: string; quantity?: number; price?: number }>;
  createdAt?: { seconds: number };
};

type PayoutRecord = {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorEmail: string;
  amount: number;
  note?: string;
  method?: string;
  createdAt?: { seconds: number };
};

export function AdminPayouts() {
  const { locale } = useI18n();
  const es = locale === 'es';
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payMethod, setPayMethod] = useState('Zelle');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, 'users'), fLimit(2000)), (s) =>
      setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() } as UserDoc)))
    );
    const u2 = onSnapshot(query(collection(db, 'orders'), fLimit(2000)), (s) =>
      setOrders(s.docs.map((d) => ({ id: d.id, ...d.data() } as OrderDoc)))
    );
    const u3 = onSnapshot(query(collection(db, 'payouts'), fLimit(2000)), (s) => {
      const rows = s.docs.map((d) => ({ id: d.id, ...d.data() } as PayoutRecord));
      rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPayouts(rows);
    });
    return () => { u1(); u2(); u3(); };
  }, []);

  // Calculate what each vendor is owed
  const vendorBalances = useMemo(() => {
    const workers = users.filter((u) => u.role === 'worker');
    return workers.map((w) => {
      // Total earned from orders (direct + upline)
      let totalEarned = 0;
      let pendingAmount = 0;
      let paidFromOrders = 0;
      let salesCount = 0;

      for (const o of orders) {
        if (o.referrerId === w.id) {
          const amt = o.referrerCommissionAmount || 0;
          totalEarned += amt;
          salesCount++;
          if (o.referrerPayoutStatus === 'paid') paidFromOrders += amt;
          else pendingAmount += amt;
        }
        if (o.uplineReferrerId === w.id) {
          const amt = o.uplineCommissionAmount || 0;
          totalEarned += amt;
          if (o.uplinePayoutStatus === 'paid') paidFromOrders += amt;
          else pendingAmount += amt;
        }
      }

      // Total paid via payouts collection
      const totalPaidOut = payouts
        .filter((p) => p.vendorId === w.id)
        .reduce((s, p) => s + p.amount, 0);

      const balance = totalEarned - totalPaidOut;

      return {
        ...w,
        totalEarned: Math.round(totalEarned * 100) / 100,
        pendingAmount: Math.round(pendingAmount * 100) / 100,
        totalPaidOut: Math.round(totalPaidOut * 100) / 100,
        balance: Math.round(balance * 100) / 100,
        salesCount,
      };
    }).sort((a, b) => b.balance - a.balance);
  }, [users, orders, payouts]);

  const filtered = searchQ.trim()
    ? vendorBalances.filter((v) =>
        (v.name || '').toLowerCase().includes(searchQ.toLowerCase()) ||
        (v.email || '').toLowerCase().includes(searchQ.toLowerCase())
      )
    : vendorBalances;

  const totals = useMemo(() => ({
    totalOwed: vendorBalances.reduce((s, v) => s + Math.max(0, v.balance), 0),
    totalPaid: vendorBalances.reduce((s, v) => s + v.totalPaidOut, 0),
    totalEarned: vendorBalances.reduce((s, v) => s + v.totalEarned, 0),
    vendorCount: vendorBalances.length,
  }), [vendorBalances]);

  const registerPayout = async (vendor: typeof vendorBalances[0]) => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'payouts'), {
        vendorId: vendor.id,
        vendorName: vendor.name || '',
        vendorEmail: vendor.email || '',
        amount,
        note: payNote || null,
        method: payMethod || 'Zelle',
        createdAt: serverTimestamp(),
      });
      setPayAmount('');
      setPayNote('');
      setExpandedId(null);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (ts?: { seconds: number }) => {
    if (!ts) return '—';
    return new Date(ts.seconds * 1000).toLocaleDateString(es ? 'es-CO' : 'en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          {es ? 'Pagos a Vendedores' : 'Vendor Payouts'}
        </h1>
        <p className="text-sm text-slate-500">
          {es ? 'Controla cuánto se le debe a cada vendedor, registra pagos y lleva el historial.' : 'Track how much is owed to each vendor, register payments and keep history.'}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-red-100 flex items-center justify-center"><DollarSign className="h-4 w-4 text-red-700" /></div>
          <div><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{es ? 'Por pagar' : 'Owed'}</p><p className="text-lg font-black text-red-700">${totals.totalOwed.toLocaleString()}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center"><CheckCircle2 className="h-4 w-4 text-emerald-700" /></div>
          <div><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{es ? 'Total pagado' : 'Total paid'}</p><p className="text-lg font-black text-emerald-700">${totals.totalPaid.toLocaleString()}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-brand-100 flex items-center justify-center"><ArrowUpRight className="h-4 w-4 text-brand-700" /></div>
          <div><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{es ? 'Total comisiones' : 'Total commissions'}</p><p className="text-lg font-black text-slate-900">${totals.totalEarned.toLocaleString()}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center"><Users className="h-4 w-4 text-slate-700" /></div>
          <div><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Partners</p><p className="text-lg font-black text-slate-900">{totals.vendorCount}</p></div>
        </CardContent></Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder={es ? 'Buscar vendedor...' : 'Search vendor...'}
          className="w-full rounded-xl bg-white border border-slate-200 pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      {/* Vendor list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-center py-8 text-sm text-slate-500">{es ? 'No hay vendedores.' : 'No vendors.'}</p>
        )}
        {filtered.map((v) => {
          const isExpanded = expandedId === v.id;
          const vendorPayouts = payouts.filter((p) => p.vendorId === v.id);
          return (
            <Card key={v.id}>
              <CardContent className="p-0">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : v.id)}
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {(v.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{v.name || '—'}</p>
                    <p className="text-xs text-slate-500 truncate">{v.email} · {v.salesCount} {es ? 'ventas' : 'sales'}</p>
                  </div>
                  <div className="text-right shrink-0 mr-2 grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase">{es ? 'Ganado' : 'Earned'}</p>
                      <p className="text-sm font-bold text-slate-900">${v.totalEarned}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase">{es ? 'Pagado' : 'Paid'}</p>
                      <p className="text-sm font-bold text-emerald-700">${v.totalPaidOut}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase">{es ? 'Debe' : 'Owed'}</p>
                      <p className={`text-sm font-black ${v.balance > 0 ? 'text-red-700' : 'text-slate-400'}`}>
                        ${v.balance > 0 ? v.balance : 0}
                      </p>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 p-5 bg-slate-50/50 space-y-5">
                    {/* Register payout */}
                    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-brand-600" />
                        {es ? 'Registrar pago' : 'Register payment'}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs font-medium text-slate-600 mb-1 block">{es ? 'Monto ($)' : 'Amount ($)'}</label>
                          <Input type="number" min={0} step={0.01} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={String(v.balance)} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600 mb-1 block">{es ? 'Método' : 'Method'}</label>
                          <Input type="text" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} placeholder="Zelle, Wire, Cash..." />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600 mb-1 block">{es ? 'Nota' : 'Note'}</label>
                          <Input type="text" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder={es ? 'Ref. transferencia...' : 'Transfer ref...'} />
                        </div>
                        <div className="flex items-end">
                          <Button
                            onClick={() => registerPayout(v)}
                            disabled={saving || !payAmount}
                            className="w-full bg-brand-600 hover:bg-brand-500 text-white rounded-lg h-10 text-xs font-bold"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            {saving ? '...' : (es ? 'Pagar' : 'Pay')}
                          </Button>
                        </div>
                      </div>
                      {v.balance > 0 && (
                        <button
                          type="button"
                          onClick={() => setPayAmount(String(v.balance))}
                          className="text-xs text-brand-700 hover:underline"
                        >
                          {es ? `Pagar todo: $${v.balance}` : `Pay all: $${v.balance}`}
                        </button>
                      )}
                    </div>

                    {/* Payment history */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                        <History className="h-4 w-4 text-brand-600" />
                        {es ? 'Historial de pagos' : 'Payment history'}
                      </h4>
                      {vendorPayouts.length === 0 ? (
                        <p className="text-xs text-slate-400">{es ? 'Sin pagos registrados.' : 'No payments recorded.'}</p>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {vendorPayouts.map((p) => (
                            <div key={p.id} className="flex items-center gap-3 rounded-xl bg-white border border-slate-100 p-3">
                              <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-emerald-700">${p.amount.toFixed(2)}</p>
                                <p className="text-[10px] text-slate-500">
                                  {p.method || 'Zelle'}{p.note ? ` · ${p.note}` : ''} · {formatDate(p.createdAt)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// Suppress unused
void Wallet;
void Clock;
