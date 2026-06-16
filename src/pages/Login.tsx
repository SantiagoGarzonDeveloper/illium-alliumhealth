import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CountryPhoneInput } from '@/components/ui/country-phone-input';
import { auth, cloudFunctions, db } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import { Users, ShoppingBag, ArrowLeft, ArrowRight, Check, AlertCircle, Globe, KeyRound, Mail, X } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { userHasAdminAccess } from '@/lib/adminAccess';
import { validateEmailRemote, emailErrorMessage, validatePhone, phoneErrorMessage } from '@/lib/validation';

type SignupRole = 'customer' | 'partner' | null;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function Login() {
  const { t, locale, setLocale } = useI18n();
  const [isLogin, setIsLogin] = useState(true);
  const [signupRole, setSignupRole] = useState<SignupRole>(null);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [occupation, setOccupation] = useState('');
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [facebook, setFacebook] = useState('');
  const [twitter, setTwitter] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [whatsappCountryCode, setWhatsappCountryCode] = useState('+1');
  const [whatsappLocalNumber, setWhatsappLocalNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  /** When signup detects an existing account, we stash the email here so we
   *  can show a richer panel with "sign in" / "reset password" actions. */
  const [duplicateEmail, setDuplicateEmail] = useState<string | null>(null);
  /** Inline forgot-password mini-form open state + status. */
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const navigate = useNavigate();

  const referrerId = useMemo(() => {
    try {
      return localStorage.getItem('referrerId');
    } catch {
      return null;
    }
  }, []);

  // If user arrived with a referral link, auto-select partner role
  const hasReferrer = Boolean(referrerId);

  const isPartner = signupRole === 'partner' || hasReferrer;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));

        if (userDoc.exists()) {
          const data = userDoc.data();
          let role = (data.role as string) || 'client';
          if (role === 'client' && data.referrerId) {
            await setDoc(doc(db, 'users', userCredential.user.uid), { role: 'worker' }, { merge: true });
            role = 'worker';
          }
          // Priority: worker → /panel (always), client → /, real admin role → /admin
          // Even if email is in adminEmails, workers go to their panel by default.
          if (role === 'worker') {
            navigate('/panel');
          } else if (role === 'admin') {
            navigate('/admin');
          } else {
            navigate('/');
          }
          void userHasAdminAccess; // silence unused import
        } else {
          navigate('/');
        }
      } else {
        // Client-side validation for signup
        const emailCheck = await validateEmailRemote(normalizedEmail);
        if (!emailCheck.valid) {
          setError(emailErrorMessage(emailCheck, locale));
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError(es ? 'La contraseña debe tener al menos 6 caracteres' : 'Password must be at least 6 characters');
          setLoading(false);
          return;
        }
        if (!ageConfirmed) {
          setError(es ? 'Debes confirmar que eres mayor de 18 años' : 'You must confirm you are 18+ to sign up');
          setLoading(false);
          return;
        }
        const phoneCheck = validatePhone(whatsappCountryCode, whatsappLocalNumber);
        if (!phoneCheck.valid) {
          setError(phoneErrorMessage(phoneCheck.reason, locale));
          setLoading(false);
          return;
        }
        // Require at least 1 social media for partners
        if (isPartner) {
          const hasSocial = [instagram, tiktok, facebook, twitter, linkedin].some((s) => s.trim().length > 0);
          if (!hasSocial) {
            setError(es ? 'Debes ingresar al menos una red social para registrarte como socio.' : 'You must enter at least one social media account to register as a partner.');
            setLoading(false);
            // Scroll to social media section and highlight it
            const el = document.getElementById('social-media-block');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('ring-2', 'ring-red-500', 'ring-offset-2');
              setTimeout(() => el.classList.remove('ring-2', 'ring-red-500', 'ring-offset-2'), 3000);
            }
            return;
          }
        }
        const cc = whatsappCountryCode.trim();
        const localDigits = whatsappLocalNumber.replace(/\D/g, '');
        const refId = referrerId;

        // Prevent duplicate registration: check if a user doc already exists with this email
        try {
          const dupSnap = await getDocs(
            query(collection(db, 'users'), where('emailLower', '==', normalizedEmail), limit(1))
          );
          if (!dupSnap.empty) {
            setDuplicateEmail(normalizedEmail);
            setLoading(false);
            return;
          }
        } catch (dupErr) {
          // If the query fails (e.g. rules), don't block — Firebase Auth will still throw on dupe email
          console.warn('duplicate-check failed', dupErr);
        }

        const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        const uid = userCredential.user.uid;

        let referralAncestors: string[] = [];
        if (refId) {
          const metaSnap = await getDoc(doc(db, 'publicReferralMeta', refId));
          const parentChain = metaSnap.exists() ? (metaSnap.data().referralAncestors as string[]) || [] : [];
          referralAncestors = [refId, ...parentChain];
        }

        const role = isPartner ? 'worker' : 'client';

        await setDoc(doc(db, 'users', uid), {
          email: normalizedEmail,
          emailLower: normalizedEmail,
          name: name.trim(),
          role,
          referrerId: refId || null,
          referralAncestors,
          city: city || null,
          occupation: occupation || null,
          vendorStatus: isPartner ? 'pending_review' : null,
          termsAccepted: false,
          instagram: instagram || null,
          tiktok: tiktok || null,
          facebook: facebook || null,
          twitter: twitter || null,
          linkedin: linkedin || null,
          whatsappCountryCode: cc.startsWith('+') ? cc : `+${cc.replace(/\D/g, '')}`,
          whatsappLocalNumber: localDigits,
          createdAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'publicReferralMeta', uid), {
          referralAncestors,
          updatedAt: new Date().toISOString(),
        });

        if (role === 'worker') navigate('/panel');
        else navigate('/');
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      // Race: another tab created the account between dup-check and create.
      if (!isLogin && (code === 'auth/email-already-in-use')) {
        setDuplicateEmail(email.trim().toLowerCase());
      } else if (isLogin && (code === 'auth/wrong-password' || code === 'auth/invalid-credential')) {
        setError(es
          ? 'Correo o contraseña incorrectos. ¿Olvidaste tu contraseña?'
          : 'Wrong email or password. Forgot your password?');
      } else if (isLogin && code === 'auth/user-not-found') {
        setError(es
          ? 'No encontramos una cuenta con este correo.'
          : 'We could not find an account with this email.');
      } else if (code === 'auth/too-many-requests') {
        setError(es
          ? 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
          : 'Too many attempts. Wait a few minutes and try again.');
      } else {
        const message = err instanceof Error ? err.message : 'Failed to authenticate';
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const es = locale === 'es';

  /** Send a Firebase password-reset email. Treats user-not-found as success
   *  to avoid email enumeration (industry-standard practice). */
  const handleSendReset = async () => {
    const target = (forgotEmail || email).trim().toLowerCase();
    if (!target || !EMAIL_REGEX.test(target)) {
      setForgotMsg({ kind: 'err', text: es ? 'Ingresa un correo válido' : 'Enter a valid email' });
      return;
    }
    setForgotSending(true);
    setForgotMsg(null);
    try {
      // Prefer the Illium-branded email sent via our Cloud Function (Resend).
      // Falls back silently to the default Firebase email if the function fails.
      let usedCustom = false;
      try {
        const fn = httpsCallable(cloudFunctions, 'sendCustomPasswordReset');
        await fn({ email: target, locale });
        usedCustom = true;
      } catch (cfErr) {
        console.warn('sendCustomPasswordReset CF failed, falling back to Firebase:', cfErr);
      }
      if (!usedCustom) {
        await sendPasswordResetEmail(auth, target);
      }
      setForgotMsg({
        kind: 'ok',
        text: es
          ? `Si existe una cuenta con ${target}, te enviamos un link para restablecer la contraseña. Revisa tu correo (y la carpeta de spam).`
          : `If an account exists for ${target}, we sent a link to reset the password. Check your inbox (and spam folder).`,
      });
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/user-not-found') {
        // Same success message to avoid leaking which emails are registered.
        setForgotMsg({
          kind: 'ok',
          text: es
            ? `Si existe una cuenta con ${target}, te enviamos un link para restablecer la contraseña.`
            : `If an account exists for ${target}, we sent a link to reset the password.`,
        });
      } else if (code === 'auth/too-many-requests') {
        setForgotMsg({
          kind: 'err',
          text: es ? 'Demasiados intentos. Intenta en unos minutos.' : 'Too many attempts. Try again in a few minutes.',
        });
      } else {
        setForgotMsg({
          kind: 'err',
          text: es ? 'No se pudo enviar el correo. Inténtalo más tarde.' : 'Could not send the email. Try again later.',
        });
      }
    } finally {
      setForgotSending(false);
    }
  };

  const openForgotWith = (prefillEmail: string) => {
    setForgotEmail(prefillEmail);
    setForgotMsg(null);
    setForgotOpen(true);
  };

  // Live validation
  const emailError = emailTouched && email.length > 0 && !EMAIL_REGEX.test(email)
    ? (es ? 'Correo electrónico no válido' : 'Invalid email address')
    : '';
  const passwordError = passwordTouched && password.length > 0 && password.length < 6
    ? (es ? 'La contraseña debe tener al menos 6 caracteres' : 'Password must be at least 6 characters')
    : '';
  const phoneError = !isLogin && phoneTouched && whatsappLocalNumber.length > 0 && whatsappLocalNumber.length < 7
    ? (es ? 'Número muy corto' : 'Phone too short')
    : '';

  // ── Role selection screen (signup only, no referrer) ──
  if (!isLogin && !signupRole && !hasReferrer) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="w-full max-w-lg animate-scale-in">
          {/* Logo */}
          <div className="text-center mb-10">
            <img src="/illium-logo-light.png" alt="ILLIUM" className="mx-auto mb-4 h-10 w-auto" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {es ? '\u00bfC\u00f3mo deseas unirte?' : 'How would you like to join?'}
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              {es ? 'Selecciona tu tipo de cuenta' : 'Select your account type'}
            </p>
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {/* Customer */}
            <button
              type="button"
              onClick={() => setSignupRole('customer')}
              className="group relative flex flex-col items-center text-center rounded-2xl border-2 border-slate-200 bg-white p-8 transition-all duration-200 hover:border-brand-300 hover:shadow-card"
            >
              <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4 group-hover:bg-brand-50 transition-colors">
                <ShoppingBag className="h-7 w-7 text-slate-600 group-hover:text-brand-600 transition-colors" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                {es ? 'Cliente' : 'Customer'}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                {es ? 'Quiero comprar productos y recibir recomendaciones personalizadas' : 'I want to buy products and get personalized recommendations'}
              </p>
            </button>

            {/* Partner */}
            <button
              type="button"
              onClick={() => setSignupRole('partner')}
              className="group relative flex flex-col items-center text-center rounded-2xl border-2 border-brand-200 bg-brand-50/30 p-8 transition-all duration-200 hover:border-brand-400 hover:shadow-card"
            >
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-sm whitespace-nowrap">
                {es ? 'Gana comisiones' : 'Earn commissions'}
              </span>
              <div className="h-14 w-14 rounded-2xl bg-brand-100 flex items-center justify-center mb-4 group-hover:bg-brand-200 transition-colors">
                <Users className="h-7 w-7 text-brand-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                {es ? 'Socio / Partner' : 'Partner'}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                {es ? 'Quiero vender, ganar comisiones y construir mi red' : 'I want to sell, earn commissions and build my network'}
              </p>
            </button>
          </div>

          {/* Back to login */}
          <div className="text-center">
            <p className="text-sm text-slate-500">
              {es ? '\u00bfYa tienes cuenta? ' : 'Already have an account? '}
              <button
                type="button"
                onClick={() => { setIsLogin(true); setSignupRole(null); setError(''); }}
                className="text-brand-600 font-semibold hover:underline"
              >
                {es ? 'Iniciar sesi\u00f3n' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Login / Signup form ──
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-scale-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/illium-logo-light.png" alt="ILLIUM" className="mx-auto mb-4 h-9 w-auto" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isLogin ? t('login.welcomeBack') : t('login.createAccount')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isLogin ? t('login.signInSubtitle') : t('login.joinSubtitle')}
          </p>
          {/* Role badge for signup */}
          {!isLogin && (signupRole || hasReferrer) && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 border border-brand-200 px-3 py-1 text-xs font-semibold text-brand-700">
              {isPartner ? (
                <><Users className="h-3 w-3" /> {es ? 'Registro como Socio' : 'Partner Signup'}</>
              ) : (
                <><ShoppingBag className="h-3 w-3" /> {es ? 'Registro como Cliente' : 'Customer Signup'}</>
              )}
            </div>
          )}
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-card p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{error}</div>
            )}

            {duplicateEmail && (
              <div className="relative rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                <button
                  type="button"
                  onClick={() => setDuplicateEmail(null)}
                  className="absolute top-2 right-2 p-1 rounded-full text-amber-700/60 hover:text-amber-900 hover:bg-amber-100"
                  aria-label={es ? 'Cerrar' : 'Close'}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-start gap-2.5">
                  <Mail className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-900">
                      {es ? 'Ya existe una cuenta con este correo' : 'An account already exists with this email'}
                    </p>
                    <p className="text-xs text-amber-800 mt-0.5 break-all">{duplicateEmail}</p>
                    <p className="text-xs text-amber-700 mt-1.5">
                      {es
                        ? 'Puede que te hayas registrado antes. Inicia sesión o restablece tu contraseña si la olvidaste.'
                        : 'You may have signed up before. Sign in, or reset your password if you forgot it.'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsLogin(true);
                      setEmail(duplicateEmail);
                      setPassword('');
                      setError('');
                      setDuplicateEmail(null);
                    }}
                    className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2"
                  >
                    {es ? 'Iniciar sesión' : 'Sign in'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      openForgotWith(duplicateEmail);
                      setDuplicateEmail(null);
                    }}
                    className="rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold px-3 py-2"
                  >
                    {es ? 'Restablecer contraseña' : 'Reset password'}
                  </button>
                </div>
              </div>
            )}

            {forgotOpen && (
              <div className="relative rounded-2xl border border-brand-200 bg-brand-50/70 p-4 space-y-3">
                <button
                  type="button"
                  onClick={() => { setForgotOpen(false); setForgotMsg(null); }}
                  className="absolute top-2 right-2 p-1 rounded-full text-brand-700/60 hover:text-brand-900 hover:bg-brand-100"
                  aria-label={es ? 'Cerrar' : 'Close'}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-start gap-2.5">
                  <KeyRound className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-brand-900">
                      {es ? 'Restablecer contraseña' : 'Reset your password'}
                    </p>
                    <p className="text-xs text-brand-700 mt-0.5">
                      {es
                        ? 'Ingresa tu correo y te enviamos un link para crear una nueva.'
                        : 'Enter your email and we will send you a link to create a new one.'}
                    </p>
                  </div>
                </div>
                <Input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder={es ? 'tu@correo.com' : 'you@email.com'}
                  className="input-premium"
                  autoComplete="email"
                />
                <Button
                  type="button"
                  onClick={handleSendReset}
                  disabled={forgotSending}
                  className="w-full bg-brand-600 hover:bg-brand-500 text-white rounded-xl h-10 text-xs font-bold"
                >
                  {forgotSending
                    ? es ? 'Enviando…' : 'Sending…'
                    : es ? 'Enviar link de recuperación' : 'Send reset link'}
                </Button>
                {forgotMsg && (
                  <div
                    className={`text-xs rounded-lg p-2.5 ${
                      forgotMsg.kind === 'ok'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {forgotMsg.text}
                  </div>
                )}
              </div>
            )}

            {hasReferrer && !isLogin && (
              <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 text-sm text-brand-900">
                <p className="font-semibold flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-brand-600" />
                  {t('login.referredTitle')}
                </p>
                <p className="mt-1 text-xs text-brand-700">{t('login.referredHint')}</p>
              </div>
            )}

            {!isLogin && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">{t('login.fullName')}</label>
                <Input type="text" value={name} onChange={(e) => setName(e.target.value)} required={!isLogin} className="input-premium" />
              </div>
            )}

            {/* Partner-only fields */}
            {!isLogin && isPartner && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">{t('login.city')}</label>
                    <Input type="text" value={city} onChange={(e) => setCity(e.target.value)} required className="input-premium" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">
                      {es ? '¿A qué te dedicas?' : 'What do you do?'}
                    </label>
                    <Input
                      type="text"
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                      className="input-premium"
                      placeholder={es ? 'Ej. Entrenador, Coach, Nutricionista...' : 'E.g. Trainer, Coach, Nutritionist...'}
                    />
                  </div>
                </div>

                <div id="social-media-block" className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3 transition-all duration-300">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {es ? 'Redes Sociales (mínimo 1)' : 'Social Media (at least 1 required)'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500">{t('login.instagram')}</label>
                      <Input type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)} className="input-premium" placeholder="@username" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500">{t('login.tiktok')}</label>
                      <Input type="text" value={tiktok} onChange={(e) => setTiktok(e.target.value)} className="input-premium" placeholder="@username" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500">{t('login.facebook')}</label>
                      <Input type="text" value={facebook} onChange={(e) => setFacebook(e.target.value)} className="input-premium" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500">{t('login.twitter')}</label>
                      <Input type="text" value={twitter} onChange={(e) => setTwitter(e.target.value)} className="input-premium" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">{t('login.linkedin')}</label>
                    <Input type="text" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} className="input-premium" />
                  </div>
                  <p className="text-[10px] text-slate-400">{t('login.optional')}</p>
                </div>
              </>
            )}

            {/* WhatsApp for signup */}
            {!isLogin && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-700">{t('login.whatsappBlockTitle')}</p>
                <p className="text-[11px] text-slate-500">{t('login.whatsappBlockHint')}</p>
                <CountryPhoneInput
                  countryCode={whatsappCountryCode}
                  phoneNumber={whatsappLocalNumber}
                  onCountryCodeChange={setWhatsappCountryCode}
                  onPhoneNumberChange={(v) => { setWhatsappLocalNumber(v); setPhoneTouched(true); }}
                  countryCodeLabel={t('login.whatsappCountryCode')}
                  phoneLabel={t('login.whatsappLocalNumber')}
                  required
                />
                {phoneError && (
                  <p className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" /> {phoneError}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">{t('login.email')}</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                required
                className={`input-premium ${emailError ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                autoComplete="email"
              />
              {emailError && (
                <p className="flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="h-3 w-3" /> {emailError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">{t('login.password')}</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setPasswordTouched(true)}
                required
                className={`input-premium ${passwordError ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                minLength={isLogin ? undefined : 6}
              />
              {passwordError && (
                <p className="flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="h-3 w-3" /> {passwordError}
                </p>
              )}
              {isLogin && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => openForgotWith(email)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    <KeyRound className="h-3 w-3" />
                    {es ? '¿Olvidaste tu contraseña?' : 'Forgot your password?'}
                  </button>
                </div>
              )}
            </div>

            {/* Language selector + 18+ for signup */}
            {!isLogin && (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    <Globe className="h-3.5 w-3.5" />
                    {es ? 'Idioma preferido' : 'Preferred language'}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setLocale('es')}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                        locale === 'es'
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-300'
                      }`}
                    >
                      🇪🇸 Español
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocale('en')}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                        locale === 'en'
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-300'
                      }`}
                    >
                      🇺🇸 English
                    </button>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-xl border-2 border-slate-200 p-3 hover:border-brand-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={ageConfirmed}
                    onChange={(e) => setAgeConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-xs text-slate-600 leading-relaxed">
                    {es
                      ? 'Confirmo que soy mayor de 18 años y acepto los términos de servicio y la política de privacidad de ILLIUM.'
                      : 'I confirm I am 18+ years old and accept the terms of service and privacy policy of ILLIUM.'}
                  </span>
                </label>
              </>
            )}

            <Button
              type="submit"
              className="btn-premium w-full bg-slate-900 text-white hover:bg-slate-800 rounded-xl h-11 text-sm font-semibold mt-2"
              disabled={loading}
            >
              {loading ? t('login.processing') : isLogin ? t('login.signIn') : t('login.signUp')}
              {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>

            <div className="mt-4 text-sm text-center text-slate-500">
              {isLogin ? t('login.noAccount') : t('login.hasAccount')}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setSignupRole(null);
                  setError('');
                  setDuplicateEmail(null);
                  setForgotOpen(false);
                  setForgotMsg(null);
                }}
                className="text-brand-600 font-semibold hover:underline"
              >
                {isLogin ? t('login.signUp') : t('login.signIn')}
              </button>
            </div>

            {/* Back to role selection (only if no referrer and in signup mode) */}
            {!isLogin && !hasReferrer && signupRole && (
              <button
                type="button"
                onClick={() => { setSignupRole(null); setError(''); }}
                className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-slate-600 transition-colors mt-2"
              >
                <ArrowLeft className="h-3 w-3" />
                {es ? 'Cambiar tipo de cuenta' : 'Change account type'}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
