import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, query, limit as fLimit, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/I18nContext';
import { useAppStore } from '@/store';
import {
  Users, Search, Save, DollarSign, Percent, Package, ChevronDown,
  ChevronUp, CheckCircle2, X, Loader2, GitBranch, ShoppingBag, AlertTriangle,
} from 'lucide-react';

type VendorUser = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  referrerId?: string | null;
  referralAncestors?: string[];
  vendorStatus?: string; // pending_review | active | blocked | inactive
  occupation?: string;
  /** Only workers with this flag see the wholesale tab on /panel. Admins see it always. */
  wholesaleAccess?: boolean;
  // Commission config
  commissionMode?: 'percentage' | 'fixed_per_product' | 'fixed_global';
  commissionPercentage?: number;
  commissionFixedAmount?: number;
  commissionFixedPerProduct?: Record<string, number>;
};

export function AdminVendors() {
  const { locale } = useI18n();
  const es = locale === 'es';
  const products = useAppStore((s) => s.products);
  const [users, setUsers] = useState<VendorUser[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'worker' | 'client' | 'subadmin'>('all');
  /** Per-user UI state for the "Reassign referrer" mini-panel. */
  const [reassignTargetId, setReassignTargetId] = useState<string | null>(null);
  const [reassignQuery, setReassignQuery] = useState('');
  const [reassignSaving, setReassignSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'users'), fLimit(2000)),
      (snap) => {
        setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as VendorUser)));
      }
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    let list = users;
    if (filter !== 'all') list = list.filter((u) => u.role === filter);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter((u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [users, filter, searchQ]);

  const workers = users.filter((u) => u.role === 'worker');
  const clients = users.filter((u) => u.role === 'client');

  // Save vendor commission config
  const saveVendor = async (vendor: VendorUser) => {
    setSaving(vendor.id);
    try {
      await updateDoc(doc(db, 'users', vendor.id), {
        commissionMode: vendor.commissionMode || 'percentage',
        commissionPercentage: vendor.commissionPercentage ?? 0.4,
        commissionFixedAmount: vendor.commissionFixedAmount ?? 0,
        commissionFixedPerProduct: vendor.commissionFixedPerProduct ?? {},
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(null);
    }
  };

  const updateVendorLocal = (id: string, patch: Partial<VendorUser>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  };

  /** Lookup user display name from in-memory cache. */
  const lookupName = (uid: string | null | undefined): string => {
    if (!uid) return es ? '— (sin referido)' : '— (no referrer)';
    const u = users.find((x) => x.id === uid);
    return u ? `${u.name || u.email || uid.slice(0, 8)}` : uid.slice(0, 8) + '…';
  };

  /**
   * Reassign a user to a new referrer. Updates the user document AND its
   * publicReferralMeta mirror so future order attribution honors the new chain.
   *
   * The new ancestor chain is: [newReferrerId, ...newReferrer.referralAncestors].
   * If you pass null as newReferrerId, the user becomes top-level.
   *
   * Safety: refuses to assign someone as their own ancestor (cycle protection).
   */
  const reassignReferrer = async (userId: string, newReferrerId: string | null) => {
    if (userId === newReferrerId) {
      window.alert(es ? 'No puedes referirte a ti mismo.' : 'A user cannot refer themselves.');
      return;
    }
    // Cycle check: refuse if userId appears in the new referrer's ancestors.
    if (newReferrerId) {
      const parent = users.find((u) => u.id === newReferrerId);
      if (parent?.referralAncestors?.includes(userId)) {
        window.alert(
          es
            ? 'No se puede crear un ciclo: el nuevo referidor desciende de este usuario.'
            : 'Cycle detected: the new referrer descends from this user.',
        );
        return;
      }
    }
    setReassignSaving(true);
    try {
      let newAncestors: string[] = [];
      if (newReferrerId) {
        // Prefer the cached referralAncestors, but fall back to publicReferralMeta.
        const parent = users.find((u) => u.id === newReferrerId);
        let parentChain = parent?.referralAncestors || [];
        if (!parent?.referralAncestors) {
          try {
            const metaSnap = await getDoc(doc(db, 'publicReferralMeta', newReferrerId));
            if (metaSnap.exists()) {
              const remote = metaSnap.data().referralAncestors as string[] | undefined;
              if (Array.isArray(remote)) parentChain = remote;
            }
          } catch { /* ignore */ }
        }
        newAncestors = [newReferrerId, ...parentChain];
      }
      await updateDoc(doc(db, 'users', userId), {
        referrerId: newReferrerId,
        referralAncestors: newAncestors,
        referrerReassignedAt: serverTimestamp(),
      });
      // Mirror to publicReferralMeta — used by checkout to resolve upline.
      await setDoc(
        doc(db, 'publicReferralMeta', userId),
        { referralAncestors: newAncestors, updatedAt: serverTimestamp() },
        { merge: true },
      );
      updateVendorLocal(userId, { referrerId: newReferrerId, referralAncestors: newAncestors });
      setReassignTargetId(null);
      setReassignQuery('');
    } catch (e) {
      console.error('reassignReferrer failed', e);
      window.alert(es ? 'No se pudo guardar el cambio.' : 'Could not save the change.');
    } finally {
      setReassignSaving(false);
    }
  };

  /** Candidates for the reassignment search: workers and admins only. */
  const reassignCandidates = useMemo(() => {
    const q = reassignQuery.trim().toLowerCase();
    const eligible = users.filter((u) =>
      u.role === 'worker' || u.role === 'admin' || u.role === 'subadmin',
    );
    if (!q) return eligible.slice(0, 8);
    return eligible
      .filter((u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [users, reassignQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {es ? 'Vendedores y Clientes' : 'Vendors & Customers'}
          </h1>
          <p className="text-sm text-slate-500">
            {es
              ? 'Configura comisiones por vendedor. Busca y filtra usuarios.'
              : 'Configure commissions per vendor. Search and filter users.'}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-brand-100 flex items-center justify-center"><Users className="h-4 w-4 text-brand-700" /></div>
            <div><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{es ? 'Total' : 'Total'}</p><p className="text-lg font-black text-slate-900">{users.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center"><DollarSign className="h-4 w-4 text-emerald-700" /></div>
            <div><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Partners</p><p className="text-lg font-black text-slate-900">{workers.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center"><Package className="h-4 w-4 text-blue-700" /></div>
            <div><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{es ? 'Clientes' : 'Clients'}</p><p className="text-lg font-black text-slate-900">{clients.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center"><Percent className="h-4 w-4 text-amber-700" /></div>
            <div><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{es ? 'Con comisión' : 'With commission'}</p><p className="text-lg font-black text-slate-900">{workers.filter((w) => w.commissionMode).length}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder={es ? 'Buscar por nombre, email o ID...' : 'Search by name, email or ID...'}
            className="w-full rounded-xl bg-white border border-slate-200 pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(['all', 'worker', 'client', 'subadmin'] as const).map((f) => {
            const labels: Record<string, string> = es
              ? { all: 'Todos', worker: 'Vendedores', client: 'Clientes', subadmin: 'Sub-admin' }
              : { all: 'All', worker: 'Vendors', client: 'Clients', subadmin: 'Sub-admin' };
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${filter === f ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {labels[f]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Users list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-10 text-sm text-slate-500">
            {es ? 'No se encontraron usuarios.' : 'No users found.'}
          </div>
        )}
        {filtered.map((user) => {
          const isExpanded = expandedId === user.id;
          const isWorker = user.role === 'worker';
          const mode = user.commissionMode || 'percentage';
          const pct = (user.commissionPercentage ?? 0.4) * 100;
          const fixedAmt = user.commissionFixedAmount ?? 0;

          return (
            <Card key={user.id}>
              <CardContent className="p-0">
                {/* Header row */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : user.id)}
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                    user.role === 'worker' ? 'bg-gradient-to-br from-brand-500 to-brand-700' :
                    user.role === 'subadmin' ? 'bg-gradient-to-br from-amber-500 to-amber-700' :
                    user.role === 'admin' ? 'bg-gradient-to-br from-red-500 to-red-700' :
                    'bg-gradient-to-br from-slate-500 to-slate-700'
                  }`}>
                    {(user.name || user.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900 truncate">{user.name || '—'}</p>
                      <span className={`text-[10px] rounded-full px-2 py-0.5 font-bold uppercase tracking-wider ${
                        user.role === 'worker' ? 'bg-brand-100 text-brand-700' :
                        user.role === 'subadmin' ? 'bg-amber-100 text-amber-700' :
                        user.role === 'admin' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {user.role || 'client'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>
                  {isWorker && (
                    <div className="flex items-center gap-3 shrink-0 mr-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                        user.vendorStatus === 'active' ? 'bg-emerald-100 text-emerald-700' :
                        user.vendorStatus === 'blocked' ? 'bg-red-100 text-red-700' :
                        user.vendorStatus === 'inactive' ? 'bg-slate-100 text-slate-600' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {user.vendorStatus === 'active' ? '✓ Active' :
                         user.vendorStatus === 'blocked' ? '🚫 Blocked' :
                         user.vendorStatus === 'inactive' ? '⏸ Inactive' :
                         '⏳ In Review'}
                      </span>
                      <div className="text-right">
                        <p className="text-xs text-slate-400">{es ? 'Comisión' : 'Commission'}</p>
                        <p className="text-sm font-bold text-brand-700">
                          {mode === 'percentage' ? `${pct}%` : mode === 'fixed_global' ? `$${fixedAmt}/unit` : es ? 'Por producto' : 'Per product'}
                        </p>
                      </div>
                    </div>
                  )}
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
                </button>

                {/* Expanded: Commission config (workers only) */}
                {isExpanded && isWorker && (
                  <div className="border-t border-slate-100 p-5 bg-slate-50/50 space-y-4">
                    {/* Vendor status controls */}
                    <div className="mb-5 pb-4 border-b border-slate-200">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        {es ? 'Estado del vendedor' : 'Vendor status'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(['active', 'pending_review', 'blocked', 'inactive'] as const).map((st) => {
                          const labels: Record<string, string> = { active: '✓ Active', pending_review: '⏳ In Review', blocked: '🚫 Blocked', inactive: '⏸ Inactive' };
                          const colors: Record<string, string> = {
                            active: user.vendorStatus === st ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                            pending_review: user.vendorStatus === st ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 border border-amber-200',
                            blocked: user.vendorStatus === st ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border border-red-200',
                            inactive: user.vendorStatus === st ? 'bg-slate-600 text-white' : 'bg-slate-50 text-slate-700 border border-slate-200',
                          };
                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={async () => {
                                updateVendorLocal(user.id, { vendorStatus: st });
                                await updateDoc(doc(db, 'users', user.id), { vendorStatus: st });
                              }}
                              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${colors[st]}`}
                            >
                              {labels[st]}
                            </button>
                          );
                        })}
                      </div>
                      {user.occupation && (
                        <p className="text-xs text-slate-500 mt-2">
                          {es ? 'Ocupación' : 'Occupation'}: <span className="font-semibold text-slate-700">{user.occupation}</span>
                        </p>
                      )}
                    </div>

                    {/* Wholesale access toggle — worker-only feature. */}
                    <div className="mb-5 pb-4 border-b border-slate-200">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <ShoppingBag className="h-3.5 w-3.5 text-brand-600" />
                        {es ? 'Acceso a lista mayorista' : 'Wholesale list access'}
                      </p>
                      <label className="inline-flex items-center gap-3 cursor-pointer select-none rounded-xl bg-white border border-slate-200 px-4 py-2.5 hover:border-brand-300">
                        <input
                          type="checkbox"
                          checked={!!user.wholesaleAccess}
                          onChange={async (e) => {
                            const next = e.target.checked;
                            updateVendorLocal(user.id, { wholesaleAccess: next });
                            try {
                              await updateDoc(doc(db, 'users', user.id), { wholesaleAccess: next });
                            } catch (err) {
                              updateVendorLocal(user.id, { wholesaleAccess: !next });
                              console.error(err);
                            }
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-sm font-semibold text-slate-700">
                          {user.wholesaleAccess
                            ? es ? 'Puede ver la lista mayorista' : 'Can view the wholesale list'
                            : es ? 'NO tiene acceso a la lista mayorista' : 'No access to the wholesale list'}
                        </span>
                      </label>
                      <p className="text-[10px] text-slate-400 mt-1.5">
                        {es
                          ? 'Solo los trabajadores con este permiso ven la pestaña “Mayorista” en su panel.'
                          : 'Only workers with this permission see the "Wholesale" tab in their panel.'}
                      </p>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-brand-600" />
                      {es ? 'Configuración de comisión' : 'Commission settings'}
                    </h4>

                    {/* Mode selector */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {([
                        { key: 'percentage', label: es ? 'Porcentaje (%)' : 'Percentage (%)', desc: es ? 'Gana X% del precio de venta' : 'Earns X% of sale price', icon: Percent },
                        { key: 'fixed_global', label: es ? 'Fijo por unidad ($)' : 'Fixed per unit ($)', desc: es ? 'Gana $X por cada producto vendido' : 'Earns $X for each product sold', icon: DollarSign },
                        { key: 'fixed_per_product', label: es ? 'Fijo por producto' : 'Fixed per product', desc: es ? 'Monto diferente por producto' : 'Different amount per product', icon: Package },
                      ] as const).map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => updateVendorLocal(user.id, { commissionMode: m.key })}
                          className={`rounded-xl border-2 p-3 text-left transition ${
                            mode === m.key
                              ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <m.icon className={`h-4 w-4 mb-1.5 ${mode === m.key ? 'text-brand-600' : 'text-slate-400'}`} />
                          <p className="text-xs font-bold text-slate-900">{m.label}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{m.desc}</p>
                        </button>
                      ))}
                    </div>

                    {/* Config based on mode */}
                    {mode === 'percentage' && (
                      <div className="flex items-end gap-3">
                        <div className="flex-1 max-w-xs">
                          <label className="text-xs font-medium text-slate-600 block mb-1">
                            {es ? 'Porcentaje de comisión' : 'Commission percentage'}
                          </label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={pct}
                              onChange={(e) => updateVendorLocal(user.id, { commissionPercentage: (parseFloat(e.target.value) || 0) / 100 })}
                              className="text-center"
                            />
                            <span className="text-lg font-bold text-slate-700">%</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {es ? `Gana $${((user.commissionPercentage ?? 0.4) * 100).toFixed(0)} por cada $100 de venta` : `Earns $${((user.commissionPercentage ?? 0.4) * 100).toFixed(0)} per $100 sale`}
                          </p>
                        </div>
                      </div>
                    )}

                    {mode === 'fixed_global' && (
                      <div className="flex items-end gap-3">
                        <div className="flex-1 max-w-xs">
                          <label className="text-xs font-medium text-slate-600 block mb-1">
                            {es ? 'Monto fijo por unidad vendida (USD)' : 'Fixed amount per unit sold (USD)'}
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-slate-700">$</span>
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              value={fixedAmt}
                              onChange={(e) => updateVendorLocal(user.id, { commissionFixedAmount: parseFloat(e.target.value) || 0 })}
                              className="text-center"
                            />
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {es ? 'Sin importar qué producto venda, gana esta cantidad por unidad.' : 'Regardless of which product sold, earns this amount per unit.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {mode === 'fixed_per_product' && (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-600">
                          {es ? 'Define cuánto gana por cada producto específico:' : 'Define how much they earn per specific product:'}
                        </p>
                        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                              <tr>
                                <th className="px-3 py-2 text-left">{es ? 'Producto' : 'Product'}</th>
                                <th className="px-3 py-2 text-right">{es ? 'Precio venta' : 'Sale price'}</th>
                                <th className="px-3 py-2 text-right">{es ? 'Comisión $' : 'Commission $'}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {products.map((p) => {
                                const perProduct = user.commissionFixedPerProduct || {};
                                const val = perProduct[p.id] ?? 0;
                                return (
                                  <tr key={p.id} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 font-medium text-slate-900 truncate max-w-[180px]">{p.name}</td>
                                    <td className="px-3 py-2 text-right text-slate-600">${p.price.toFixed(2)}</td>
                                    <td className="px-3 py-2 text-right">
                                      <Input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={val}
                                        onChange={(e) => {
                                          const updated = { ...(user.commissionFixedPerProduct || {}), [p.id]: parseFloat(e.target.value) || 0 };
                                          updateVendorLocal(user.id, { commissionFixedPerProduct: updated });
                                        }}
                                        className="w-20 text-center text-xs h-7 ml-auto"
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        type="button"
                        onClick={() => saveVendor(user)}
                        disabled={saving === user.id}
                        className="bg-brand-600 hover:bg-brand-500 text-white rounded-lg h-9 px-5 text-xs font-bold"
                      >
                        {saving === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                        {es ? 'Guardar comisión' : 'Save commission'}
                      </Button>
                      <p className="text-[10px] text-slate-400">
                        {es ? 'El upline (referido del referido) sigue con el % global del sistema.' : 'Upline (referrer of the referrer) still uses the global system %.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Expanded: info for non-workers */}
                {isExpanded && !isWorker && (
                  <div className="border-t border-slate-100 p-5 bg-slate-50/50 space-y-5">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="text-slate-500 font-semibold">ID</p>
                        <p className="font-mono text-slate-800 truncate">{user.id}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-semibold">Email</p>
                        <p className="text-slate-800 truncate">{user.email}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-semibold">{es ? 'Referido por' : 'Referred by'}</p>
                        <p className="text-slate-800 truncate">{lookupName(user.referrerId)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-semibold">Rol</p>
                        <p className="text-slate-800">{user.role || 'client'}</p>
                      </div>
                    </div>
                    <ReassignReferrerBlock
                      user={user}
                      es={es}
                      lookupName={lookupName}
                      isOpen={reassignTargetId === user.id}
                      onOpen={() => { setReassignTargetId(user.id); setReassignQuery(''); }}
                      onClose={() => { setReassignTargetId(null); setReassignQuery(''); }}
                      query={reassignQuery}
                      setQuery={setReassignQuery}
                      candidates={reassignCandidates}
                      saving={reassignSaving}
                      onAssign={(newId) => reassignReferrer(user.id, newId)}
                    />
                  </div>
                )}

                {/* Reassign referrer block — also shown for workers */}
                {isExpanded && isWorker && (
                  <div className="border-t border-slate-100 p-5 bg-slate-50/50">
                    <ReassignReferrerBlock
                      user={user}
                      es={es}
                      lookupName={lookupName}
                      isOpen={reassignTargetId === user.id}
                      onOpen={() => { setReassignTargetId(user.id); setReassignQuery(''); }}
                      onClose={() => { setReassignTargetId(null); setReassignQuery(''); }}
                      query={reassignQuery}
                      setQuery={setReassignQuery}
                      candidates={reassignCandidates}
                      saving={reassignSaving}
                      onAssign={(newId) => reassignReferrer(user.id, newId)}
                    />
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

// Unused import suppressor
void X;
void CheckCircle2;

interface ReassignProps {
  user: VendorUser;
  es: boolean;
  lookupName: (uid: string | null | undefined) => string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  query: string;
  setQuery: (v: string) => void;
  candidates: VendorUser[];
  saving: boolean;
  onAssign: (newReferrerId: string | null) => void;
}

function ReassignReferrerBlock({
  user, es, lookupName, isOpen, onOpen, onClose, query, setQuery, candidates, saving, onAssign,
}: ReassignProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-brand-600" />
          <p className="text-sm font-bold text-slate-900">
            {es ? 'Referidor' : 'Referrer'}
          </p>
        </div>
        {!isOpen ? (
          <Button
            type="button"
            onClick={onOpen}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg h-8 px-3 text-xs font-bold"
          >
            {es ? 'Cambiar' : 'Change'}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onClose}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg h-8 px-3 text-xs font-bold"
          >
            <X className="h-3 w-3 mr-1" />
            {es ? 'Cancelar' : 'Cancel'}
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-1">
        {es ? 'Actual: ' : 'Current: '}
        <span className="font-semibold text-slate-800">{lookupName(user.referrerId)}</span>
      </p>
      {isOpen && (
        <div className="mt-3 space-y-2">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
            <span>
              {es
                ? 'Al cambiar el referidor se recalcula el árbol de descendencia y futuras comisiones. Las órdenes pasadas no cambian su atribución.'
                : 'Changing the referrer recomputes the downline tree and future commissions. Past orders keep their original attribution.'}
            </span>
          </div>
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={es ? 'Buscar trabajador por nombre o email…' : 'Search worker by name or email…'}
            className="text-sm"
          />
          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-100">
            <button
              type="button"
              disabled={saving}
              onClick={() => onAssign(null)}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 disabled:opacity-50 text-xs"
            >
              <span className="font-bold text-slate-700">{es ? '— Sin referidor (raíz) —' : '— No referrer (root) —'}</span>
            </button>
            {candidates
              .filter((c) => c.id !== user.id)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={saving}
                  onClick={() => onAssign(c.id)}
                  className="w-full text-left px-3 py-2 hover:bg-brand-50 disabled:opacity-50"
                >
                  <p className="text-xs font-bold text-slate-900 truncate">{c.name || c.email || c.id}</p>
                  <p className="text-[10px] text-slate-500 truncate">{c.email}</p>
                  <p className="text-[10px] text-brand-600 font-semibold uppercase">{c.role}</p>
                </button>
              ))}
            {candidates.length === 0 && (
              <div className="px-3 py-3 text-xs text-slate-400 text-center">
                {es ? 'Sin coincidencias.' : 'No matches.'}
              </div>
            )}
          </div>
          {saving && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              {es ? 'Guardando…' : 'Saving…'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
