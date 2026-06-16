import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Locale } from './translations';
import { translate } from './translations';

const LOCALE_KEY = 'app_locale';
const AGE_KEY = 'age_verified';
const AGE_SESSION_KEY = 'age_verified_session';

type I18nContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (path: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  const v = localStorage.getItem(LOCALE_KEY);
  return v === 'es' || v === 'en' ? v : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      return readStoredLocale();
    } catch {
      return 'en';
    }
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(LOCALE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback((path: string) => translate(locale, path), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export function getStoredLocale(): Locale {
  try {
    return readStoredLocale();
  } catch {
    return 'en';
  }
}

export function isAgeVerified(): boolean {
  try {
    if (localStorage.getItem(AGE_KEY) === '1') return true;
    return sessionStorage.getItem(AGE_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAgeVerified(persist: boolean) {
  try {
    sessionStorage.setItem(AGE_SESSION_KEY, '1');
    if (persist) localStorage.setItem(AGE_KEY, '1');
    else localStorage.removeItem(AGE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAgeVerified() {
  try {
    sessionStorage.removeItem(AGE_SESSION_KEY);
    localStorage.removeItem(AGE_KEY);
  } catch {
    /* ignore */
  }
}
