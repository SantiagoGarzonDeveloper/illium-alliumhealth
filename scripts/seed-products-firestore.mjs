#!/usr/bin/env node
/**
 * Seeds the same 4 demo products as the app fallback (App.tsx), with ES fields,
 * into Firestore collection `products` using fixed doc IDs 1–4 (merge writes).
 *
 *   export FIREBASE_SERVICE_ACCOUNT="/absolute/path/to/serviceAccount.json"
 *   npm run seed:products
 *
 * Safe to re-run: uses setDoc(..., { merge: true }).
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { getScriptDir, resolveFirebaseCredentialsPath } from './resolve-firebase-credentials.mjs';

const scriptDir = getScriptDir(import.meta.url);
const credPath = resolveFirebaseCredentialsPath(scriptDir);

if (!credPath) {
  console.error('Service account JSON not found. Set FIREBASE_SERVICE_ACCOUNT or place the key next to package.json / parent folder.');
  process.exit(1);
}

console.log('Using credentials:', credPath);

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(credPath, 'utf8'))),
});

const db = admin.firestore();

const SEED = [
  {
    id: '1',
    name: 'BPC-157 10mg',
    nameEs: 'BPC-157 10 mg',
    price: 45.0,
    stock: 100,
    category: 'peptides',
    description:
      'Body Protection Compound 157 is a pentadecapeptide with remarkable healing properties.',
    descriptionEs:
      'El compuesto de protección corporal 157 es un pentadecapéptido con propiedades de cicatrización notables.',
    benefits: ['Accelerated wound healing', 'Joint and tendon repair', 'Gut health support'],
    benefitsEs: ['Cicatrización acelerada', 'Reparación de articulaciones y tendones', 'Apoyo a la salud intestinal'],
    img: 'https://images.unsplash.com/photo-1614948064977-8494916a04cb?auto=format&fit=crop&q=80&w=400&h=400',
  },
  {
    id: '2',
    name: 'NAD+ 500mg',
    nameEs: 'NAD+ 500 mg',
    price: 48.0,
    stock: 100,
    category: 'nad',
    description: 'NAD+ is essential for cellular metabolism and energy.',
    descriptionEs: 'El NAD+ es esencial para el metabolismo celular y la energía.',
    benefits: ['Energy boost', 'Cellular repair'],
    benefitsEs: ['Más energía', 'Reparación celular'],
    img: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=80&w=400&h=400',
  },
  {
    id: '3',
    name: 'Semax 30mg',
    nameEs: 'Semax 30 mg',
    price: 55.0,
    stock: 100,
    category: 'nootropics',
    description: 'Nootropic peptide known for cognitive enhancement.',
    descriptionEs: 'Péptido nootrópico conocido por el refuerzo cognitivo.',
    benefits: ['Mental focus', 'Memory'],
    benefitsEs: ['Concentración', 'Memoria'],
    img: 'https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&q=80&w=400&h=400',
  },
  {
    id: '4',
    name: 'GHK-Cu 50mg',
    nameEs: 'GHK-Cu 50 mg',
    price: 39.0,
    stock: 100,
    category: 'peptides',
    description: 'Copper peptide for skin and repair.',
    descriptionEs: 'Péptido de cobre para la piel y la reparación tisular.',
    benefits: ['Skin health', 'Hair growth'],
    benefitsEs: ['Salud de la piel', 'Crecimiento capilar'],
    img: 'https://images.unsplash.com/photo-1628771065518-0d82f1938462?auto=format&fit=crop&q=80&w=400&h=400',
  },
];

let written = 0;
for (const row of SEED) {
  const { id, ...data } = row;
  await db.collection('products').doc(id).set(data, { merge: true });
  written += 1;
  console.log('upsert products/', id);
}

console.log(`Done. Upserted ${written} product documents.`);
