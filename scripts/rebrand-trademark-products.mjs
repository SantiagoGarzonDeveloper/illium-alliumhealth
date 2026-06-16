#!/usr/bin/env node
/**
 * Removes Eli Lilly trademarks (Tirzepatide / Retatrutide) from product names,
 * descriptions and benefits in Firestore, and adds a research-use disclaimer to
 * PT-141 (reframing its overtly human-use claims to a research framing so the
 * disclaimer isn't contradicted on the same page).
 *
 * Idempotent: re-running makes no changes once clean.
 *   node scripts/rebrand-trademark-products.mjs
 */
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { getScriptDir, resolveFirebaseCredentialsPath } from './resolve-firebase-credentials.mjs';

const credPath = resolveFirebaseCredentialsPath(getScriptDir(import.meta.url));
if (!credPath) { console.error('Service account not found'); process.exit(1); }
console.log('Using credentials:', credPath);
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(credPath, 'utf8'))) });
const db = admin.firestore();

// Trademark → safe replacements (order matters: prefixed forms first).
function scrub(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/GLP2-TIRZEPATIDE/gi, 'GLP2-T Peptide')
    .replace(/GLP3-Retatrutide/gi, 'GLP3-R Peptide')
    .replace(/Tirzepatida/gi, 'el péptido GLP2-T')
    .replace(/Tirzepatide/gi, 'GLP2-T Peptide')
    .replace(/Retatrutida/gi, 'el péptido GLP3-R')
    .replace(/Retatrutide/gi, 'GLP3-R Peptide');
}
function scrubArr(arr) {
  return Array.isArray(arr) ? arr.map(scrub) : arr;
}

// PT-141 research reframing (instr. 17 — keep name, add disclaimer).
const PT141_DISCLAIMER_EN =
  ' Research disclaimer: this compound (PT-141 / bremelanotide) is supplied strictly as a reference material for in vitro laboratory research only. It is not for human or animal use, consumption, diagnosis, or treatment.';
const PT141_DISCLAIMER_ES =
  ' Aviso de investigación: este compuesto (PT-141 / bremelanotida) se suministra estrictamente como material de referencia para investigación de laboratorio in vitro. No es para uso ni consumo humano o animal, diagnóstico ni tratamiento.';
const PT141_DESC_EN =
  'A melanocortin (MC) receptor agonist studied via a non-hormonal central nervous system pathway. Provided as a reference compound for melanocortin-pathway research.';
const PT141_DESC_ES =
  'Agonista de receptores de melanocortina (MC) estudiado a través de una vía no hormonal del sistema nervioso central. Se ofrece como compuesto de referencia para investigación de la vía de la melanocortina.';
const PT141_BENEFITS_EN = ['Melanocortin receptor agonist', 'Non-hormonal mechanism', 'CNS pathway research', 'HPLC & MS verified', 'QR authenticity verification'];
const PT141_BENEFITS_ES = ['Agonista de receptores de melanocortina', 'Mecanismo no hormonal', 'Investigación de vías del SNC', 'Verificado por HPLC y MS', 'Verificación de autenticidad por QR'];

const snap = await db.collection('products').get();
let changed = 0;
for (const d of snap.docs) {
  const p = d.data();
  const update = {};

  const newName = scrub(p.name);
  const newNameEs = scrub(p.nameEs);
  const newDesc = scrub(p.description);
  const newDescEs = scrub(p.descriptionEs);
  const newBen = scrubArr(p.benefits);
  const newBenEs = scrubArr(p.benefitsEs);

  if (newName !== p.name) update.name = newName;
  if (newNameEs !== p.nameEs) update.nameEs = newNameEs;
  if (newDesc !== p.description) update.description = newDesc;
  if (newDescEs !== p.descriptionEs) update.descriptionEs = newDescEs;
  if (JSON.stringify(newBen) !== JSON.stringify(p.benefits)) update.benefits = newBen;
  if (JSON.stringify(newBenEs) !== JSON.stringify(p.benefitsEs)) update.benefitsEs = newBenEs;

  // PT-141 special handling (match by name, not id).
  const isPt141 = /pt-?141/i.test(`${p.name || ''} ${p.nameEs || ''}`);
  if (isPt141) {
    const descEn = PT141_DESC_EN + PT141_DISCLAIMER_EN;
    const descEs = PT141_DESC_ES + PT141_DISCLAIMER_ES;
    if (p.description !== descEn) update.description = descEn;
    if (p.descriptionEs !== descEs) update.descriptionEs = descEs;
    if (JSON.stringify(p.benefits) !== JSON.stringify(PT141_BENEFITS_EN)) update.benefits = PT141_BENEFITS_EN;
    if (JSON.stringify(p.benefitsEs) !== JSON.stringify(PT141_BENEFITS_ES)) update.benefitsEs = PT141_BENEFITS_ES;
  }

  if (Object.keys(update).length > 0) {
    await d.ref.set(update, { merge: true });
    changed++;
    console.log(`✔ updated ${d.id}: ${p.name} -> ${update.name || p.name}`);
  }
}
console.log(`\nDone. ${changed} product(s) updated.`);
process.exit(0);
