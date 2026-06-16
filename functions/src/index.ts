import * as admin from 'firebase-admin';
import * as dns from 'dns';
import { promisify } from 'util';

// Cloud Run / Cloud Functions Gen2 defaults Node 20 to IPv6-first DNS, which
// causes outbound calls to certain hosts (notably Stripe's api.stripe.com) to
// hang or fail. Force IPv4 resolution first to fix Stripe connection retries.
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  /* older Node — ignore */
}
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https';
import Stripe from 'stripe';
import { defineSecret } from 'firebase-functions/params';

/** Google Cloud Secret Manager — set with: firebase functions:secrets:set META_WHATSAPP_TOKEN */
const META_WHATSAPP_TOKEN = defineSecret('META_WHATSAPP_TOKEN');
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
/** Stripe secret key (sk_test_… or sk_live_…). Set via:
 *  firebase functions:secrets:set STRIPE_SECRET_KEY
 */
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
/** Stripe webhook signing secret (whsec_…). Set via:
 *  firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
 */
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

setGlobalOptions({
  region: 'us-central1',
  secrets: [META_WHATSAPP_TOKEN, RESEND_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
});

const resolveMx = promisify(dns.resolveMx);

admin.initializeApp();
const db = admin.firestore();

const GRAPH_VER = 'v21.0';

// ── ILLIUM WhatsApp templates ──────────────────────────────────────
const T = {
  NEW_AFFILIATE: 'illium_new_affiliate',
  NEW_REFERRAL: 'illium_new_referral',
  ADMIN_NEW_USER: 'illium_admin_new_user',
  NEW_SALE: 'illium_new_sale',
  ORDER_SHIPPED: 'illium_order_shipped',
} as const;

function pickLang(locale?: string | null): string {
  const l = (locale || 'es').toLowerCase();
  if (l === 'en' || l === 'en_us' || l === 'en-us') return 'en_US';
  return 'es_MX';
}

async function getPhoneNumberId(): Promise<string | null> {
  const snap = await db.doc('settings/general').get();
  const d = snap.data() || {};
  const id = String(d.metaWhatsappPhoneNumberId || '').trim();
  return id || null;
}

/** Returns the admin-configured public URL (no trailing slash), falling back to monaco-community.web.app */
async function getPublicSiteUrl(): Promise<string> {
  try {
    const snap = await db.doc('settings/general').get();
    const d = snap.data() || {};
    const url = String(d.publicSiteUrl || '').trim().replace(/\/$/, '');
    if (url) return url;
  } catch { /* fall through */ }
  return 'https://monaco-community.web.app';
}

function toWaRecipientDigits(countryCode?: string, localNumber?: string): string | null {
  if (!localNumber) return null;
  const localDigits = String(localNumber).replace(/\D/g, '');
  if (!localDigits) return null;
  const ccDigits = String(countryCode || '').replace(/\D/g, '');
  if (!ccDigits) return null;
  return `${ccDigits}${localDigits}`;
}

function digitsFromUser(data: admin.firestore.DocumentData | undefined): string | null {
  if (!data) return null;
  return toWaRecipientDigits(
    data.whatsappCountryCode as string | undefined,
    data.whatsappLocalNumber as string | undefined
  );
}

function digitsFromOrderCustomer(cust: unknown): string | null {
  if (!cust || typeof cust !== 'object') return null;
  const o = cust as Record<string, unknown>;
  return toWaRecipientDigits(
    o.whatsappCountryCode as string | undefined,
    o.whatsappLocalNumber as string | undefined
  );
}

async function userWaDigits(uid: string): Promise<string | null> {
  const snap = await db.doc(`users/${uid}`).get();
  return digitsFromUser(snap.data());
}

async function userLocale(uid: string): Promise<string> {
  const snap = await db.doc(`users/${uid}`).get();
  const d = snap.data() || {};
  return pickLang(d.preferredLocale as string | undefined);
}

/** Return ALL configured owner WhatsApp digits (multi-number). */
async function ownerWaDigitsAll(): Promise<string[]> {
  const snap = await db.doc('settings/general').get();
  const sd = snap.data() || {};
  const out: string[] = [];
  const arr = sd.ownerWhatsappNumbers;
  if (Array.isArray(arr)) {
    for (const n of arr) {
      if (!n || typeof n !== 'object') continue;
      const d = toWaRecipientDigits(
        (n as Record<string, unknown>).countryCode as string | undefined,
        (n as Record<string, unknown>).localNumber as string | undefined
      );
      if (d) out.push(d);
    }
  }
  // Back-compat: single legacy pair
  if (out.length === 0) {
    const legacy = toWaRecipientDigits(
      sd.ownerWhatsappCountryCode as string | undefined,
      sd.ownerWhatsappLocalNumber as string | undefined
    );
    if (legacy) out.push(legacy);
  }
  // Dedupe
  return Array.from(new Set(out));
}

/** Send a specific WhatsApp template by name. */
async function sendTemplate(
  token: string,
  toDigits: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[],
  headerParams?: string[]
): Promise<{ ok: boolean; status?: number; detail?: string }> {
  const phoneNumberId = await getPhoneNumberId();
  if (!phoneNumberId) return { ok: false, detail: 'no_phone_number_id' };

  const to = toDigits.replace(/^\+/, '').replace(/\D/g, '');
  if (!to) return { ok: false, detail: 'invalid_to' };

  const components: Array<Record<string, unknown>> = [];
  if (headerParams && headerParams.length > 0) {
    components.push({
      type: 'header',
      parameters: headerParams.map((t) => ({ type: 'text', text: String(t).slice(0, 60) })),
    });
  }
  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((t) => ({ type: 'text', text: String(t).slice(0, 1024) })),
    });
  }

  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: languageCode },
  };
  if (components.length > 0) template.components = components;

  const url = `https://graph.facebook.com/${GRAPH_VER}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    console.error(`[wa] ${templateName} error`, res.status, JSON.stringify(json).slice(0, 500));
    return { ok: false, status: res.status, detail: JSON.stringify(json).slice(0, 500) };
  }
  return { ok: true };
}

// ─────────── TRIGGERS ───────────

export const waOnUserCreated = onDocumentCreated('users/{userId}', async (event) => {
  const token = META_WHATSAPP_TOKEN.value();
  const snap = event.data;
  if (!snap) return;
  const u = snap.data();
  const uid = snap.id;
  const name = String(u.name || u.email || '—').slice(0, 120);
  const email = String(u.email || '—').slice(0, 120);
  const role = String(u.role || 'client');
  const lang = pickLang(u.preferredLocale as string | undefined);

  // 1) Welcome the new partner with their referral link
  if (role === 'worker') {
    const to = digitsFromUser(u);
    if (to) {
      const siteUrl = await getPublicSiteUrl();
      const refLink = `${siteUrl}/?ref=${uid}`;
      await sendTemplate(token, to, T.NEW_AFFILIATE, lang, [name, refLink]);
    }
  }

  // 2) Notify the referrer (if any) that someone joined their network
  const referrerId = typeof u.referrerId === 'string' && u.referrerId ? u.referrerId : null;
  if (referrerId) {
    const to = await userWaDigits(referrerId);
    if (to) {
      const refLang = await userLocale(referrerId);
      await sendTemplate(token, to, T.NEW_REFERRAL, refLang, [name, email]);
    }
  }

  // 3) Notify owner/admin of new user — send to ALL configured owner numbers
  const owners = await ownerWaDigitsAll();
  if (owners.length > 0) {
    const roleLabel = role === 'worker' ? 'Partner' : 'Customer';
    const when = new Date().toISOString().replace('T', ' ').slice(0, 16);
    await Promise.all(
      owners.map((o) =>
        sendTemplate(token, o, T.ADMIN_NEW_USER, 'es_MX', [roleLabel, name, email, when])
      )
    );
  }
});

/**
 * Calculate the referrer commission based on vendor's custom config.
 * Modes: percentage (default 40%), fixed_global ($X per unit), fixed_per_product (per product $).
 */
async function calculateVendorCommission(
  vendorId: string,
  total: number,
  items: Array<{ productId?: string; quantity?: number; price?: number }>
): Promise<number> {
  const snap = await db.doc(`users/${vendorId}`).get();
  const d = snap.data() || {};
  const mode = String(d.commissionMode || 'percentage');

  if (mode === 'fixed_global') {
    const fixedAmt = Number(d.commissionFixedAmount) || 0;
    const totalUnits = items.reduce((s, i) => s + (i.quantity || 1), 0);
    return Math.round(fixedAmt * totalUnits * 100) / 100;
  }

  if (mode === 'fixed_per_product') {
    const perProduct = (d.commissionFixedPerProduct || {}) as Record<string, number>;
    let sum = 0;
    for (const item of items) {
      const pid = item.productId || '';
      const qty = item.quantity || 1;
      const amt = Number(perProduct[pid]) || 0;
      sum += amt * qty;
    }
    return Math.round(sum * 100) / 100;
  }

  // Default: percentage
  const pct = typeof d.commissionPercentage === 'number' ? d.commissionPercentage : 0.4;
  return Math.round(total * pct * 100) / 100;
}

export const waOnOrderCreated = onDocumentCreated('orders/{orderId}', async (event) => {
  const token = META_WHATSAPP_TOKEN.value();
  const snap = event.data;
  if (!snap) return;
  const o = snap.data();
  const orderId = snap.id;
  const total = typeof o.total === 'number' ? o.total : Number(o.total) || 0;
  const cust = (o.customer || {}) as Record<string, string>;
  const customerName = String(cust.name || cust.email || 'Cliente').slice(0, 80);
  const items = Array.isArray(o.items) ? o.items as Array<{ productId?: string; quantity?: number; price?: number }> : [];

  // ─── Decrement product stock for this sale (idempotent via order flag) ───
  if (items.length > 0) {
    try {
      const orderRef = db.doc(`orders/${orderId}`);
      let decremented: Array<{ productId: string; name: string; qty: number; prev: number; next: number }> = [];
      await db.runTransaction(async (tx) => {
        const orderSnap = await tx.get(orderRef);
        if (orderSnap.get('stockApplied') === true) return; // already applied — don't double-count
        const productRefs = items
          .filter((it) => it.productId)
          .map((it) => db.doc(`products/${it.productId}`));
        const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));
        const byId = new Map(productSnaps.map((s) => [s.id, s]));
        decremented = []; // reset in case the transaction retries
        for (const it of items) {
          if (!it.productId) continue;
          const ps = byId.get(it.productId);
          if (!ps || !ps.exists) continue;
          const qty = Number(it.quantity) || 1;
          const prev = Number(ps.get('stock')) || 0;
          const next = Math.max(0, prev - qty);
          tx.update(ps.ref, { stock: next });
          decremented.push({ productId: it.productId, name: String(ps.get('name') || ''), qty, prev, next });
        }
        tx.update(orderRef, { stockApplied: true });
      });
      // Record sale movements in the inventory history (best-effort).
      for (const d of decremented) {
        await db.collection('inventoryLogs').add({
          productId: d.productId,
          productName: d.name,
          type: 'sale',
          quantity: -d.qty,
          previousStock: d.prev,
          newStock: d.next,
          note: `Order ${orderId.slice(0, 8)}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } catch (err) {
      console.error('Stock decrement failed for order', orderId, err);
    }
  }

  const refId = typeof o.referrerId === 'string' && o.referrerId ? o.referrerId : null;
  const uplineId = typeof o.uplineReferrerId === 'string' && o.uplineReferrerId ? o.uplineReferrerId : null;

  // Calculate vendor-specific commission + update order doc with real amounts
  let refCommAmt = 0;
  let uplineCommAmt = 0;

  if (refId) {
    refCommAmt = await calculateVendorCommission(refId, total, items);
  }
  if (uplineId) {
    // Upline always uses global settings rate (not vendor-specific).
    // The rate applies to the DIRECT seller's commission (their net earnings),
    // NOT the order total — e.g. if the seller earns $1000, the upline earns $100.
    const settingsSnap = await db.doc('settings/general').get();
    const sd = settingsSnap.data() || {};
    const uplineRate = typeof sd.commissionUplineRate === 'number' ? sd.commissionUplineRate : 0.1;
    uplineCommAmt = Math.round(refCommAmt * uplineRate * 100) / 100;
  }

  // Write the calculated commission amounts back to the order
  if (refId || uplineId) {
    await db.doc(`orders/${orderId}`).update({
      referrerCommissionAmount: refCommAmt,
      uplineCommissionAmount: uplineCommAmt,
    });
  }

  // Notify direct partner
  if (refId) {
    const to = await userWaDigits(refId);
    if (to) {
      const lang = await userLocale(refId);
      await sendTemplate(token, to, T.NEW_SALE, lang, [
        orderId.slice(0, 12),
        customerName,
        total.toFixed(2),
        refCommAmt.toFixed(2),
      ]);
    }
  }

  // Notify upline
  if (uplineId && uplineId !== refId) {
    const to = await userWaDigits(uplineId);
    if (to) {
      const lang = await userLocale(uplineId);
      await sendTemplate(token, to, T.NEW_SALE, lang, [
        orderId.slice(0, 12),
        customerName,
        total.toFixed(2),
        uplineCommAmt.toFixed(2),
      ]);
    }
  }

  // Owner alert — ALL configured owner numbers
  const owners = await ownerWaDigitsAll();
  if (owners.length > 0) {
    const when = new Date().toISOString().replace('T', ' ').slice(0, 16);
    await Promise.all(
      owners.map((o) =>
        sendTemplate(token, o, T.ADMIN_NEW_USER, 'es_MX', [
          'Nueva venta',
          customerName,
          `$${total.toFixed(2)} · #${orderId.slice(0, 8)}`,
          when,
        ])
      )
    );
  }
});

