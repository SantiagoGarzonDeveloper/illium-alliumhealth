import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '@/lib/firebase';
import { useToastStore } from '@/store';
import { useI18n } from '@/i18n/I18nContext';
import { Button } from '@/components/ui/button';
import { X, Printer, Mail, Loader2, FileText, AlertCircle } from 'lucide-react';

/** Minimal sale shape needed to build an invoice. Works for both web orders and
 *  manual sales (the caller normalizes items to {productName, quantity, unitPrice}). */
export interface InvoiceSale {
  id: string;
  customerName?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerTaxId?: string;
  items: { productName: string; quantity: number; unitPrice: number }[];
  total: number;
  createdAt?: unknown;
  channel?: string;
}

interface CompanyInfo {
  name: string;
  logoUrl: string;
  address: string;
  taxId: string;
  email: string;
  phone: string;
  website: string;
  bank: string;
  terms: string;
  footerNote: string;
  currency: string;
  taxRate: number; // e.g. 0 or 0.21
  prefix: string;
}

const PLACEHOLDER: CompanyInfo = {
  name: 'ILLIUM',
  logoUrl: '',
  address: '[Dirección de la empresa]',
  taxId: '[NIF / Tax ID]',
  email: '[email corporativo]',
  phone: '[teléfono]',
  website: 'alliumhealth.net',
  bank: '',
  terms: '',
  footerNote: '',
  currency: 'USD',
  taxRate: 0,
  prefix: 'ILL-',
};

function fmtDate(v: unknown): string {
  try {
    let d: Date;
    if (v && typeof v === 'object' && 'seconds' in (v as Record<string, unknown>)) {
      d = new Date((v as { seconds: number }).seconds * 1000);
    } else if (v) {
      d = new Date(v as string);
    } else {
      return '—';
    }
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
  } catch {
    return '—';
  }
}

function money(n: number, currency: string): string {
  const sym = currency === 'EUR' ? '€' : '$';
  return `${sym}${(Number(n) || 0).toFixed(2)}`;
}

/** Builds the invoice as an email-safe, self-contained HTML fragment (inline styles).
 *  Used identically for the on-screen preview, the print window and the email body. */
