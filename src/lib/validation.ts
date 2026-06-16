import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '@/lib/firebase';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export type EmailValidationResult = {
  valid: boolean;
  reason?: string;
  suggestion?: string;
};

/** Call the server-side `validateEmail` Cloud Function. Falls back to regex if server fails. */
export async function validateEmailRemote(email: string): Promise<EmailValidationResult> {
  const trimmed = email.trim().toLowerCase();
  // Fast client-side gate first
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
    return { valid: false, reason: 'bad_format' };
  }
  try {
    const fn = httpsCallable(cloudFunctions, 'validateEmail');
    const res = await fn({ email: trimmed });
    return (res.data as EmailValidationResult) || { valid: true };
  } catch (e) {
    console.warn('validateEmail fallback', e);
    // If the function is down, accept (don't block the user)
    return { valid: true, reason: 'server_unavailable' };
  }
}

export function emailErrorMessage(result: EmailValidationResult, locale: 'es' | 'en'): string {
  const es = locale === 'es';
  switch (result.reason) {
    case 'bad_format':
      return es ? 'Formato de correo inválido' : 'Invalid email format';
    case 'local_too_short':
      return es ? 'El correo es muy corto' : 'Email is too short';
    case 'typo':
      return es
        ? `Correo parece tener un typo. ¿Quisiste decir ${result.suggestion}?`
        : `Looks like a typo. Did you mean ${result.suggestion}?`;
    case 'disposable':
      return es
        ? 'Ese correo no es válido. Usa uno real para recibir tu confirmación.'
        : 'That email is not valid. Use a real one to receive your confirmation.';
    case 'no_mx':
    case 'domain_not_found':
      return es
        ? 'Ese dominio no existe o no puede recibir correos.'
        : "That domain does not exist or cannot receive emails.";
    default:
      return es ? 'Correo no válido' : 'Invalid email';
  }
}

/** Validate phone number using libphonenumber-js. Country-aware. */
export function validatePhone(
  countryCode: string,
  localNumber: string
): { valid: boolean; e164?: string; reason?: string } {
  const cc = countryCode.trim();
  const local = localNumber.replace(/\D/g, '');
  if (!cc.replace(/\D/g, '') || !local) {
    return { valid: false, reason: 'empty' };
  }
  const full = `${cc.startsWith('+') ? cc : '+' + cc}${local}`;
  const parsed = parsePhoneNumberFromString(full);
  if (!parsed) {
    return { valid: false, reason: 'unparseable' };
  }
  if (!parsed.isValid()) {
    return { valid: false, reason: 'invalid_for_country' };
  }
  return { valid: true, e164: parsed.number };
}

/** Request OTP code via email. */
export async function requestEmailOTP(email: string, locale: 'es' | 'en'): Promise<{ sent: boolean; reason?: string; message?: string; devCode?: string }> {
  try {
    const fn = httpsCallable(cloudFunctions, 'requestEmailOTP');
    const res = await fn({ email, locale });
    return res.data as { sent: boolean; reason?: string; devCode?: string };
  } catch (e) {
    const err = e as { code?: string; message?: string; details?: unknown };
    const msg = err?.message || '';
    // Extract the Resend-specific reason if present
    if (msg.includes('resend_test_domain_restriction')) {
      return { sent: false, reason: 'resend_test_domain_restriction', message: msg };
    }
    if (msg.includes('resend_error')) {
      return { sent: false, reason: 'resend_error', message: msg };
    }
    return { sent: false, reason: err?.code || 'error', message: msg };
  }
}

/** Verify OTP code. */
export async function verifyEmailOTP(email: string, code: string): Promise<{ valid: boolean; reason?: string; attemptsLeft?: number }> {
  try {
    const fn = httpsCallable(cloudFunctions, 'verifyEmailOTP');
    const res = await fn({ email, code });
    return res.data as { valid: boolean; reason?: string; attemptsLeft?: number };
  } catch {
    return { valid: false, reason: 'error' };
  }
}

export function phoneErrorMessage(reason: string | undefined, locale: 'es' | 'en'): string {
  const es = locale === 'es';
  switch (reason) {
    case 'empty':
      return es ? 'Ingresa un número de teléfono' : 'Enter a phone number';
    case 'unparseable':
      return es ? 'Número no reconocido. Revisa código de país.' : 'Could not parse number. Check country code.';
    case 'invalid_for_country':
      return es
        ? 'Ese número no es válido para ese país.'
        : 'That number is not valid for the selected country.';
    default:
      return es ? 'Número de teléfono inválido' : 'Invalid phone number';
  }
}
