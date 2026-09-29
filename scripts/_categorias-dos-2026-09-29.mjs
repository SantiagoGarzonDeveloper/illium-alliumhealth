// 29-sep-2026 — el cliente pidió dejar SOLO dos categorías: «All products» y «Wholesale».
//
//   node scripts/_categorias-dos-2026-09-29.mjs            → simulación (no escribe nada)
//   node scripts/_categorias-dos-2026-09-29.mjs --aplicar  → aplica
//
// · Antes de escribir guarda un RESPALDO JSON fuera del repo
//   (../respaldos-illium/categorias-<fecha>.json) con la categoría vieja de cada producto
//   y settings/general.categories.
// · En cada producto SOLO escribe el campo `category` (update, nunca set): no toca precio,
//   stock, fotos ni nada más.
// · Idempotente: si un producto ya está en su categoría nueva, no se escribe.
// · Paquetes «(10 vials)» → `wholesale` (los creó el cliente la noche del 28-sep como
//   productos por volumen). Todo lo demás → `peptides` (la general). Un producto que ya
//   esté en `wholesale` se queda ahí.
// · settings/general.categories → las dos tarjetas nuevas de la portada.
//
// Para deshacer: node scripts/_categorias-dos-2026-09-29.mjs --restaurar <respaldo.json> --aplicar
import admin from 'firebase-admin';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { resolveFirebaseCredentialsPath, getScriptDir } from './resolve-firebase-credentials.mjs';

const dir = getScriptDir(import.meta.url);
const APLICAR = process.argv.includes('--aplicar');
const iRest = process.argv.indexOf('--restaurar');
const RESTAURAR = iRest > -1 ? process.argv[iRest + 1] : null;

const sa = JSON.parse(readFileSync(resolveFirebaseCredentialsPath(dir), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const GENERAL = 'peptides';
const WHOLESALE = 'wholesale';
const esPaquete = (name) => /\(\s*\d+\s*vials?\s*\)/i.test(String(name || ''));

const NUEVAS_CATEGORIAS = [
  {
    name: 'Shop All Peptides',
    nameEs: 'Todos los péptidos',
    path: '/shop',
    color: 'bg-slate-900 text-white',
    imageUrl: 'https://alliumhealth.net/product-images/illium-bpc157-tb500.png',
  },
  {
    name: 'Wholesale',
    nameEs: 'Al por mayor',
    path: '/shop?category=wholesale',
    color: 'bg-slate-900 text-white',
    imageUrl: 'https://alliumhealth.net/product-images/illium-glow.png',
  },
];

const snap = await db.collection('products').get();
const settingsRef = db.doc('settings/general');
const settings = (await settingsRef.get()).data() || {};

if (RESTAURAR) {
  const r = JSON.parse(readFileSync(RESTAURAR, 'utf8'));
  let n = 0;
  for (const p of r.productos) {
    const d = snap.docs.find((x) => x.id === p.id);
    if (!d || d.data().category === p.category) continue;
    console.log(`${APLICAR ? 'RESTAURA' : '(sim) restauraría'} ${p.name}: ${d.data().category} → ${p.category}`);
    if (APLICAR) await d.ref.update({ category: p.category });
    n++;
  }
  if (APLICAR && Array.isArray(r.settingsCategories)) await settingsRef.update({ categories: r.settingsCategories });
  console.log(`Listo: ${n} productos ${APLICAR ? 'restaurados' : 'por restaurar'}.`);
  process.exit(0);
}

// 1) Respaldo (siempre, también en simulación)
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const carpeta = join(dir, '..', '..', 'respaldos-illium');
mkdirSync(carpeta, { recursive: true });
const respaldo = join(carpeta, `categorias-${stamp}.json`);
writeFileSync(
  respaldo,
  JSON.stringify(
    {
      creado: new Date().toISOString(),
      productos: snap.docs.map((d) => ({ id: d.id, name: d.data().name, category: d.data().category ?? null })),
      settingsCategories: settings.categories ?? null,
    },
    null,
    2,
  ),
);
console.log('Respaldo:', respaldo);

// 2) Productos → solo el campo category
let cambios = 0;
const resumen = { [GENERAL]: 0, [WHOLESALE]: 0 };
for (const d of snap.docs) {
  const x = d.data();
  const actual = String(x.category || '');
  const nueva = actual === WHOLESALE || esPaquete(x.name) ? WHOLESALE : GENERAL;
  resumen[nueva]++;
  if (actual === nueva) continue;
  cambios++;
  console.log(`${APLICAR ? 'CAMBIA' : '(sim)'} ${String(x.name).trim()}: ${actual || '∅'} → ${nueva}`);
  if (APLICAR) await d.ref.update({ category: nueva });
}

// 3) Tarjetas de categorías de la portada
const iguales = JSON.stringify(settings.categories) === JSON.stringify(NUEVAS_CATEGORIAS);
if (!iguales) {
  console.log(`${APLICAR ? 'CAMBIA' : '(sim)'} settings/general.categories → Shop All Peptides + Wholesale`);
  if (APLICAR) await settingsRef.update({ categories: NUEVAS_CATEGORIAS });
}

console.log(
  `\n${snap.size} productos · ${cambios} ${APLICAR ? 'actualizados' : 'por actualizar'} · general=${resumen[GENERAL]} · wholesale=${resumen[WHOLESALE]}` +
    (APLICAR ? '' : '\n(Simulación. Para aplicar: --aplicar)'),
);
process.exit(0);