function buildInvoiceHtml(sale: InvoiceSale, c: CompanyInfo, es: boolean): { invoiceNo: string; html: string } {
  const cleanId = sale.id.replace(/^order-/, '');
  const invoiceNo = `${c.prefix}${cleanId.slice(-6).toUpperCase()}`;
  const cur = c.currency || 'USD';

  const subtotal = sale.items.reduce((s, it) => s + (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0), 0);
  const grandTotal = Number(sale.total) || 0;
  // Discount = whatever brought the line subtotal down to the stored total (when no tax).
  const hasTax = (c.taxRate || 0) > 0;
  const discount = !hasTax ? Math.max(0, subtotal - grandTotal) : 0;
  const tax = hasTax ? grandTotal - grandTotal / (1 + c.taxRate) : 0;

  const t = {
    invoice: es ? 'FACTURA' : 'INVOICE',
    billTo: es ? 'Facturar a' : 'Bill to',
    number: es ? 'Factura' : 'Invoice',
    date: es ? 'Fecha' : 'Date',
    desc: es ? 'Descripción' : 'Description',
    qty: es ? 'Cant.' : 'Qty',
    price: es ? 'Precio' : 'Price',
    amount: es ? 'Importe' : 'Amount',
    subtotal: es ? 'Subtotal' : 'Subtotal',
    discount: es ? 'Descuento' : 'Discount',
    tax: es ? 'Impuesto' : 'Tax',
    total: es ? 'Total' : 'Total',
    paid: es ? 'Importe pagado' : 'Amount paid',
    due: es ? 'Importe a pagar' : 'Amount due',
    terms: es ? 'Términos y condiciones' : 'Terms & conditions',
    email: 'E-mail',
    phone: es ? 'Tel.' : 'Phone',
    web: es ? 'Web' : 'Web',
  };

  const rows = sale.items.map((it) => {
    const qn = Number(it.quantity) || 0;
    const up = Number(it.unitPrice) || 0;
    return `<tr>
      <td style="padding:12px 8px;border-bottom:1px solid #eef2f7;color:#0f172a;">${escapeHtml(it.productName || '—')}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #eef2f7;text-align:center;color:#475569;">${qn}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #eef2f7;text-align:right;color:#475569;">${money(up, cur)}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #eef2f7;text-align:right;font-weight:600;color:#0f172a;">${money(up * qn, cur)}</td>
    </tr>`;
  }).join('');

  const logoBlock = c.logoUrl
    ? `<img src="${escapeHtml(c.logoUrl)}" alt="${escapeHtml(c.name)}" style="max-height:64px;max-width:180px;object-fit:contain;" />`
    : `<div style="font-family:Georgia,serif;font-size:28px;font-weight:900;letter-spacing:3px;color:#14532d;">${escapeHtml(c.name)}</div>`;

  const totalsRows = [
    `<tr><td style="padding:6px 0;color:#64748b;">${t.subtotal}</td><td style="padding:6px 0;text-align:right;color:#0f172a;">${money(subtotal, cur)}</td></tr>`,
    discount > 0 ? `<tr><td style="padding:6px 0;color:#64748b;">${t.discount}</td><td style="padding:6px 0;text-align:right;color:#0f172a;">-${money(discount, cur)}</td></tr>` : '',
    hasTax ? `<tr><td style="padding:6px 0;color:#64748b;">${t.tax} ${Math.round(c.taxRate * 100)}%</td><td style="padding:6px 0;text-align:right;color:#0f172a;">${money(tax, cur)}</td></tr>` : '',
    `<tr><td style="padding:10px 0;border-top:2px solid #0f172a;font-weight:800;color:#0f172a;">${t.total} ${cur}</td><td style="padding:10px 0;border-top:2px solid #0f172a;text-align:right;font-weight:800;color:#0f172a;font-size:18px;">${money(grandTotal, cur)}</td></tr>`,
  ].join('');

  const html = `
  <div style="max-width:720px;margin:0 auto;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;padding:40px;">
    <!-- Header -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="vertical-align:top;">${logoBlock}</td>
        <td style="vertical-align:top;text-align:right;font-size:12px;color:#475569;line-height:1.6;">
          <div style="font-weight:700;color:#0f172a;font-size:14px;">${escapeHtml(c.name)}</div>
          ${c.address ? `<div>${escapeHtml(c.address)}</div>` : ''}
          ${c.taxId ? `<div><strong>NIF/Tax ID:</strong> ${escapeHtml(c.taxId)}</div>` : ''}
          ${c.email ? `<div><strong>${t.email}:</strong> ${escapeHtml(c.email)}</div>` : ''}
          ${c.phone ? `<div><strong>${t.phone}:</strong> ${escapeHtml(c.phone)}</div>` : ''}
          ${c.website ? `<div><strong>${t.web}:</strong> ${escapeHtml(c.website)}</div>` : ''}
        </td>
      </tr>
    </table>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0;" />

    <!-- Bill to + invoice meta -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="vertical-align:top;font-size:13px;color:#0f172a;line-height:1.6;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700;margin-bottom:4px;">${t.billTo}</div>
          <div style="font-weight:700;">${escapeHtml(sale.customerName || '—')}</div>
          ${sale.customerEmail ? `<div style="color:#475569;">${escapeHtml(sale.customerEmail)}</div>` : ''}
          ${sale.customerAddress ? `<div style="color:#475569;">${escapeHtml(sale.customerAddress)}</div>` : ''}
          ${sale.customerTaxId ? `<div style="color:#475569;">NIF/Tax ID: ${escapeHtml(sale.customerTaxId)}</div>` : ''}
        </td>
        <td style="vertical-align:top;text-align:right;font-size:13px;">
          <div style="font-size:22px;font-weight:900;color:#14532d;letter-spacing:1px;">${t.invoice}</div>
          <div style="margin-top:8px;color:#475569;"><span style="color:#94a3b8;">${t.number}:</span> <strong style="color:#0f172a;">${invoiceNo}</strong></div>
          <div style="color:#475569;"><span style="color:#94a3b8;">${t.date}:</span> <strong style="color:#0f172a;">${fmtDate(sale.createdAt)}</strong></div>
        </td>
      </tr>
    </table>

    <!-- Items -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:28px;font-size:13px;">
      <thead>
        <tr style="border-bottom:2px solid #0f172a;">
          <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;">${t.desc}</th>
          <th style="padding:8px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;">${t.qty}</th>
          <th style="padding:8px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;">${t.price}</th>
          <th style="padding:8px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;">${t.amount}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <!-- Totals -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:60%;margin-left:40%;margin-top:20px;border-collapse:collapse;font-size:13px;">
      ${totalsRows}
      <tr><td style="padding:6px 0;color:#64748b;">${t.paid}</td><td style="padding:6px 0;text-align:right;color:#0f172a;">${money(grandTotal, cur)}</td></tr>
      <tr><td style="padding:6px 0;font-weight:700;color:#0f172a;">${t.due} (${cur})</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#0f172a;">${money(0, cur)}</td></tr>
    </table>

    ${c.terms ? `<div style="margin-top:36px;font-size:12px;color:#475569;"><div style="font-weight:700;color:#0f172a;margin-bottom:4px;">${t.terms}</div>${escapeHtml(c.terms).replace(/\n/g, '<br>')}</div>` : ''}

    ${c.bank || c.footerNote ? `<hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 12px;" /><div style="font-size:11px;color:#94a3b8;text-align:center;">${[c.bank, c.footerNote].filter(Boolean).map(escapeHtml).join(' · ')}</div>` : ''}
    <div style="font-size:11px;color:#cbd5e1;text-align:center;margin-top:8px;">${invoiceNo}</div>
  </div>`;

  return { invoiceNo, html };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function InvoiceModal({ open, onClose, sale }: { open: boolean; onClose: () => void; sale: InvoiceSale | null }) {
  const { locale } = useI18n();
  const es = locale === 'es';
  const showToast = useToastStore((s) => s.showToast);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'general'));
        const d = snap.exists() ? snap.data() : {};
        if (cancelled) return;
        setCompany({
          name: String(d.invoiceCompanyName || PLACEHOLDER.name),
          logoUrl: String(d.invoiceLogoUrl || ''),
          address: String(d.invoiceAddress || PLACEHOLDER.address),
          taxId: String(d.invoiceTaxId || PLACEHOLDER.taxId),
          email: String(d.invoiceEmail || PLACEHOLDER.email),
          phone: String(d.invoicePhone || PLACEHOLDER.phone),
          website: String(d.invoiceWebsite || PLACEHOLDER.website),
          bank: String(d.invoiceBank || ''),
          terms: String(d.invoiceTerms || ''),
          footerNote: String(d.invoiceFooterNote || ''),
          currency: String(d.invoiceCurrency || 'USD'),
          // Stored as a percentage (e.g. 21 = 21%); convert to a fraction here.
          taxRate: (Number(d.invoiceTaxRate) || 0) / 100,
          prefix: String(d.invoicePrefix || 'ILL-'),
        });
      } catch {
        if (!cancelled) setCompany(PLACEHOLDER);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const built = useMemo(() => {
    if (!sale || !company) return null;
    return buildInvoiceHtml(sale, company, es);
  }, [sale, company, es]);

  if (!open || !sale) return null;

  const fullDoc = (inner: string, title: string) =>
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;background:#f1f5f9;padding:20px;">${inner}</body></html>`;

  const handlePrint = () => {
    if (!built) return;
    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) {
      showToast(es ? 'Permite las ventanas emergentes para imprimir' : 'Allow pop-ups to print');
      return;
    }
    w.document.write(fullDoc(built.html, built.invoiceNo));
    w.document.close();
    // Give the browser a tick to render images/styles before printing.
    setTimeout(() => { w.focus(); w.print(); }, 350);
  };

  const handleEmail = async () => {
    if (!built) return;
    const to = sale.customerEmail?.trim();
    if (!to) {
      showToast(es ? 'Esta venta no tiene correo del cliente' : 'This sale has no customer email');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const fn = httpsCallable(cloudFunctions, 'sendInvoiceEmail');
      await fn({
        to,
        subject: `${es ? 'Factura' : 'Invoice'} ${built.invoiceNo}${company?.name ? ` — ${company.name}` : ''}`,
        html: fullDoc(built.html, built.invoiceNo),
      });
      showToast(es ? `✓ Factura enviada a ${to}` : `✓ Invoice sent to ${to}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error';
      setError(msg);
      showToast(es ? 'No se pudo enviar la factura' : 'Could not send invoice');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4" onClick={onClose}>
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-gradient-to-br from-brand-50 to-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <FileText className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-600">{es ? 'Factura' : 'Invoice'}</p>
              <h2 className="text-lg font-bold text-slate-900 truncate">
                {sale.customerName || (es ? 'Cliente' : 'Customer')}
                {built && <span className="ml-2 font-mono text-xs text-slate-500">{built.invoiceNo}</span>}
              </h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label={es ? 'Cerrar' : 'Close'}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — invoice preview */}
        <div className="flex-1 overflow-auto bg-slate-100 p-3 sm:p-5">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> {es ? 'Cargando…' : 'Loading…'}
            </div>
          )}
          {!loading && error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 mb-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="break-all">{error}</p>
            </div>
          )}
          {!loading && built && (
            <div className="rounded-lg shadow-sm bg-white overflow-hidden" dangerouslySetInnerHTML={{ __html: built.html }} />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-3 bg-slate-50/60">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button type="button" onClick={onClose} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl h-10 text-xs font-bold">
              {es ? 'Cerrar' : 'Close'}
            </Button>
            <Button type="button" onClick={handlePrint} disabled={!built} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl h-10 text-xs font-bold">
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              {es ? 'Imprimir / Guardar PDF' : 'Print / Save PDF'}
            </Button>
            <Button type="button" onClick={handleEmail} disabled={!built || sending} className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-xl h-10 text-xs font-bold">
              {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1.5" />}
              {es ? 'Enviar al cliente' : 'Send to customer'}
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-slate-400 text-center">
            {es
              ? 'Los datos de tu empresa se configuran en Ajustes → Datos de facturación.'
              : 'Your company details are configured in Settings → Invoice details.'}
          </p>
        </div>
      </div>
    </div>
  );
}
