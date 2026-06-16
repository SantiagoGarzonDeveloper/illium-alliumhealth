#!/usr/bin/env node
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const serviceAccountPath = path.resolve(ROOT, '..', 'monaco-community-firebase-adminsdk-eyuy1-01d9d7084a.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

await db.doc('settings/general').set({
  // Meta WhatsApp config
  metaWhatsappPhoneNumberId: '741757739028910', // "Nueva IA Chat" (+57 324 2455799)
  metaWhatsappWabaId: '104990149152559',
  // Legacy template fields kept for backwards compat but functions now pick per event:
  metaWhatsappTemplateName: 'illium_new_affiliate',
  metaWhatsappTemplateLang: 'es_MX',
  metaWhatsappTemplateBodyVariables: 2,
}, { merge: true });

console.log('✓ Meta WhatsApp settings saved to settings/general');
console.log('  - phoneNumberId: 741757739028910');
console.log('  - WABA ID: 104990149152559');
console.log('  - Each Cloud Function will pick the matching illium_* template automatically.');
