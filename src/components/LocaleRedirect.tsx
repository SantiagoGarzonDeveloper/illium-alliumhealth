import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { markLocaleExplicitChoice } from '@/components/gates/LanguageAgeGates';
import type { Locale } from '@/i18n/translations';

/** Sets UI language and returns to home (shareable `/es` / `/en` entry). */
export function LocaleRedirect({ lang }: { lang: Locale }) {
  const navigate = useNavigate();
  const { setLocale } = useI18n();

  useEffect(() => {
    setLocale(lang);
    markLocaleExplicitChoice();
    navigate('/', { replace: true });
  }, [lang, navigate, setLocale]);

  return null;
}
