/**
 * One-shot script: writes the Stripe publishable key + enabled flag directly
 * into Firestore settings/general so the admin doesn't have to paste it.
 *
 * Run with:
 *   node scripts/set-stripe-publishable.mjs
 */
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolveFirebaseCredentialsPath, getScriptDir } from './resolve-firebase-credentials.mjs';

const dir = getScriptDir(import.meta.url);
const credPath = resolveFirebaseCredentialsPath(dir);
if (!credPath) {
  console.error('No Firebase credentials found');
  process.exit(1);
}
const cred = JSON.parse(readFileSync(credPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(cred) });
const db = admin.firestore();

const PUBLISHABLE =
  'pk_live_51TZYoXFdEfFk95pyvi1FcRyECFERHvRR6znW68xQPhMZ19nPaQWK0qygG5RdlyCIYF8JZSIeGP5FispS4co6DVqC00EnWIKnhk';

await db
  .doc('settings/general')
  .set({ stripePublishableKey: PUBLISHABLE, cardPaymentsEnabled: true }, { merge: true });
console.log('✔ Stripe publishable key + enabled flag written to settings/general');
process.exit(0);
