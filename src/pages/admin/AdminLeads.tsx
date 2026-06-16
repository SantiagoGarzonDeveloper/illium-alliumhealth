import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, limit, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { useI18n } from '@/i18n/I18nContext';
import { useToastStore } from '@/store';

type LeadRow = Record<string, unknown> & { id: string };

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

export function AdminLeads() {
  const { t, locale } = useI18n();
  const es = locale === 'es';
  const showToast = useToastStore((s) => s.showToast);
  const [tab, setTab] = useState<'leads' | 'messages'>('leads');
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [messages, setMessages] = useState<LeadRow[]>([]);
  const [detail, setDetail] = useState<LeadRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStatus, setEditStatus] = useState('new');
  const [editAdminNotes, setEditAdminNotes] = useState('');

  useEffect(() => {
    const leadsUnsub = onSnapshot(
      query(collection(db, 'leads'), limit(800)),
      (snapshot) => {
        const data: LeadRow[] = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => createdAtMs(b) - createdAtMs(a));
        setLeads(data);
      },
      (error) => console.error('Error fetching leads', error)
    );
    const msgsUnsub = onSnapshot(
      query(collection(db, 'contactMessages'), limit(500)),
      (snapshot) => {
        const data: LeadRow[] = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => createdAtMs(b) - createdAtMs(a));
        setMessages(data);
      }
    );
    return () => { leadsUnsub(); msgsUnsub(); };
  }, []);

  const openDetail = useCallback((lead: LeadRow) => {
    setDetail(lead);
    setEditName(String(lead.name ?? ''));
    setEditEmail(String(lead.email ?? ''));
    setEditPhone(String(lead.phone ?? ''));
    setEditStatus(String(lead.leadStatus ?? 'new'));
    setEditAdminNotes(String(lead.adminNotes ?? ''));
  }, []);

  const saveDetail = useCallback(async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'leads', detail.id), {
        name: editName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        leadStatus: editStatus,
        adminNotes: editAdminNotes.trim(),
        updatedByAdminAt: serverTimestamp(),
      });
      showToast(t('adminPage.leads.leadSaved'));
      setDetail(null);
    } catch (e) {
      console.error(e);
      showToast(t('adminPage.leads.leadSaveError'));
    } finally {
      setSaving(false);
    }
  }, [detail, editAdminNotes, editEmail, editName, editPhone, editStatus, showToast, t]);

  const removeLead = useCallback(async () => {
    if (!deleteId) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'leads', deleteId));
      showToast(t('adminPage.leads.leadDeleted'));
      setDeleteId(null);
      if (detail?.id === deleteId) setDetail(null);
    } catch (e) {
      console.error(e);
      showToast(t('adminPage.leads.leadDeleteError'));
    } finally {
      setSaving(false);
    }
  }, [deleteId, detail?.id, showToast, t]);

  const dateCell = (createdAt: unknown) =>
    createdAt && typeof createdAt === 'object' && createdAt !== null && 'toDate' in createdAt && typeof (createdAt as { toDate: () => Date }).toDate === 'function'
      ? (createdAt as { toDate: () => Date }).toDate().toLocaleString()
      : t('adminPage.leads.justNow');

  return (
    <div className="space-y-8">
      <Dialog
        open={Boolean(deleteId)}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title={t('adminPage.leads.deleteLeadTitle')}
        description={t('adminPage.leads.deleteLeadBody')}
      >
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setDeleteId(null)} disabled={saving}>
            {t('adminPage.products.cancel')}
          </Button>
          <Button type="button" variant="primary" className="bg-red-600 hover:bg-red-700" onClick={() => void removeLead()} disabled={saving}>
            {saving ? t('adminPage.settings.saving') : t('adminPage.leads.deleteLeadConfirm')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(detail)}
        onOpenChange={(o) => !o && setDetail(null)}
        title={t('adminPage.leads.detailTitle')}
        panelClassName="max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">{t('adminPage.leads.colContact')} — name</label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Email</label>
                <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Phone</label>
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">{t('adminPage.leads.colLeadStatus')}</label>
                <select className="w-full rounded border border-slate-200 px-2 py-2 text-sm" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  <option value="new">new</option>
                  <option value="contacted">contacted</option>
                  <option value="qualified">qualified</option>
                  <option value="payment_link_sent">{es ? 'link de pago enviado' : 'payment link sent'}</option>
                  <option value="converted">converted</option>
                  <option value="archived">archived</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Admin notes</label>
              <textarea className="w-full min-h-[72px] rounded border border-slate-200 p-2 text-sm" value={editAdminNotes} onChange={(e) => setEditAdminNotes(e.target.value)} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
              <p>
                <span className="font-semibold">{t('adminPage.leads.colGoal')}:</span> {String((detail.quizAnswers as Record<string, string> | undefined)?.goal ?? '—')}
              </p>
              <p>
                <span className="font-semibold">{t('adminPage.leads.colExperience')}:</span>{' '}
                {String((detail.quizAnswers as Record<string, string> | undefined)?.experience ?? '—')}
              </p>
              <p>
                <span className="font-semibold">{t('adminPage.leads.colDuration')}:</span>{' '}
                {String((detail.quizAnswers as Record<string, string> | undefined)?.duration ?? '—')}
              </p>
              <p>
                <span className="font-semibold">{t('adminPage.leads.colPreference')}:</span>{' '}
                {String((detail.quizAnswers as Record<string, string> | undefined)?.preference ?? '—')}
              </p>
              <p>
                <span className="font-semibold">{t('adminPage.leads.colBudget')}:</span>{' '}
                {String((detail.quizAnswers as Record<string, string> | undefined)?.budget ?? '—')}
              </p>
              <p>
                <span className="font-semibold">{es ? 'Producto de interés' : 'Product of interest'}:</span>{' '}
                {Array.isArray(detail.productOfInterestNames) && (detail.productOfInterestNames as string[]).length > 0
                  ? (detail.productOfInterestNames as string[]).join(', ')
                  : String(detail.productOfInterest ?? '—')}
              </p>
              <p>
                <span className="font-semibold">{t('adminPage.leads.colReferrer')}:</span> {String(detail.referrerId ?? '—')}
              </p>
              <p>
                <span className="font-semibold">{t('adminPage.leads.colLocale')}:</span> {String(detail.locale ?? '—')}
              </p>
              <p className="font-mono text-[11px] text-slate-500 pt-2">id: {detail.id}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-800">{t('adminPage.leads.quizJsonTitle')}</p>
              <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px] leading-relaxed">
                {JSON.stringify(detail.quizAnswers ?? {}, null, 2)}
              </pre>
            </div>
            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <Button type="button" variant="outline" className="text-red-600 border-red-200" onClick={() => setDeleteId(detail.id)}>
                {t('adminPage.leads.deleteLead')}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setDetail(null)}>
                  {t('adminPage.products.cancel')}
                </Button>
                <Button type="button" variant="primary" onClick={() => void saveDetail()} disabled={saving}>
                  {saving ? t('adminPage.settings.saving') : t('adminPage.leads.saveLead')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      <h1 className="text-2xl font-bold text-slate-900">{t('adminPage.leads.title')}</h1>

      {/* Tabs: Leads vs Messages */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('leads')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${tab === 'leads' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          Quiz Leads ({leads.length})
        </button>
        <button
          onClick={() => setTab('messages')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${tab === 'messages' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          📧 {es ? 'Mensajes de contacto' : 'Contact Messages'} ({messages.length})
        </button>
      </div>

      {/* Contact Messages tab */}
      {tab === 'messages' && (
        <Card>
          <CardContent className="p-0">
            {messages.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">{es ? 'Sin mensajes aún.' : 'No messages yet.'}</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {messages.map((msg) => {
                  const date = msg.createdAt
                    ? new Date((msg.createdAt as { seconds: number }).seconds * 1000).toLocaleDateString(es ? 'es-CO' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '';
                  return (
                    <div key={msg.id} className="flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors">
                      <div className="h-10 w-10 rounded-xl bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm shrink-0">
                        {(String(msg.name || '?')).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-900 text-sm">{String(msg.name || '—')}</p>
                          <a href={`mailto:${String(msg.email || '')}`} className="text-xs text-brand-600 hover:underline truncate">{String(msg.email || '')}</a>
                        </div>
                        <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{String(msg.message || '')}</p>
                        <p className="text-[10px] text-slate-400 mt-2">{date}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(es ? '¿Eliminar?' : 'Delete?')) return;
                          await deleteDoc(doc(db, 'contactMessages', msg.id));
                        }}
                        className="text-slate-400 hover:text-red-500 p-1 shrink-0"
                        title={es ? 'Eliminar' : 'Delete'}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'leads' && <><Card>
        <CardContent className="p-6 space-y-3">
          <h2 className="text-lg font-bold text-slate-900">{t('adminPage.leads.ordersHintTitle')}</h2>
          <p className="text-sm text-slate-600">{t('adminPage.leads.ordersHintBody')}</p>
          <Link to="/admin/finance">
            <Button type="button" variant="primary" size="sm">
              {t('adminPage.leads.ordersHintLink')}
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-bold mb-4 text-slate-900">{t('adminPage.leads.leadsTitle')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[900px]">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="px-4 py-3 font-medium text-slate-500">{t('adminPage.leads.colDate')}</th>
                  <th className="px-4 py-3 font-medium text-slate-500">{t('adminPage.leads.colContact')}</th>
                  <th className="px-4 py-3 font-medium text-slate-500">{t('adminPage.leads.colGoal')}</th>
                  <th className="px-4 py-3 font-medium text-slate-500">{es ? 'Producto interés' : 'Product interest'}</th>
                  <th className="px-4 py-3 font-medium text-slate-500">{t('adminPage.leads.colBudget')}</th>
                  <th className="px-4 py-3 font-medium text-slate-500">{t('adminPage.leads.colReferrer')}</th>
                  <th className="px-4 py-3 font-medium text-slate-500">{t('adminPage.leads.colLeadStatus')}</th>
                  <th className="px-4 py-3 font-medium text-slate-500">{t('adminPage.leads.colLocale')}</th>
                  <th className="px-4 py-3 font-medium text-slate-500 text-right">{t('adminPage.leads.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap">{dateCell(lead.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{String(lead.name ?? '')}</div>
                      <div className="text-slate-500 text-xs">{String(lead.email ?? '')}</div>
                      <div className="text-slate-500 text-xs">{String(lead.phone ?? '')}</div>
                    </td>
                    <td className="px-4 py-3">{String((lead.quizAnswers as Record<string, string> | undefined)?.goal ?? '—')}</td>
                    <td className="px-4 py-3 text-xs">
                      {Array.isArray(lead.productOfInterestNames) && (lead.productOfInterestNames as string[]).length > 0
                        ? (lead.productOfInterestNames as string[]).join(', ')
                        : String(lead.productOfInterest ?? '—')}
                    </td>
                    <td className="px-4 py-3">{String((lead.quizAnswers as Record<string, string> | undefined)?.budget ?? '—')}</td>
                    <td className="px-4 py-3 font-mono text-xs">{String(lead.referrerId ?? '—')}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-violet-50 px-2 py-0.5 text-xs text-violet-900">{String(lead.leadStatus ?? 'new')}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{String(lead.locale ?? '—')}</td>
                    <td className="px-4 py-3 text-right space-y-1">
                      <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => openDetail(lead)}>
                        {t('adminPage.leads.viewDetail')}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="text-xs text-red-600 block w-full" onClick={() => setDeleteId(lead.id)}>
                        {t('adminPage.leads.deleteLead')}
                      </Button>
                    </td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      {t('adminPage.leads.noLeads')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card></>}
    </div>
  );
}
