import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/I18nContext';
import { ShieldCheck, KeyRound, CheckCircle2, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';

/**
 * Illium-branded handler for Firebase Auth action links (password reset,
 * email verification, email recovery). Replaces the default page hosted at
 * monaco-community.firebaseapp.com — so the user sees `alliumhealth.net`
 * in the URL bar throughout the flow.
 *
 * To activate: in Firebase Console → Authentication → Templates → click any
 * template → "Customize action URL" → set to https://alliumhealth.net/auth/action
 */
export function AuthAction() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { locale, setLocale } = useI18n();

  const mode = searchParams.get('mode') || '';
  const oobCode = searchParams.get('oobCode') || '';
  const continueUrl = searchParams.get('continueUrl') || '';
  const langParam = searchParams.get('lang') || '';

  // Respect the lang= param from the email link (we send it ourselves in the CF).
  useEffect(() => {
    if (langParam === 'es' || langParam === 'en') {
      setLocale(langParam);
    }
  }, [langParam, setLocale]);

  const es = locale === 'es';

  if (!oobCode || !mode) {
    return <ActionShell><InvalidLink es={es} /></ActionShell>;
  }

  if (mode === 'resetPassword') {
    return <ActionShell><ResetPasswordFlow code={oobCode} es={es} continueUrl={continueUrl} onDone={() => navigate('/login')} /></ActionShell>;
  }
  if (mode === 'verifyEmail') {
    return <ActionShell><VerifyEmailFlow code={oobCode} es={es} /></ActionShell>;
  }
  if (mode === 'recoverEmail') {
    return <ActionShell><RecoverEmailFlow code={oobCode} es={es} /></ActionShell>;
  }
  return <ActionShell><InvalidLink es={es} /></ActionShell>;
}

/** Branded card shell shared by every action mode. */
function ActionShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-600/20">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <span className="font-black text-2xl tracking-[0.3em] text-slate-900">ILLIUM</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-card p-6 md:p-8">
          {children}
        </div>
        <p className="text-center mt-4 text-[10px] text-slate-400">
          alliumhealth.net
        </p>
      </div>
    </div>
  );
}

