import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Users, ShoppingBag, TrendingUp, PieChart, Package, Wallet, BookOpen, Settings } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { COMMISSION_DIRECT_RATE, COMMISSION_UPLINE_RATE } from '@/lib/commissions';
import { useI18n } from '@/i18n/I18nContext';

type OrderDoc = {
  id: string;
  total?: number;
  referrerId?: string | null;
  uplineReferrerId?: string | null;
  items?: { name?: string; price?: number; quantity?: number }[];
};

export function AdminDashboard() {
  const { t, locale } = useI18n();
  const [leads, setLeads] = useState<any[]>([]);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [userEmail, setUserEmail] = useState<string>('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUserEmail(u?.email || '');
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const leadsUnsub = onSnapshot(query(collection(db, 'leads'), orderBy('createdAt', 'desc')), (snapshot) => {
      const data: any[] = [];
      snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
      setLeads(data);
    });

    const ordersUnsub = onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), (snapshot) => {
      const data: OrderDoc[] = [];
      snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() } as OrderDoc));
      setOrders(data);
    });

    return () => {
      leadsUnsub();
      ordersUnsub();
    };
  }, []);

  const totalRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);

  const finance = useMemo(() => {
    let directPayout = 0;
    let uplinePayout = 0;
    for (const o of orders) {
      const t = Number(o.total) || 0;
      if (o.referrerId) directPayout += t * COMMISSION_DIRECT_RATE;
      if (o.uplineReferrerId) uplinePayout += t * COMMISSION_UPLINE_RATE;
    }
    directPayout = Math.round(directPayout * 100) / 100;
    uplinePayout = Math.round(uplinePayout * 100) / 100;
    const totalCommissions = Math.round((directPayout + uplinePayout) * 100) / 100;
    const netAfterCommissions = Math.round((totalRevenue - totalCommissions) * 100) / 100;
    return { directPayout, uplinePayout, totalCommissions, netAfterCommissions };
  }, [orders, totalRevenue]);

  const productRows = useMemo(() => {
    const map = new Map<string, { name: string; units: number; revenue: number; commissionLoad: number }>();
    for (const o of orders) {
      const total = Number(o.total) || 0;
      const rate = (o.referrerId ? COMMISSION_DIRECT_RATE : 0) + (o.uplineReferrerId ? COMMISSION_UPLINE_RATE : 0);
      for (const it of o.items || []) {
        const qty = Number(it.quantity) || 0;
        const price = Number(it.price) || 0;
        const line = price * qty;
        const name = it.name || t('adminPage.dashboard.unknownLineProduct');
        const frac = total > 0 ? line / total : 0;
        const commSlice = line > 0 ? total * rate * frac : 0;
        const prev = map.get(name) || { name, units: 0, revenue: 0, commissionLoad: 0 };
        prev.units += qty;
        prev.revenue += line;
        prev.commissionLoad += commSlice;
        map.set(name, prev);
      }
    }
    return Array.from(map.values())
      .map((r) => ({
        ...r,
        commissionLoad: Math.round(r.commissionLoad * 100) / 100,
        estNet: Math.round((r.revenue - r.commissionLoad) * 100) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [orders, t]);

  const stats = useMemo(
    () => [
      { title: t('adminPage.dashboard.statRevenue'), value: `$${totalRevenue.toFixed(2)}`, icon: DollarSign, trend: '+12.5%' },
      { title: t('adminPage.dashboard.statLeads'), value: leads.length.toString(), icon: Users, trend: '+5.2%' },
      { title: t('adminPage.dashboard.statOrders'), value: orders.length.toString(), icon: ShoppingBag, trend: '+18.1%' },
      {
        title: t('adminPage.dashboard.statConversion'),
        value: leads.length ? `${((orders.length / leads.length) * 100).toFixed(1)}%` : '0%',
        icon: TrendingUp,
        trend: '+1.1%',
      },
    ],
    [t, totalRevenue, leads.length, orders.length]
  );

  const es = locale === 'es';
  const firstName = (userEmail.split('@')[0] || 'Admin').replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const hour = new Date().getHours();
  const greeting = hour < 12 ? (es ? 'Buenos días' : 'Good morning') : hour < 19 ? (es ? 'Buenas tardes' : 'Good afternoon') : (es ? 'Buenas noches' : 'Good evening');

  return (
    <div className="space-y-6">
      {/* Welcome hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-slate-900 to-brand-950 p-6 md:p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
        <div className="relative grid md:grid-cols-2 gap-6 items-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-400 mb-2">ILLIUM · SUPER ADMIN</p>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
              {greeting}, {firstName} 👋
            </h1>
            <p className="text-sm text-slate-300 mb-4 max-w-md">
              {es
                ? 'Esto es lo que está pasando en tu plataforma hoy. Todo sincronizado en tiempo real.'
                : "Here's what's happening on your platform today. All synced in real time."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/guide">
                <button className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold px-4 py-2 transition">
                  <BookOpen className="h-3.5 w-3.5" />
                  {es ? 'Guía de uso' : 'User guide'}
                </button>
              </Link>
              <Link to="/admin/finance">
                <button className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 hover:bg-brand-400 text-white text-xs font-bold px-4 py-2 transition shadow-md shadow-brand-700/30">
                  <Wallet className="h-3.5 w-3.5" />
                  {es ? 'Ver finanzas' : 'View finance'}
                </button>
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{es ? 'Leads' : 'Leads'}</p>
              <p className="text-2xl font-bold text-white mt-0.5">{leads.length}</p>
            </div>
            <div className="rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{es ? 'Pedidos' : 'Orders'}</p>
              <p className="text-2xl font-bold text-white mt-0.5">{orders.length}</p>
            </div>
            <div className="rounded-xl bg-brand-500/20 backdrop-blur-sm border border-brand-400/30 p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-brand-300 font-semibold">{es ? 'Ingresos' : 'Revenue'}</p>
              <p className="text-2xl font-bold text-white mt-0.5">${totalRevenue.toFixed(0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">
          {es ? 'Accesos rápidos' : 'Quick actions'}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/admin/products" className="group rounded-2xl bg-white border border-slate-200 p-4 hover:border-brand-300 hover:shadow-md transition">
            <div className="h-9 w-9 rounded-xl bg-brand-100 flex items-center justify-center mb-2 group-hover:bg-brand-200 transition">
              <Package className="h-4 w-4 text-brand-700" />
            </div>
            <p className="text-sm font-bold text-slate-900">{es ? 'Productos' : 'Products'}</p>
            <p className="text-xs text-slate-500 mt-0.5">{es ? 'Editar catálogo' : 'Edit catalog'}</p>
          </Link>
          <Link to="/admin/finance" className="group rounded-2xl bg-white border border-slate-200 p-4 hover:border-brand-300 hover:shadow-md transition">
            <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center mb-2 group-hover:bg-amber-200 transition">
              <Wallet className="h-4 w-4 text-amber-700" />
            </div>
            <p className="text-sm font-bold text-slate-900">{es ? 'Finanzas' : 'Finance'}</p>
            <p className="text-xs text-slate-500 mt-0.5">{es ? 'Pedidos · Árbol' : 'Orders · Tree'}</p>
          </Link>
          <Link to="/admin/leads" className="group rounded-2xl bg-white border border-slate-200 p-4 hover:border-brand-300 hover:shadow-md transition">
            <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center mb-2 group-hover:bg-blue-200 transition">
              <Users className="h-4 w-4 text-blue-700" />
            </div>
            <p className="text-sm font-bold text-slate-900">{es ? 'Leads' : 'Leads'}</p>
            <p className="text-xs text-slate-500 mt-0.5">{es ? 'Del quiz' : 'From quiz'}</p>
          </Link>
          <Link to="/admin/settings" className="group rounded-2xl bg-white border border-slate-200 p-4 hover:border-brand-300 hover:shadow-md transition">
            <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center mb-2 group-hover:bg-slate-200 transition">
              <Settings className="h-4 w-4 text-slate-700" />
            </div>
            <p className="text-sm font-bold text-slate-900">{es ? 'Ajustes' : 'Settings'}</p>
            <p className="text-xs text-slate-500 mt-0.5">{es ? 'Global' : 'Global'}</p>
          </Link>
        </div>
      </div>

      {/* Section title for KPIs */}
      <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest pt-2">
        {es ? 'Resumen' : 'Overview'}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                  <stat.icon className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-slate-500 text-sm font-medium">{stat.title}</h3>
              <div className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="w-5 h-5 text-blue-600" />
            {t('adminPage.dashboard.financeTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-slate-100 py-2">
              <span className="text-slate-600">{t('adminPage.dashboard.grossSales')}</span>
              <span className="font-bold text-slate-900">${totalRevenue.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-2">
              <span className="text-slate-600">{t('adminPage.dashboard.directPayout')}</span>
              <span className="font-semibold text-amber-700">-${finance.directPayout.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-2">
              <span className="text-slate-600">{t('adminPage.dashboard.uplinePayout')}</span>
              <span className="font-semibold text-amber-700">-${finance.uplinePayout.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-800 font-medium">{t('adminPage.dashboard.netAfter')}</span>
              <span className="font-bold text-emerald-700">${finance.netAfterCommissions.toFixed(2)}</span>
            </div>
            <p className="text-xs text-slate-500">{t('adminPage.dashboard.financeFootnote')}</p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-3">{t('adminPage.dashboard.perProductTitle')}</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="p-3">Product</th>
                    <th className="p-3">Qty</th>
                    <th className="p-3">Revenue</th>
                    <th className="p-3">Commissions</th>
                    <th className="p-3">Est. net</th>
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((r) => (
                    <tr key={r.name} className="border-t border-slate-100">
                      <td className="p-3 font-medium text-slate-900">{r.name}</td>
                      <td className="p-3">{r.units}</td>
                      <td className="p-3">${r.revenue.toFixed(2)}</td>
                      <td className="p-3 text-amber-800">${r.commissionLoad.toFixed(2)}</td>
                      <td className="p-3 text-emerald-800 font-semibold">${r.estNet.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {productRows.length === 0 && (
              <p className="text-sm text-slate-500 mt-2">{t('adminPage.dashboard.noLineItems')}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('adminPage.dashboard.recentLeads')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {leads.slice(0, 5).map((lead) => (
                <div key={lead.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <div className="font-medium text-slate-900">{lead.name || t('adminPage.dashboard.anonymous')}</div>
                    <div className="text-sm text-slate-500">{lead.email}</div>
                  </div>
                  <div className="text-sm bg-slate-100 px-2 py-1 rounded text-slate-600">
                    {lead.quizAnswers?.goal || t('adminPage.dashboard.goalQuiz')}
                  </div>
                </div>
              ))}
              {leads.length === 0 && <div className="text-slate-500 text-sm">{t('adminPage.dashboard.noLeads')}</div>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('adminPage.dashboard.recentOrders')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {orders.slice(0, 5).map((order) => (
                <div key={order.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <div className="font-medium text-slate-900">
                      {(order as any).customer?.name || t('adminPage.dashboard.customer')}
                    </div>
                    <div className="text-sm text-slate-500">
                      {t('adminPage.dashboard.itemsCount').replace('{n}', String((order as any).items?.length || 0))}
                    </div>
                  </div>
                  <div className="font-bold text-slate-900">${order.total?.toFixed(2)}</div>
                </div>
              ))}
              {orders.length === 0 && <div className="text-slate-500 text-sm">{t('adminPage.dashboard.noOrders')}</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
