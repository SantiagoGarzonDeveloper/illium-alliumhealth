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

async function main() {
  await db.doc('settings/general').set({
    logoUrl: 'https://storage.googleapis.com/monaco-community.firebasestorage.app/branding/illium-logo-light.png',
    logoUrlDark: 'https://storage.googleapis.com/monaco-community.firebasestorage.app/branding/illium-logo-dark.png',
  }, { merge: true });
  console.log('✓ Logo URLs saved to settings/general');
}
main().catch(console.error);
