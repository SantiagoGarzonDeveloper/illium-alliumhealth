import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { Download, FileText, Loader2, XCircle, CheckCircle2, FlaskConical } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

interface CoaData {
  productName: string;
  lot: string;
  purity: string;
  coaUrl: string | null;
  analysisDate: string | null;
  labName: string | null;
  methods: string | null;
  codesInBatch: number;
}

type Phase = 'loading' | 'ready' | 'notfound';

export function CoaBatch() {
  const { batch } = useParams<{ batch: string }>();
  const { locale } = useI18n();
  const es = locale === 'es';
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<CoaData | null>(null);

  useEffect(() => {
    (async () => {
      if (!batch) { setPhase('notfound'); return; }
      try {
        const q = query(collection(db, 'authCodes'), where('lot', '==', batch), limit(50));
        const snap = await getDocs(q);
        if (snap.empty) { setPhase('notfound'); return; }
        const first = snap.docs[0].data() as Record<string, unknown>;
        setData({
          productName: String(first.productName || '—'),
          lot: String(first.lot || batch),
          purity: String(first.purity || '—'),
          coaUrl: (first.coaUrl as string) || null,
          analysisDate: (first.analysisDate as string) || null,
          labName: (first.labName as string) || null,
          methods: (first.methods as string) || null,
          codesInBatch: snap.size,
        });
        setPhase('ready');
      } catch (e) {
        console.error(e);
        setPhase('notfound');
      }
    })();
  }, [batch]);

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">{es ? 'Cargando certificado...' : 'Loading certificate...'}</p>
        </div>
      </div>
    );
  }

  if (phase === 'notfound') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
          <XCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{es ? 'Lote no encontrado' : 'Batch not found'}</h1>
          <p className="text-sm text-slate-600 mb-4">
            {es ? 'No existe un certificado de análisis con este número de lote.' : 'No certificate of analysis exists for this batch number.'}
          </p>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 font-mono">
            {batch || '—'}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const displayDate = data.analysisDate
    ? new Date(data.analysisDate).toLocaleDateString(es ? 'es-CO' : 'en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : '—';

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-700 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-serif text-xl font-black tracking-widest text-slate-900">ILLIUM</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 -mt-0.5">Laboratory Certificate</div>
            </div>
          </div>
          <div className="hidden sm:block text-xs text-slate-500 font-mono">
            /coa/{data.lot}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Title block */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold tracking-wider uppercase mb-4">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {es ? 'Análisis Verificado' : 'Verified Analysis'}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">
            {es ? 'Certificado de Análisis' : 'Certificate of Analysis'}
          </h1>
          <p className="text-slate-600 mt-2 text-sm">
            {es
              ? 'Informe técnico del análisis de pureza realizado por laboratorio independiente.'
              : 'Technical report of purity analysis performed by independent laboratory.'}
          </p>
        </div>

        {/* Product hero */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 mb-6 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold mb-2">
            {es ? 'Producto analizado' : 'Analyzed product'}
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">{data.productName}</h2>
          <div className="text-sm text-slate-500 font-mono">Batch: {data.lot}</div>

          {/* Purity big number */}
          <div className="mt-6 pt-6 border-t border-slate-100 flex items-end gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">
                {es ? 'Pureza medida' : 'Measured purity'}
              </div>
              <div className="text-5xl sm:text-6xl font-black text-emerald-700 leading-none mt-1">
                {data.purity}
              </div>
            </div>
            <div className="mb-2 px-3 py-1 rounded bg-emerald-700 text-white text-xs font-bold tracking-wider uppercase">
              PASS
            </div>
          </div>
        </div>

        {/* Specs table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-6">
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-600 font-semibold">
              {es ? 'Detalles del análisis' : 'Analysis details'}
            </div>
          </div>
          <dl className="divide-y divide-slate-100">
            <SpecRow label={es ? 'Nombre del producto' : 'Product name'} value={data.productName} />
            <SpecRow label={es ? 'Número de lote (Batch)' : 'Batch number'} value={data.lot} mono />
            <SpecRow label={es ? 'Fecha de análisis' : 'Analysis date'} value={displayDate} />
            <SpecRow label={es ? 'Laboratorio' : 'Laboratory'} value={data.labName || '—'} />
            <SpecRow label={es ? 'Métodos' : 'Methods'} value={data.methods || '—'} />
            <SpecRow label={es ? 'Pureza (%)' : 'Purity (%)'} value={data.purity} highlight />
            <SpecRow label={es ? 'Estado' : 'Status'} value="PASS" statusPass />
          </dl>
        </div>

        {/* Download button */}
        {data.coaUrl ? (
          <a
            href={data.coaUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="block w-full text-center py-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm transition shadow-sm"
          >
            <span className="inline-flex items-center gap-2">
              <Download className="w-4 h-4" />
              {es ? 'Descargar COA en PDF' : 'Download COA as PDF'}
            </span>
          </a>
        ) : (
          <div className="w-full text-center py-4 rounded-xl bg-slate-100 text-slate-400 text-sm">
            <FileText className="w-4 h-4 inline-block mr-2" />
            {es ? 'PDF no disponible' : 'PDF not available'}
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 pt-6 border-t border-slate-200 text-center">
          <p className="text-xs text-slate-500 leading-relaxed max-w-xl mx-auto">
            {es
              ? 'El análisis de pureza aquí reportado fue realizado mediante los métodos listados bajo condiciones de laboratorio estándar. Este certificado es específico al lote indicado. Productos destinados únicamente para investigación — no aprobados para uso humano o veterinario.'
              : 'The purity analysis reported here was conducted using the listed methods under standard laboratory conditions. This certificate is specific to the batch indicated. Products intended for research purposes only — not approved for human or veterinary use.'}
          </p>
          <p className="text-[10px] font-mono tracking-[0.3em] text-slate-400 mt-4 uppercase">
            ILLIUM · Laboratory Transparency
          </p>
        </div>
      </main>
    </div>
  );
}

function SpecRow({
  label,
  value,
  mono,
  highlight,
  statusPass,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  statusPass?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-3.5">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className={`text-sm ${mono ? 'font-mono' : ''} ${highlight ? 'font-bold text-emerald-700' : 'font-semibold text-slate-900'}`}>
        {statusPass ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-700 text-white text-xs font-bold tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            PASS
          </span>
        ) : value}
      </dd>
    </div>
  );
}
