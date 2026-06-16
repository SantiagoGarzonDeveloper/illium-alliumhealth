import { useEffect, useState } from 'react';
import { useI18n, setAgeVerified, isAgeVerified } from '@/i18n/I18nContext';
import type { Locale } from '@/i18n/translations';
import { Button } from '@/components/ui/button';
import { AgeVerificationShield } from './AgeVerificationShield';

export const LOCALE_EXPLICIT_KEY = 'app_locale_chosen';

export function markLocaleExplicitChoice() {
  try {
    localStorage.setItem(LOCALE_EXPLICIT_KEY, '1');
  } catch {
    /* ignore */
  }
}

function hasChosenLanguage(): boolean {
  try {
    return localStorage.getItem(LOCALE_EXPLICIT_KEY) === '1';
  } catch {
    return false;
  }
}

function setChosenLanguageFlag() {
  markLocaleExplicitChoice();
}

export function LanguageAgeGates({ children }: { children: React.ReactNode }) {
  const { t, setLocale } = useI18n();
  const [phase, setPhase] = useState<'lang' | 'age' | 'done'>(() => {
    if (isAgeVerified()) return 'done';
    if (!hasChosenLanguage()) return 'lang';
    return 'age';
  });
  const [remember, setRemember] = useState(true);
  const [showMinorMsg, setShowMinorMsg] = useState(false);

  useEffect(() => {
    if (isAgeVerified()) {
      setPhase('done');
      return;
    }
    if (!hasChosenLanguage()) setPhase('lang');
    else setPhase('age');
  }, []);

  const finishLanguage = (l: Locale) => {
    setLocale(l);
    setChosenLanguageFlag();
    if (isAgeVerified()) setPhase('done');
    else setPhase('age');
  };

  const confirmAge = () => {
    setAgeVerified(remember);
    setShowMinorMsg(false);
    setPhase('done');
  };

  const denyAge = () => {
    setShowMinorMsg(true);
  };

  return (
    <>
      {children}

      {phase === 'lang' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 p-10 shadow-2xl text-center text-white border border-slate-700/50 animate-scale-in">
            {/* Logo */}
            <img src="/illium-logo-dark.png" alt="ILLIUM" className="mx-auto mb-6 h-10 w-auto" />
            <h2 className="text-xl font-bold text-white mb-2">{t('gates.chooseLanguage')}</h2>
            <p className="mb-8 text-sm text-slate-400">{t('gates.langSubtitle')}</p>
            <div className="flex gap-3 justify-center">
              <Button
                type="button"
                className="btn-premium min-w-[130px] rounded-xl bg-slate-800 text-white hover:bg-slate-700 border border-slate-600 h-11 text-sm font-semibold"
                onClick={() => finishLanguage('es')}
              >
                {t('gates.spanish')}
              </Button>
              <Button
                type="button"
                className="btn-premium min-w-[130px] rounded-xl bg-brand-600 text-white hover:bg-brand-500 shadow-lg shadow-brand-600/30 h-11 text-sm font-semibold"
                onClick={() => finishLanguage('en')}
              >
                {t('gates.english')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {phase === 'age' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl bg-white p-10 shadow-2xl animate-scale-in">
            <AgeVerificationShield className="mb-4" />
            <p className="text-center text-lg font-bold text-slate-900 mb-8">{t('gates.ageQuestion')}</p>
            <div className="flex gap-3 justify-center mb-6">
              <Button
                type="button"
                className="min-w-[110px] rounded-xl border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 h-11 text-sm font-semibold"
                onClick={denyAge}
              >
                {t('gates.no')}
              </Button>
              <Button
                type="button"
                className="btn-premium min-w-[110px] rounded-xl bg-slate-900 text-white hover:bg-slate-800 h-11 text-sm font-semibold"
                onClick={confirmAge}
              >
                {t('gates.yes')}
              </Button>
            </div>
            <label className="flex items-center justify-center gap-2 text-sm text-brand-600 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-500"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              {t('gates.rememberMe')}
            </label>
            <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400">{t('gates.ageDisclaimer')}</p>
            {showMinorMsg && (
              <p className="mt-4 text-center text-sm font-semibold text-red-500">{t('gates.mustBeAdult')}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