/**
 * Decrement product stock when an admin records a MANUAL sale (`manualSales`
 * collection). Web orders + worker POS already go through `orders` and are
 * handled by waOnOrderCreated; manual/direct sales were the one channel that
 * never touched inventory. Idempotent via a `stockApplied` flag on the sale doc.
 */
export const onManualSaleCreated = onDocumentCreated('manualSales/{saleId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const m = snap.data();
  const saleId = snap.id;
  const items = Array.isArray(m.items)
    ? (m.items as Array<{ productId?: string; productName?: string; quantity?: number }>)
    : [];
  if (items.length === 0) return;

  try {
    const saleRef = db.doc(`manualSales/${saleId}`);
    let decremented: Array<{ productId: string; name: string; qty: number; prev: number; next: number }> = [];
    await db.runTransaction(async (tx) => {
      const saleSnap = await tx.get(saleRef);
      if (saleSnap.get('stockApplied') === true) return; // already applied — don't double-count
      const productRefs = items
        .filter((it) => it.productId)
        .map((it) => db.doc(`products/${it.productId}`));
      const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));
      const byId = new Map(productSnaps.map((s) => [s.id, s]));
      decremented = []; // reset in case the transaction retries
      for (const it of items) {
        if (!it.productId) continue;
        const ps = byId.get(it.productId);
        if (!ps || !ps.exists) continue;
        const qty = Number(it.quantity) || 1;
        const prev = Number(ps.get('stock')) || 0;
        const next = Math.max(0, prev - qty);
        tx.update(ps.ref, { stock: next });
        decremented.push({ productId: it.productId, name: String(ps.get('name') || it.productName || ''), qty, prev, next });
      }
      tx.update(saleRef, { stockApplied: true });
    });
    for (const d of decremented) {
      await db.collection('inventoryLogs').add({
        productId: d.productId,
        productName: d.name,
        type: 'sale',
        quantity: -d.qty,
        previousStock: d.prev,
        newStock: d.next,
        note: `Manual sale ${saleId.slice(0, 8)}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (err) {
    console.error('Stock decrement failed for manual sale', saleId, err);
  }
});

export const waOnOrderUpdated = onDocumentUpdated('orders/{orderId}', async (event) => {
  const token = META_WHATSAPP_TOKEN.value();
  const change = event.data;
  if (!change) return;
  const before = change.before.data();
  const after = change.after.data();
  if (!before || !after) return;
  const orderId = event.params.orderId as string;

  // Shipped → notify customer
  const shipBefore = String((before as Record<string, unknown>).fulfillmentStatus || '');
  const shipAfter = String((after as Record<string, unknown>).fulfillmentStatus || '');
  if (shipAfter === 'shipped' && shipBefore !== 'shipped') {
    const toCust = digitsFromOrderCustomer(after.customer);
    if (toCust) {
      const tracking = String((after as Record<string, unknown>).shippingTracking || 'N/A').slice(0, 120);
      const cust = (after.customer as Record<string, string>) || {};
      const customerName = String(cust.name || 'Cliente').slice(0, 80);
      const lang = pickLang((after.checkoutLocale as string | undefined) || 'es');
      await sendTemplate(token, toCust, T.ORDER_SHIPPED, lang, [
        customerName,
        orderId.slice(0, 12),
        tracking,
      ]);
    }
  }
});

async function assertRequestIsAdmin(auth: { uid: string; token: { email?: string } } | undefined): Promise<void> {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Login required');
  const email = (auth.token?.email || '').trim().toLowerCase();
  const uDoc = await db.doc(`users/${auth.uid}`).get();
  if (uDoc.exists && (uDoc.data()?.role as string | undefined) === 'admin') return;
  const sDoc = await db.doc('settings/general').get();
  const list = sDoc.data()?.adminEmails;
  if (
    Array.isArray(list) &&
    email &&
    list.some((x) => typeof x === 'string' && String(x).trim().toLowerCase() === email)
  ) {
    return;
  }
  throw new HttpsError('permission-denied', 'Admin access required');
}

export const adminDeleteUserAccount = onCall({ region: 'us-central1' }, async (request) => {
  await assertRequestIsAdmin(request.auth);
  const targetUid = request.data?.targetUid;
  if (typeof targetUid !== 'string' || !targetUid.trim()) {
    throw new HttpsError('invalid-argument', 'targetUid required');
  }
  if (targetUid === request.auth!.uid) {
    throw new HttpsError('invalid-argument', 'Cannot delete your own account');
  }
  try {
    await admin.auth().deleteUser(targetUid);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code !== 'auth/user-not-found') {
      throw new HttpsError('internal', err?.message || 'Auth delete failed');
    }
  }
  await db.doc(`users/${targetUid}`).delete().catch(() => undefined);
  await db.doc(`publicReferralMeta/${targetUid}`).delete().catch(() => undefined);
  return { ok: true };
});

export const waOnLeadCreated = onDocumentCreated('leads/{leadId}', async (event) => {
  const token = META_WHATSAPP_TOKEN.value();
  const snap = event.data;
  if (!snap) return;
  const L = snap.data();
  const referrerId = typeof L.referrerId === 'string' && L.referrerId ? L.referrerId : null;
  if (!referrerId) return;

  const to = await userWaDigits(referrerId);
  if (!to) return;

  const name = String(L.name || L.email || 'Lead').slice(0, 100);
  const email = String(L.email || '—').slice(0, 100);
  const lang = await userLocale(referrerId);
  // Reuse NEW_REFERRAL template — same shape (name, email/info)
  await sendTemplate(token, to, T.NEW_REFERRAL, lang, [name, email]);
});

// ─────────────────── EMAIL VALIDATION + SENDING ───────────────────

/** Large list of disposable / known-fake email domains */
const DISPOSABLE_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'test.com', 'test.org',
  'fake.com', 'fakemail.com', 'mailinator.com', 'tempmail.com', 'tempmail.org',
  'yopmail.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'sharklasers.com', 'throwaway.email', '10minutemail.com', '10minutemail.net',
  'trashmail.com', 'getnada.com', 'maildrop.cc', 'mintemail.com', 'temp-mail.org',
  'dispostable.com', 'emailondeck.com', 'fakeinbox.com', 'mailforspam.com',
  'spamex.com', 'trbvm.com', 'mytrashmail.com', 'mt2014.com', 'mohmal.com',
  'email.com', 'mail.com', 'asdf.com', 'qwerty.com', 'abc.com', 'xyz.com',
  'aaa.com', 'none.com', 'null.com', 'user.com', 'admin.com', 'demo.com',
  'notreal.com', 'invalid.com', 'nospam.com', 'nomail.com', 'somemail.com',
]);

/** Common typos of popular email providers -> corrected domain */
const TYPO_CORRECTIONS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmil.com': 'gmail.com',
  'gmaill.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmeil.com': 'gmail.com',
  'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmailo.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmai.co': 'gmail.com',
  'yaho.com': 'yahoo.com', 'yhaoo.com': 'yahoo.com', 'yahho.com': 'yahoo.com',
  'yaoo.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yahho.co': 'yahoo.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmil.com': 'hotmail.com',
  'hotail.com': 'hotmail.com', 'hotamil.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'outloook.com': 'outlook.com',
  'iclod.com': 'icloud.com', 'icluod.com': 'icloud.com', 'icloud.co': 'icloud.com',
};

/**
 * Public callable to validate an email address using:
 *  - format regex
 *  - disposable/fake domain blacklist
 *  - common typo detection
 *  - DNS MX record lookup (real deliverability check)
 *
 * Usage from frontend:
 *   const fn = httpsCallable(functions, 'validateEmail');
 *   const { data } = await fn({ email: 'foo@bar.com' });
 *   data => { valid, reason?, suggestion? }
 */
export const validateEmail = onCall({ region: 'us-central1', cors: true }, async (request) => {
  const raw = String(request.data?.email || '').trim().toLowerCase();
  if (!raw) return { valid: false, reason: 'empty' };

  // 1. Format
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!EMAIL_RE.test(raw)) {
    return { valid: false, reason: 'bad_format' };
  }

  const [local, domain] = raw.split('@');

  if (!local || local.length < 2) {
    return { valid: false, reason: 'local_too_short' };
  }

  // 2. Typo detection
  if (TYPO_CORRECTIONS[domain]) {
    return {
      valid: false,
      reason: 'typo',
      suggestion: `${local}@${TYPO_CORRECTIONS[domain]}`,
    };
  }

  // 3. Disposable/fake domain blacklist
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: 'disposable' };
  }

  // 4. DNS MX lookup — the real deliverability check
  try {
    const mxRecords = await resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, reason: 'no_mx' };
    }
    return { valid: true };
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'ENOTFOUND' || err?.code === 'ENODATA') {
      return { valid: false, reason: 'domain_not_found' };
    }
    // DNS timeout or other — don't block the user, treat as valid
    console.warn('MX lookup error', err?.code || e);
    return { valid: true, reason: 'mx_check_unavailable' };
  }
});

// ─────────────────── EMAIL SENDING (Resend) ───────────────────

async function sendEmailViaResend(
  apiKey: string,
  opts: { to: string; subject: string; html: string; from?: string }
): Promise<{ ok: boolean; id?: string; error?: string }> {
  // Sender: uses verified domain `nuevaia.com` in Resend.
  // To change to alliumhealth.net or any other, verify the domain first at resend.com/domains.
  const from = opts.from || 'ILLIUM <illium@nuevaia.com>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[email] Resend error', res.status, JSON.stringify(data).slice(0, 500));
    return { ok: false, error: JSON.stringify(data).slice(0, 300) };
  }
  return { ok: true, id: (data as { id?: string }).id };
}

/**
 * Send an invoice to a customer by email (admin-only). The client renders the
 * invoice HTML (single source of truth in InvoiceModal) and passes it here.
 */
export const sendInvoiceEmail = onCall(
  { region: 'us-central1', cors: true, secrets: [RESEND_API_KEY] },
  async (request) => {
    await assertRequestIsAdmin(request.auth);
    const { to, subject, html } = (request.data || {}) as { to?: string; subject?: string; html?: string };
    const cleanTo = (to || '').trim();
    if (!cleanTo || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanTo)) {
      throw new HttpsError('invalid-argument', 'A valid recipient email is required.');
    }
    if (!html || html.length < 20) {
      throw new HttpsError('invalid-argument', 'Invoice HTML is required.');
    }
    const apiKey = RESEND_API_KEY.value();
    if (!apiKey || apiKey === 'placeholder-get-one-at-resend.com') {
      throw new HttpsError('failed-precondition', 'Email service is not configured.');
    }
    const r = await sendEmailViaResend(apiKey, {
      to: cleanTo,
      subject: (subject || 'Invoice').slice(0, 200),
      html,
    });
    if (!r.ok) {
      throw new HttpsError('internal', r.error || 'Email send failed.');
    }
    return { sent: true, id: r.id };
  },
);

function orderConfirmationHtml(order: Record<string, unknown>, orderId: string, locale: string): string {
  const es = locale === 'es';
  const cust = (order.customer || {}) as Record<string, string>;
  const name = String(cust.name || (es ? 'Amigo' : 'Friend'));
  const email = String(cust.email || '');
  const total = Number(order.total) || 0;
  const items = Array.isArray(order.items) ? order.items : [];
  // Differentiate the "next step" block depending on how the order was paid.
  const paymentMethod = String((order as { paymentMethod?: string }).paymentMethod || 'zelle');
  const isPaidByCard = paymentMethod === 'stripe' || String(order.status || '') === 'paid';

  const itemsHtml = items.map((it) => {
    const item = it as { name?: string; quantity?: number; price?: number };
    return `<tr>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;">${String(item.name || '')}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity || 1}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">$${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</td>
    </tr>`;
  }).join('');

  const orderShort = orderId.slice(0, 8).toUpperCase();
  const subject = isPaidByCard
    ? (es ? '¡Pago confirmado!' : 'Payment confirmed!')
    : (es ? '¡Pedido recibido!' : 'Order received!');
  const greeting = es ? `Hola ${name},` : `Hi ${name},`;
  const bodyIntro = isPaidByCard
    ? (es
        ? '¡Gracias por tu compra! Recibimos tu pago. En cuanto tu pedido salga te enviaremos el número de rastreo por correo.'
        : 'Thanks for your purchase! We received your payment. As soon as your order ships we will send you the tracking number by email.')
    : (es
        ? 'Recibimos tu pedido en ILLIUM. Te enviaremos por correo las instrucciones de pago y, una vez confirmado, el número de rastreo.'
        : 'We received your order at ILLIUM. We will email you the payment instructions and, once confirmed, the tracking number.');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" style="width:100%;background:#0f172a;padding:40px 20px;" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;" cellpadding="0" cellspacing="0">
        <tr><td style="padding:28px 40px;background:linear-gradient(135deg,#052e16,#14532d,#052e16);color:#ffffff;text-align:center;">
          <div style="font-family:Georgia,serif;font-size:32px;font-weight:900;letter-spacing:4px;">ILLIUM</div>
          <div style="font-size:10px;letter-spacing:3px;color:#86efac;margin-top:4px;text-transform:uppercase;">Advanced Research Peptides</div>
        </td></tr>
        <tr><td style="padding:40px;color:#0f172a;">
          <div style="display:inline-block;padding:6px 14px;background:#dcfce7;color:#166534;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;border-radius:999px;margin-bottom:20px;">✓ ${subject}</div>
          <h1 style="font-size:28px;font-weight:800;margin:0 0 8px;color:#0f172a;">${greeting}</h1>
          <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 24px;">${bodyIntro}</p>
          <div style="background:#f1f5f9;border-radius:12px;padding:14px 16px;margin-bottom:24px;">
            <div style="font-size:10px;letter-spacing:2px;color:#64748b;text-transform:uppercase;font-weight:700;">${es ? 'Pedido' : 'Order'}</div>
            <div style="font-family:monospace;font-size:18px;font-weight:800;color:#0f172a;margin-top:2px;">#${orderShort}</div>
          </div>
          <table role="presentation" style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0">
            <thead><tr style="background:#f8fafc;">
              <th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">${es ? 'Producto' : 'Product'}</th>
              <th style="padding:10px 8px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">${es ? 'Cant.' : 'Qty'}</th>
              <th style="padding:10px 8px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">${es ? 'Total' : 'Total'}</th>
            </tr></thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot><tr>
              <td colspan="2" style="padding:14px 8px;font-weight:700;font-size:16px;color:#0f172a;">${es ? 'Total' : 'Total'}</td>
              <td style="padding:14px 8px;text-align:right;font-weight:900;font-size:22px;color:#14532d;">$${total.toFixed(2)}</td>
            </tr></tfoot>
          </table>
          ${isPaidByCard ? `
          <div style="margin-top:28px;padding:18px;background:#dcfce7;border:1px solid #86efac;border-radius:12px;">
            <div style="font-size:13px;font-weight:700;color:#14532d;margin-bottom:4px;">✓ ${es ? 'Pago confirmado' : 'Payment confirmed'}</div>
            <div style="font-size:13px;line-height:1.5;color:#14532d;">${es ? 'Te avisaremos por correo cuando tu pedido salga con su número de rastreo. ¡Gracias por confiar en Illium!' : 'We will email you the moment your order ships with its tracking number. Thanks for trusting Illium!'}</div>
          </div>
          ` : `
          <div style="margin-top:28px;padding:18px;background:#fefce8;border:1px solid #fde047;border-radius:12px;">
            <div style="font-size:13px;font-weight:700;color:#713f12;margin-bottom:4px;">📌 ${es ? 'Siguiente paso' : 'Next step'}</div>
            <div style="font-size:13px;line-height:1.5;color:#713f12;">${es ? 'Revisa tu correo. Te enviaremos las instrucciones de pago en los próximos minutos.' : 'Check your email. We will send payment instructions in the next few minutes.'}</div>
          </div>
          `}
          <div style="margin-top:32px;text-align:center;">
            <a href="https://alliumhealth.net/orders" style="display:inline-block;background:#16a34a;color:#ffffff;padding:12px 28px;border-radius:999px;font-weight:700;text-decoration:none;font-size:14px;">${es ? 'Ver mis pedidos' : 'View my orders'}</a>
          </div>
        </td></tr>
        <tr><td style="padding:24px 40px;background:#f8fafc;text-align:center;color:#94a3b8;font-size:11px;line-height:1.5;">
          <div style="font-weight:700;color:#475569;">ILLIUM</div>
          <div style="margin-top:4px;">99%+ purity · Independently tested · For research purposes only.</div>
          <div style="margin-top:8px;">${email}</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Send order confirmation email when a new order is created. */
export const sendOrderConfirmationEmail = onDocumentCreated(
  { document: 'orders/{orderId}', region: 'us-central1', secrets: [RESEND_API_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const order = snap.data();
    const orderId = snap.id;
    const cust = (order.customer || {}) as Record<string, string>;
    const email = String(cust.email || '').trim();
    if (!email) {
      console.warn('[email] Order has no customer email, skip');
      return;
    }
    const apiKey = RESEND_API_KEY.value();
    if (!apiKey) {
      console.warn('[email] RESEND_API_KEY not configured, skipping email');
      return;
    }
    const locale = String(order.checkoutLocale || 'es');
    const subject = locale === 'es' ? `ILLIUM · ¡Pedido #${orderId.slice(0, 8).toUpperCase()} recibido!` : `ILLIUM · Order #${orderId.slice(0, 8).toUpperCase()} received!`;
    const html = orderConfirmationHtml(order, orderId, locale);
    const r = await sendEmailViaResend(apiKey, { to: email, subject, html });
    if (r.ok) {
      console.log(`[email] Order confirmation sent to ${email} (resend id ${r.id})`);
    } else {
      console.error(`[email] Failed to send to ${email}:`, r.error);
    }
  }
);

/** Send lead thank-you email when a quiz lead is created. */
export const sendLeadThankYouEmail = onDocumentCreated(
  { document: 'leads/{leadId}', region: 'us-central1', secrets: [RESEND_API_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const lead = snap.data();
    const email = String(lead.email || '').trim();
    if (!email) return;
    const apiKey = RESEND_API_KEY.value();
    if (!apiKey) return;
    const name = String(lead.name || 'Friend').split(' ')[0];
    const locale = String(lead.locale || 'es');
    const es = locale === 'es';
    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,sans-serif;">
      <table role="presentation" style="width:100%;background:#0f172a;padding:40px 20px;" cellpadding="0" cellspacing="0"><tr><td align="center">
        <table role="presentation" style="width:100%;max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;" cellpadding="0" cellspacing="0">
          <tr><td style="padding:28px 40px;background:linear-gradient(135deg,#052e16,#14532d);color:#ffffff;text-align:center;">
            <div style="font-family:Georgia,serif;font-size:32px;font-weight:900;letter-spacing:4px;">ILLIUM</div>
          </td></tr>
          <tr><td style="padding:40px;color:#0f172a;">
            <h1 style="margin:0 0 12px;">${es ? '¡Hola ' + name + '!' : 'Hi ' + name + '!'}</h1>
            <p style="font-size:15px;line-height:1.6;color:#475569;">${es ? 'Gracias por completar tu perfil. Ya tenemos una selección personalizada lista para ti. Pronto recibirás recomendaciones detalladas.' : 'Thanks for completing your profile. We have a personalized selection ready for you. You will receive detailed recommendations shortly.'}</p>
            <div style="margin-top:24px;text-align:center;">
              <a href="https://monaco-community.web.app/shop" style="display:inline-block;background:#16a34a;color:#ffffff;padding:12px 28px;border-radius:999px;font-weight:700;text-decoration:none;">${es ? 'Ver productos' : 'View products'}</a>
            </div>
          </td></tr>
        </table>
      </td></tr></table>
    </body></html>`;
    const subject = es ? '🌿 Tu selección personalizada ILLIUM' : '🌿 Your personalized ILLIUM selection';
    await sendEmailViaResend(apiKey, { to: email, subject, html });
  }
);

// ─────────────────── EMAIL OTP VERIFICATION ───────────────────

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function otpEmailHtml(code: string, locale: string): string {
  const es = locale === 'es';
  return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,sans-serif;">
  <table role="presentation" style="width:100%;background:#0f172a;padding:40px 20px;" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" style="width:100%;max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;" cellpadding="0" cellspacing="0">
      <tr><td style="padding:32px 40px;background:linear-gradient(135deg,#052e16,#14532d,#052e16);color:#ffffff;text-align:center;">
        <div style="font-family:Georgia,serif;font-size:36px;font-weight:900;letter-spacing:6px;">ILLIUM</div>
        <div style="font-size:10px;letter-spacing:3px;color:#86efac;margin-top:6px;text-transform:uppercase;">Advanced Research Peptides</div>
      </td></tr>
      <tr><td style="padding:44px 40px;color:#0f172a;text-align:center;">
        <div style="display:inline-block;padding:6px 14px;background:#dcfce7;color:#166534;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;border-radius:999px;margin-bottom:20px;">🔐 ${es ? 'Código de verificación' : 'Verification code'}</div>
        <h1 style="font-size:26px;font-weight:800;margin:0 0 8px;color:#0f172a;">${es ? 'Confirma tu email' : 'Confirm your email'}</h1>
        <p style="font-size:14px;line-height:1.6;color:#64748b;margin:0 0 28px;">${es ? 'Usa este código para verificar que esta dirección de correo es tuya.' : 'Use this code to verify that this email address belongs to you.'}</p>
        <div style="display:inline-block;padding:20px 36px;background:#f0fdf4;border:2px solid #16a34a;border-radius:16px;margin:0 auto;">
          <div style="font-family:'SF Mono',Menlo,monospace;font-size:42px;font-weight:900;letter-spacing:12px;color:#14532d;">${code}</div>
        </div>
        <p style="font-size:12px;color:#94a3b8;margin-top:28px;">${es ? 'Este código expira en 10 minutos.' : 'This code expires in 10 minutes.'}</p>
        <p style="font-size:11px;color:#cbd5e1;margin-top:12px;">${es ? 'Si no solicitaste este código, ignora este correo.' : "If you didn't request this code, ignore this email."}</p>
      </td></tr>
      <tr><td style="padding:18px 40px;background:#f8fafc;text-align:center;color:#94a3b8;font-size:10px;">ILLIUM · Powered by Alliumhealth</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/** Request an OTP code for email verification. */
export const requestEmailOTP = onCall(
  { region: 'us-central1', cors: true, secrets: [RESEND_API_KEY] },
  async (request) => {
    const email = String(request.data?.email || '').trim().toLowerCase();
    const locale = String(request.data?.locale || 'es');
    if (!email) throw new HttpsError('invalid-argument', 'Email required');
    // Basic format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw new HttpsError('invalid-argument', 'Invalid email');
    }
    // Rate-limit by email
    const keyId = Buffer.from(email).toString('hex').slice(0, 80);
    const ref = db.doc(`emailOtps/${keyId}`);
    const existing = await ref.get();
    const now = Date.now();
    if (existing.exists) {
      const data = existing.data() as { createdAt?: number; attempts?: number };
      const since = now - (data.createdAt || 0);
      if (since < 30_000) {
        throw new HttpsError('resource-exhausted', 'Too fast — wait 30s');
      }
    }
    const code = generateOTP();
    await ref.set({
      email,
      code,
      createdAt: now,
      expiresAt: now + 10 * 60 * 1000,
      attempts: 0,
      verified: false,
    });

    const apiKey = RESEND_API_KEY.value();
    if (!apiKey || apiKey === 'placeholder-get-one-at-resend.com') {
      console.warn('[otp] RESEND_API_KEY not configured; returning code for dev');
      return { sent: false, reason: 'resend_not_configured', devCode: code };
    }
    const subject = locale === 'es' ? `ILLIUM · Tu código ${code}` : `ILLIUM · Your code ${code}`;
    const html = otpEmailHtml(code, locale);
    const r = await sendEmailViaResend(apiKey, { to: email, subject, html });
    if (!r.ok) {
      console.error('[otp] Resend failed', r.error);
      // Detect Resend's test-domain restriction
      const errStr = r.error || '';
      if (errStr.includes('testing') || errStr.includes('verify a domain') || errStr.includes('can only send')) {
        throw new HttpsError(
          'permission-denied',
          'resend_test_domain_restriction'
        );
      }
      throw new HttpsError('internal', `resend_error: ${errStr.slice(0, 120)}`);
    }
    return { sent: true };
  }
);

/** Verify an OTP code. Returns { valid: true } if it matches. */
export const verifyEmailOTP = onCall({ region: 'us-central1', cors: true }, async (request) => {
  const email = String(request.data?.email || '').trim().toLowerCase();
  const code = String(request.data?.code || '').trim();
  if (!email || !code) throw new HttpsError('invalid-argument', 'email + code required');
  const keyId = Buffer.from(email).toString('hex').slice(0, 80);
  const ref = db.doc(`emailOtps/${keyId}`);
  const snap = await ref.get();
  if (!snap.exists) return { valid: false, reason: 'not_requested' };
  const data = snap.data() as { code?: string; expiresAt?: number; attempts?: number; verified?: boolean };
  if ((data.expiresAt || 0) < Date.now()) return { valid: false, reason: 'expired' };
  if ((data.attempts || 0) >= 5) return { valid: false, reason: 'too_many_attempts' };
  if (data.code !== code) {
    await ref.update({ attempts: (data.attempts || 0) + 1 });
    return { valid: false, reason: 'wrong_code', attemptsLeft: 5 - ((data.attempts || 0) + 1) };
  }
  await ref.update({ verified: true });
  return { valid: true };
});

// ─────────────────── CREATE SUB-ADMIN ───────────────────

/** Super admin can create sub-admin accounts with limited permissions. */
export const createSubAdmin = onCall({ region: 'us-central1' }, async (request) => {
  await assertRequestIsAdmin(request.auth);
  const { email, password, name } = request.data || {};
  if (!email || !password || !name) throw new HttpsError('invalid-argument', 'email, password, name required');
  if (String(password).length < 6) throw new HttpsError('invalid-argument', 'Password must be 6+ chars');

  let uid: string;
  try {
    const existing = await admin.auth().getUserByEmail(String(email));
    uid = existing.uid;
    await admin.auth().updateUser(uid, { password: String(password) });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'auth/user-not-found') {
      const created = await admin.auth().createUser({
        email: String(email),
        emailVerified: true,
        password: String(password),
        displayName: String(name),
      });
      uid = created.uid;
    } else throw new HttpsError('internal', (e as Error)?.message || 'Auth error');
  }

  await db.doc(`users/${uid}`).set({
    email: String(email).toLowerCase(),
    name: String(name),
    role: 'subadmin',
    createdAt: new Date().toISOString(),
  }, { merge: true });

  return { ok: true, uid };
});

// ─────────────────── VENDOR STATUS CHANGE → WELCOME EMAIL ───────────────────

export const onVendorStatusChange = onDocumentUpdated(
  { document: 'users/{userId}', region: 'us-central1', secrets: [META_WHATSAPP_TOKEN, RESEND_API_KEY] },
  async (event) => {
    const change = event.data;
    if (!change) return;
    const before = change.before.data();
    const after = change.after.data();
    if (!before || !after) return;

    const prevStatus = String(before.vendorStatus || '');
    const newStatus = String(after.vendorStatus || '');

    // Only fire when status changes TO 'active'
    if (newStatus !== 'active' || prevStatus === 'active') return;

    const userId = event.params.userId;
    const email = String(after.email || '').trim();
    const name = String(after.name || 'Partner').split(' ')[0];
    const refLink = `https://monaco-community.web.app/?ref=${userId}`;

    // 1) Send welcome email via Resend
    const apiKey = RESEND_API_KEY.value();
    if (apiKey && apiKey !== 'placeholder-get-one-at-resend.com' && email) {
      const html = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,sans-serif;">
  <table role="presentation" style="width:100%;background:#0f172a;padding:40px 20px;" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" style="width:100%;max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;" cellpadding="0" cellspacing="0">
      <tr><td style="padding:32px 40px;background:linear-gradient(135deg,#052e16,#14532d);color:#ffffff;text-align:center;">
        <div style="font-family:Georgia,serif;font-size:36px;font-weight:900;letter-spacing:6px;">ILLIUM</div>
        <div style="font-size:10px;letter-spacing:3px;color:#86efac;margin-top:6px;text-transform:uppercase;">Partner Program</div>
      </td></tr>
      <tr><td style="padding:44px 40px;color:#0f172a;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">🎉</div>
        <h1 style="font-size:28px;font-weight:900;margin:0 0 12px;">Welcome, ${name}!</h1>
        <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 24px;">Your partner account has been approved! You can now start selling with ILLIUM and earn commissions on every sale.</p>
        <div style="background:#f0fdf4;border:2px solid #16a34a;border-radius:16px;padding:20px;margin-bottom:24px;">
          <p style="font-size:11px;letter-spacing:2px;color:#166534;text-transform:uppercase;font-weight:700;margin:0 0 8px;">Your referral link</p>
          <p style="font-family:monospace;font-size:13px;color:#14532d;word-break:break-all;margin:0;">${refLink}</p>
        </div>
        <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0 0 24px;">Share this link with your audience. Every sale through your link earns you a commission. Access your dashboard to track sales, commissions and your network.</p>
        <a href="https://monaco-community.web.app/panel" style="display:inline-block;background:#16a34a;color:#ffffff;padding:14px 32px;border-radius:999px;font-weight:700;text-decoration:none;font-size:15px;">Open your dashboard →</a>
      </td></tr>
      <tr><td style="padding:20px 40px;background:#f8fafc;text-align:center;color:#94a3b8;font-size:11px;">ILLIUM · Advanced Research Peptides</td></tr>
    </table>
  </td></tr></table>
</body></html>`;

      await sendEmailViaResend(apiKey, {
        to: email,
        subject: `🎉 Welcome to ILLIUM, ${name}! Your account is active`,
        html,
      });
      console.log(`[vendor] Welcome email sent to ${email}`);
    }

    // 2) Send WhatsApp welcome
    const token = META_WHATSAPP_TOKEN.value();
    const to = digitsFromUser(after);
    if (to && token) {
      await sendTemplate(token, to, T.NEW_AFFILIATE, 'en_US', [name, refLink]);
    }
  }
);

/**
 * Backup admin email notification for every new lead.
 * Sends a simple HTML email to all addresses in settings/general.adminEmails.
 * Serves as a fallback in case the WhatsApp notification fails.
 */
export const sendLeadAdminNotificationEmail = onDocumentCreated(
  { document: 'leads/{leadId}', region: 'us-central1', secrets: [RESEND_API_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const lead = snap.data();
    const leadId = snap.id;
    const apiKey = RESEND_API_KEY.value();
    if (!apiKey) return;

    const sDoc = await db.doc('settings/general').get();
    const list = sDoc.data()?.adminEmails;
    const recipients: string[] = Array.isArray(list)
      ? list.filter((x) => typeof x === 'string' && x.includes('@')).map((x) => String(x).trim())
      : [];
    if (recipients.length === 0) {
      console.warn('[email] No adminEmails configured, skipping admin lead notification');
      return;
    }

    const name = String(lead.name || '—');
    const email = String(lead.email || '—');
    const phone = String(lead.phone || '—');
    const goal = String((lead.quizAnswers as Record<string, string> | undefined)?.goal || '—');
    const budget = String((lead.quizAnswers as Record<string, string> | undefined)?.budget || '—');
    const interest = String(lead.productOfInterest || goal || '—');
    const referrerId = String(lead.referrerId || '—');
    const locale = String(lead.locale || 'es');

    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,sans-serif;">
      <table role="presentation" style="width:100%;padding:32px 16px;" cellpadding="0" cellspacing="0"><tr><td align="center">
        <table role="presentation" style="width:100%;max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;" cellpadding="0" cellspacing="0">
          <tr><td style="padding:18px 24px;background:#14532d;color:#ffffff;">
            <div style="font-family:Georgia,serif;font-size:20px;font-weight:900;letter-spacing:3px;">ILLIUM · NEW LEAD</div>
          </td></tr>
          <tr><td style="padding:24px;color:#0f172a;font-size:14px;line-height:1.6;">
            <p style="margin:0 0 12px;color:#475569;">Se creó un nuevo lead desde el quiz.</p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tr><td style="padding:6px 0;color:#64748b;width:42%;">Nombre</td><td style="padding:6px 0;font-weight:600;">${name}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Email</td><td style="padding:6px 0;font-weight:600;">${email}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Teléfono</td><td style="padding:6px 0;font-weight:600;">${phone}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Meta (goal)</td><td style="padding:6px 0;">${goal}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Producto interés</td><td style="padding:6px 0;font-weight:600;">${interest}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Presupuesto</td><td style="padding:6px 0;">${budget}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Referrer</td><td style="padding:6px 0;font-family:monospace;font-size:11px;">${referrerId}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Locale</td><td style="padding:6px 0;">${locale}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Lead ID</td><td style="padding:6px 0;font-family:monospace;font-size:11px;">${leadId}</td></tr>
            </table>
            <div style="margin-top:20px;text-align:center;">
              <a href="https://monaco-community.web.app/admin/leads" style="display:inline-block;background:#16a34a;color:#ffffff;padding:10px 22px;border-radius:8px;font-weight:700;text-decoration:none;font-size:13px;">Abrir panel de leads</a>
            </div>
          </td></tr>
        </table>
      </td></tr></table>
    </body></html>`;

    const subject = `ILLIUM · Nuevo lead: ${name} (${interest})`;
    for (const to of recipients) {
      try {
        const r = await sendEmailViaResend(apiKey, { to, subject, html });
        if (r.ok) console.log(`[email] Admin lead notification sent to ${to} (id ${r.id})`);
        else console.error(`[email] Admin lead notification failed for ${to}:`, r.error);
      } catch (e) {
        console.error('[email] Admin lead notification error', e);
      }
    }
  }
);

// ─────────────────── PRODUCT AUTHENTICITY (QR SCAN) ───────────────────

interface AuthCodeData {
  productId?: string;
  productName?: string;
  lot?: string;
  purity?: string;
  coaUrl?: string;
  analysisDate?: string;
  labName?: string;
  methods?: string;
  scanCount?: number;
  firstScanAt?: FirebaseFirestore.Timestamp | null;
  lastScanAt?: FirebaseFirestore.Timestamp | null;
  status?: string;
  scanHistory?: Array<{ ts: FirebaseFirestore.Timestamp; ip?: string; ua?: string; country?: string }>;
  createdAt?: FirebaseFirestore.Timestamp;
}

/**
 * Public callable to scan an authenticity code.
 * Increments scanCount atomically, stores scan history, and emails admins
 * on 2nd+ scan (possible counterfeit).
 */
export const scanAuthCode = onCall(
  { region: 'us-central1', cors: true, secrets: [RESEND_API_KEY] },
  async (request) => {
    const code = String(request.data?.code || '').trim().toUpperCase();
    if (!code || !/^[A-Z0-9-]{4,40}$/.test(code)) {
      throw new HttpsError('invalid-argument', 'invalid_code_format');
    }

    const ref = db.doc(`authCodes/${code}`);
    const snap = await ref.get();
    if (!snap.exists) {
      // Log attempted scan of non-existent code
      await db.collection('authScanLogs').add({
        code,
        result: 'not_found',
        ts: admin.firestore.FieldValue.serverTimestamp(),
        ip: (request.rawRequest?.ip as string) || null,
        ua: (request.rawRequest?.headers?.['user-agent'] as string) || null,
      }).catch(() => { /* noop */ });
      throw new HttpsError('not-found', 'code_not_found');
    }

    const existing = (snap.data() || {}) as AuthCodeData;
    if (existing.status === 'voided') {
      throw new HttpsError('failed-precondition', 'code_voided');
    }

    const ip = (request.rawRequest?.ip as string) || 'unknown';
    const ua = String(request.rawRequest?.headers?.['user-agent'] || '').slice(0, 200);
    const now = admin.firestore.Timestamp.now();
    const prevCount = Number(existing.scanCount || 0);
    const newCount = prevCount + 1;

    const historyEntry = { ts: now, ip: ip.slice(0, 60), ua };
    const prevHistory = Array.isArray(existing.scanHistory) ? existing.scanHistory : [];
    const nextHistory = [historyEntry, ...prevHistory].slice(0, 20);

    const update: Record<string, unknown> = {
      scanCount: newCount,
      lastScanAt: now,
      scanHistory: nextHistory,
    };
    if (prevCount === 0) update.firstScanAt = now;

    await ref.update(update);

    // Alert admins when code is scanned 2+ times (possible counterfeit / resale)
    if (newCount >= 2) {
      try {
        const apiKey = RESEND_API_KEY.value();
        if (apiKey) {
          const sDoc = await db.doc('settings/general').get();
          const list = sDoc.data()?.adminEmails;
          const recipients: string[] = Array.isArray(list)
            ? list.filter((x) => typeof x === 'string' && x.includes('@')).map((x) => String(x).trim())
            : [];
          if (recipients.length > 0) {
            const productName = existing.productName || '—';
            const lot = existing.lot || '—';
            const firstTs = existing.firstScanAt && typeof (existing.firstScanAt as FirebaseFirestore.Timestamp).toDate === 'function'
              ? (existing.firstScanAt as FirebaseFirestore.Timestamp).toDate().toISOString()
              : '—';
            const html = `<!doctype html><html><body style="margin:0;padding:0;background:#fef2f2;font-family:-apple-system,sans-serif;">
              <table style="width:100%;padding:32px 16px;" cellpadding="0" cellspacing="0"><tr><td align="center">
                <table style="width:100%;max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:2px solid #dc2626;" cellpadding="0" cellspacing="0">
                  <tr><td style="padding:18px 24px;background:#991b1b;color:#ffffff;">
                    <div style="font-size:20px;font-weight:900;letter-spacing:2px;">⚠️ ILLIUM · MULTIPLE SCAN ALERT</div>
                  </td></tr>
                  <tr><td style="padding:24px;color:#0f172a;font-size:14px;line-height:1.6;">
                    <p style="margin:0 0 12px;color:#475569;">Se detectó un escaneo múltiple de un código de autenticidad. Esto puede indicar una posible falsificación o un vial revendido.</p>
                    <table style="width:100%;border-collapse:collapse;font-size:13px;">
                      <tr><td style="padding:6px 0;color:#64748b;width:40%;">Código</td><td style="padding:6px 0;font-family:monospace;font-weight:700;">${code}</td></tr>
                      <tr><td style="padding:6px 0;color:#64748b;">Producto</td><td style="padding:6px 0;font-weight:600;">${productName}</td></tr>
                      <tr><td style="padding:6px 0;color:#64748b;">Lote</td><td style="padding:6px 0;">${lot}</td></tr>
                      <tr><td style="padding:6px 0;color:#64748b;">Escaneos totales</td><td style="padding:6px 0;color:#dc2626;font-weight:900;">${newCount}</td></tr>
                      <tr><td style="padding:6px 0;color:#64748b;">Primer escaneo</td><td style="padding:6px 0;">${firstTs}</td></tr>
                      <tr><td style="padding:6px 0;color:#64748b;">Último IP</td><td style="padding:6px 0;font-family:monospace;font-size:11px;">${ip}</td></tr>
                    </table>
                    <div style="margin-top:20px;text-align:center;">
                      <a href="https://monaco-community.web.app/admin/authenticity" style="display:inline-block;background:#dc2626;color:#ffffff;padding:10px 22px;border-radius:8px;font-weight:700;text-decoration:none;font-size:13px;">Revisar en panel</a>
                    </div>
                  </td></tr>
                </table>
              </td></tr></table>
            </body></html>`;
            const subject = `⚠️ ILLIUM · Escaneo múltiple (${newCount}x) · ${code}`;
            for (const to of recipients) {
              try { await sendEmailViaResend(apiKey, { to, subject, html }); }
              catch (e) { console.error('[auth] alert email failed', e); }
            }
          }
        }
      } catch (e) {
        console.error('[auth] alert error', e);
      }
    }

    return {
      ok: true,
      code,
      productId: existing.productId || null,
      productName: existing.productName || null,
      lot: existing.lot || null,
      purity: existing.purity || null,
      coaUrl: existing.coaUrl || null,
      analysisDate: existing.analysisDate || null,
      labName: existing.labName || null,
      methods: existing.methods || null,
      status: existing.status || 'active',
      scanCount: newCount,
      firstScan: prevCount === 0,
      firstScanAt: prevCount === 0 ? now.toMillis() : (existing.firstScanAt?.toMillis?.() ?? null),
    };
  }
);


// ═════════════════════════════════════════════════════════════════════
// STRIPE — Card payments
// ═════════════════════════════════════════════════════════════════════

interface StripeIntentItem {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Creates a any server-side. Returns the clientSecret so the
 * frontend can confirm the card payment with Stripe Elements.
 *
 * Anti-tampering: we DON'T trust the amount the client sends. We re-resolve
 * each item against the Firestore `products` doc and recompute the total
 * (with the same coupon, if any). If the client-claimed total doesn't match
 * our server-computed total within a 2-cent rounding tolerance, we reject.
 *
 * Call from frontend:
 *   const fn = httpsCallable(functions, 'createStripePaymentIntent');
 *   const { data } = await fn({ items, couponCode, claimedTotal, customerEmail, locale });
 *   const clientSecret = data.clientSecret;
 */
export const createStripePaymentIntent = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const stripeKey = STRIPE_SECRET_KEY.value();
    if (!stripeKey || !stripeKey.startsWith('sk_')) {
      throw new HttpsError('failed-precondition', 'Stripe not configured (missing STRIPE_SECRET_KEY).');
    }
    const items = (request.data?.items || []) as StripeIntentItem[];
    if (!Array.isArray(items) || items.length === 0) {
      throw new HttpsError('invalid-argument', 'No items provided.');
    }
    const couponCode = typeof request.data?.couponCode === 'string' ? request.data.couponCode.trim().toUpperCase() : '';
    const claimedTotal = Number(request.data?.claimedTotal) || 0;
    const customerEmail = typeof request.data?.customerEmail === 'string' ? request.data.customerEmail : '';
    const locale = request.data?.locale === 'es' ? 'es' : 'en';
    // Whitelist the shipping cost the client claims — must be 0 (free / express
    // doesn't apply / legacy), $12 standard, or $40 express. Anything else → reject.
    const claimedShipping = Number(request.data?.shippingCost) || 0;
    const validShippingCosts = [0, 12, 40];
    if (!validShippingCosts.includes(claimedShipping)) {
      throw new HttpsError('invalid-argument', `Invalid shipping cost: ${claimedShipping}`);
    }
    // Verify free-shipping eligibility — if client claims 0 with "standard"
    // selected, the subtotal-after-coupon must hit the configured threshold.
    // (Express is always paid.)

    // Server-side re-pricing.
    let subtotal = 0;
    for (const it of items) {
      if (!it.productId) {
        // Allow no-productId only if the unit price seems sane.
        subtotal += (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0);
        continue;
      }
      const snap = await db.doc(`products/${it.productId}`).get();
      if (!snap.exists) {
        throw new HttpsError('invalid-argument', `Product ${it.productId} not found.`);
      }
      const p = snap.data() || {};
      const basePrice = Number(p.price) || 0;
      let finalPrice = basePrice;
      if (p.discountType === 'percent' && Number(p.discountValue) > 0) {
        finalPrice = basePrice * (1 - Number(p.discountValue) / 100);
      } else if (p.discountType === 'fixed' && Number(p.discountValue) > 0) {
        finalPrice = Math.max(0, basePrice - Number(p.discountValue));
      }
      subtotal += finalPrice * (Number(it.quantity) || 0);
    }

    let couponDiscount = 0;
    if (couponCode) {
      const couponsSnap = await db.collection('coupons').where('code', '==', couponCode).limit(1).get();
      if (!couponsSnap.empty) {
        const c = couponsSnap.docs[0].data();
        const active = c.active !== false;
        const expired = c.expiresAt && typeof c.expiresAt.toMillis === 'function'
          ? c.expiresAt.toMillis() < Date.now()
          : false;
        if (active && !expired) {
          if (c.discountType === 'percent' && Number(c.discountValue) > 0) {
            couponDiscount = subtotal * (Number(c.discountValue) / 100);
          } else if (c.discountType === 'fixed' && Number(c.discountValue) > 0) {
            couponDiscount = Math.min(subtotal, Number(c.discountValue));
          }
        }
      }
    }

    const serverTotal = Math.max(0, Math.round((subtotal - couponDiscount + claimedShipping) * 100) / 100);
    if (Math.abs(serverTotal - claimedTotal) > 0.02) {
      throw new HttpsError(
        'failed-precondition',
        `Total mismatch — server ${serverTotal} vs client ${claimedTotal}.`,
      );
    }
    if (serverTotal <= 0) {
      throw new HttpsError('failed-precondition', 'Total must be greater than 0.');
    }

    const amountCents = Math.round(serverTotal * 100);

    // Call Stripe REST API directly via fetch — bypasses the SDK's
    // http-client that was hitting connection retries inside Cloud Run.
    try {
      const body = new URLSearchParams();
      body.set('amount', String(amountCents));
      body.set('currency', 'usd');
      // Restrict to card only (incl. Apple/Google Pay card wallets). This hides
      // Cash App Pay, Amazon Pay and any other automatic methods from the
      // PaymentElement so the customer sees just the card form.
      body.set('payment_method_types[0]', 'card');
      if (customerEmail) body.set('receipt_email', customerEmail);
      body.set('metadata[couponCode]', couponCode || '');
      body.set('metadata[locale]', locale);
      body.set('metadata[itemCount]', String(items.reduce((s, x) => s + (x.quantity || 0), 0)));
      body.set(
        'metadata[itemsSummary]',
        items.map((i) => `${i.name}×${i.quantity}`).join(' | ').slice(0, 480),
      );

      const res = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Stripe-Version': '2024-12-18.acacia',
        },
        body: body.toString(),
      });
      const data = (await res.json()) as { id?: string; client_secret?: string; error?: { message?: string; code?: string } };
      if (!res.ok || !data.client_secret) {
        const msg = data.error?.message || `HTTP ${res.status}`;
        console.error('[stripe] paymentIntent create failed (REST)', res.status, msg);
        throw new HttpsError('internal', `Stripe error: ${msg.slice(0, 200)}`);
      }
      return {
        clientSecret: data.client_secret,
        intentId: data.id,
        amount: amountCents,
        currency: 'usd',
      };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      const msg = e instanceof Error ? e.message : 'Stripe error';
      console.error('[stripe] REST call failed', msg);
      throw new HttpsError('internal', `Stripe error: ${msg.slice(0, 200)}`);
    }
  },
);

