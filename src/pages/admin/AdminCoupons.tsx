import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, limit as fLimit, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { useI18n } from '@/i18n/I18nContext';
import { Tag, Plus, Trash2, Copy, Calendar, Hash, Power } from 'lucide-react';

interface CouponDoc {
  id: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  active: boolean;
  expiresAt?: { seconds: number } | null;
  maxUses?: number | null;
  usedCount?: number;
  note?: string | null;
}

export function AdminCoupons() {
  const { locale } = useI18n();
  const es = locale === 'es';

  const [coupons, setCoupons] = useState<CouponDoc[]>([]);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState<number>(10);
  const [maxUses, setMaxUses] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'coupons'), fLimit(500)), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CouponDoc, 'id'>) }));
      rows.sort((a, b) => a.code.localeCompare(b.code));
      setCoupons(rows);
    });
    return () => unsub();
  }, []);

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
    setCode(s);
  };

  const create = async () => {
    setError('');
    const c = code.trim().toUpperCase();
    if (!c) { setError(es ? 'Código requerido' : 'Code required'); return; }
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      setError(es ? 'Valor de descuento inválido' : 'Invalid discount value');
      return;
    }
    if (discountType === 'percent' && discountValue > 100) {
      setError(es ? 'El porcentaje no puede ser mayor a 100' : 'Percent cannot exceed 100');
      return;
    }
    if (coupons.some((co) => co.code === c)) {
      setError(es ? 'Ese código ya existe' : 'Code already exists');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'coupons'), {
        code: c,
        discountType,
        discountValue,
        active: true,
        usedCount: 0,
        maxUses: maxUses ? parseInt(maxUses, 10) : null,
        expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null,
        note: note || null,
        createdAt: Timestamp.now(),
      });
      setCode(''); setDiscountValue(10); setMaxUses(''); setExpiresAt(''); setNote('');
    } catch (e) {
      console.error(e);
      setError(es ? 'No se pudo crear el cupón' : 'Could not create coupon');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: CouponDoc) => {
    await updateDoc(doc(db, 'coupons', c.id), { active: !c.active });
  };

  const remove = async (id: string) => {
    if (!confirm(es ? '¿Eliminar este cupón?' : 'Delete this coupon?')) return;
    await deleteDoc(doc(db, 'coupons', id));
  };

  const copyCode = async (c: string) => {
    try { await navigator.clipboard.writeText(c); } catch { /* ignore */ }
  };

  const fmtDate = (ts?: { seconds: number } | null) => {
    if (!ts) return es ? 'Sin expiración' : 'No expiry';
    return new Date(ts.seconds * 1000).toLocaleDateString(es ? 'es-CO' : 'en-US');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Tag className="h-6 w-6 text-brand-600" />
          {es ? 'Cupones de Descuento' : 'Discount Coupons'}
        </h1>
        <p className="text-sm text-slate-500">
          {es
            ? 'Crea códigos para compartir con tus clientes (ej. promoción del Día de las Madres). Los clientes los ingresan en el carrito.'
            : 'Create codes to share with customers (e.g. Mother\'s Day promo). Customers enter them in the cart.'}
        </p>
      </div>

      {/* Create form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-5 w-5 text-brand-600" />
            {es ? 'Crear cupón nuevo' : 'Create new coupon'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{es ? 'Código' : 'Code'}</label>
              <div className="flex gap-1">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder={es ? 'MAMA20' : 'MOM20'}
                  className="uppercase font-mono"
                />
                <Button type="button" variant="outline" onClick={generateCode} className="px-2 shrink-0" title={es ? 'Generar aleatorio' : 'Generate random'}>
                  <Hash className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{es ? 'Tipo' : 'Type'}</label>
              <Combobox
                value={discountType}
                onChange={(v) => setDiscountType(v as 'percent' | 'fixed')}
                options={[
                  { value: 'percent', label: es ? '% Porcentaje' : '% Percent' },
                  { value: 'fixed', label: es ? '$ Monto fijo' : '$ Fixed amount' },
                ]}
                searchable={false}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                {es ? 'Valor' : 'Value'} {discountType === 'percent' ? '(%)' : '($)'}
              </label>
              <Input
                type="number"
                min={0}
                step={discountType === 'percent' ? 1 : 0.01}
                value={discountValue}
                onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{es ? 'Usos máx. (opcional)' : 'Max uses (optional)'}</label>
              <Input
                type="number"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="∞"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {es ? 'Expira (opcional)' : 'Expires (optional)'}
              </label>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{es ? 'Nota interna' : 'Internal note'}</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={es ? 'Promo Día de las Madres' : 'Mother\'s Day promo'} />
            </div>
          </div>
          {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
          <Button onClick={create} disabled={saving} className="w-full bg-brand-600 hover:bg-brand-500 text-white rounded-xl h-11 font-bold">
            {saving ? '...' : (es ? 'Crear cupón' : 'Create coupon')}
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {es ? 'Cupones activos' : 'Active coupons'} ({coupons.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {coupons.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              {es ? 'Aún no has creado cupones.' : 'No coupons yet.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {coupons.map((c) => (
                <div key={c.id} className={`flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors ${!c.active ? 'opacity-60' : ''}`}>
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${c.active ? 'bg-brand-100' : 'bg-slate-100'}`}>
                    <Tag className={`h-5 w-5 ${c.active ? 'text-brand-700' : 'text-slate-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black text-slate-900 text-base">{c.code}</span>
                      <button onClick={() => copyCode(c.code)} className="text-slate-400 hover:text-brand-600" title={es ? 'Copiar' : 'Copy'}>
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-[10px] rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 font-bold">
                        {c.discountType === 'percent' ? `-${c.discountValue}%` : `-$${c.discountValue}`}
                      </span>
                      {!c.active && <span className="text-[10px] rounded-full bg-slate-200 text-slate-600 px-2 py-0.5 font-bold">{es ? 'INACTIVO' : 'INACTIVE'}</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {es ? 'Usos' : 'Uses'}: {c.usedCount || 0}{c.maxUses ? ` / ${c.maxUses}` : ''} · {fmtDate(c.expiresAt)}
                      {c.note && ` · ${c.note}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(c)} className="h-8" title={c.active ? (es ? 'Desactivar' : 'Disable') : (es ? 'Activar' : 'Enable')}>
                    <Power className={`h-4 w-4 ${c.active ? 'text-emerald-600' : 'text-slate-400'}`} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(c.id)} className="text-red-500 hover:text-red-700 h-8 w-8 p-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
