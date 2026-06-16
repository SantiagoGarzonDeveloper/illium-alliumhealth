import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  deleteField,
  limit,
  query,
  deleteDoc,
  increment,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { useI18n } from '@/i18n/I18nContext';
import { useToastStore } from '@/store';
import { resolveOrderCommissions, type CommissionPayoutStatus } from '@/lib/orderCommission';
import { getDirectRate, getUplineRate, loadCommissionRates } from '@/lib/commissions';
import { ReferralTree, buildReferralTree, type NetworkUser } from '@/components/referral/ReferralTree';
import { NotifyOrderPanel } from '@/components/orders/NotifyOrderPanel';
import { useAppStore } from '@/store';
import { getEffectivePrice } from '@/lib/pricing';

type Tab = 'orders' | 'users' | 'tree';

type OrderDoc = { id: string } & Record<string, unknown>;

type UserRow = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  referrerId?: string | null;
  referralAncestors?: string[];
};

function createdAtMs(data: Record<string, unknown>): number {
  const v = data.createdAt as { toDate?: () => Date; seconds?: number } | undefined;
  if (v && typeof v.toDate === 'function') {
    try {
      return v.toDate().getTime();
    } catch {
      return 0;
    }
  }
  if (v && typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

function fmtDate(v: unknown): string {
  if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    try {
      return (v as { toDate: () => Date }).toDate().toLocaleString();
    } catch {
      /* ignore */
    }
  }
  return '—';
}

function payoutLabel(s: CommissionPayoutStatus, t: (k: string) => string): string {
  if (s === 'paid') return t('worker.statusPaid');
  if (s === 'pending') return t('worker.statusPending');
  return t('worker.statusNa');
}

const deleteUserCallable = httpsCallable<{ targetUid: string }, { ok: boolean }>(cloudFunctions, 'adminDeleteUserAccount');

export function AdminFinance() {
  const { t, locale } = useI18n();
  const showToast = useToastStore((s) => s.showToast);
  const [tab, setTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  // Deep-link: /admin/finance?expand=<id> opens that row already expanded.
  useEffect(() => {
    const wanted = searchParams.get('expand');
    if (wanted && expandedId !== wanted) setExpandedId(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  type OrderLine = { name: string; quantity: number; price: number; productId?: string };
  const [orderForm, setOrderForm] = useState<{
    status: string;
    fulfillmentStatus: string;
    shippingTracking: string;
    adminInternalNotes: string;
    customerWhatsappCc: string;
    customerWhatsappLocal: string;
    items: OrderLine[];
  }>({
    status: 'pending',
    fulfillmentStatus: 'unfulfilled',
    shippingTracking: '',
    adminInternalNotes: '',
    customerWhatsappCc: '+52',
    customerWhatsappLocal: '',
    items: [],
  });
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'worker' | 'client' | 'admin'>('all');
  const [userSearch, setUserSearch] = useState('');

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      const role = (u.role || 'client').toLowerCase();
      if (userRoleFilter !== 'all' && role !== userRoleFilter) return false;
      if (!q) return true;
      const haystack = `${u.email || ''} ${u.name || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [users, userRoleFilter, userSearch]);

  // Detect duplicate suspects: same name (case-insensitive) appearing more than once
  const dupeNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of users) {
      const k = (u.name || '').trim().toLowerCase();
      if (!k) continue;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const dupes = new Set<string>();
    counts.forEach((v, k) => { if (v > 1) dupes.add(k); });
    return dupes;
  }, [users]);

  const userCounts = useMemo(() => {
    let workers = 0, clients = 0, admins = 0;
    for (const u of users) {
      const r = (u.role || 'client').toLowerCase();
      if (r === 'worker') workers++;
      else if (r === 'admin') admins++;
      else clients++;
    }
    return { workers, clients, admins, total: users.length };
  }, [users]);

  const userById = useMemo(() => {
    const m = new Map<string, UserRow>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  useEffect(() => {
    void loadCommissionRates();
  }, []);

  // Manual sales (admin-recorded direct sales) also carry referrerId +
  // uplineReferrerId so they count toward 40% / 10% commission pools.
  const [manualSales, setManualSales] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), limit(1500)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderDoc));
        rows.sort((a, b) => createdAtMs(b) - createdAtMs(a));
        setOrders(rows);
      },
      (e) => console.error('AdminFinance orders', e)
    );
    const unsubManual = onSnapshot(
      query(collection(db, 'manualSales'), limit(1500)),
      (snap) => setManualSales(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>))),
      (e) => console.error('AdminFinance manualSales', e),
    );
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) =>
        setUsers(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              email: x.email as string | undefined,
              name: x.name as string | undefined,
              role: x.role as string | undefined,
              referrerId: (x.referrerId as string | null) ?? null,
              referralAncestors: (x.referralAncestors as string[]) || [],
            };
          })
        ),
      (e) => console.error('AdminFinance users', e)
    );
    return () => {
      unsubOrders();
      unsubUsers();
      unsubManual();
    };
  }, []);

  const kpis = useMemo(() => {
    let gross = 0;
    let pendD = 0;
    let pendU = 0;
    // Online orders.
    for (const o of orders) {
      const total = Number(o.total) || 0;
      gross += total;
      const c = resolveOrderCommissions(o);
      if (c.referrerPayoutStatus === 'pending') pendD += c.referrerCommissionAmount;
      if (c.uplinePayoutStatus === 'pending') pendU += c.uplineCommissionAmount;
    }
    // Manual / direct sales — also carry referrerId + uplineReferrerId.
    for (const m of manualSales) {
      const total = Number((m as { total?: number }).total) || 0;
      gross += total;
      const c = resolveOrderCommissions(m);
      if (c.referrerPayoutStatus === 'pending') pendD += c.referrerCommissionAmount;
      if (c.uplinePayoutStatus === 'pending') pendU += c.uplineCommissionAmount;
    }
    return {
      gross: Math.round(gross * 100) / 100,
      pendD: Math.round(pendD * 100) / 100,
      pendU: Math.round(pendU * 100) / 100,
    };
  }, [orders, manualSales]);

  const patchPayout = useCallback(
    async (
      orderId: string,
      field: 'referrerPayoutStatus' | 'uplinePayoutStatus',
      paid: boolean,
      paidAtField: 'referrerPayoutPaidAt' | 'uplinePayoutPaidAt'
    ) => {
      setUpdatingId(orderId);
      try {
        await updateDoc(doc(db, 'orders', orderId), {
          [field]: paid ? 'paid' : 'pending',
          [paidAtField]: paid ? serverTimestamp() : deleteField(),
        });
        showToast(t('adminPage.finance.payoutUpdated'));
      } catch (e) {
        console.error(e);
        showToast(t('adminPage.finance.payoutError'));
      } finally {
        setUpdatingId(null);
      }
    },
    [showToast, t]
  );

  const openOrderRow = useCallback((o: OrderDoc) => {
    if (expandedId === o.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(o.id);
    const c = (o.customer as Record<string, unknown>) || {};
    const rawItems = (o.items as { name?: string; quantity?: number; price?: number; productId?: string }[]) || [];
    setOrderForm({
      status: String(o.status ?? 'pending'),
      fulfillmentStatus: String(o.fulfillmentStatus ?? 'unfulfilled'),
      shippingTracking: String(o.shippingTracking ?? ''),
      adminInternalNotes: String(o.adminInternalNotes ?? ''),
      customerWhatsappCc: String(c.whatsappCountryCode ?? '+52'),
      customerWhatsappLocal: String(c.whatsappLocalNumber ?? ''),
      items: rawItems.map((it) => ({
        name: String(it.name || ''),
        quantity: Number(it.quantity) || 0,
        price: Number(it.price) || 0,
        productId: it.productId ? String(it.productId) : undefined,
      })),
    });
  }, [expandedId]);

  const saveOrderAdminFields = useCallback(async () => {
    if (!expandedId) return;
    setUpdatingId(expandedId);
    try {
      const current = orders.find((x) => x.id === expandedId);
      const prevCust = { ...((current?.customer as Record<string, unknown>) || {}) };
      const ccRaw = orderForm.customerWhatsappCc.trim();
      const localDigits = orderForm.customerWhatsappLocal.replace(/\D/g, '');
      const ccDigits = ccRaw.replace(/\D/g, '');
      if (ccDigits && localDigits) {
        prevCust.whatsappCountryCode = ccRaw.startsWith('+') ? ccRaw : `+${ccDigits}`;
        prevCust.whatsappLocalNumber = localDigits;
      } else {
        delete prevCust.whatsappCountryCode;
        delete prevCust.whatsappLocalNumber;
      }
      // Recompute total from edited items
      const cleanItems = orderForm.items
        .filter((it) => it.name.trim() && it.quantity > 0)
        .map((it) => ({
          name: it.name.trim(),
          quantity: Math.max(0, Math.round(it.quantity)),
          price: Math.max(0, Number(it.price) || 0),
          ...(it.productId ? { productId: it.productId } : {}),
        }));
      const newTotal = cleanItems.reduce((acc, it) => acc + it.price * it.quantity, 0);
      await updateDoc(doc(db, 'orders', expandedId), {
        status: orderForm.status,
        fulfillmentStatus: orderForm.fulfillmentStatus,
        shippingTracking: orderForm.shippingTracking.trim(),
        // Mirror as `trackingNumber` for compatibility with MyOrders + WorkerPanel + email CFs.
        trackingNumber: orderForm.shippingTracking.trim(),
        adminInternalNotes: orderForm.adminInternalNotes.trim(),
        customer: prevCust,
        items: cleanItems,
        total: Math.round(newTotal * 100) / 100,
        updatedByAdminAt: serverTimestamp(),
      });
      showToast(t('adminPage.finance.orderSaved'));
    } catch (e) {
      console.error(e);
      showToast(t('adminPage.finance.orderSaveError'));
    } finally {
      setUpdatingId(null);
    }
  }, [expandedId, orderForm, orders, showToast, t]);

  const sendPartnerWaRemind = useCallback(
    async (orderId: string) => {
      setUpdatingId(orderId);
      try {
        await updateDoc(doc(db, 'orders', orderId), { waPartnerRemindSeq: increment(1) });
        showToast(t('adminPage.finance.waRemindQueued'));
      } catch (e) {
        console.error(e);
        showToast(t('adminPage.finance.waRemindError'));
      } finally {
        setUpdatingId(null);
      }
    },
    [showToast, t]
  );

  const removeOrder = useCallback(
    async (orderId: string) => {
      setUpdatingId(orderId);
      try {
        await deleteDoc(doc(db, 'orders', orderId));
        showToast(t('adminPage.finance.orderDeleted'));
        setDeleteOrderId(null);
        if (expandedId === orderId) setExpandedId(null);
      } catch (e) {
        console.error(e);
        showToast(t('adminPage.finance.orderDeleteError'));
      } finally {
        setUpdatingId(null);
      }
    },
    [expandedId, showToast, t]
  );

  const saveUserRole = useCallback(
    async (uid: string, role: string) => {
      try {
        await updateDoc(doc(db, 'users', uid), { role });
        showToast(t('adminPage.finance.userRoleSaved'));
      } catch (e) {
        console.error(e);
        showToast(t('adminPage.finance.userRoleError'));
      }
    },
    [showToast, t]
  );

  const confirmDeleteUser = useCallback(async () => {
    if (!deleteUserId) return;
    setDeleteBusy(true);
    try {
      await deleteUserCallable({ targetUid: deleteUserId });
      showToast(t('adminPage.finance.userDeleted'));
      setDeleteUserId(null);
    } catch (e: unknown) {
      console.error(e);
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : '';
      showToast(msg || t('adminPage.finance.userDeleteError'));
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteUserId, showToast, t]);

  const ancestorLabel = useCallback(
    (ids: string[]) => {
      if (!ids.length) return '—';
      return ids
        .map((id) => {
          const x = userById.get(id);
          return x?.name || x?.email || `${id.slice(0, 6)}…`;
        })
        .join(' → ');
    },
    [userById]
  );

  const TabBtn = ({ k, label }: { k: Tab; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
        tab === k ? 'bg-blue-600 text-white shadow' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-8 min-w-0 w-full">
      <Dialog
        open={Boolean(deleteUserId)}
        onOpenChange={(o) => !o && setDeleteUserId(null)}
        title={t('adminPage.finance.deleteUserTitle')}
        description={t('adminPage.finance.deleteUserBody')}
      >
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setDeleteUserId(null)} disabled={deleteBusy}>
            {t('adminPage.products.cancel')}
          </Button>
          <Button type="button" variant="primary" className="bg-red-600 hover:bg-red-700" onClick={() => void confirmDeleteUser()} disabled={deleteBusy}>
            {deleteBusy ? t('adminPage.settings.saving') : t('adminPage.finance.deleteUserConfirm')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(deleteOrderId)}
        onOpenChange={(o) => !o && setDeleteOrderId(null)}
        title={t('adminPage.finance.deleteOrderTitle')}
        description={t('adminPage.finance.deleteOrderBody')}
      >
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setDeleteOrderId(null)} disabled={Boolean(updatingId)}>
            {t('adminPage.products.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            className="bg-red-600 hover:bg-red-700"
            onClick={() => deleteOrderId && void removeOrder(deleteOrderId)}
            disabled={Boolean(updatingId)}
          >
            {t('adminPage.finance.deleteOrderConfirm')}
          </Button>
        </div>
      </Dialog>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('adminPage.finance.pageTitle')}</h1>
        <p className="mt-2 text-sm text-slate-600 max-w-3xl">{t('adminPage.finance.intro')}</p>
        <p className="mt-1 text-xs text-slate-500">
          {Math.round(getDirectRate() * 100)}% / {Math.round(getUplineRate() * 100)}% —{' '}
          {t('adminPage.dashboard.financeFootnote')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <TabBtn k="orders" label={t('adminPage.finance.tabOrders')} />
        <TabBtn k="users" label={t('adminPage.finance.tabUsers')} />
        <TabBtn k="tree" label="🌳 Árbol / Tree" />
      </div>

      {tab === 'tree' && (
        <AdminReferralForest users={users} orders={orders} />
      )}

      {tab === 'orders' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium text-slate-500">{t('adminPage.finance.kpiGross')}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">${kpis.gross.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium text-slate-500">{t('adminPage.finance.kpiPendingDirect')}</p>
                <p className="mt-1 text-2xl font-bold text-amber-700">${kpis.pendD.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-500">{t('adminPage.finance.kpiPendingUpline')}</p>
                  <span
                    className="text-xs text-slate-400 cursor-help"
                    title={
                      locale === 'es'
                        ? 'El 10% se paga al "upline": el referidor del referidor. Solo aparece cuando un trabajador (que tiene a otro trabajador como referido) gana una venta. Ej: Bob refirió a Ana. Ana refiere a un cliente → la venta paga 40% a Ana y 10% a Bob (upline).'
                        : 'The 10% goes to the "upline": the referrer of the referrer. It only fires when a worker (whose referrer is also a worker) lands a sale. E.g.: Bob referred Ana. Ana refers a customer → the order pays 40% to Ana and 10% to Bob (upline).'
                    }
                  >
                    ⓘ
                  </span>
                </div>
                <p className="mt-1 text-2xl font-bold text-amber-700">${kpis.pendU.toFixed(2)}</p>
                {kpis.pendU === 0 && (
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-tight">
                    {locale === 'es'
                      ? 'Aparece solo cuando un trabajador referido por otro trabajador genera ventas.'
                      : 'Appears when a worker referred by another worker generates sales.'}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium text-slate-500">{t('adminPage.finance.kpiOrdersCount')}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{orders.length + manualSales.length}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {locale === 'es'
                    ? `${orders.length} online + ${manualSales.length} directas`
                    : `${orders.length} online + ${manualSales.length} direct`}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Per-vendor breakdown — who generated how much, 40% direct, 10% upline. */}
          <VendorBreakdownCard
            orders={orders}
            manualSales={manualSales}
            users={users}
            locale={locale}
          />

          <OrdersPanel
            orders={orders}
            users={users}
            updatingId={updatingId}
            expandedId={expandedId}
            openOrderRow={openOrderRow}
            patchPayout={patchPayout}
            sendPartnerWaRemind={sendPartnerWaRemind}
            setDeleteOrderId={setDeleteOrderId}
            t={t}
            locale={locale}
          />
          {false && (
          <Card>
            <CardHeader>
              <CardTitle>{t('adminPage.finance.ordersDetailTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Mobile only — card list (very narrow screens) */}
              <div className="md:hidden divide-y divide-slate-100">
                {orders.map((o) => {
                  const c = resolveOrderCommissions(o);
                  const refId = (o.referrerId as string) || '';
                  const refUser = refId ? userById.get(refId) : undefined;
                  const cust = (o.customer as { name?: string; email?: string }) || {};
                  const busy = updatingId === o.id;
                  const ful = String(o.fulfillmentStatus || '—');
                  return (
                    <div key={`m-${o.id}`} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-slate-500">{fmtDate(o.createdAt)}</p>
                          <p className="font-bold text-slate-900 truncate">{cust.name || '—'}</p>
                          <p className="text-xs text-slate-500 truncate">{cust.email || ''}</p>
                        </div>
                        <p className="text-lg font-black text-slate-900 shrink-0">${(Number(o.total) || 0).toFixed(2)}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[10px]">
                        <span className="rounded bg-slate-100 px-2 py-0.5 uppercase font-bold">{String(o.status || '—')}</span>
                        <span className="rounded bg-indigo-50 text-indigo-900 px-2 py-0.5 uppercase font-bold">{ful}</span>
                      </div>
                      {refId && (
                        <div className="text-[11px] text-slate-600">
                          <span className="font-bold">{t('adminPage.finance.colReferrer')}: </span>
                          {refUser?.email || refUser?.name || refId.slice(0, 10) + '…'}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => openOrderRow(o)}>
                          {expandedId === o.id ? t('adminPage.finance.closeRow') : t('adminPage.finance.manageOrder')}
                        </Button>
                        {c.referrerPayoutStatus !== 'na' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            disabled={busy}
                            onClick={() =>
                              void patchPayout(
                                o.id,
                                'referrerPayoutStatus',
                                c.referrerPayoutStatus !== 'paid',
                                'referrerPayoutPaidAt',
                              )
                            }
                          >
                            {c.referrerPayoutStatus === 'paid'
                              ? t('adminPage.finance.markUnpaidDirect')
                              : t('adminPage.finance.markPaidDirect')}
                          </Button>
                        )}
                        {refId && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-xs border-emerald-200 text-emerald-800"
                            disabled={busy}
                            onClick={() => void sendPartnerWaRemind(o.id)}
                          >
                            {t('adminPage.finance.waRemindPartner')}
                          </Button>
                        )}
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline ml-auto"
                          onClick={() => setDeleteOrderId(o.id)}
                        >
                          {t('adminPage.finance.deleteOrder')}
                        </button>
                      </div>
                      {/* Modal opens automatically when expandedId is set — no inline placeholder needed. */}
                    </div>
                  );
                })}
              </div>
              {/* Tablet+ — table inside a horizontal-scroll container (always visible scrollbar). */}
              <div className="hidden md:block admin-hscroll">
              <table className="w-full text-left text-sm" style={{ minWidth: '1200px' }}>
                <thead>
                  <tr className="border-b bg-slate-50 text-slate-600">
                    <th className="px-3 py-3 font-medium">{t('adminPage.finance.colDate')}</th>
                    <th className="px-3 py-3 font-medium">{t('adminPage.finance.colCustomer')}</th>
                    <th className="px-3 py-3 font-medium">{t('adminPage.finance.colTotal')}</th>
                    <th className="px-3 py-3 font-medium">{t('adminPage.finance.colOrderStatus')}</th>
                    <th className="px-3 py-3 font-medium">{t('adminPage.finance.colFulfillment')}</th>
                    <th className="px-3 py-3 font-medium">{t('adminPage.finance.colReferrer')}</th>
                    {/* Commission columns moved into the "Manage" modal — keeps the table narrow on every screen. */}
                    <th className="px-3 py-3 font-medium text-right">{t('adminPage.finance.colManage')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.map((o) => {
                    const c = resolveOrderCommissions(o);
                    const refId = (o.referrerId as string) || '';
                    const refUser = refId ? userById.get(refId) : undefined;
                    const cust = (o.customer as {
                      name?: string;
                      email?: string;
                      address?: string;
                      city?: string;
                      zip?: string;
                      whatsappCountryCode?: string;
                      whatsappLocalNumber?: string;
                    }) || {};
                    const busy = updatingId === o.id;
                    const ful = String(o.fulfillmentStatus || '—');
                    return (
                      <Fragment key={o.id}>
                        <tr className="hover:bg-slate-50/80 align-top">
                          <td className="px-3 py-2 whitespace-nowrap">{fmtDate(o.createdAt)}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-900">{cust.name || '—'}</div>
                            <div className="text-xs text-slate-500">{cust.email || ''}</div>
                          </td>
                          <td className="px-3 py-2 font-semibold">${(Number(o.total) || 0).toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase">{String(o.status || '—')}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="rounded bg-indigo-50 text-indigo-900 px-2 py-0.5 text-xs uppercase">{ful}</span>
                          </td>
                          <td className="px-3 py-2 text-xs">
                            <div className="font-mono text-slate-700">{refId || t('adminPage.finance.none')}</div>
                            <div className="text-slate-500">{refUser?.email || ''}</div>
                          </td>
                          {/* Commission cells moved into the "Manage" modal below. */}
                          <td className="px-3 py-2 text-right space-y-1">
                            <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => openOrderRow(o)}>
                              {expandedId === o.id ? t('adminPage.finance.closeRow') : t('adminPage.finance.manageOrder')}
                            </Button>
                            {c.referrerPayoutStatus !== 'na' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="text-xs block w-full"
                                disabled={busy}
                                onClick={() =>
                                  void patchPayout(
                                    o.id,
                                    'referrerPayoutStatus',
                                    c.referrerPayoutStatus !== 'paid',
                                    'referrerPayoutPaidAt'
                                  )
                                }
                              >
                                {c.referrerPayoutStatus === 'paid'
                                  ? t('adminPage.finance.markUnpaidDirect')
                                  : t('adminPage.finance.markPaidDirect')}
                              </Button>
                            )}
                            {c.uplinePayoutStatus !== 'na' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="text-xs block w-full"
                                disabled={busy}
                                onClick={() =>
                                  void patchPayout(
                                    o.id,
                                    'uplinePayoutStatus',
                                    c.uplinePayoutStatus !== 'paid',
                                    'uplinePayoutPaidAt'
                                  )
                                }
                              >
                                {c.uplinePayoutStatus === 'paid'
                                  ? t('adminPage.finance.markUnpaidUpline')
                                  : t('adminPage.finance.markPaidUpline')}
                              </Button>
                            )}
                            {refId && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="text-xs block w-full border-emerald-200 text-emerald-800"
                                disabled={busy}
                                onClick={() => void sendPartnerWaRemind(o.id)}
                              >
                                {t('adminPage.finance.waRemindPartner')}
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-xs block w-full text-red-600"
                              disabled={busy}
                              onClick={() => setDeleteOrderId(o.id)}
                            >
                              {t('adminPage.finance.deleteOrder')}
                            </Button>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
              {orders.length === 0 && <p className="p-6 text-sm text-slate-500">{t('adminPage.finance.noOrders')}</p>}
            </CardContent>
          </Card>
          )}

          {/* Universal "Manage order" modal — works the same on mobile, tablet, desktop. */}
          {expandedId && (() => {
            const o = orders.find((x) => x.id === expandedId);
            if (!o) return null;
            const c = resolveOrderCommissions(o);
            const upId = (o.uplineReferrerId as string) || '';
            const upUser = upId ? userById.get(upId) : undefined;
            const cust = (o.customer as {
              name?: string;
              email?: string;
              address?: string;
              city?: string;
              zip?: string;
              whatsappCountryCode?: string;
              whatsappLocalNumber?: string;
            }) || {};
            const busy = updatingId === o.id;
            return (
              <div
                className="fixed inset-0 z-[120] flex items-start justify-center bg-black/60 backdrop-blur-sm p-0 md:p-6 overflow-y-auto"
                onClick={() => setExpandedId(null)}
              >
                <div
                  className="relative w-full md:max-w-4xl bg-white md:rounded-2xl shadow-2xl my-0 md:my-8"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Sticky header */}
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 py-3 md:py-4 md:rounded-t-2xl">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-600">
                        {locale === 'es' ? 'Gestionar pedido' : 'Manage order'}
                      </p>
                      <h2 className="text-base md:text-lg font-bold text-slate-900 truncate">
                        {cust.name || '—'}{' '}
                        <span className="text-xs font-mono text-slate-500">#{o.id.slice(0, 8).toUpperCase()}</span>
                      </h2>
                      <p className="text-xs text-slate-500">${(Number(o.total) || 0).toFixed(2)} · {String(o.status || '—').toUpperCase()} · {String(o.fulfillmentStatus || '—').toUpperCase()}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedId(null)}
                      className="text-slate-400 hover:text-slate-700 text-3xl leading-none p-1 shrink-0"
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>

                  {/* Body */}
                  <div className="px-4 md:px-6 py-4 space-y-4">
                    {/* Commission summary */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                        {locale === 'es' ? 'Comisiones del pedido' : 'Order commissions'}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{locale === 'es' ? 'Monto 40%' : '40% amount'}</p>
                          <p className="text-lg font-black text-slate-900">${c.referrerCommissionAmount.toFixed(2)}</p>
                          <p className="text-[10px] text-slate-500">{payoutLabel(c.referrerPayoutStatus, t)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{locale === 'es' ? 'Monto 10%' : '10% amount'}</p>
                          <p className="text-lg font-black text-slate-900">${c.uplineCommissionAmount.toFixed(2)}</p>
                          <p className="text-[10px] text-slate-500">{payoutLabel(c.uplinePayoutStatus, t)}</p>
                        </div>
                        <div className="col-span-2 md:col-span-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Upline</p>
                          <p className="font-mono text-xs text-slate-700 truncate">{upId || t('adminPage.finance.none')}</p>
                          <p className="text-[10px] text-slate-500 truncate">{upUser?.email || ''}</p>
                        </div>
                      </div>
                    </div>

                    {/* Edit form */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-slate-900">{t('adminPage.finance.orderEditTitle')}</h4>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">{t('adminPage.finance.fieldPaymentStatus')}</label>
                            <select
                              className="w-full rounded border border-slate-200 px-2 py-2 text-sm"
                              value={orderForm.status}
                              onChange={(e) => setOrderForm((f) => ({ ...f, status: e.target.value }))}
                            >
                              <option value="pending">pending</option>
                              <option value="processing">processing</option>
                              <option value="paid">paid</option>
                              <option value="cancelled">cancelled</option>
                              <option value="refunded">refunded</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">{t('adminPage.finance.fieldFulfillment')}</label>
                            <select
                              className="w-full rounded border border-slate-200 px-2 py-2 text-sm"
                              value={orderForm.fulfillmentStatus}
                              onChange={(e) => setOrderForm((f) => ({ ...f, fulfillmentStatus: e.target.value }))}
                            >
                              <option value="unfulfilled">unfulfilled</option>
                              <option value="processing">processing</option>
                              <option value="shipped">shipped</option>
                              <option value="delivered">delivered</option>
                            </select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-600">{t('adminPage.finance.fieldTracking')}</label>
                          <Input
                            value={orderForm.shippingTracking}
                            onChange={(e) => setOrderForm((f) => ({ ...f, shippingTracking: e.target.value }))}
                            placeholder="Tracking / guía"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-600">{t('adminPage.finance.fieldAdminNotes')}</label>
                          <textarea
                            className="w-full min-h-[88px] rounded border border-slate-200 p-2 text-sm"
                            value={orderForm.adminInternalNotes}
                            onChange={(e) => setOrderForm((f) => ({ ...f, adminInternalNotes: e.target.value }))}
                          />
                        </div>
                        <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => void saveOrderAdminFields()}>
                          {t('adminPage.finance.saveOrder')}
                        </Button>

                        <ReassignOrderVendor
                          orderId={expandedId!}
                          currentReferrerId={(o.referrerId as string) || ''}
                          users={users}
                          locale={locale}
                          onChanged={() => { /* live snapshot refreshes */ }}
                        />

                        <NotifyOrderPanel
                          orderId={expandedId!}
                          order={o as Record<string, unknown>}
                          es={locale === 'es'}
                        />
                      </div>

                      <div className="space-y-2 text-sm text-slate-700">
                        <h4 className="text-sm font-semibold text-slate-900">{t('adminPage.finance.orderItemsTitle')}</h4>
                        <div className="space-y-2">
                          {orderForm.items.length === 0 && (
                            <p className="text-xs text-slate-500 italic">Sin productos. Agrega al menos uno.</p>
                          )}
                          {orderForm.items.map((it, i) => (
                            <div key={i} className="grid grid-cols-12 gap-2 items-center rounded-md border border-slate-200 bg-white p-2">
                              <div className="col-span-6">
                                <ProductPickerInput
                                  value={it.name}
                                  onChange={(name, productId, suggestedPrice) => {
                                    setOrderForm((f) => {
                                      const items = [...f.items];
                                      items[i] = {
                                        ...items[i],
                                        name,
                                        productId: productId || items[i].productId,
                                        price: suggestedPrice ?? items[i].price,
                                      };
                                      return { ...f, items };
                                    });
                                  }}
                                />
                              </div>
                              <Input
                                className="col-span-2 text-xs"
                                type="number"
                                min={0}
                                value={it.quantity}
                                onChange={(e) => setOrderForm((f) => {
                                  const items = [...f.items];
                                  items[i] = { ...items[i], quantity: Math.max(0, parseInt(e.target.value || '0', 10)) };
                                  return { ...f, items };
                                })}
                                placeholder="Cant"
                              />
                              <Input
                                className="col-span-3 text-xs"
                                type="number"
                                step="0.01"
                                min={0}
                                value={it.price}
                                onChange={(e) => setOrderForm((f) => {
                                  const items = [...f.items];
                                  items[i] = { ...items[i], price: Math.max(0, parseFloat(e.target.value || '0')) };
                                  return { ...f, items };
                                })}
                                placeholder="Precio"
                              />
                              <button
                                type="button"
                                className="col-span-1 text-red-600 text-xs font-bold hover:bg-red-50 rounded py-1"
                                onClick={() => setOrderForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                                title="Eliminar"
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
                            onClick={() => setOrderForm((f) => ({
                              ...f,
                              items: [...f.items, { name: '', quantity: 1, price: 0 }],
                            }))}
                          >
                            + Agregar línea
                          </Button>
                        </div>
                        <p className="text-xs pt-2">
                          <span className="font-medium">Nuevo total:</span>{' '}
                          <span className="font-bold text-slate-900">
                            ${orderForm.items.reduce((acc, it) => acc + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0).toFixed(2)}
                          </span>
                          {' '}
                          <span className="text-slate-400">(antes ${(Number(o.total) || 0).toFixed(2)})</span>
                        </p>
                        <p className="text-xs">
                          <span className="font-medium">{t('adminPage.finance.shipTo')}:</span> {cust.address || '—'}, {cust.city || ''} {cust.zip || ''}
                        </p>
                        <p className="text-xs">
                          <span className="font-medium">{t('adminPage.finance.customerWhatsapp')}:</span>{' '}
                          {cust.whatsappCountryCode && cust.whatsappLocalNumber
                            ? `${cust.whatsappCountryCode} ${cust.whatsappLocalNumber}`
                            : '—'}
                        </p>
                        <p className="text-[10px] font-mono text-slate-500 break-all">ID: {o.id}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {tab === 'users' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('adminPage.finance.tabUsers')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
              {(['all', 'worker', 'client', 'admin'] as const).map((k) => {
                const lbl = k === 'all'
                  ? `Todos (${userCounts.total})`
                  : k === 'worker'
                    ? `Trabajadores (${userCounts.workers})`
                    : k === 'client'
                      ? `Clientes (${userCounts.clients})`
                      : `Admins (${userCounts.admins})`;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setUserRoleFilter(k)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      userRoleFilter === k
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {lbl}
                  </button>
                );
              })}
              <div className="ml-auto w-full sm:w-64">
                <Input
                  placeholder="Buscar por nombre o email…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
            </div>
            {dupeNames.size > 0 && userRoleFilter !== 'admin' && (
              <p className="px-4 text-[11px] text-amber-700">
                ⚠️ {dupeNames.size} nombre(s) duplicado(s) detectado(s). Las filas marcadas en ámbar comparten nombre con otra cuenta.
              </p>
            )}
            <div className="p-0 overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[960px]">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-600">
                  <th className="px-4 py-3 font-medium">{t('adminPage.finance.usersColEmail')}</th>
                  <th className="px-4 py-3 font-medium">{t('adminPage.finance.usersColName')}</th>
                  <th className="px-4 py-3 font-medium">{t('adminPage.finance.usersColRole')}</th>
                  <th className="px-4 py-3 font-medium">{t('adminPage.finance.usersColReferrer')}</th>
                  <th className="px-4 py-3 font-medium">{t('adminPage.finance.usersColAncestors')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('adminPage.finance.usersColActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredUsers.map((u) => {
                  const ref = u.referrerId ? userById.get(u.referrerId) : undefined;
                  const isDupe = (u.name || '').trim() && dupeNames.has((u.name || '').trim().toLowerCase());
                  return (
                    <tr key={u.id} className={`align-top ${isDupe ? 'bg-amber-50/60 hover:bg-amber-100/60' : 'hover:bg-slate-50'}`}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{u.email || '—'}</div>
                        <div className="text-[11px] font-mono text-slate-400">{u.id}</div>
                      </td>
                      <td className="px-4 py-2">{u.name || '—'}</td>
                      <td className="px-4 py-2">
                        <select
                          className="rounded border border-slate-200 px-2 py-1 text-xs capitalize"
                          value={u.role || 'client'}
                          onChange={(e) => void saveUserRole(u.id, e.target.value)}
                        >
                          <option value="client">client</option>
                          <option value="worker">worker</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <div className="font-mono">{u.referrerId || '—'}</div>
                        <div className="text-slate-500">{ref?.email || ref?.name || ''}</div>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-700 max-w-md" title={ancestorLabel(u.referralAncestors || [])}>
                        {ancestorLabel(u.referralAncestors || [])}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button type="button" size="sm" variant="outline" className="text-red-600 border-red-200" onClick={() => setDeleteUserId(u.id)}>
                          {t('adminPage.finance.deleteUser')}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredUsers.length === 0 && <p className="p-6 text-sm text-slate-500">{userSearch || userRoleFilter !== 'all' ? 'Sin resultados con esos filtros.' : t('adminPage.finance.noUsers')}</p>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Admin referral forest — shows the full multi-level tree of all partners ──
function AdminReferralForest({
  users,
  orders,
}: {
  users: Array<{ id: string; email?: string; name?: string; role?: string; referrerId?: string | null; referralAncestors?: string[] }>;
  orders: Array<Record<string, unknown>>;
}) {
  const roots: NetworkUser[] = buildReferralTree('__root__', users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    referrerId: u.referrerId ?? null,
  })));

  const workers = users.filter((u) => u.role === 'worker' || u.role === 'admin');
  const clients = users.filter((u) => u.role === 'client');
  const topLevel = users.filter((u) => !u.referrerId).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-bold">Red completa de afiliados</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-brand-50 border border-brand-200 p-4">
            <p className="text-xs uppercase tracking-wider text-brand-700 font-bold">Total usuarios</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{users.length}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
            <p className="text-xs uppercase tracking-wider text-emerald-700 font-bold">Partners</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{workers.length}</p>
          </div>
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
            <p className="text-xs uppercase tracking-wider text-blue-700 font-bold">Clientes</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{clients.length}</p>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
            <p className="text-xs uppercase tracking-wider text-amber-700 font-bold">Raíces</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{topLevel}</p>
          </div>
        </div>

        <div className="text-xs text-slate-500 border-l-2 border-brand-400 pl-3">
          Muestra todos los usuarios y debajo de cada uno sus referidos directos y sub-referidos.
          Las <strong>coronas doradas</strong> marcan raíces. Cada nodo muestra cuántos afiliados tiene debajo.
          <span className="text-slate-400"> · {orders.length} pedidos totales en el sistema.</span>
        </div>

        <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-5">
          {roots.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No hay usuarios registrados todavía.</p>
          ) : (
            <ReferralTree roots={roots} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}


/**
 * Searchable product picker for the order line items. Lets the admin pick
 * an existing product (auto-fills price) or type a custom name for ad-hoc
 * line items.
 */
function ProductPickerInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string, productId?: string, suggestedPrice?: number) => void;
}) {
  const products = useAppStore((s) => s.products);
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
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
            const eff = getEffectivePrice(p);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(p.name, p.id, eff.finalPrice);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-brand-50 border-b border-slate-100 last:border-0"
                >
                  <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{p.category}</span>
                    <span className="font-mono">${eff.finalPrice.toFixed(2)}{eff.hasDiscount ? ` (-${eff.percentOff}%)` : ''}</span>
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

/**
 * Per-vendor breakdown: aggregates all online orders + manual sales by
 * referrerId, shows for each worker their total sales generated, their
 * 40% direct commission, and their 10% upline commission (from people
 * they referred).
 */
function VendorBreakdownCard({
  orders,
  manualSales,
  users,
  locale,
}: {
  orders: OrderDoc[];
  manualSales: Record<string, unknown>[];
  users: UserRow[];
  locale: string;
}) {
  const es = locale === 'es';
  const [expandedUid, setExpandedUid] = useState<string | null>(null);

  const rows = useMemo(() => {
    type SaleDetail = {
      id: string;
      kind: 'order' | 'manual';
      createdAt: unknown;
      total: number;
      customerName: string;
      customerEmail: string;
      status: string;
      itemsLabel: string;
      relation: 'direct' | 'upline';
      commission: number;
      payoutStatus: string;
    };
    type Row = {
      uid: string;
      name: string;
      email: string;
      role: string;
      salesCount: number;
      salesTotal: number;
      directComm: number;
      directPending: number;
      directPaid: number;
      uplineComm: number;
      uplinePending: number;
      uplinePaid: number;
      sales: SaleDetail[];
    };
    const byUid = new Map<string, Row>();
    const ensure = (uid: string): Row => {
      let r = byUid.get(uid);
      if (r) return r;
      const u = users.find((x) => x.id === uid);
      r = {
        uid,
        name: u?.name || '',
        email: u?.email || '',
        role: u?.role || 'unknown',
        salesCount: 0,
        salesTotal: 0,
        directComm: 0,
        directPending: 0,
        directPaid: 0,
        uplineComm: 0,
        uplinePending: 0,
        uplinePaid: 0,
        sales: [],
      };
      byUid.set(uid, r);
      return r;
    };

    const all = [
      ...orders.map((o) => ({ data: o as Record<string, unknown>, kind: 'order' as const })),
      ...manualSales.map((m) => ({ data: m, kind: 'manual' as const })),
    ];

    for (const { data, kind } of all) {
      const total = Number((data as { total?: number }).total) || 0;
      const c = resolveOrderCommissions(data);
      const refId = (data as { referrerId?: string | null }).referrerId;
      const upId = (data as { uplineReferrerId?: string | null }).uplineReferrerId;
      const id = (data as { id?: string }).id || '';
      // Orders store customer under `customer.{name,email}`; manualSales store
      // `customerName`/`customerEmail` at top level. Support both.
      const cust = (data as { customer?: { name?: string; email?: string } }).customer || {};
      const customerName = cust.name || (data as { customerName?: string }).customerName || '';
      const customerEmail = cust.email || (data as { customerEmail?: string }).customerEmail || '';
      // Orders: items[].name / .price ; manualSales: items[].productName / .unitPrice
      const rawItems = (data as { items?: Array<{ name?: string; productName?: string; quantity?: number }> }).items || [];
      const itemsLabel = Array.isArray(rawItems) && rawItems.length > 0
        ? rawItems
            .map((it) => `${it.name || it.productName || '—'}${Number(it.quantity) > 1 ? ` ×${it.quantity}` : ''}`)
            .join(', ')
        : '';
      // Orders have `status`; manualSales have `channel` instead.
      const status = String(
        (data as { status?: string }).status ||
        (data as { channel?: string }).channel ||
        '—',
      );
      const createdAt = (data as { createdAt?: unknown }).createdAt;
      if (refId) {
        const r = ensure(refId);
        r.salesCount += 1;
        r.salesTotal += total;
        r.directComm += c.referrerCommissionAmount;
        if (c.referrerPayoutStatus === 'pending') r.directPending += c.referrerCommissionAmount;
        else if (c.referrerPayoutStatus === 'paid') r.directPaid += c.referrerCommissionAmount;
        r.sales.push({
          id, kind, createdAt, total,
          customerName, customerEmail,
          status, itemsLabel,
          relation: 'direct', commission: c.referrerCommissionAmount,
          payoutStatus: c.referrerPayoutStatus,
        });
      }
      if (upId) {
        const r = ensure(upId);
        r.uplineComm += c.uplineCommissionAmount;
        if (c.uplinePayoutStatus === 'pending') r.uplinePending += c.uplineCommissionAmount;
        else if (c.uplinePayoutStatus === 'paid') r.uplinePaid += c.uplineCommissionAmount;
        r.sales.push({
          id, kind, createdAt, total,
          customerName, customerEmail,
          status, itemsLabel,
          relation: 'upline', commission: c.uplineCommissionAmount,
          payoutStatus: c.uplinePayoutStatus,
        });
      }
    }

    const out = Array.from(byUid.values());
    // Newest sales first inside each vendor.
    const ts = (v: unknown): number => {
      if (v && typeof v === 'object' && 'seconds' in (v as Record<string, unknown>)) {
        return Number((v as { seconds?: number }).seconds) || 0;
      }
      const n = new Date(v as string).getTime();
      return Number.isFinite(n) ? n / 1000 : 0;
    };
    out.forEach((r) => r.sales.sort((a, b) => ts(b.createdAt) - ts(a.createdAt)));
    out.sort((a, b) => (b.salesTotal + b.uplineComm) - (a.salesTotal + a.uplineComm));
    return out;
  }, [orders, manualSales, users]);

  if (rows.length === 0) {
    return null;
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          📊 {es ? 'Ventas por vendedor' : 'Sales by vendor'}
          <span className="text-xs font-normal text-slate-500">
            ({rows.length} {es ? 'personas' : 'people'})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Card list — same look across mobile, tablet, desktop. */}
        <div className="divide-y divide-slate-100">
          {rows.map((r) => {
            const open = expandedUid === r.uid;
            return (
            <div key={`m-${r.uid}`} className="p-4 space-y-2">
              <button
                type="button"
                onClick={() => setExpandedUid(open ? null : r.uid)}
                className="w-full text-left space-y-2 rounded-lg -m-1 p-1 hover:bg-slate-50 transition-colors"
                aria-expanded={open}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                      <span className={`text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
                      {r.name || '—'}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate pl-4">{r.email}</p>
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold pl-4">{r.role}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">{es ? 'Total' : 'Total'}</p>
                    <p className="text-lg font-black text-slate-900">${r.salesTotal.toFixed(2)}</p>
                    <p className="text-[10px] text-slate-500">{r.salesCount} {es ? 'ventas' : 'sales'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                  <div className="rounded bg-emerald-50 border border-emerald-200 p-2">
                    <p className="text-[9px] uppercase font-bold text-emerald-700">{es ? '40% Directo' : '40% Direct'}</p>
                    <p className="font-black text-emerald-800">${r.directComm.toFixed(2)}</p>
                    {r.directPending > 0 && (
                      <p className="text-[10px] text-amber-700">Pend: ${r.directPending.toFixed(2)}</p>
                    )}
                  </div>
                  <div className="rounded bg-purple-50 border border-purple-200 p-2">
                    <p className="text-[9px] uppercase font-bold text-purple-700">{es ? '10% Upline' : '10% Upline'}</p>
                    <p className="font-black text-purple-800">${r.uplineComm.toFixed(2)}</p>
                    {r.uplinePending > 0 && (
                      <p className="text-[10px] text-amber-700">Pend: ${r.uplinePending.toFixed(2)}</p>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 pt-0.5">
                  {open
                    ? (es ? 'Toca para ocultar el detalle' : 'Tap to hide details')
                    : (es ? '👆 Toca para ver el detalle de las ventas' : '👆 Tap to see sale details')}
                </p>
              </button>

              {open && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 overflow-hidden">
                  <p className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-slate-500 border-b border-slate-200 bg-white">
                    {es ? `Detalle (${r.sales.length})` : `Details (${r.sales.length})`}
                  </p>
                  {r.sales.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-slate-500 italic">
                      {es ? 'Sin ventas registradas.' : 'No sales recorded.'}
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {r.sales.map((s, i) => (
                        <div key={`${s.id}-${s.relation}-${i}`} className="px-3 py-2.5 text-xs space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] text-slate-500">{fmtDate(s.createdAt)}</p>
                              <p className="font-bold text-slate-900 truncate">{s.customerName || (es ? 'Cliente —' : 'Customer —')}</p>
                              {s.customerEmail && <p className="text-[10px] text-slate-500 truncate">{s.customerEmail}</p>}
                            </div>
                            <p className="text-sm font-black text-slate-900 shrink-0">${s.total.toFixed(2)}</p>
                          </div>
                          {s.itemsLabel && (
                            <p className="text-[11px] text-slate-600 leading-snug">{s.itemsLabel}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="rounded bg-slate-200 text-slate-700 px-1.5 py-0.5 text-[9px] uppercase font-bold">{s.status}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[9px] uppercase font-bold ${s.relation === 'direct' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'}`}>
                              {s.relation === 'direct' ? (es ? '40% Directo' : '40% Direct') : (es ? '10% Upline' : '10% Upline')}
                            </span>
                            {s.kind === 'manual' && (
                              <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[9px] uppercase font-bold">{es ? 'Manual' : 'Manual'}</span>
                            )}
                            <span className="ml-auto font-bold text-slate-700">
                              {es ? 'Comisión' : 'Commission'}: ${s.commission.toFixed(2)}
                            </span>
                            {s.payoutStatus === 'pending' && (
                              <span className="text-[10px] text-amber-700 font-semibold">({es ? 'pendiente' : 'pending'})</span>
                            )}
                            {s.payoutStatus === 'paid' && (
                              <span className="text-[10px] text-emerald-700 font-semibold">({es ? 'pagado' : 'paid'})</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Inline vendor (referrer) reassignment for any order/manualSale.
 * Updates referrerId, recomputes uplineReferrerId from publicReferralMeta,
 * and rewrites the 40%/10% commission amounts based on the new chain.
 */
function ReassignOrderVendor({
  orderId,
  currentReferrerId,
  users,
  locale,
  onChanged,
}: {
  orderId: string;
  currentReferrerId: string;
  users: UserRow[];
  locale: string;
  onChanged: () => void;
}) {
  const es = locale === 'es';
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const eligible = users.filter((u) => u.role === 'worker' || u.role === 'admin' || u.role === 'subadmin');
    if (!q) return eligible.slice(0, 12);
    return eligible
      .filter((u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [users, query]);

  const currentUser = currentReferrerId ? users.find((u) => u.id === currentReferrerId) : null;

  const reassign = async (newReferrerId: string | null) => {
    setSaving(true);
    setFeedback(null);
    try {
      // Resolve upline (referrer's referrer) from publicReferralMeta.
      let newUpline: string | null = null;
      if (newReferrerId) {
        try {
          const metaSnap = await import('firebase/firestore').then((m) =>
            m.getDoc(m.doc(db, 'publicReferralMeta', newReferrerId)),
          );
          if (metaSnap.exists()) {
            const ancestors = (metaSnap.data().referralAncestors as string[]) || [];
            newUpline = ancestors.length > 0 ? ancestors[0] : null;
          }
        } catch { /* ignore */ }
      }
      // Try update on orders first; if not found, try manualSales.
      const tryCollections = ['orders', 'manualSales'];
      let updated = false;
      for (const coll of tryCollections) {
        try {
          await updateDoc(doc(db, coll, orderId), {
            referrerId: newReferrerId,
            uplineReferrerId: newUpline,
            referrerReassignedAt: serverTimestamp(),
          });
          updated = true;
          break;
        } catch { /* try next collection */ }
      }
      if (!updated) {
        setFeedback(es ? 'No se pudo actualizar.' : 'Could not update.');
        return;
      }
      setFeedback(
        newReferrerId
          ? (es ? '✓ Vendedor reasignado.' : '✓ Vendor reassigned.')
          : (es ? '✓ Vendedor removido.' : '✓ Vendor removed.'),
      );
      setPickerOpen(false);
      setQuery('');
      onChanged();
    } catch (e) {
      console.error('reassign order vendor failed', e);
      setFeedback(es ? 'Error al guardar.' : 'Save error.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4 mt-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          👤 {es ? 'Vendedor (atribuir comisión)' : 'Vendor (commission attribution)'}
        </h4>
        {!pickerOpen ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPickerOpen(true)}
            className="text-xs"
          >
            {es ? 'Cambiar' : 'Change'}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => { setPickerOpen(false); setQuery(''); setFeedback(null); }}
            className="text-xs"
          >
            {es ? 'Cancelar' : 'Cancel'}
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-600 mb-2">
        {es ? 'Actual: ' : 'Current: '}
        <span className="font-semibold text-slate-800">
          {currentUser
            ? `${currentUser.name || currentUser.email} (${currentUser.role})`
            : (es ? '— Sin vendedor —' : '— No vendor —')}
        </span>
      </p>
      {pickerOpen && (
        <div className="space-y-2">
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠️ {es
              ? 'Al cambiar el vendedor se recalcula la comisión 40% y el upline 10%. Las notificaciones ya enviadas no cambian.'
              : 'Changing the vendor recomputes the 40% commission and 10% upline. Past notifications stay as-is.'}
          </p>
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={es ? 'Buscar trabajador por nombre o email…' : 'Search worker by name or email…'}
            className="text-xs"
          />
          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-100">
            <button
              type="button"
              disabled={saving}
              onClick={() => reassign(null)}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 disabled:opacity-50 text-xs"
            >
              <span className="font-bold text-slate-700">{es ? '— Sin vendedor —' : '— No vendor —'}</span>
            </button>
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={saving}
                onClick={() => reassign(c.id)}
                className="w-full text-left px-3 py-2 hover:bg-emerald-50 disabled:opacity-50"
              >
                <p className="text-xs font-bold text-slate-900 truncate">{c.name || c.email || c.id}</p>
                <p className="text-[10px] text-slate-500 truncate">{c.email}</p>
                <p className="text-[10px] text-emerald-600 font-semibold uppercase">{c.role}</p>
              </button>
            ))}
            {candidates.length === 0 && (
              <div className="px-3 py-3 text-xs text-slate-400 text-center">
                {es ? 'Sin coincidencias.' : 'No matches.'}
              </div>
            )}
          </div>
          {saving && (
            <p className="text-xs text-slate-500">{es ? 'Guardando…' : 'Saving…'}</p>
          )}
        </div>
      )}
      {feedback && (
        <p className="text-[11px] mt-2 text-emerald-700 font-semibold">{feedback}</p>
      )}
    </div>
  );
}

interface OrdersPanelProps {
  orders: OrderDoc[];
  users: UserRow[];
  updatingId: string | null;
  expandedId: string | null;
  openOrderRow: (o: OrderDoc) => void;
  patchPayout: (
    orderId: string,
    field: 'referrerPayoutStatus' | 'uplinePayoutStatus',
    paid: boolean,
    paidAtField: 'referrerPayoutPaidAt' | 'uplinePayoutPaidAt',
  ) => Promise<void>;
  sendPartnerWaRemind: (id: string) => Promise<void>;
  setDeleteOrderId: (id: string | null) => void;
  t: (k: string) => string;
  locale: string;
}

const AVATAR_COLORS = [
  'bg-rose-200 text-rose-800',
  'bg-amber-200 text-amber-800',
  'bg-emerald-200 text-emerald-800',
  'bg-sky-200 text-sky-800',
  'bg-violet-200 text-violet-800',
  'bg-pink-200 text-pink-800',
  'bg-cyan-200 text-cyan-800',
  'bg-indigo-200 text-indigo-800',
];

function hashToColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function statusPill(status: string, kind: 'payment' | 'dispatch') {
  const s = (status || '').toLowerCase();
  let cls = 'bg-slate-100 text-slate-600';
  let icon = '';
  if (kind === 'payment') {
    if (s === 'paid') { cls = 'bg-emerald-100 text-emerald-700'; icon = '✓'; }
    else if (s === 'pending') { cls = 'bg-amber-100 text-amber-700'; icon = '⏳'; }
    else if (s === 'processing') { cls = 'bg-yellow-100 text-yellow-700'; icon = '⟳'; }
    else if (s === 'cancelled') { cls = 'bg-red-100 text-red-700'; icon = '✕'; }
    else if (s === 'refunded') { cls = 'bg-slate-200 text-slate-700'; icon = '↺'; }
  } else {
    if (s === 'shipped') { cls = 'bg-sky-100 text-sky-700'; icon = '✈'; }
    else if (s === 'delivered') { cls = 'bg-teal-100 text-teal-700'; icon = '✓'; }
    else if (s === 'unfulfilled') { cls = 'bg-slate-100 text-slate-500'; icon = '○'; }
    else if (s === 'processing') { cls = 'bg-yellow-100 text-yellow-700'; icon = '⟳'; }
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {icon && <span className="text-[9px]">{icon}</span>}
      {status || '—'}
    </span>
  );
}

function OrdersPanel({
  orders, users, updatingId, openOrderRow,
  patchPayout, setDeleteOrderId, t, locale,
}: OrdersPanelProps) {
  const es = locale === 'es';
  const userById = useMemo(() => {
    const m = new Map<string, UserRow>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);
  const [search, setSearch] = useState('');

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const cust = (o.customer as { name?: string; email?: string }) || {};
      const hay = `${cust.name || ''} ${cust.email || ''} ${o.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [orders, search]);

  return (
    <Card>
      <div className="border-b border-slate-200 px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3 bg-white">
        <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
          📋 {es ? 'Panel de Gestión de Pedidos' : 'Order Management Panel'}
        </h2>
        <div className="flex-1 max-w-md min-w-[180px]">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={es ? 'Buscar cliente, email o ID…' : 'Search customer, email or ID…'}
              className="pl-9 h-10 text-sm rounded-full"
            />
          </div>
        </div>
      </div>

      {/* Card layout — used at every screen width. Mobile-first design.
          User explicitly asked for the same card UX on desktop too. */}
      <div className="divide-y divide-slate-100">
        {filteredOrders.length === 0 ? (
          <p className="p-8 text-sm text-slate-500 text-center">
            {orders.length === 0
              ? (es ? 'No hay pedidos todavía.' : 'No orders yet.')
              : (es ? 'Sin resultados.' : 'No results.')}
          </p>
        ) : filteredOrders.map((o) => {
          const c = resolveOrderCommissions(o);
          const refId = (o.referrerId as string) || '';
          const refUser = refId ? userById.get(refId) : undefined;
          const cust = (o.customer as { name?: string; email?: string }) || {};
          const busy = updatingId === o.id;
          const ful = String(o.fulfillmentStatus || 'unfulfilled');
          const status = String(o.status || 'pending');
          const initial = (cust.name || cust.email || '?').charAt(0).toUpperCase();
          return (
            <div key={`m-${o.id}`} className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className={`h-11 w-11 rounded-full ${hashToColor(cust.email || cust.name || o.id)} flex items-center justify-center text-base font-bold shrink-0`}>
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 truncate">{cust.name || '—'}</p>
                  <p className="text-[11px] text-slate-500 truncate">{cust.email || ''}</p>
                  <p className="text-[10px] text-slate-400">{fmtDate(o.createdAt)}</p>
                </div>
                <p className="text-lg font-black text-slate-900 shrink-0">${(Number(o.total) || 0).toFixed(2)}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {statusPill(status, 'payment')}
                {statusPill(ful, 'dispatch')}
                {refId && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-700 px-2 py-0.5 text-[10px] font-bold">
                    👤 {refUser?.email?.split('@')[0] || refId.slice(0, 8)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="outline" className="text-xs flex-1 min-w-[120px]" onClick={() => openOrderRow(o)}>
                  📁 {t('adminPage.finance.manageOrder')}
                </Button>
                {c.referrerPayoutStatus !== 'na' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-xs flex-1 min-w-[120px]"
                    disabled={busy}
                    onClick={() => void patchPayout(o.id, 'referrerPayoutStatus', c.referrerPayoutStatus !== 'paid', 'referrerPayoutPaidAt')}
                  >
                    {c.referrerPayoutStatus === 'paid'
                      ? `↺ ${t('adminPage.finance.markUnpaidDirect')}`
                      : `💰 ${t('adminPage.finance.markPaidDirect')}`}
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => setDeleteOrderId(o.id)}
                  className="text-[11px] text-red-600 hover:underline font-semibold px-2"
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
