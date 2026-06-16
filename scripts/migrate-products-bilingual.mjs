#!/usr/bin/env node
/**
 * Migration: ensure each product has Spanish mirror fields when missing.
 * Copies name → nameEs, description → descriptionEs, benefits → benefitsEs.
 *
 *   export FIREBASE_SERVICE_ACCOUNT="/absolute/path/to/serviceAccount.json"
 *   npm run migrate:bilingual-products
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { getScriptDir, resolveFirebaseCredentialsPath } from './resolve-firebase-credentials.mjs';

const scriptDir = getScriptDir(import.meta.url);
const credPath = resolveFirebaseCredentialsPath(scriptDir);

if (!credPath) {
  console.error('Service account JSON not found. Set FIREBASE_SERVICE_ACCOUNT or place the key at:');
  console.error('  (parent or project folder) monaco-community-firebase-adminsdk-eyuy1-01d9d7084a.json');
  process.exit(1);
}

console.log('Using credentials:', credPath);

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(credPath, 'utf8'))),
});

const db = admin.firestore();
const snap = await db.collection('products').get();
let patched = 0;

for (const doc of snap.docs) {
  const d = doc.data();
  const patch = {};

  if (d.nameEs == null || String(d.nameEs).trim() === '') {
    patch.nameEs = d.name != null ? String(d.name) : '';
  }
  if (d.descriptionEs == null || String(d.descriptionEs).trim() === '') {
    patch.descriptionEs = d.description != null ? String(d.description) : '';
  }
  const ben = Array.isArray(d.benefits) ? d.benefits : [];
  const benEs = Array.isArray(d.benefitsEs) ? d.benefitsEs : [];
  if (benEs.length === 0 && ben.length > 0) {
    patch.benefitsEs = ben;
  }

  if (Object.keys(patch).length > 0) {
    await doc.ref.set(patch, { merge: true });
    patched += 1;
    console.log('patched', doc.id);
  }
}

console.log(`Done. Updated ${patched} of ${snap.size} product documents.`);
process.exit(0);
