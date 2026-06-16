#!/usr/bin/env node
/**
 * Seed all 13 ILLIUM products from the Spanish & English catalogs
 * into Firestore with bilingual data.
 *
 * Usage: node scripts/seed-all-products.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const serviceAccountPath = path.resolve(ROOT, '..', 'monaco-community-firebase-adminsdk-eyuy1-01d9d7084a.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

const app = initializeApp({
  credential: cert(serviceAccount),
});
const db = getFirestore(app);

// Try to load generated image URLs
let imageUrls = {};
const urlsPath = path.join(ROOT, 'scripts', 'product-image-urls.json');
if (fs.existsSync(urlsPath)) {
  imageUrls = JSON.parse(fs.readFileSync(urlsPath, 'utf-8'));
}

const placeholder = 'https://images.unsplash.com/photo-1614948064977-8494916a04cb?auto=format&fit=crop&q=80&w=400&h=400';

const PRODUCTS = [
  // ═══ CATEGORY: metabolic ═══
  {
    slug: 'tirzepatide',
    name: 'GLP2-T Peptide',
    nameEs: 'GLP2-T Peptide',
    category: 'metabolic',
    price: 149.00,
    stock: 100,
    description: 'A dual GIP/GLP-1 receptor agonist that supports metabolic function, gut health, nutrient absorption, and body composition optimization.',
    descriptionEs: 'Agonista dual de receptores GIP/GLP-1 que apoya la función metabólica, salud intestinal, absorción de nutrientes y optimización de la composición corporal.',
    benefits: [
      'Supports Gut Health',
      'Enhances Nutrient Absorption',
      'Reduces Visceral Fat',
      'Supports Metabolic Function',
      'Promotes Tissue Repair',
      'Supports Hormonal Balance',
    ],
    benefitsEs: [
      'Apoya la Salud Intestinal',
      'Mejora la Absorción de Nutrientes',
      'Reduce la Grasa Visceral',
      'Apoya la Función Metabólica',
      'Favorece la Reparación de Tejidos',
      'Apoya el Equilibrio Hormonal',
    ],
  },
  {
    slug: 'retatrutide',
    name: 'GLP3-R Peptide',
    nameEs: 'GLP3-R Peptide',
    category: 'metabolic',
    price: 159.00,
    stock: 100,
    description: 'A triple agonist (GIP/GLP-1/Glucagon) compound that supports appetite control, weight management, metabolic function, and insulin sensitivity.',
    descriptionEs: 'Compuesto triple agonista (GIP/GLP-1/Glucagón) que apoya el control del apetito, manejo de peso, función metabólica y sensibilidad a la insulina.',
    benefits: [
      'Supports Appetite Control',
      'Promotes Weight Management',
      'Enhances Metabolic Function',
      'Supports Energy Balance',
      'Improves Insulin Sensitivity',
      'Promotes Digestive Regulation',
    ],
    benefitsEs: [
      'Apoya el Control del Apetito',
      'Favorece el Control del Peso',
      'Mejora la Función Metabólica',
      'Apoya el Equilibrio Energético',
      'Mejora la Sensibilidad a la Insulina',
      'Favorece la Regulación Digestiva',
    ],
  },
  {
    slug: 'mots-c',
    name: 'MOTS-C',
    nameEs: 'MOTS-C',
    category: 'metabolic',
    price: 89.00,
    stock: 100,
    description: 'A mitochondrial-derived peptide that supports metabolic function, fat metabolism, cellular energy, physical performance, and healthy aging.',
    descriptionEs: 'Péptido de origen mitocondrial que apoya la función metabólica, metabolismo de grasas, energía celular, rendimiento físico y envejecimiento saludable.',
    benefits: [
      'Supports Metabolic Function',
      'Enhances Fat Metabolism',
      'Supports Cellular Energy',
      'Enhances Physical Performance',
      'Supports Insulin Sensitivity',
      'Promotes Healthy Aging',
    ],
    benefitsEs: [
      'Apoya la Función Metabólica',
      'Optimiza el Metabolismo de Grasas',
      'Apoya la Energía Celular',
      'Mejora el Rendimiento Físico',
      'Apoya la Sensibilidad a la Insulina',
      'Promueve un Envejecimiento Saludable',
    ],
  },
  {
    slug: 'tesamorelin',
    name: 'Tesamorelin',
    nameEs: 'Tesamorelina',
    category: 'metabolic',
    price: 129.00,
    stock: 100,
    description: 'A GHRH analogue clinically associated with reduction of visceral fat, enhanced growth hormone activity, and improved body composition.',
    descriptionEs: 'Análogo de GHRH clínicamente asociado con la reducción de grasa visceral, actividad de hormona de crecimiento y mejora de la composición corporal.',
    benefits: [
      'Reduces Visceral Fat',
      'Supports Lean Body Composition',
      'Enhances Growth Hormone Activity',
      'Supports Metabolic Health',
      'Promotes Liver Health',
      'Improves Physical Definition',
    ],
    benefitsEs: [
      'Reduce la Grasa Visceral',
      'Favorece la Composición Corporal Magra',
      'Potencia la Actividad de la Hormona del Crecimiento',
      'Apoya la Salud Metabólica',
      'Promueve la Salud Hepática',
      'Mejora la Definición Física',
    ],
  },
  {
    slug: 'cjc1295-ipamorelin',
    name: 'CJC-1295 + Ipamorelin',
    nameEs: 'CJC-1295 + Ipamorelina',
    category: 'metabolic',
    price: 119.00,
    stock: 100,
    description: 'A synergistic combination of a GHRH analogue and a growth hormone secretagogue that supports lean muscle, fat metabolism, recovery, and sleep quality.',
    descriptionEs: 'Combinación sinérgica de un análogo GHRH y un secretagogo de hormona de crecimiento que apoya músculo magro, metabolismo de grasas, recuperación y calidad de sueño.',
    benefits: [
      'Lean Muscle Development',
      'Fat Metabolism',
      'Recovery',
      'Sleep Quality',
      'Skin Quality',
      'Bone & Joint Health',
      'Mental Clarity & Energy',
    ],
    benefitsEs: [
      'Desarrollo de Masa Muscular Magra',
      'Metabolismo de Grasas',
      'Recuperación',
      'Calidad del Sueño',
      'Calidad de la Piel',
      'Salud Ósea y Articular',
      'Claridad Mental y Energía',
    ],
  },
  // ═══ CATEGORY: recovery ═══
  {
    slug: 'bpc-157',
    name: 'BPC-157',
    nameEs: 'BPC-157',
    category: 'recovery',
    price: 59.00,
    stock: 100,
    description: 'Body Protection Compound 157 — a pentadecapeptide that supports tissue repair, recovery, joint health, gut integrity, and vascular health.',
    descriptionEs: 'Compuesto de Protección Corporal 157 — un pentadecapéptido que apoya la reparación de tejidos, recuperación, salud articular, integridad intestinal y salud vascular.',
    benefits: [
      'Supports Tissue Repair',
      'Enhances Recovery',
      'Supports Joint and Tendon Health',
      'Gastrointestinal Support',
      'Supports Inflammation Balance',
      'Promotes Vascular Health',
    ],
    benefitsEs: [
      'Favorece la Reparación de Tejidos',
      'Optimiza la Recuperación',
      'Salud de Articulaciones y Tendones',
      'Soporte Gastrointestinal',
      'Equilibrio Inflamatorio',
      'Salud Vascular',
    ],
  },
  {
    slug: 'bpc157-tb500',
    name: 'BPC-157 + TB-500',
    nameEs: 'BPC-157 + TB-500',
    category: 'recovery',
    price: 89.00,
    stock: 100,
    description: 'A powerful healing blend combining BPC-157 and TB-500 for tissue repair, accelerated recovery, joint mobility, inflammation reduction, and enhanced circulation.',
    descriptionEs: 'Mezcla potente de sanación que combina BPC-157 y TB-500 para reparación de tejidos, recuperación acelerada, movilidad articular, reducción de inflamación y mejor circulación.',
    benefits: [
      'Supports Tissue Repair',
      'Enhances Recovery',
      'Supports Joint & Mobility Health',
      'Reduces Inflammation',
      'Promotes Cellular Regeneration',
      'Enhances Circulation',
    ],
    benefitsEs: [
      'Favorece la Reparación de Tejidos',
      'Optimiza la Recuperación',
      'Apoya la Salud Articular y la Movilidad',
      'Reduce la Inflamación',
      'Promueve la Regeneración Celular',
      'Mejora la Circulación',
    ],
  },
  {
    slug: 'ghk-cu',
    name: 'GHK-Cu',
    nameEs: 'GHK-Cu',
    category: 'recovery',
    price: 49.00,
    stock: 100,
    description: 'A copper peptide that supports skin renewal, healing, improved skin appearance, hair health, and antioxidant protection.',
    descriptionEs: 'Péptido de cobre que apoya la renovación cutánea, cicatrización, mejora de apariencia de la piel, salud capilar y protección antioxidante.',
    benefits: [
      'Supports Skin Renewal',
      'Enhances Healing',
      'Improves Skin Appearance',
      'Supports Hair Health',
      'Antioxidant Support',
    ],
    benefitsEs: [
      'Favorece la Renovación de la Piel',
      'Mejora la Cicatrización',
      'Mejora la Apariencia de la Piel',
      'Apoya la Salud Capilar',
      'Soporte Antioxidante',
    ],
  },
  {
    slug: 'glow',
    name: 'Glow (BPC-157, TB-500 & GHK-Cu)',
    nameEs: 'Glow (BPC-157, TB-500 y GHK-Cu)',
    category: 'blends',
    price: 109.00,
    stock: 100,
    description: 'A premium regenerative blend combining BPC-157, TB-500 and GHK-Cu for radiant skin, collagen production, hydration, repair, and anti-aging support.',
    descriptionEs: 'Mezcla regenerativa premium que combina BPC-157, TB-500 y GHK-Cu para piel radiante, producción de colágeno, hidratación, reparación y soporte anti-envejecimiento.',
    benefits: [
      'Enhances Skin Radiance',
      'Supports Collagen Production',
      'Improves Skin Hydration',
      'Supports Skin Repair',
      'Reduces Visible Signs of Aging',
      'Antioxidant Support',
    ],
    benefitsEs: [
      'Mejora la Luminosidad de la Piel',
      'Favorece la Producción de Colágeno',
      'Mejora la Hidratación de la Piel',
      'Apoya la Reparación de la Piel',
      'Reduce los Signos Visibles del Envejecimiento',
      'Soporte Antioxidante',
    ],
  },
  // ═══ CATEGORY: nootropics ═══
  {
    slug: 'nad-plus',
    name: 'NAD+ 500mg',
    nameEs: 'NAD+ 500mg',
    category: 'nad',
    price: 79.00,
    stock: 100,
    description: 'Essential coenzyme for cellular metabolism that supports cellular energy, healthy aging, cognitive function, metabolic health, DNA repair, and reduces fatigue.',
    descriptionEs: 'Coenzima esencial para el metabolismo celular que apoya la energía celular, envejecimiento saludable, función cognitiva, salud metabólica, reparación del ADN y reduce la fatiga.',
    benefits: [
      'Supports Cellular Energy',
      'Promotes Healthy Aging',
      'Enhances Cognitive Function',
      'Supports Metabolic Function',
      'Promotes DNA Repair',
      'Reduces Fatigue',
    ],
    benefitsEs: [
      'Apoya la Energía Celular',
      'Promueve un Envejecimiento Saludable',
      'Mejora la Función Cognitiva',
      'Apoya la Función Metabólica',
      'Favorece la Reparación del ADN',
      'Reduce la Fatiga',
    ],
  },
  {
    slug: 'semax',
    name: 'Semax 30mg',
    nameEs: 'Semax 30mg',
    category: 'nootropics',
    price: 55.00,
    stock: 100,
    description: 'A nootropic peptide that improves mental performance, supports mood balance, provides neuroprotective support, and enhances stress response.',
    descriptionEs: 'Péptido nootrópico que mejora el rendimiento mental, apoya el equilibrio del ánimo, proporciona soporte neuroprotector y mejora la respuesta al estrés.',
    benefits: [
      'Improves Mental Performance',
      'Supports Mood Balance',
      'Neuroprotective Support',
      'Enhances Stress Response',
      'Supports Neurological Function',
    ],
    benefitsEs: [
      'Mejora el Rendimiento Mental',
      'Apoya el Equilibrio del Estado de Ánimo',
      'Soporte Neuroprotector',
      'Optimiza la Respuesta al Estrés',
      'Apoya la Función Neurológica',
    ],
  },
  {
    slug: 'selank',
    name: 'Selank 30mg',
    nameEs: 'Selank 30mg',
    category: 'nootropics',
    price: 55.00,
    stock: 100,
    description: 'An anxiolytic peptide that supports stress reduction, mood balance, cognitive function, anxiety reduction, immune balance, and mental clarity.',
    descriptionEs: 'Péptido ansiolítico que apoya la reducción del estrés, equilibrio del ánimo, función cognitiva, reducción de ansiedad, equilibrio inmune y claridad mental.',
    benefits: [
      'Supports Stress Reduction',
      'Supports Mood Balance',
      'Enhances Cognitive Function',
      'Reduces Anxiety Symptoms',
      'Supports Immune Balance',
      'Promotes Mental Clarity',
    ],
    benefitsEs: [
      'Favorece la Reducción del Estrés',
      'Apoya el Equilibrio del Estado de Ánimo',
      'Mejora la Función Cognitiva',
      'Reduce los Síntomas de Ansiedad',
      'Apoya el Equilibrio del Sistema Inmunológico',
      'Promueve la Claridad Mental',
    ],
  },
  {
    slug: 'pt-141',
    name: 'PT-141',
    nameEs: 'PT-141',
    category: 'peptides',
    price: 69.00,
    stock: 100,
    description: 'A melanocortin receptor agonist that enhances sexual desire, supports arousal response, works via non-hormonal mechanism, and targets brain pathways.',
    descriptionEs: 'Agonista de receptores de melanocortina que aumenta el deseo sexual, apoya la respuesta de excitación, actúa mediante mecanismo no hormonal y activa vías cerebrales.',
    benefits: [
      'Enhances Sexual Desire',
      'Supports Arousal Response',
      'Non-Hormonal Mechanism',
      'Supports Sexual Performance',
      'Targets Brain Pathways',
    ],
    benefitsEs: [
      'Aumenta el Deseo Sexual',
      'Apoya la Respuesta de Excitación',
      'Mecanismo No Hormonal',
      'Mejora el Rendimiento Sexual',
      'Actúa sobre Vías Cerebrales',
    ],
  },
];

async function main() {
  console.log('=== Seeding ILLIUM Products ===\n');

  // Delete existing products first
  const existing = await db.collection('products').get();
  if (!existing.empty) {
    console.log(`Deleting ${existing.size} existing products...`);
    const batch = db.batch();
    existing.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  for (const product of PRODUCTS) {
    const imgUrl = imageUrls[product.slug] || placeholder;
    const docData = {
      name: product.name,
      nameEs: product.nameEs,
      category: product.category,
      price: product.price,
      stock: product.stock,
      img: imgUrl,
      description: product.description,
      descriptionEs: product.descriptionEs,
      benefits: product.benefits,
      benefitsEs: product.benefitsEs,
    };

    const ref = await db.collection('products').add(docData);
    console.log(`  ✓ ${product.name} → ${ref.id}`);
  }

  console.log(`\nDone! Seeded ${PRODUCTS.length} products.`);
}

main().catch(console.error);
