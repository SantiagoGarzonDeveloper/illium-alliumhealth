import { useState, useRef, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Mail, RefreshCw } from 'lucide-react';
import { requestEmailOTP, verifyEmailOTP } from '@/lib/validation';

type Props = {
  email: string;
  locale: 'es' | 'en';
  verified: boolean;
  onVerifiedChange: (v: boolean) => void;
  onChangeEmail?: () => void;
  className?: string;
};

export function EmailOTP({ email, locale, verified, onVerifiedChange, onChangeEmail, className = '' }: Props) {
  const es = locale === 'es';
  const [stage, setStage] = useState<'idle' | 'sent' | 'verified' | 'error'>(verified ? 'verified' : 'idle');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (stage === 'verified' && !verified) {
      setStage('idle');
      setCode('');
      setMsg('');
    }
  }, [email, verified, stage]);

  useEffect(() => {
    if (countdown <= 0) return;
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [countdown]);

  const sendCode = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setMsg(es ? 'Ingresa un correo válido primero' : 'Enter a valid email first');
      return;
    }
    setLoading(true);
    setMsg('');
    const r = await requestEmailOTP(email, locale);
    setLoading(false);
    if (r.sent || r.reason === 'resend_not_configured') {
      setStage('sent');
      setCountdown(30);
      setMsg(
        r.reason === 'resend_not_configured' && r.devCode
          ? `DEV: ${r.devCode}`
          : es
          ? '✓ Código enviado a tu correo. Revisa también spam.'
          : '✓ Code sent to your email. Check spam too.'
      );
    } else if (r.reason === 'resource-exhausted') {
      setMsg(es ? 'Espera 30 segundos antes de pedir otro código' : 'Wait 30 seconds before requesting another code');
    } else if (r.reason === 'resend_test_domain_restriction') {
      setMsg(
        es
          ? '⚠ Servicio en modo de prueba. El admin debe verificar el dominio en Resend.'
          : '⚠ Email service in test mode. Admin must verify domain in Resend.'
      );
    } else {
      setMsg(es ? `No pudimos enviar el código. ${r.message || ''}` : `Couldn't send the code. ${r.message || ''}`);
    }
  };

  const submit = async () => {
    if (code.length !== 6) {
      setMsg(es ? 'El código tiene 6 dígitos' : 'Code has 6 digits');
      return;
    }
    setLoading(true);
    setMsg('');
    const r = await verifyEmailOTP(email, code);
    setLoading(false);
    if (r.valid) {
      setStage('verified');
      onVerifiedChange(true);
      setMsg(es ? '✓ Correo verificado' : '✓ Email verified');
    } else {
      const map: Record<string, string> = {
        not_requested: es ? 'Primero solicita un código' : 'First request a code',
        expired: es ? 'El código expiró. Solicita uno nuevo.' : 'Code expired. Request a new one.',
        too_many_attempts: es ? 'Demasiados intentos. Espera un poco.' : 'Too many attempts. Wait a bit.',
        wrong_code: es
          ? `Código incorrecto.${r.attemptsLeft !== undefined ? ` ${r.attemptsLeft} intentos restantes.` : ''}`
          : `Wrong code.${r.attemptsLeft !== undefined ? ` ${r.attemptsLeft} attempts left.` : ''}`,
      };
      setMsg(map[r.reason || ''] || (es ? 'No se pudo verificar' : 'Could not verify'));
    }
  };

  if (stage === 'verified' || verified) {
    return (
      <div className={`rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 flex items-center gap-2 text-xs text-emerald-700 ${className}`}>
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        <span className="flex-1">{es ? 'Correo verificado' : 'Email verified'}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3 space-y-2.5 ${className}`}>
      {stage === 'idle' && (
        <button
          type="button"
          onClick={sendCode}
          disabled={loading || !email}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-brand-600 bg-brand-50 hover:bg-brand-100 disabled:opacity-40 text-brand-800 text-sm font-semibold px-4 py-2.5 transition"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {es ? 'Verificar correo' : 'Verify email'}
        </button>
      )}
      {stage === 'sent' && (
        <>
          <p className="text-xs text-slate-600 leading-relaxed">
            {es ? 'Código enviado a ' : 'Code sent to '}
            <span className="font-semibold text-slate-900 break-all">{email}</span>
          </p>

          {/* Code input — responsive */}
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="flex-1 min-w-0 rounded-lg bg-white border-2 border-slate-200 px-3 py-2.5 text-center text-lg sm:text-xl tracking-[0.4em] text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 font-mono font-bold"
            />
            <button
              type="button"
              onClick={submit}
              disabled={loading || code.length !== 6}
              className="rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs sm:text-sm font-bold px-3 sm:px-5 transition shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'OK'}
            </button>
          </div>

          {/* Actions row — responsive */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={sendCode}
                disabled={countdown > 0 || loading}
                className="hover:text-brand-700 disabled:opacity-40 underline-offset-2 hover:underline flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                {countdown > 0
                  ? `${countdown}s`
                  : (es ? 'Reenviar' : 'Resend')}
              </button>
              {onChangeEmail && (
                <>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => {
                      setStage('idle');
                      setCode('');
                      setMsg('');
                      onChangeEmail();
                    }}
                    className="hover:text-brand-700 underline-offset-2 hover:underline"
                  >
                    {es ? 'Cambiar correo' : 'Change email'}
                  </button>
                </>
              )}
            </div>
            <span className="text-slate-400">{es ? 'Expira 10 min' : 'Expires 10 min'}</span>
          </div>
        </>
      )}
      {msg && (
        <p className={`flex items-start gap-1.5 text-[11px] leading-relaxed ${msg.startsWith('✓') ? 'text-emerald-600' : 'text-amber-600'}`}>
          {!msg.startsWith('✓') && <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />}
          <span className="break-words">{msg}</span>
        </p>
      )}
    </div>
  );
}
