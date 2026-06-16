#!/usr/bin/env node
/** Lists products whose name/description reference trademarked drug names. Read-only. */
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { getScriptDir, resolveFirebaseCredentialsPath } from './resolve-firebase-credentials.mjs';

const credPath = resolveFirebaseCredentialsPath(getScriptDir(import.meta.url));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(credPath, 'utf8'))) });
const db = admin.firestore();

const snap = await db.collection('products').get();
console.log(`Total products: ${snap.size}\n`);
const NEEDLES = ['tirzepatide', 'retatrutide', 'pt-141', 'pt141', 'bremelanotide'];
for (const d of snap.docs) {
  const p = d.data();
  const hay = `${p.name || ''} ${p.nameEs || ''} ${p.description || ''} ${p.descriptionEs || ''}`.toLowerCase();
  if (NEEDLES.some((n) => hay.includes(n))) {
    console.log(`--- id=${d.id}`);
    console.log(`  name:        ${JSON.stringify(p.name)}`);
    console.log(`  nameEs:      ${JSON.stringify(p.nameEs)}`);
    console.log(`  description: ${JSON.stringify((p.description || '').slice(0, 240))}`);
    console.log(`  descEs:      ${JSON.stringify((p.descriptionEs || '').slice(0, 240))}`);
    console.log(`  benefits:    ${JSON.stringify(p.benefits)}`);
    console.log(`  benefitsEs:  ${JSON.stringify(p.benefitsEs)}`);
    console.log('');
  }
}
process.exit(0);
