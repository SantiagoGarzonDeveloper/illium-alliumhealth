import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Award, Download, ExternalLink, FileText, Mail, X } from 'lucide-react';
import { isPdfUrl } from '@/lib/coa';

/**
 * COA (Certificate of Analysis) de cada producto — 29-sep-2026.
 * El archivo (imagen o PDF) se sube desde Admin → Productos con subir.php y
 * queda en `product.coaUrl`. Si no hay archivo se muestra «COA bajo solicitud».
 */


/** Vista del COA dentro de la ficha (acordeón). */
export function CoaPreview({
  url,
  productName,
  locale,
  onExpand,
}: {
  url: string;
  productName: string;
  locale: string;
  onExpand?: () => void;
}) {
  const es = locale === 'es';
  const pdf = isPdfUrl(url);
  return (
    <div className="space-y-3" data-coa="available">
      {pdf ? (
        <>
          {/* En móvil el visor de PDF incrustado es poco fiable: se ofrece abrirlo. */}
          <div className="hidden sm:block rounded-xl overflow-hidden border border-slate-700 bg-white">
            <iframe
              src={`${url}#view=FitH`}
              title={es ? `COA de ${productName}` : `${productName} COA`}
              className="w-full h-[520px]"
              loading="lazy"
            />
          </div>
          <button
            type="button"
            onClick={onExpand}
            className="sm:hidden w-full flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-left"
          >
            <div className="h-12 w-12 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
              <FileText className="h-6 w-6 text-brand-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{es ? `COA · ${productName}` : `${productName} · COA`}</p>
              <p className="text-xs text-slate-400">{es ? 'Documento PDF · toca para verlo' : 'PDF document · tap to view'}</p>
            </div>
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onExpand}
          className="block w-full rounded-xl overflow-hidden border border-slate-700 bg-white"
          aria-label={es ? 'Ver COA en grande' : 'View COA full size'}
        >
          <img src={url} alt={es ? `COA de ${productName}` : `${productName} COA`} className="w-full h-auto" loading="lazy" />
        </button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white py-2.5 text-xs font-bold transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" /> {es ? 'Abrir COA' : 'Open COA'}
        </a>
        <a
          href={url}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-600 text-slate-200 hover:bg-slate-800 py-2.5 text-xs font-bold transition-colors"
        >
          <Download className="h-3.5 w-3.5" /> {es ? 'Descargar' : 'Download'}
        </a>
      </div>
    </div>
  );
}

/** Aviso elegante cuando el producto todavía no tiene su COA subido. */
export function CoaUnavailable({ productName, locale, compact = false }: { productName: string; locale: string; compact?: boolean }) {
  const es = locale === 'es';
  return (
    <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4" data-coa="on-request">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
          <Award className="h-5 w-5 text-brand-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">{es ? 'COA disponible bajo solicitud' : 'COA available on request'}</p>
          {!compact && (
            <p className="text-xs text-brand-100/80 leading-relaxed mt-1">
              {es
                ? `Te enviamos el Certificado de Análisis del lote actual de ${productName} en PDF. Escríbenos por correo o WhatsApp.`
                : `We will send you the Certificate of Analysis for the current lot of ${productName} as a PDF. Contact us by email or WhatsApp.`}
            </p>
          )}
          <Link
            to="/contact"
            className="inline-flex items-center gap-1.5 mt-3 rounded-full bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 text-xs font-bold transition-colors"
          >
            <Mail className="h-3.5 w-3.5" /> {es ? 'Solicitar COA' : 'Request COA'}
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Visor a pantalla completa, fondo sólido (sin modales flotantes). */
export function CoaFullscreen({
  url,
  productName,
  locale,
  onClose,
}: {
  url: string;
  productName: string;
  locale: string;
  onClose: () => void;
}) {
  const es = locale === 'es';
  const pdf = isPdfUrl(url);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950" role="dialog" aria-modal="true" data-coa-viewer>
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-400">ILLIUM · COA</p>
          <p className="text-sm font-bold text-white truncate">{productName}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
          >
            <ExternalLink className="h-3.5 w-3.5" /> {es ? 'Abrir en otra pestaña' : 'Open in new tab'}
          </a>
          <a
            href={url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-500"
          >
            <Download className="h-3.5 w-3.5" /> {es ? 'Descargar' : 'Download'}
          </a>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-white hover:bg-slate-700"
            aria-label={es ? 'Cerrar' : 'Close'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-slate-900">
        {pdf ? (
          <iframe src={`${url}#view=FitH`} title={`${productName} COA`} className="w-full h-full min-h-[70vh] bg-white" />
        ) : (
          <div className="p-4 flex justify-center">
            <img src={url} alt={`${productName} COA`} className="max-w-full h-auto rounded-lg bg-white" />
          </div>
        )}
      </div>
    </div>
  );
}