function ResetPasswordFlow({
  code,
  es,
  continueUrl,
  onDone,
}: { code: string; es: boolean; continueUrl: string; onDone: () => void }) {
  const [phase, setPhase] = useState<'verifying' | 'form' | 'submitting' | 'done' | 'error'>('verifying');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resolvedEmail = await verifyPasswordResetCode(auth, code);
        if (cancelled) return;
        setEmail(resolvedEmail);
        setPhase('form');
      } catch (e) {
        if (cancelled) return;
        const codeStr = (e as { code?: string })?.code || '';
        setErr(translateAuthError(codeStr, es));
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [code, es]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (pwd.length < 6) {
      setErr(es ? 'La contraseña debe tener al menos 6 caracteres.' : 'Password must be at least 6 characters.');
      return;
    }
    if (pwd !== pwd2) {
      setErr(es ? 'Las contraseñas no coinciden.' : 'Passwords do not match.');
      return;
    }
    setPhase('submitting');
    try {
      await confirmPasswordReset(auth, code, pwd);
      setPhase('done');
    } catch (e) {
      const codeStr = (e as { code?: string })?.code || '';
      setErr(translateAuthError(codeStr, es));
      setPhase('form');
    }
  };

  if (phase === 'verifying') {
    return (
      <div className="text-center py-6">
        <KeyRound className="h-8 w-8 text-brand-600 mx-auto mb-3 animate-pulse" />
        <p className="text-sm text-slate-600">{es ? 'Validando el link…' : 'Validating the link…'}</p>
      </div>
    );
  }

  if (phase === 'error') {
    return <ErrorPanel es={es} message={err} />;
  }

  if (phase === 'done') {
    return (
      <div className="text-center py-2">
        <div className="h-14 w-14 rounded-full bg-emerald-100 ring-4 ring-emerald-200/50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-1">
          {es ? '¡Contraseña actualizada!' : 'Password updated!'}
        </h1>
        <p className="text-sm text-slate-600 mb-5">
          {es
            ? `Ya puedes iniciar sesión con tu nueva contraseña${email ? ` (${email})` : ''}.`
            : `You can now sign in with your new password${email ? ` (${email})` : ''}.`}
        </p>
        {continueUrl ? (
          <a href={continueUrl}>
            <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-11 text-sm font-bold">
              {es ? 'Continuar' : 'Continue'} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </a>
        ) : (
          <Button
            type="button"
            onClick={onDone}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-11 text-sm font-bold"
          >
            {es ? 'Ir a iniciar sesión' : 'Go to sign in'} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="mb-5">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 border border-brand-200 px-3 py-1 text-[11px] font-bold text-brand-700 uppercase tracking-wider mb-2">
          <KeyRound className="h-3 w-3" />
          {es ? 'Restablecer contraseña' : 'Reset password'}
        </div>
        <h1 className="text-xl font-bold text-slate-900">
          {es ? 'Crea tu nueva contraseña' : 'Create your new password'}
        </h1>
        {email && (
          <p className="text-xs text-slate-500 mt-1 truncate">
            {es ? 'Para la cuenta' : 'For account'}: <span className="font-semibold text-slate-700">{email}</span>
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">
            {es ? 'Nueva contraseña' : 'New password'}
          </label>
          <div className="relative">
            <Input
              type={showPwd ? 'text' : 'password'}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              required
              minLength={6}
              className="pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">
            {es ? 'Confirma la contraseña' : 'Confirm password'}
          </label>
          <Input
            type={showPwd ? 'text' : 'password'}
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>
        {err && (
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{err}</span>
          </div>
        )}
        <Button
          type="submit"
          disabled={phase === 'submitting'}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-11 text-sm font-bold"
        >
          {phase === 'submitting'
            ? (es ? 'Guardando…' : 'Saving…')
            : (es ? 'Guardar nueva contraseña' : 'Save new password')}
        </Button>
        <Link to="/login" className="block text-center text-xs text-slate-500 hover:text-slate-700">
          {es ? 'Cancelar y volver' : 'Cancel and go back'}
        </Link>
      </form>
    </>
  );
}

function VerifyEmailFlow({ code, es }: { code: string; es: boolean }) {
  const [phase, setPhase] = useState<'verifying' | 'done' | 'error'>('verifying');
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await applyActionCode(auth, code);
        if (!cancelled) setPhase('done');
      } catch (e) {
        if (cancelled) return;
        const codeStr = (e as { code?: string })?.code || '';
        setErr(translateAuthError(codeStr, es));
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [code, es]);

  if (phase === 'verifying') {
    return (
      <div className="text-center py-6">
        <ShieldCheck className="h-8 w-8 text-brand-600 mx-auto mb-3 animate-pulse" />
        <p className="text-sm text-slate-600">{es ? 'Verificando tu correo…' : 'Verifying your email…'}</p>
      </div>
    );
  }
  if (phase === 'error') return <ErrorPanel es={es} message={err} />;
  return (
    <div className="text-center py-2">
      <div className="h-14 w-14 rounded-full bg-emerald-100 ring-4 ring-emerald-200/50 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="h-7 w-7 text-emerald-600" />
      </div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">
        {es ? '¡Correo verificado!' : 'Email verified!'}
      </h1>
      <p className="text-sm text-slate-600 mb-5">
        {es ? 'Tu cuenta de Illium ya está activa.' : 'Your Illium account is now active.'}
      </p>
      <Link to="/login">
        <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-11 text-sm font-bold">
          {es ? 'Iniciar sesión' : 'Sign in'} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}

function RecoverEmailFlow({ code, es }: { code: string; es: boolean }) {
  const [phase, setPhase] = useState<'verifying' | 'done' | 'error'>('verifying');
  const [restoredEmail, setRestoredEmail] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const info = await checkActionCode(auth, code);
        const previous = info.data?.email || '';
        await applyActionCode(auth, code);
        if (!cancelled) {
          setRestoredEmail(previous);
          setPhase('done');
        }
      } catch (e) {
        if (cancelled) return;
        const codeStr = (e as { code?: string })?.code || '';
        setErr(translateAuthError(codeStr, es));
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [code, es]);

  if (phase === 'verifying') {
    return (
      <div className="text-center py-6">
        <ShieldCheck className="h-8 w-8 text-brand-600 mx-auto mb-3 animate-pulse" />
        <p className="text-sm text-slate-600">{es ? 'Restaurando tu correo…' : 'Restoring your email…'}</p>
      </div>
    );
  }
  if (phase === 'error') return <ErrorPanel es={es} message={err} />;
  return (
    <div className="text-center py-2">
      <div className="h-14 w-14 rounded-full bg-emerald-100 ring-4 ring-emerald-200/50 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="h-7 w-7 text-emerald-600" />
      </div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">
        {es ? 'Correo restaurado' : 'Email restored'}
      </h1>
      <p className="text-sm text-slate-600 mb-5">
        {restoredEmail
          ? (es ? `Tu cuenta vuelve a usar ${restoredEmail}.` : `Your account is back to ${restoredEmail}.`)
          : (es ? 'Tu correo anterior fue restaurado.' : 'Your previous email has been restored.')}
      </p>
      <Link to="/login">
        <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-11 text-sm font-bold">
          {es ? 'Iniciar sesión' : 'Sign in'}
        </Button>
      </Link>
    </div>
  );
}

function InvalidLink({ es }: { es: boolean }) {
  return (
    <ErrorPanel
      es={es}
      message={es ? 'El link no es válido o está incompleto.' : 'The link is invalid or incomplete.'}
    />
  );
}

function ErrorPanel({ es, message }: { es: boolean; message: string }) {
  return (
    <div className="text-center py-2">
      <div className="h-14 w-14 rounded-full bg-red-100 ring-4 ring-red-200/50 flex items-center justify-center mx-auto mb-4">
        <AlertCircle className="h-7 w-7 text-red-600" />
      </div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">
        {es ? 'No pudimos completar la acción' : 'We could not complete the action'}
      </h1>
      <p className="text-sm text-slate-600 mb-5">{message}</p>
      <Link to="/login">
        <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-11 text-sm font-bold">
          {es ? 'Volver a iniciar sesión' : 'Back to sign in'}
        </Button>
      </Link>
    </div>
  );
}

/** Translate Firebase Auth error codes to friendly messages in ES/EN. */
function translateAuthError(code: string, es: boolean): string {
  const map: Record<string, { es: string; en: string }> = {
    'auth/expired-action-code': {
      es: 'Este link expiró. Solicita uno nuevo desde la pantalla de inicio de sesión.',
      en: 'This link has expired. Request a new one from the sign-in screen.',
    },
    'auth/invalid-action-code': {
      es: 'El link no es válido (puede que ya se haya usado).',
      en: 'The link is no longer valid (it may have already been used).',
    },
    'auth/user-disabled': {
      es: 'Tu cuenta está deshabilitada. Contáctanos.',
      en: 'Your account is disabled. Please contact us.',
    },
    'auth/user-not-found': {
      es: 'No encontramos esta cuenta.',
      en: 'Account not found.',
    },
    'auth/weak-password': {
      es: 'La contraseña es muy débil. Usa al menos 6 caracteres.',
      en: 'The password is too weak. Use at least 6 characters.',
    },
  };
  const fallback = es ? 'Algo salió mal. Inténtalo de nuevo.' : 'Something went wrong. Please try again.';
  const entry = map[code];
  if (!entry) return fallback;
  return es ? entry.es : entry.en;
}
