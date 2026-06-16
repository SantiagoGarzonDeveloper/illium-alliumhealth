#!/usr/bin/env node
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const serviceAccountPath = path.resolve(ROOT, '..', 'monaco-community-firebase-adminsdk-eyuy1-01d9d7084a.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

const app = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);

// ── Strong random password (24 chars: letters + digits + symbols) ──
function genPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const nums = '23456789';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const syms = '!@#$%&*';
  const all = abc + nums + lower + syms;
  const pick = (s) => s[crypto.randomInt(0, s.length)];
  let pw =
    pick(abc) + pick(abc) + pick(lower) + pick(lower) +
    pick(nums) + pick(nums) + pick(syms);
  while (pw.length < 20) pw += pick(all);
  return pw;
}

const ADMIN_EMAIL = 'admin@illium.health';
const ADMIN_NAME = 'ILLIUM Super Admin';

async function main() {
  // 1. Create or find admin user in Firebase Auth
  let password = genPassword();
  let uid;
  try {
    const existing = await auth.getUserByEmail(ADMIN_EMAIL);
    uid = existing.uid;
    // Reset password so we always know it
    await auth.updateUser(uid, { password });
    console.log(`✓ Reset password on existing admin user: ${ADMIN_EMAIL}`);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      const created = await auth.createUser({
        email: ADMIN_EMAIL,
        emailVerified: true,
        password,
        displayName: ADMIN_NAME,
      });
      uid = created.uid;
      console.log(`✓ Created new admin user: ${ADMIN_EMAIL}`);
    } else throw e;
  }

  // 2. Set role:admin in users/{uid}
  await db.doc(`users/${uid}`).set(
    {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      role: 'admin',
      createdAt: new Date().toISOString(),
    },
    { merge: true }
  );
  console.log(`✓ Set role:admin on users/${uid}`);

  // 3. Configure owner WhatsApp numbers (multiple) + add email to adminEmails
  const existingSettings = await db.doc('settings/general').get();
  const existingEmails = Array.isArray(existingSettings.data()?.adminEmails)
    ? existingSettings.data().adminEmails
    : [];
  const adminEmails = Array.from(new Set([...existingEmails, ADMIN_EMAIL.toLowerCase()]));

  const ownerNumbers = [
    { label: 'US · Primario', countryCode: '+1', localNumber: '7867592242' },
    { label: 'CO · Secundario', countryCode: '+57', localNumber: '3104146583' },
  ];

  await db.doc('settings/general').set(
    {
      adminEmails,
      // Legacy single-owner fields (keep first number for back-compat):
      ownerWhatsappCountryCode: ownerNumbers[0].countryCode,
      ownerWhatsappLocalNumber: ownerNumbers[0].localNumber,
      // New multi-number array used by Cloud Functions:
      ownerWhatsappNumbers: ownerNumbers,
    },
    { merge: true }
  );
  console.log(`✓ Saved ${ownerNumbers.length} owner WhatsApp numbers`);
  console.log(`✓ Added ${ADMIN_EMAIL} to adminEmails`);

  // ─────────── PRINT CREDENTIALS ───────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('  ADMIN ACCESS CREDENTIALS');
  console.log('═══════════════════════════════════════════════');
  console.log(`  URL:      https://monaco-community.web.app/login`);
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${password}`);
  console.log('═══════════════════════════════════════════════');
  console.log('\n  GUARDA estas credenciales en un lugar seguro.');
  console.log('  Cambia la contraseña desde /profile después de entrar.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
