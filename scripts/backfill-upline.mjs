/**
 * Backfill `uplineReferrerId` + `uplineCommissionAmount` + `uplinePayoutStatus`
 * on all existing orders. Reads each order's referrerId, looks up the
 * referrer's publicReferralMeta to find their parent (upline), and rewrites
 * the order doc so the 10% commission shows up retroactively.
 *
 * Run with:
 *   node scripts/backfill-upline.mjs
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

const UPLINE_RATE = 0.10;

async function getUplineFor(referrerId) {
  // Try publicReferralMeta first (mirror used by checkout)
  try {
    const meta = await db.doc(`publicReferralMeta/${referrerId}`).get();
    if (meta.exists) {
      const ancestors = (meta.data() || {}).referralAncestors || [];
      if (Array.isArray(ancestors) && ancestors.length > 0) {
        return ancestors[0];
      }
    }
  } catch { /* fall through */ }
  // Fall back to users doc
  try {
    const u = await db.doc(`users/${referrerId}`).get();
    if (u.exists) {
      const ancestors = (u.data() || {}).referralAncestors || [];
      if (Array.isArray(ancestors) && ancestors.length > 0) return ancestors[0];
    }
  } catch { /* ignore */ }
  return null;
}

async function backfillCollection(collName) {
  console.log(`\n=== Backfilling ${collName} ===`);
  const snap = await db.collection(collName).get();
  let touched = 0;
  let already = 0;
  let noref = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const referrerId = data.referrerId;
    if (!referrerId) {
      noref += 1;
      continue;
    }
    const currentUpline = data.uplineReferrerId;
    const computedUpline = await getUplineFor(referrerId);
    const total = Number(data.total) || 0;
    const expectedUplineAmt = computedUpline ? Math.round(total * UPLINE_RATE * 100) / 100 : 0;
    const expectedUplineStatus = computedUpline ? (data.uplinePayoutStatus === 'paid' ? 'paid' : 'pending') : 'na';

    // Skip if already correctly set.
    if (
      currentUpline === computedUpline &&
      Number(data.uplineCommissionAmount || 0) === expectedUplineAmt &&
      (data.uplinePayoutStatus || 'na') === expectedUplineStatus
    ) {
      already += 1;
      continue;
    }

    await docSnap.ref.update({
      uplineReferrerId: computedUpline,
      uplineCommissionAmount: expectedUplineAmt,
      uplinePayoutStatus: expectedUplineStatus,
      uplineBackfilledAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    touched += 1;
    console.log(`  • ${docSnap.id} → upline=${computedUpline || '—'} amt=$${expectedUplineAmt} status=${expectedUplineStatus}`);
  }
  console.log(`Result: ${touched} updated, ${already} already correct, ${noref} no referrer`);
}

await backfillCollection('orders');
await backfillCollection('manualSales');
console.log('\n✔ Backfill complete');
process.exit(0);