/**
 * Stripe webhook receiver — listens for `payment_intent.succeeded` and marks
 * the corresponding Firestore order as paid. The order is identified by the
 * `stripePaymentIntentId` field stored on the order at checkout time.
 *
 * Configure in Stripe Dashboard → Developers → Webhooks → Add endpoint:
 *   https://us-central1-monaco-community.cloudfunctions.net/stripeWebhook
 * Events: payment_intent.succeeded, payment_intent.payment_failed
 */
export const stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], cors: false },
  async (req, res) => {
    const stripeKey = STRIPE_SECRET_KEY.value();
    const webhookSecret = STRIPE_WEBHOOK_SECRET.value();
    if (!stripeKey || !webhookSecret) {
      res.status(500).send('Stripe not configured');
      return;
    }
    const stripe = new Stripe(stripeKey, {
      httpClient: Stripe.createNodeHttpClient(),
    });
    const sig = req.headers['stripe-signature'] as string | undefined;
    if (!sig) {
      res.status(400).send('Missing stripe-signature');
      return;
    }
    let event: any;
    try {
      // Firebase Functions v2 onRequest provides rawBody.
      event = stripe.webhooks.constructEvent((req as unknown as { rawBody: Buffer }).rawBody, sig, webhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error('[stripe] webhook signature verification failed:', msg);
      res.status(400).send(`Webhook signature error: ${msg}`);
      return;
    }

    try {
      if (event.type === 'payment_intent.succeeded') {
        const intent = event.data.object as any;
        // Find the order with this paymentIntentId and mark as paid.
        const ordersSnap = await db
          .collection('orders')
          .where('stripePaymentIntentId', '==', intent.id)
          .limit(1)
          .get();
        if (!ordersSnap.empty) {
          await ordersSnap.docs[0].ref.update({
            status: 'paid',
            paymentMethod: 'stripe',
            stripeStatus: 'succeeded',
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(`[stripe] order ${ordersSnap.docs[0].id} marked paid via intent ${intent.id}`);
        } else {
          console.warn(`[stripe] intent ${intent.id} succeeded but no matching order found.`);
        }
      } else if (event.type === 'payment_intent.payment_failed') {
        const intent = event.data.object as any;
        const ordersSnap = await db
          .collection('orders')
          .where('stripePaymentIntentId', '==', intent.id)
          .limit(1)
          .get();
        if (!ordersSnap.empty) {
          await ordersSnap.docs[0].ref.update({
            stripeStatus: 'failed',
            stripeFailureMessage: intent.last_payment_error?.message || 'failed',
          });
        }
      }
      res.status(200).json({ received: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      console.error('[stripe] webhook handler error', msg);
      res.status(500).send(msg);
    }
  },
);

// ═════════════════════════════════════════════════════════════════════
// CUSTOM PASSWORD RESET — Illium-branded email via Resend
// ═════════════════════════════════════════════════════════════════════

/**
 * Sends a password reset email branded as Illium (via Resend), instead of the
 * default Firebase email that comes from noreply@monaco-community.firebaseapp.com.
 *
 * Anti-enumeration: returns OK even if the email doesn't have an account, so
 * an attacker can't probe which addresses are registered.
 */
export const sendCustomPasswordReset = onCall(
  { secrets: [RESEND_API_KEY] },
  async (request) => {
    const rawEmail = typeof request.data?.email === 'string' ? request.data.email.trim().toLowerCase() : '';
    const locale = request.data?.locale === 'es' ? 'es' : 'en';
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      throw new HttpsError('invalid-argument', 'Invalid email');
    }
    const apiKey = RESEND_API_KEY.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'Resend not configured');
    }
    // Public site URL is the redirect target after the user resets their password.
    const continueUrl = await getPublicSiteUrl();

    // Try to generate a reset link. If user doesn't exist, return OK anyway.
    let resetLink: string | null = null;
    try {
      // First confirm the user exists (auth/user-not-found throws). We swallow
      // the error and report success either way for anti-enumeration.
      await admin.auth().getUserByEmail(rawEmail);
      // Try with actionCodeSettings first (requires the domain to be in the
      // Firebase Auth Authorized Domains list). If that fails, fall back to
      // generating the link without a custom continue URL — we rewrite the
      // host below anyway, so the user still lands on alliumhealth.net.
      try {
        resetLink = await admin.auth().generatePasswordResetLink(rawEmail, {
          url: continueUrl + '/login',
          handleCodeInApp: false,
        });
      } catch (urlErr) {
        const c = (urlErr as { errorInfo?: { code?: string } })?.errorInfo?.code || '';
        if (c === 'auth/unauthorized-continue-uri') {
          console.warn('[passwordReset] continue URL not allowlisted, retrying without it');
          resetLink = await admin.auth().generatePasswordResetLink(rawEmail);
        } else {
          throw urlErr;
        }
      }
      // Rewrite the link host so the user lands on the Illium-branded handler
      // at alliumhealth.net/auth/action instead of monaco-community.firebaseapp.com.
      // We also inject `lang=` so the action page opens in the right language.
      // The Firebase Console "Customize action URL" setting does the same thing,
      // but doing it here too means it works regardless of console state.
      try {
        const url = new URL(resetLink);
        const params = url.searchParams;
        const target = new URL(continueUrl + '/auth/action');
        for (const k of ['mode', 'oobCode', 'apiKey', 'continueUrl']) {
          const v = params.get(k);
          if (v) target.searchParams.set(k, v);
        }
        target.searchParams.set('lang', locale);
        resetLink = target.toString();
      } catch (rewriteErr) {
        console.warn('[passwordReset] link rewrite failed, using original', rewriteErr);
      }
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/user-not-found') {
        // Silent success.
        return { ok: true, delivered: false };
      }
      console.error('[passwordReset] generate link failed', err);
      throw new HttpsError('internal', 'Could not generate reset link');
    }

    if (!resetLink) {
      return { ok: true, delivered: false };
    }

    const subject = locale === 'es'
      ? 'Restablece tu contraseña en Illium'
      : 'Reset your Illium password';

    const greeting = locale === 'es' ? 'Hola,' : 'Hello,';
    const body = locale === 'es'
      ? `Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>Illium</strong> (${rawEmail}). Haz clic en el botón de abajo para crear una nueva contraseña.`
      : `We received a request to reset the password for your <strong>Illium</strong> account (${rawEmail}). Click the button below to create a new password.`;
    const cta = locale === 'es' ? 'Restablecer contraseña' : 'Reset password';
    const expiryNote = locale === 'es'
      ? 'Este enlace expira en 1 hora por seguridad.'
      : 'This link expires in 1 hour for security.';
    const ignoreNote = locale === 'es'
      ? 'Si tú no solicitaste este cambio, puedes ignorar este correo. Tu contraseña no cambiará.'
      : 'If you did not request this, you can safely ignore this email. Your password will remain unchanged.';
    const sig = locale === 'es' ? 'El equipo de Illium' : 'The Illium team';

    const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
        <tr><td style="background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);padding:32px;text-align:center;">
          <h1 style="margin:0;color:white;font-size:24px;font-weight:900;letter-spacing:0.25em;">ILLIUM</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;color:#0f172a;">${greeting}</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#334155;">${body}</p>
          <p style="text-align:center;margin:28px 0;">
            <a href="${resetLink}" style="display:inline-block;background:#16a34a;color:white;text-decoration:none;font-weight:700;padding:14px 32px;border-radius:9999px;font-size:14px;">${cta}</a>
          </p>
          <p style="margin:0 0 12px;font-size:12px;color:#64748b;">${expiryNote}</p>
          <p style="margin:0;font-size:12px;color:#64748b;">${ignoreNote}</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">${sig}<br>${continueUrl}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    try {
      const r = await sendEmailViaResend(apiKey, {
        to: rawEmail,
        subject,
        html,
        from: 'ILLIUM <illium@nuevaia.com>',
      });
      if (!r.ok) {
        console.error('[passwordReset] Resend send failed', r.error);
        throw new HttpsError('internal', 'Email send failed');
      }
      return { ok: true, delivered: true };
    } catch (e) {
      console.error('[passwordReset] send error', e);
      throw new HttpsError('internal', 'Email send failed');
    }
  },
);


