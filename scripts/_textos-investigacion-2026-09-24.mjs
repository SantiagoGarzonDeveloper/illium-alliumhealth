// 24-sep-2026: el cliente pidió quitar todo lenguaje de uso humano de la web pública.
// Reescribe nombres de categoría y las descripciones con beneficios humanos.
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolveFirebaseCredentialsPath, getScriptDir } from './resolve-firebase-credentials.mjs';
const sa = JSON.parse(readFileSync(resolveFirebaseCredentialsPath(getScriptDir(import.meta.url)), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const NOMBRES = {
  metabolic: ['GLP & Peptide Analogs', 'Análogos GLP y péptidos'],
  recovery: ['BPC · TB · GHK Peptides', 'Péptidos BPC · TB · GHK'],
  nootropics: ['Neuropeptides', 'Neuropéptidos'],
  nad: ['NAD+', 'NAD+'],
  blends: ['Blends', 'Mezclas'],
};
const ref = db.doc('settings/general');
const cats = (await ref.get()).data().categories.map((c) => {
  const slug = new URLSearchParams(c.path.split('?')[1] || '').get('category');
  const n = NOMBRES[slug];
  return n ? { ...c, name: n[0], nameEs: n[1] } : c;
});
await ref.update({
  categories: cats,
  categoriesSectionTitle: 'Browse by category',
  categoriesSectionTitleEs: 'Explora por categoría',
});

const NAD = {
  description: 'High-purity NAD+ (nicotinamide adenine dinucleotide) research compound, supplied as a lyophilized powder. Studied in in vitro research on cellular redox chemistry and mitochondrial enzyme activity. HPLC & MS verified, with a certificate of analysis per batch. For laboratory research use only.',
  descriptionEs: 'Compuesto de investigación NAD+ (dinucleótido de nicotinamida y adenina) de alta pureza, en polvo liofilizado. Estudiado en investigación in vitro sobre química redox celular y actividad de enzimas mitocondriales. Verificado por HPLC y MS, con certificado de análisis por lote. Solo para investigación de laboratorio.',
  benefits: ['99%+ purity (HPLC & MS)', 'Lyophilized powder', 'Certificate of analysis per batch', 'In vitro research on cellular redox chemistry', 'For laboratory research use only'],
  benefitsEs: ['Pureza 99%+ (HPLC y MS)', 'Polvo liofilizado', 'Certificado de análisis por lote', 'Investigación in vitro sobre química redox celular', 'Solo para investigación de laboratorio'],
};
const BPC = {
  description: 'Research blend of BPC-157 and TB-500 in a single lyophilized vial. Both peptides are studied in in vitro research on cell migration and angiogenesis signaling. HPLC & MS verified, with a certificate of analysis per batch. For laboratory research use only.',
  descriptionEs: 'Mezcla de investigación de BPC-157 y TB-500 en un solo vial liofilizado. Ambos péptidos se estudian en investigación in vitro sobre migración celular y señalización de angiogénesis. Verificada por HPLC y MS, con certificado de análisis por lote. Solo para investigación de laboratorio.',
  benefits: ['BPC-157 + TB-500 in one vial', '99%+ purity (HPLC & MS)', 'Lyophilized powder', 'Certificate of analysis per batch', 'For laboratory research use only'],
  benefitsEs: ['BPC-157 + TB-500 en un solo vial', 'Pureza 99%+ (HPLC y MS)', 'Polvo liofilizado', 'Certificado de análisis por lote', 'Solo para investigación de laboratorio'],
};
await db.doc('products/JRCSsm7eeVOFmXpsf7fB').update(NAD);
await db.doc('products/JmGil5EJbGkSpkNsKx2g').update(BPC);
await db.doc('products/cGM9l2OvGRbqPCtAOrFx').update(BPC);
console.log('listo');
process.exit(0);
