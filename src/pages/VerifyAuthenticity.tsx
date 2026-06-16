import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '@/lib/firebase';
import { ShieldCheck, AlertTriangle, Loader2, XCircle, Download, FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';

interface ScanResult {
  ok: boolean;
  code: string;
  productId: string | null;
  productName: string | null;
  lot: string | null;
  purity: string | null;
  coaUrl: string | null;
  analysisDate: string | null;
  labName: string | null;
  methods: string | null;
  status: string;
  scanCount: number;
  firstScan: boolean;
  firstScanAt: number | null;
}

type Phase = 'privacy' | 'loading' | 'result' | 'error';

export function VerifyAuthenticity() {
  const { code } = useParams<{ code: string }>();
  const { locale } = useI18n();
  const es = locale === 'es';
  const [phase, setPhase] = useState<Phase>('privacy');
  const [data, setData] = useState<ScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const runScan = async () => {
    if (!code) {
      setErrorMsg(es ? 'Código no proporcionado' : 'No code provided');
      setPhase('error');
      return;
    }
    setPhase('loading');
    try {
      const fn = httpsCallable<{ code: string }, ScanResult>(cloudFunctions, 'scanAuthCode');
      const res = await fn({ code });
      setData(res.data);
      setPhase('result');
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const msg = err.message || 'error';
      if (msg.includes('code_not_found') || msg.includes('not-found')) {
        setErrorMsg(es ? 'Código no válido. Este producto no está registrado.' : 'Invalid code. This product is not registered.');
      } else if (msg.includes('code_voided')) {
        setErrorMsg(es ? 'Este código ha sido anulado.' : 'This code has been voided.');
      } else if (msg.includes('invalid_code_format')) {
        setErrorMsg(es ? 'Formato de código inválido.' : 'Invalid code format.');
      } else {
        setErrorMsg(es ? 'No pudimos verificar el código. Intenta de nuevo.' : 'We could not verify the code. Try again.');
      }
      setPhase('error');
    }
  };

  // Auto-scan if user already consented once in this browser
  useEffect(() => {
    if (localStorage.getItem('illium_verify_consent') === '1') {
      void runScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConsent = () => {
    localStorage.setItem('illium_verify_consent', '1');
    void runScan();
  };

  // ── Privacy gate (like AuthentiChain) ─────────────────────
  if (phase === 'privacy') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-700 to-teal-600 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center">
              <ShieldCheck className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">{es ? 'Aviso de Privacidad' : 'Privacy Notice'}</h1>
            <p className="text-sm text-slate-600 leading-relaxed mb-8">
              {es
                ? 'Esta página de verificación utiliza tokens de sesión, marcas de tiempo y tecnología de fingerprinting para confirmar la autenticidad del producto y prevenir falsificaciones. Al continuar, aceptas que estos datos sean procesados conforme a la política de privacidad de ILLIUM.'
                : 'This verification page uses session tokens, timestamps and fingerprinting technology to confirm product authenticity and prevent counterfeiting. By proceeding, you consent to this data being processed in accordance with ILLIUM privacy policy.'}
            </p>
            <button
              onClick={handleConsent}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold text-sm shadow-lg transition"
            >
              {es ? 'Entiendo — Mostrar verificación' : 'I Understand — Show Verification'}
            </button>
            <p className="text-[10px] text-slate-400 mt-6 font-mono tracking-wider">
              ILLIUM · Independent Product Authentication
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading spinner ──────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 to-teal-700 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <p className="text-white/80 text-sm">{es ? 'Verificando...' : 'Verifying...'}</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-red-700 to-orange-600 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-600 flex items-center justify-center">
              <XCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-red-700 mb-3">{es ? 'Verificación Fallida' : 'Verification Failed'}</h1>
            <p className="text-sm text-slate-700 leading-relaxed mb-6">{errorMsg}</p>
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-xs text-red-800 text-left">
              <p className="font-semibold mb-1">{es ? 'Código escaneado:' : 'Scanned code:'}</p>
              <p className="font-mono">{code || '—'}</p>
            </div>
            <a
              href="https://alliumhealth.net/contact"
              className="block mt-6 w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm transition"
            >
              {es ? 'Contactar soporte' : 'Contact support'}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Result: Verified ────────────────────────────────
  if (!data) return null;
  const flagged = data.scanCount > 1;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero: Verified Authentic */}
      <div className={`relative ${flagged ? 'bg-gradient-to-br from-amber-600 via-orange-600 to-red-600' : 'bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600'} px-4 pt-16 pb-24 text-center`}>
        <div className="relative z-10 max-w-md mx-auto">
          <div className="inline-flex items-center justify-center w-28 h-28 rounded-full bg-white/20 backdrop-blur-sm mb-6 ring-4 ring-white/30">
            {flagged ? (
              <AlertTriangle className="w-16 h-16 text-white" />
            ) : (
              <ShieldCheck className="w-16 h-16 text-white" />
            )}
          </div>
          <h1 className="text-3xl font-black text-white tracking-widest mb-2">
            {flagged
              ? (es ? 'YA ESCANEADO' : 'ALREADY SCANNED')
              : (es ? 'VERIFICADO AUTÉNTICO' : 'VERIFIED AUTHENTIC')}
          </h1>
          <p className="text-white/90 text-sm mb-6 px-4">
            {flagged
              ? (es ? 'Este código ya fue verificado antes. Si acabas de comprar este producto, contacta a tu vendedor.' : 'This code was already verified before. If you just purchased this product, contact your seller.')
              : (es ? 'Este producto ha sido verificado de forma independiente' : 'This product has been independently verified')}
          </p>
          <div className="inline-block px-5 py-2 rounded-full bg-white/20 backdrop-blur-sm text-white font-bold text-sm">
            {es ? `Escaneo #${data.scanCount}` : `Scan #${data.scanCount}`}
          </div>
          <div className="mt-3 inline-block px-5 py-2 rounded-full bg-white/10 backdrop-blur-sm text-white/90 text-xs">
            {data.firstScan
              ? (es ? 'Eres el primero en verificar este producto' : 'You are the first to verify this product')
              : (es ? 'Ya se ha escaneado anteriormente' : 'Previously scanned')}
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="max-w-md mx-auto px-4 -mt-12 relative z-20 pb-16 space-y-4">
        {/* Independent verification chip */}
        <div className="bg-white rounded-2xl shadow-lg p-4 flex items-center gap-3 border border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-black">
            ✓
          </div>
          <div className="text-sm">
            <div className="font-bold text-slate-900">ILLIUM</div>
            <div className="text-slate-500 text-xs">{es ? 'Verificación independiente' : 'Independent verification'}</div>
          </div>
        </div>

        {/* Product info */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100">
          <div className="p-6 text-center border-b border-slate-100">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-700 flex items-center justify-center text-white text-3xl font-black">
              {(data.productName || 'A').charAt(0).toUpperCase()}
            </div>
            <h2 className="text-xl font-bold text-slate-900">{data.productName || '—'}</h2>
            <p className="text-xs font-mono text-slate-400 mt-2">{data.code}</p>
          </div>
          <div className="divide-y divide-slate-100">
            <div className="flex items-center justify-between px-6 py-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{es ? 'Pureza' : 'Purity'}</span>
              <span className="font-bold text-emerald-700">{data.purity || '—'}</span>
            </div>
            <div className="flex items-center justify-between px-6 py-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{es ? 'Lote' : 'Lot'}</span>
              <span className="font-mono text-sm text-slate-900">{data.lot || '—'}</span>
            </div>
            <div className="flex items-center justify-between px-6 py-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{es ? 'Estado' : 'Status'}</span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                PASS
              </span>
            </div>
          </div>
        </div>

        {/* Lab details */}
        {(data.analysisDate || data.labName || data.methods) && (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-emerald-700" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {es ? 'Datos del laboratorio' : 'Laboratory details'}
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {data.analysisDate && (
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{es ? 'Fecha de análisis' : 'Analysis date'}</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {new Date(data.analysisDate).toLocaleDateString(es ? 'es-CO' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              )}
              {data.labName && (
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{es ? 'Laboratorio' : 'Laboratory'}</span>
                  <span className="text-sm font-semibold text-slate-900">{data.labName}</span>
                </div>
              )}
              {data.methods && (
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{es ? 'Métodos' : 'Methods'}</span>
                  <span className="text-sm font-semibold text-slate-900">{data.methods}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Download COA */}
        {data.coaUrl ? (
          <a
            href={data.coaUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="block w-full text-center py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition shadow-lg"
          >
            <span className="inline-flex items-center gap-2">
              <Download className="w-5 h-5" />
              {es ? 'Descargar COA en PDF' : 'Download COA as PDF'}
            </span>
          </a>
        ) : null}

        {/* Full COA page link */}
        {data.lot && (
          <Link
            to={`/coa/${data.lot}`}
            className="block w-full text-center py-3 rounded-2xl bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-200 font-semibold text-sm transition"
          >
            {es ? 'Ver certificado completo →' : 'View full certificate →'}
          </Link>
        )}

        {/* Footer badge */}
        <div className="text-center pt-4">
          <p className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
            ILLIUM · Independent Product Authentication
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            {es ? 'Para fines de investigación. Pureza verificada por laboratorio independiente.' : 'For research purposes. Purity verified by independent laboratory.'}
          </p>
        </div>
      </div>
    </div>
  );
}