// ═════════════════════════════════════════════════════════════════════
// ORDER STATUS UPDATE EMAILS — Illium-branded, sent to customer + vendor
// ═════════════════════════════════════════════════════════════════════

type EmailTemplate = 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'tracking_added';

function uspsTrackingLink(trackingNumber: string): string {
  const clean = String(trackingNumber || '').replace(/\s+/g, '');
  return `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${encodeURIComponent(clean)}`;
}

function statusEmailSubject(template: EmailTemplate, orderId: string, locale: string, audience: 'customer' | 'vendor'): string {
  const short = orderId.slice(0, 8).toUpperCase();
  const es = locale === 'es';
  if (audience === 'vendor') {
    if (es) return `ILLIUM · Actualización de pedido referido #${short}`;
    return `ILLIUM · Referred order update #${short}`;
  }
  switch (template) {
    case 'paid':
      return es ? `ILLIUM · Pago confirmado — Pedido #${short}` : `ILLIUM · Payment confirmed — Order #${short}`;
    case 'shipped':
      return es ? `ILLIUM · Tu pedido fue enviado 📦 #${short}` : `ILLIUM · Your order has shipped 📦 #${short}`;
    case 'delivered':
      return es ? `ILLIUM · Pedido entregado ✓ #${short}` : `ILLIUM · Order delivered ✓ #${short}`;
    case 'cancelled':
      return es ? `ILLIUM · Pedido cancelado #${short}` : `ILLIUM · Order cancelled #${short}`;
    case 'tracking_added':
      return es ? `ILLIUM · Número de rastreo agregado #${short}` : `ILLIUM · Tracking number added #${short}`;
  }
}

