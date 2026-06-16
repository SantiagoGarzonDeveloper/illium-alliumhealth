import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToastStore } from '@/store';
import { useI18n } from '@/i18n/I18nContext';

/** One toast per ref code per browser tab session; deferred so React StrictMode double-mount does not cancel it. */
function sessionKeyForRef(ref: string) {
  return `labpremium-ref-toast-${ref}`;
}

export function ReferralNotice() {
  const [searchParams] = useSearchParams();
  const showToast = useToastStore((s) => s.showToast);
  const { t } = useI18n();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (!ref || ref.length < 6) return;

    const key = sessionKeyForRef(ref);
    if (sessionStorage.getItem(key)) return;

    const id = window.setTimeout(() => {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      showToast(t('referralToast'));
    }, 0);

    return () => window.clearTimeout(id);
  }, [searchParams, showToast, t]);

  return null;
}
