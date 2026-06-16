import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, ExternalLink, Send, AlertCircle, CheckCircle2 } from 'lucide-react';

interface NotifyHistoryEntry {
  at?: string;
  email?: string;
  template?: string;
  automatic?: boolean;
}

interface Props {
  orderId: string;
  order: Record<string, unknown>;
  es: boolean;
}

function uspsLink(t: string) {
  return `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${encodeURIComponent(t.replace(/\s+/g, ''))}`;
}

/**
 * Admin-only panel inside the "Gestionar" order modal — lets the admin
 * manually trigger a status-update email to the customer or the vendor
 * (referrer), with an optional email override. Shows count + last sent.
 */
export function NotifyOrderPanel({ orderId, order, es }: Props) {
  const customer = (order.customer || {}) as { email?: string; name?: string };
  const tracking = String(
    (order as { trackingNumber?: string }).trackingNumber ||
      (order as { shippingTracking?: string }).shippingTracking ||
      '',
  ).trim();
  const referrerId = (order as { referrerId?: string | null }).referrerId;
  const customerEmail = String(customer.email || '').trim();
  const customerCount = Number((order as { customerNotifyCount?: number }).customerNotifyCount || 0);
  const vendorCount = Number((order as { vendorNotifyCount?: number }).vendorNotifyCount || 0);
  const customerHistory = ((order as { customerNotifyHistory?: NotifyHistoryEntry[] }).customerNotifyHistory || []);
  const vendorHistory = ((order as { vendorNotifyHistory?: NotifyHistoryEntry[] }).vendorNotifyHistory || []);

  const [sending, setSending] = useState<'customer' | 'vendor' | null>(null);
  const [customerOverride, setCustomerOverride] = useState('');
  const [vendorOverride, setVendorOverride] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const send = async (target: 'customer' | 'vendor') => {
    setFeedback(null);
    setSending(target);
    try {
      const fn = httpsCallable<unknown, { ok: boolean; recipient: string; count: number; template: string }>(
        cloudFunctions,
        'notifyOrderStatus',
      );
      const overrideEmail = target === 'customer' ? customerOverride.trim() : vendorOverride.trim();
      const result = await fn({ orderId, target, overrideEmail: overrideEmail || undefined });
      setFeedback({
        kind: 'ok',
        msg: es
          ? `✓ Correo enviado a ${result.data.recipient} (${result.data.template})`
          : `✓ Email sent to ${result.data.recipient} (${result.data.template})`,
      });
      if (target === 'customer') setCustomerOverride('');
      else setVendorOverride('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error';
      setFeedback({
        kind: 'err',
        msg: es ? `No se pudo enviar: ${msg}` : `Could not send: ${msg}`,
      });
    } finally {
      setSending(null);
    }
  };

  const fmtDate = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString(es ? 'es-CO' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="rounded-xl border-2 border-brand-200 bg-brand-50/40 p-4 mt-4 space-y-4">
      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
        <Mail className="h-4 w-4 text-brand-600" />
        {es ? 'Notificaciones por correo' : 'Email notifications'}
      </h4>

      {/* Tracking link block */}
      {tracking && (
        <div className="rounded-lg bg-sky-50 border border-sky-200 p-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-sky-700 mb-1">
            {es ? 'Rastreo USPS' : 'USPS tracking'}
          </p>
          <p className="font-mono text-xs text-sky-900 mb-2">{tracking}</p>
          <a
            href={uspsLink(tracking)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold px-3 py-1.5"
          >
            <ExternalLink className="h-3 w-3" />
            {es ? 'Abrir rastreo USPS' : 'Open USPS tracker'}
          </a>
        </div>
      )}

      {/* Customer notify */}
      <div className="rounded-lg bg-white border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-slate-800">
            {es ? 'Notificar al cliente' : 'Notify the customer'}
          </p>
          {customerCount > 0 && (
            <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold rounded-full px-2 py-0.5">
              {es ? `Enviado ${customerCount}×` : `Sent ${customerCount}×`}
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-500 mb-2">
          {customerEmail
            ? (es ? `Por defecto: ${customerEmail}` : `Default: ${customerEmail}`)
            : (es ? 'Sin correo del cliente. Usa el campo de abajo.' : 'No customer email on file. Use the override below.')}
        </p>
        <Input
          type="email"
          value={customerOverride}
          onChange={(e) => setCustomerOverride(e.target.value)}
          placeholder={es ? 'Otro correo (opcional)' : 'Override email (optional)'}
          className="text-xs mb-2"
        />
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={sending === 'customer' || (!customerEmail && !customerOverride.trim())}
          onClick={() => void send('customer')}
          className="w-full"
        >
          <Send className="h-3 w-3 mr-1.5" />
          {sending === 'customer'
            ? (es ? 'Enviando…' : 'Sending…')
            : (es ? 'Enviar notificación al cliente' : 'Send notification to customer')}
        </Button>
        {customerHistory.length > 0 && (
          <details className="mt-2">
            <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-700">
              {es ? 'Historial' : 'History'} ({customerHistory.length})
            </summary>
            <ul className="mt-1.5 space-y-1 max-h-32 overflow-y-auto">
              {[...customerHistory].reverse().map((h, i) => (
                <li key={i} className="text-[10px] text-slate-600 flex items-center gap-1.5">
                  {h.automatic ? '🤖' : '👤'} {h.email} · <span className="text-slate-400">{h.template}</span> · <span className="text-slate-400">{fmtDate(h.at)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Vendor notify */}
      {referrerId && (
        <div className="rounded-lg bg-white border border-slate-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-800">
              {es ? 'Notificar al vendedor (referidor)' : 'Notify the vendor (referrer)'}
            </p>
            {vendorCount > 0 && (
              <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold rounded-full px-2 py-0.5">
                {es ? `Enviado ${vendorCount}×` : `Sent ${vendorCount}×`}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mb-2">
            {es
              ? `Se buscará el correo del usuario ${referrerId.slice(0, 8)}…`
              : `Will look up email for user ${referrerId.slice(0, 8)}…`}
          </p>
          <Input
            type="email"
            value={vendorOverride}
            onChange={(e) => setVendorOverride(e.target.value)}
            placeholder={es ? 'Otro correo (opcional)' : 'Override email (optional)'}
            className="text-xs mb-2"
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={sending === 'vendor'}
            onClick={() => void send('vendor')}
            className="w-full bg-purple-600 hover:bg-purple-500"
          >
            <Send className="h-3 w-3 mr-1.5" />
            {sending === 'vendor'
              ? (es ? 'Enviando…' : 'Sending…')
              : (es ? 'Enviar notificación al vendedor' : 'Send notification to vendor')}
          </Button>
          {vendorHistory.length > 0 && (
            <details className="mt-2">
              <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-700">
                {es ? 'Historial' : 'History'} ({vendorHistory.length})
              </summary>
              <ul className="mt-1.5 space-y-1 max-h-32 overflow-y-auto">
                {[...vendorHistory].reverse().map((h, i) => (
                  <li key={i} className="text-[10px] text-slate-600 flex items-center gap-1.5">
                    {h.automatic ? '🤖' : '👤'} {h.email} · <span className="text-slate-400">{h.template}</span> · <span className="text-slate-400">{fmtDate(h.at)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {feedback && (
        <div
          className={`flex items-start gap-2 rounded-lg p-2.5 text-xs ${
            feedback.kind === 'ok'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {feedback.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
          <span>{feedback.msg}</span>
        </div>
      )}

      <p className="text-[10px] text-slate-500 italic">
        {es
          ? 'Tip: el sistema envía un correo automático cuando cambias el estado del pedido o agregas el tracking. Estos botones son por si necesitas reenviarlo manualmente.'
          : 'Tip: the system sends an automatic email when you change order status or add tracking. These buttons are for manual resends.'}
      </p>
    </div>
  );
}