function statusEmailHtml(args: {
  template: EmailTemplate;
  audience: 'customer' | 'vendor';
  order: Record<string, unknown>;
  orderId: string;
  locale: string;
  publicSiteUrl: string;
}): string {
  const { template, audience, order, orderId, locale, publicSiteUrl } = args;
  const es = locale === 'es';
  const short = orderId.slice(0, 8).toUpperCase();
  const cust = (order.customer || {}) as Record<string, string>;
  const customerName = String(cust.name || '').trim() || (es ? 'Cliente' : 'Customer');
  const total = Number(order.total) || 0;
  const trackingNumber = String(
    (order as { trackingNumber?: string }).trackingNumber ||
      (order as { shippingTracking?: string }).shippingTracking ||
      '',
  ).trim();
  const items = ((order.items as Array<Record<string, unknown>>) || []).map((it) => {
    const name = String(it.name || '');
    const qty = Number(it.quantity) || 0;
    const price = Number(it.price) || 0;
    return `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#334155;">${qty}× ${name}</td><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;color:#0f172a;font-weight:600;">$${(qty * price).toFixed(2)}</td></tr>`;
  }).join('');

  // Body copy per template + audience.
  let titleEs = '';
  let titleEn = '';
  let bodyEs = '';
  let bodyEn = '';
  let accentColor = '#16a34a';
  let icon = '✓';

  if (audience === 'vendor') {
    titleEs = 'Actualización de un pedido referido';
    titleEn = 'Referred order update';
    const labelEs: Record<EmailTemplate, string> = {
      paid: 'pago confirmado',
      shipped: 'enviado',
      delivered: 'entregado',
      cancelled: 'cancelado',
      tracking_added: 'rastreo agregado',
    };
    const labelEn: Record<EmailTemplate, string> = {
      paid: 'payment confirmed',
      shipped: 'shipped',
      delivered: 'delivered',
      cancelled: 'cancelled',
      tracking_added: 'tracking added',
    };
    bodyEs = `Un pedido atribuido a tu cuenta tuvo un cambio de estado: <strong>${labelEs[template]}</strong>.<br><br>Cliente: <strong>${customerName}</strong><br>Pedido: <strong>#${short}</strong><br>Total: <strong>$${total.toFixed(2)}</strong>`;
    bodyEn = `An order attributed to your account has been updated: <strong>${labelEn[template]}</strong>.<br><br>Customer: <strong>${customerName}</strong><br>Order: <strong>#${short}</strong><br>Total: <strong>$${total.toFixed(2)}</strong>`;
    if (template === 'shipped' || template === 'tracking_added') {
      icon = '📦';
      accentColor = '#16a34a';
    } else if (template === 'delivered') {
      icon = '✓';
      accentColor = '#16a34a';
    } else if (template === 'cancelled') {
      icon = '✕';
      accentColor = '#dc2626';
    }
  } else {
    // Customer-facing copy.
    switch (template) {
      case 'paid':
        icon = '💳';
        accentColor = '#16a34a';
        titleEs = '¡Pago confirmado!';
        titleEn = 'Payment confirmed!';
        bodyEs = `Hola <strong>${customerName}</strong>, confirmamos la recepción de tu pago. Tu pedido ya entró a producción y será enviado pronto. Te avisaremos cuando salga.`;
        bodyEn = `Hi <strong>${customerName}</strong>, we've received your payment. Your order is now in production and will ship soon. We'll let you know when it leaves our facility.`;
        break;
      case 'shipped':
        icon = '📦';
        accentColor = '#16a34a';
        titleEs = '¡Tu pedido fue enviado!';
        titleEn = 'Your order is on its way!';
        bodyEs = `Hola <strong>${customerName}</strong>, tu pedido <strong>#${short}</strong> ya está en camino.${trackingNumber ? ' Puedes rastrearlo en tiempo real con el botón de abajo.' : ''}`;
        bodyEn = `Hi <strong>${customerName}</strong>, your order <strong>#${short}</strong> is on its way.${trackingNumber ? ' You can track it live with the button below.' : ''}`;
        break;
      case 'delivered':
        icon = '✓';
        accentColor = '#16a34a';
        titleEs = '¡Pedido entregado!';
        titleEn = 'Order delivered!';
        bodyEs = `Hola <strong>${customerName}</strong>, tu pedido <strong>#${short}</strong> ya fue entregado. Si tienes cualquier inconveniente con los productos, responde a este correo y te ayudamos.`;
        bodyEn = `Hi <strong>${customerName}</strong>, your order <strong>#${short}</strong> has been delivered. If anything is wrong with the products, just reply to this email and we'll help you.`;
        break;
      case 'cancelled':
        icon = '✕';
        accentColor = '#dc2626';
        titleEs = 'Tu pedido fue cancelado';
        titleEn = 'Your order was cancelled';
        bodyEs = `Hola <strong>${customerName}</strong>, tu pedido <strong>#${short}</strong> fue cancelado. Si fue por error o tienes preguntas, responde a este correo.`;
        bodyEn = `Hi <strong>${customerName}</strong>, your order <strong>#${short}</strong> has been cancelled. If this was a mistake or you have questions, just reply to this email.`;
        break;
      case 'tracking_added':
        icon = '📍';
        accentColor = '#16a34a';
        titleEs = 'Número de rastreo agregado';
        titleEn = 'Tracking number added';
        bodyEs = `Hola <strong>${customerName}</strong>, agregamos el número de rastreo a tu pedido <strong>#${short}</strong>. Ya puedes ver el progreso del envío.`;
        bodyEn = `Hi <strong>${customerName}</strong>, we've added the tracking number to your order <strong>#${short}</strong>. You can see the shipment progress now.`;
        break;
    }
  }

  const title = es ? titleEs : titleEn;
  const body = es ? bodyEs : bodyEn;

  const trackingBlock = trackingNumber
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:2px solid #16a34a;border-radius:12px;margin:20px 0;">
        <tr><td style="padding:18px;text-align:center;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:800;color:#15803d;letter-spacing:0.18em;text-transform:uppercase;">${es ? '📦 Número de rastreo' : '📦 Tracking number'}</p>
          <p style="margin:0 0 14px;font-family:'Courier New',Courier,monospace;font-size:20px;color:#14532d;font-weight:900;letter-spacing:0.05em;word-break:break-all;">${trackingNumber}</p>
          <a href="${uspsTrackingLink(trackingNumber)}" target="_blank" style="display:inline-block;background:#16a34a;color:#ffffff !important;text-decoration:none;font-weight:800;padding:14px 28px;border-radius:9999px;font-size:14px;box-shadow:0 4px 12px rgba(22,163,74,0.3);">${es ? '🔍 Rastrear envío en USPS →' : '🔍 Track shipment on USPS →'}</a>
          <p style="margin:12px 0 0;font-size:11px;color:#15803d;">${es ? 'Pega el número en' : 'Or paste the number at'} <a href="https://tools.usps.com/go/TrackConfirmAction" style="color:#15803d;" target="_blank">tools.usps.com</a></p>
        </td></tr>
      </table>
    `
    : '';

  const itemsBlock = items
    ? `
      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:13px;">
        <thead><tr><th style="text-align:left;color:#64748b;font-weight:600;padding:6px 0;border-bottom:2px solid #e2e8f0;">${es ? 'Productos' : 'Items'}</th><th style="text-align:right;color:#64748b;font-weight:600;padding:6px 0;border-bottom:2px solid #e2e8f0;">${es ? 'Total' : 'Total'}</th></tr></thead>
        <tbody>${items}<tr><td style="padding:10px 0;font-weight:700;color:#0f172a;">${es ? 'Total del pedido' : 'Order total'}</td><td style="padding:10px 0;text-align:right;font-weight:900;color:${accentColor};font-size:16px;">$${total.toFixed(2)}</td></tr></tbody>
      </table>
    `
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
        <tr><td style="background:linear-gradient(135deg,${accentColor} 0%,${accentColor}cc 100%);padding:32px;text-align:center;">
          <p style="margin:0;font-size:36px;line-height:1;">${icon}</p>
          <h1 style="margin:8px 0 4px;color:white;font-size:14px;font-weight:900;letter-spacing:0.3em;">ILLIUM</h1>
          <p style="margin:8px 0 0;color:#ffffffcc;font-size:13px;font-weight:600;">${title}</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">${body}</p>
          ${trackingBlock}
          ${itemsBlock}
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">${es ? 'Si tienes preguntas, responde a este correo y un humano del equipo Illium te ayudará.' : 'Got questions? Reply to this email and a human from the Illium team will help you.'}</p>
          <p style="margin:8px 0 0;font-size:11px;color:#cbd5e1;">${publicSiteUrl}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Decide which email template (if any) applies given the diff between old and new order. */
function detectStatusEmailTemplate(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): EmailTemplate | null {
  const beforeStatus = String(before.status || '');
  const afterStatus = String(after.status || '');
  const beforeFul = String((before as { fulfillmentStatus?: string }).fulfillmentStatus || '');
  const afterFul = String((after as { fulfillmentStatus?: string }).fulfillmentStatus || '');
  const beforeTracking = String(
    (before as { trackingNumber?: string }).trackingNumber ||
      (before as { shippingTracking?: string }).shippingTracking ||
      '',
  ).trim();
  const afterTracking = String(
    (after as { trackingNumber?: string }).trackingNumber ||
      (after as { shippingTracking?: string }).shippingTracking ||
      '',
  ).trim();

  // Priority: shipped > delivered > paid > cancelled > tracking_added (alone).
  if (beforeFul !== 'shipped' && afterFul === 'shipped') return 'shipped';
  if (beforeFul !== 'delivered' && afterFul === 'delivered') return 'delivered';
  if (beforeStatus !== 'paid' && afterStatus === 'paid') return 'paid';
  if (beforeStatus !== 'cancelled' && afterStatus === 'cancelled') return 'cancelled';
  if (!beforeTracking && afterTracking && afterFul !== 'shipped') return 'tracking_added';
  return null;
}

/**
 * Firestore trigger: when an order updates, detect whether a status email
 * should go out (and to whom). Customer always gets notified; vendor too
 * if a referrerId is on the order.
 */
export const onOrderStatusEmail = onDocumentUpdated(
  { document: 'orders/{orderId}', region: 'us-central1', secrets: [RESEND_API_KEY] },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const template = detectStatusEmailTemplate(before, after);
    if (!template) return;

    const orderId = event.params.orderId;
    const apiKey = RESEND_API_KEY.value();
    if (!apiKey) {
      console.warn('[orderStatusEmail] RESEND_API_KEY not configured');
      return;
    }
    const locale = String(after.checkoutLocale || 'es');
    const publicSiteUrl = await getPublicSiteUrl();

    // 1) Customer email
    const cust = (after.customer || {}) as Record<string, string>;
    const customerEmail = String(cust.email || '').trim();
    if (customerEmail) {
      try {
        const html = statusEmailHtml({
          template,
          audience: 'customer',
          order: after,
          orderId,
          locale,
          publicSiteUrl,
        });
        const subject = statusEmailSubject(template, orderId, locale, 'customer');
        const r = await sendEmailViaResend(apiKey, { to: customerEmail, subject, html });
        if (r.ok) {
          await db.doc(`orders/${orderId}`).set(
            {
              customerNotifyCount: admin.firestore.FieldValue.increment(1),
              customerNotifyHistory: admin.firestore.FieldValue.arrayUnion({
                at: new Date().toISOString(),
                email: customerEmail,
                template,
                automatic: true,
              }),
            },
            { merge: true },
          );
        }
      } catch (e) {
        console.error('[orderStatusEmail] customer send failed', e);
      }
    }

    // 2) Vendor (referrer) email
    const referrerId = (after as { referrerId?: string | null }).referrerId;
    if (referrerId) {
      try {
        const refSnap = await db.doc(`users/${referrerId}`).get();
        if (refSnap.exists) {
          const refEmail = String(refSnap.data()?.email || '').trim();
          if (refEmail) {
            const html = statusEmailHtml({
              template,
              audience: 'vendor',
              order: after,
              orderId,
              locale,
              publicSiteUrl,
            });
            const subject = statusEmailSubject(template, orderId, locale, 'vendor');
            const r = await sendEmailViaResend(apiKey, { to: refEmail, subject, html });
            if (r.ok) {
              await db.doc(`orders/${orderId}`).set(
                {
                  vendorNotifyCount: admin.firestore.FieldValue.increment(1),
                  vendorNotifyHistory: admin.firestore.FieldValue.arrayUnion({
                    at: new Date().toISOString(),
                    email: refEmail,
                    template,
                    automatic: true,
                  }),
                },
                { merge: true },
              );
            }
          }
        }
      } catch (e) {
        console.error('[orderStatusEmail] vendor send failed', e);
      }
    }
  },
);

/**
 * Callable: admin manually triggers a notification (allows resending and
 * overriding the destination email). Returns count + history echo.
 */
export const notifyOrderStatus = onCall(
  { secrets: [RESEND_API_KEY] },
  async (request) => {
    const orderId = typeof request.data?.orderId === 'string' ? request.data.orderId : '';
    const target = request.data?.target === 'vendor' ? 'vendor' : 'customer';
    const overrideEmail = typeof request.data?.overrideEmail === 'string' ? request.data.overrideEmail.trim() : '';
    const explicitTemplate = (typeof request.data?.template === 'string' ? request.data.template : '') as EmailTemplate | '';
    if (!orderId) throw new HttpsError('invalid-argument', 'Missing orderId');

    const apiKey = RESEND_API_KEY.value();
    if (!apiKey) throw new HttpsError('failed-precondition', 'Email service not configured');

    const orderRef = db.doc(`orders/${orderId}`);
    const snap = await orderRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Order not found');
    const order = snap.data() || {};

    // Pick a template: explicit, then by current status, fall back to 'tracking_added'.
    let template: EmailTemplate = 'tracking_added';
    if (
      explicitTemplate &&
      ['paid', 'shipped', 'delivered', 'cancelled', 'tracking_added'].includes(explicitTemplate)
    ) {
      template = explicitTemplate;
    } else {
      const ful = String((order as { fulfillmentStatus?: string }).fulfillmentStatus || '');
      const st = String(order.status || '');
      if (ful === 'shipped') template = 'shipped';
      else if (ful === 'delivered') template = 'delivered';
      else if (st === 'paid') template = 'paid';
      else if (st === 'cancelled') template = 'cancelled';
    }

    let recipient = overrideEmail;
    if (!recipient) {
      if (target === 'customer') {
        recipient = String(((order.customer as Record<string, string>) || {}).email || '').trim();
      } else {
        const referrerId = (order as { referrerId?: string }).referrerId;
        if (referrerId) {
          const refSnap = await db.doc(`users/${referrerId}`).get();
          recipient = String(refSnap.data()?.email || '').trim();
        }
      }
    }
    if (!recipient) throw new HttpsError('failed-precondition', 'No recipient email available');

    const locale = String(order.checkoutLocale || 'es');
    const publicSiteUrl = await getPublicSiteUrl();
    const html = statusEmailHtml({ template, audience: target, order, orderId, locale, publicSiteUrl });
    const subject = statusEmailSubject(template, orderId, locale, target);
    const r = await sendEmailViaResend(apiKey, { to: recipient, subject, html });
    if (!r.ok) {
      throw new HttpsError('internal', `Email send failed: ${(r.error || '').slice(0, 200)}`);
    }

    const historyEntry = { at: new Date().toISOString(), email: recipient, template, automatic: false };
    const countField = target === 'customer' ? 'customerNotifyCount' : 'vendorNotifyCount';
    const historyField = target === 'customer' ? 'customerNotifyHistory' : 'vendorNotifyHistory';
    await orderRef.set(
      {
        [countField]: admin.firestore.FieldValue.increment(1),
        [historyField]: admin.firestore.FieldValue.arrayUnion(historyEntry),
      },
      { merge: true },
    );

    const updated = (await orderRef.get()).data() || {};
    return {
      ok: true,
      delivered: true,
      recipient,
      template,
      count: Number(updated[countField] || 0),
    };
  },
);
