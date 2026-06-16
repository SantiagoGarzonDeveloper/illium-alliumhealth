import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAppStore, useToastStore } from '@/store';
import { useI18n } from '@/i18n/I18nContext';
import {
  X,
  Sparkles,
  Copy as CopyIcon,
  Save,
  RefreshCw,
  MessageCircle,
  AlertCircle,
  Eye,
  Pencil,
  Bold,
  Italic,
  Heading,
  List,
  ListOrdered,
  Table as TableIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { generateProtocolForOrder, type ProtocolOrderInfo } from '@/lib/orderProtocol';

interface Props {
  open: boolean;
  onClose: () => void;
  order: ProtocolOrderInfo & {
    customer?: { name?: string; email?: string; whatsappCountryCode?: string; whatsappLocalNumber?: string };
    checkoutLocale?: string;
  };
}

/** Modal that shows / generates / edits / shares the AI-generated protocol
 *  for a specific order. Visible only to admins and workers — never rendered
 *  inside the customer-facing checkout flow. */
export function OrderProtocolModal({ open, onClose, order }: Props) {
  const { locale } = useI18n();
  const showToast = useToastStore((s) => s.showToast);
  const products = useAppStore((s) => s.products);

  // Prefer the locale the customer used at checkout, falling back to UI locale.
  const targetLocale: 'es' | 'en' = (order.checkoutLocale === 'es' || order.locale === 'es')
    ? 'es'
    : order.checkoutLocale === 'en' || order.locale === 'en'
      ? 'en'
      : (locale === 'es' ? 'es' : 'en');
  const es = targetLocale === 'es';

  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Default to formatted preview so the markdown looks like a real protocol; user can flip to edit. */
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Insert/wrap markdown at the current cursor in the editor textarea, so the
   * admin can format without typing markdown syntax by hand. `wrap` surrounds
   * the selection (bold/italic); `linePrefix` prepends each selected line
   * (headings/lists); `block` inserts a snippet (table) at the cursor.
   */
  const applyFormat = (opts: { wrap?: string; linePrefix?: string; block?: string }) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = text.slice(start, end);
    let next = text;
    let caret = end;

    if (opts.block) {
      const insert = (start > 0 && text[start - 1] !== '\n' ? '\n' : '') + opts.block;
      next = text.slice(0, start) + insert + text.slice(end);
      caret = start + insert.length;
    } else if (opts.wrap) {
      const w = opts.wrap;
      const inner = selected || (es ? 'texto' : 'text');
      next = text.slice(0, start) + w + inner + w + text.slice(end);
      caret = start + w.length + inner.length + w.length;
    } else if (opts.linePrefix) {
      // Find the start of the first selected line and prefix every line.
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const region = text.slice(lineStart, end);
      const prefixed = region
        .split('\n')
        .map((ln) => (ln.startsWith(opts.linePrefix!) ? ln : opts.linePrefix! + ln))
        .join('\n');
      next = text.slice(0, lineStart) + prefixed + text.slice(end);
      caret = lineStart + prefixed.length;
    }

    setText(next);
    setDirty(true);
    // Restore focus + caret after React re-renders the value.
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  };

  const TABLE_SNIPPET = es
    ? '\n| Ítem | Detalle |\n|------|---------|\n| Dosis | [valor] |\n| Frecuencia | [valor] |\n| Vía | [valor] |\n'
    : '\n| Item | Detail |\n|------|--------|\n| Dose | [value] |\n| Frequency | [value] |\n| Route | [value] |\n';

  // On open, load the saved draft if any. Otherwise auto-generate.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setDirty(false);
    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'orders', order.id));
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as { protocolDraft?: string; protocolDraftAt?: { seconds: number } };
          if (data.protocolDraft && data.protocolDraft.trim()) {
            setText(data.protocolDraft);
            setSavedAt(data.protocolDraftAt?.seconds ? data.protocolDraftAt.seconds * 1000 : null);
            return;
          }
        }
        // No saved draft — generate.
        await runGenerate(false);
      } catch {
        if (!cancelled) await runGenerate(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order.id]);

  const runGenerate = async (announce: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const md = await generateProtocolForOrder({
        order: {
          id: order.id,
          items: order.items || [],
          customerName: order.customer?.name || order.customerName,
          customerEmail: order.customer?.email || order.customerEmail,
          locale: targetLocale,
          total: order.total,
        },
        products,
        locale: targetLocale,
      });
      setText(md.trim());
      setDirty(true);
      if (announce) {
        showToast(es ? 'Protocolo regenerado' : 'Protocol regenerated');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!text.trim()) return;
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        protocolDraft: text,
        protocolDraftAt: serverTimestamp(),
      });
      setDirty(false);
      setSavedAt(Date.now());
      showToast(es ? 'Protocolo guardado' : 'Protocol saved');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save error';
      setError(msg);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(es ? '¡Copiado al portapapeles!' : 'Copied to clipboard!');
    } catch {
      showToast(es ? 'No se pudo copiar' : 'Could not copy');
    }
  };

  const handleWhatsapp = () => {
    const cc = order.customer?.whatsappCountryCode || '';
    const num = order.customer?.whatsappLocalNumber || '';
    const phone = `${cc}${num}`.replace(/\D/g, '');
    const message = encodeURIComponent(text);
    const url = phone
      ? `https://wa.me/${phone}?text=${message}`
      : `https://wa.me/?text=${message}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-gradient-to-br from-brand-50 to-white">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-600">
                {es ? 'Protocolo asistido por IA' : 'AI-assisted protocol'}
              </p>
              <h2 className="text-lg font-bold text-slate-900 truncate">
                {order.customer?.name || order.customerName || (es ? 'Pedido' : 'Order')}
                <span className="ml-2 font-mono text-xs text-slate-500">#{order.id.slice(0, 8).toUpperCase()}</span>
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {(order.items || []).map((i) => `${i.name} ×${i.quantity || 1}`).join(' · ')}
              </p>
              {savedAt && !dirty && (
                <p className="text-[10px] text-emerald-600 mt-0.5">
                  {es ? 'Guardado' : 'Saved'} · {new Date(savedAt).toLocaleString()}
                </p>
              )}
              {dirty && (
                <p className="text-[10px] text-amber-600 mt-0.5">
                  {es ? 'Cambios sin guardar' : 'Unsaved changes'}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label={es ? 'Cerrar' : 'Close'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <RefreshCw className="h-6 w-6 text-brand-600 animate-spin" />
              <p className="text-sm text-slate-600">
                {es ? 'Generando protocolo con material de entrenamiento…' : 'Generating protocol from training material…'}
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">{es ? 'Hubo un error' : 'Something went wrong'}</p>
                <p className="break-all">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && (
            <div className="space-y-3">
              {/* Mode toggle: preview vs edit */}
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 w-fit">
                <button
                  type="button"
                  onClick={() => setMode('preview')}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                    mode === 'preview' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5 inline mr-1.5" />
                  {es ? 'Vista previa' : 'Preview'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('edit')}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                    mode === 'edit' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Pencil className="h-3.5 w-3.5 inline mr-1.5" />
                  {es ? 'Editar' : 'Edit'}
                </button>
              </div>

              {mode === 'edit' ? (
                <div className="space-y-2">
                  {/* Formatting toolbar — insert markdown without typing syntax. */}
                  <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                    {[
                      { icon: Heading, label: es ? 'Título' : 'Heading', action: () => applyFormat({ linePrefix: '## ' }) },
                      { icon: Bold, label: es ? 'Negrita' : 'Bold', action: () => applyFormat({ wrap: '**' }) },
                      { icon: Italic, label: es ? 'Cursiva' : 'Italic', action: () => applyFormat({ wrap: '*' }) },
                      { icon: List, label: es ? 'Lista' : 'Bullet list', action: () => applyFormat({ linePrefix: '- ' }) },
                      { icon: ListOrdered, label: es ? 'Lista numerada' : 'Numbered list', action: () => applyFormat({ linePrefix: '1. ' }) },
                      { icon: TableIcon, label: es ? 'Tabla' : 'Table', action: () => applyFormat({ block: TABLE_SNIPPET }) },
                    ].map((b) => (
                      <button
                        key={b.label}
                        type="button"
                        onClick={b.action}
                        title={b.label}
                        aria-label={b.label}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm transition"
                      >
                        <b.icon className="h-4 w-4" />
                      </button>
                    ))}
                    <span className="ml-auto pr-1 text-[10px] text-slate-400 hidden sm:block">
                      {es ? 'Vista previa en vivo →' : 'Live preview →'}
                    </span>
                  </div>
                  {/* Editor + live preview side by side on large screens. */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <textarea
                      ref={textareaRef}
                      value={text}
                      onChange={(e) => { setText(e.target.value); setDirty(true); }}
                      className="w-full min-h-[40vh] resize-y rounded-xl border border-slate-200 bg-slate-50/40 p-3 text-sm font-mono text-slate-800 outline-none focus:ring-2 focus:ring-brand-500"
                      spellCheck={false}
                    />
                    <div className="protocol-markdown hidden lg:block rounded-xl border border-slate-200 bg-white p-4 min-h-[40vh] max-h-[40vh] overflow-auto text-sm text-slate-800 max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="protocol-markdown rounded-xl border border-slate-200 bg-white p-5 min-h-[40vh] text-sm text-slate-800 max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-3 bg-slate-50/60">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Button
              type="button"
              onClick={() => runGenerate(true)}
              disabled={loading}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl h-10 text-xs font-bold"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              {es ? 'Regenerar' : 'Regenerate'}
            </Button>
            <Button
              type="button"
              onClick={handleCopy}
              disabled={!text || loading}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl h-10 text-xs font-bold"
            >
              <CopyIcon className="h-3.5 w-3.5 mr-1.5" />
              {es ? 'Copiar' : 'Copy'}
            </Button>
            <Button
              type="button"
              onClick={handleWhatsapp}
              disabled={!text || loading}
              className="bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl h-10 text-xs font-bold"
            >
              <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
              WhatsApp
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!dirty || !text || loading}
              className="bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-xl h-10 text-xs font-bold"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {es ? 'Guardar' : 'Save'}
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-slate-400 text-center">
            {es
              ? 'Borrador generado por IA. Revisa y valida antes de enviar al paciente.'
              : 'AI-generated draft. Review and validate before sending to the patient.'}
          </p>
        </div>
      </div>
    </div>
  );
}
