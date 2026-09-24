// 24-sep-2026: las imágenes de categoría traían vendas, cerebros y frascos "sterile injection".
// Se sustituyen por fotos de frascos ILLIUM del catálogo.
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolveFirebaseCredentialsPath, getScriptDir } from './resolve-firebase-credentials.mjs';
const sa = JSON.parse(readFileSync(resolveFirebaseCredentialsPath(getScriptDir(import.meta.url)), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const FOTO = {
  metabolic: 'illium-mots-c.png', recovery: 'illium-bpc157-tb500.png',
  nootropics: 'illium-semax.png', nad: 'illium-nad-plus.png', blends: 'illium-glow.png',
};
const ref = db.doc('settings/general');
const cats = (await ref.get()).data().categories.map((c) => {
  const slug = new URLSearchParams(c.path.split('?')[1] || '').get('category');
  return FOTO[slug] ? { ...c, imageUrl: `https://alliumhealth.net/product-images/${FOTO[slug]}` } : c;
});
await ref.update({ categories: cats });
console.log(cats.map((c) => c.name + ' → ' + c.imageUrl).join('\n'));
process.exit(0);
