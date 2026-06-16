/**
 * Product seed script for Firebase Firestore (Admin SDK).
 *
 * Run with:  npx tsx scripts/seed-products.ts
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountPath = resolve(__dirname, '../../monaco-community-firebase-adminsdk-eyuy1-01d9d7084a.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

interface ProductSeed {
  id: string;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  price: number;
  stock: number;
  category: string;
  img: string;
  benefits: string[];
  benefitsEs: string[];
  protocol?: string;
}

const products: ProductSeed[] = [
  // ═══════════════════════════════════════════════════
  // CATEGORY: Metabolic & Physical Optimization
  // ═══════════════════════════════════════════════════
  {
    id: 'tirzepatide',
    name: 'GLP2-T Peptide',
    nameEs: 'GLP2-T Peptide',
    description: 'Optimizes metabolic function, improves energy efficiency and promotes a more defined and balanced body composition.',
    descriptionEs: 'Optimiza la funci\u00f3n metab\u00f3lica, mejora la eficiencia energ\u00e9tica y favorece una composici\u00f3n corporal m\u00e1s definida y equilibrada.',
    price: 189.00,
    stock: 50,
    category: 'peptides',
    img: 'https://images.unsplash.com/photo-1614948064977-8494916a04cb?auto=format&fit=crop&q=80&w=400&h=400',
    benefits: [
      'Supports Gut Health \u2013 Promotes intestinal integrity and digestive function.',
      'Enhances Nutrient Absorption \u2013 Supports improved absorption and utilization of nutrients.',
      'Reduces Visceral Fat \u2013 Associated with reduction of deep abdominal fat.',
      'Supports Metabolic Function \u2013 Helps regulate metabolism and overall body composition.',
      'Promotes Tissue Repair \u2013 Supports regeneration of intestinal and soft tissues.',
      'Supports Hormonal Balance \u2013 Enhances natural growth hormone activity.',
    ],
    benefitsEs: [
      'Apoya la Salud Intestinal \u2013 Favorece la integridad del intestino y la funci\u00f3n digestiva.',
      'Mejora la Absorci\u00f3n de Nutrientes \u2013 Favorece una mejor absorci\u00f3n y utilizaci\u00f3n de nutrientes.',
      'Reduce la Grasa Visceral \u2013 Asociado con la disminuci\u00f3n de la grasa abdominal profunda.',
      'Apoya la Funci\u00f3n Metab\u00f3lica \u2013 Ayuda a regular el metabolismo y la composici\u00f3n corporal.',
      'Favorece la Reparaci\u00f3n de Tejidos \u2013 Promueve la regeneraci\u00f3n de tejidos intestinales y blandos.',
      'Apoya el Equilibrio Hormonal \u2013 Mejora la actividad natural de la hormona del crecimiento.',
    ],
    protocol: 'metabolic',
  },
  {
    id: 'retatrutide',
    name: 'GLP3-R Peptide',
    nameEs: 'GLP3-R Peptide',
    description: 'Designed to enhance fat metabolism, promote lean muscle development, and improve physical performance while maintaining a balanced physiological state.',
    descriptionEs: 'Desarrollado para potenciar la oxidaci\u00f3n de grasas, promover masa muscular magra y elevar el rendimiento f\u00edsico, respetando el equilibrio natural del organismo.',
    price: 210.00,
    stock: 40,
    category: 'peptides',
    img: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=80&w=400&h=400',
    benefits: [
      'Supports Appetite Control \u2013 Helps regulate hunger signals and reduce cravings.',
      'Promotes Weight Management \u2013 Supports fat loss and improved body composition.',
      'Enhances Metabolic Function \u2013 Improves glucose regulation and metabolic efficiency.',
      'Supports Energy Balance \u2013 Helps maintain stable energy levels throughout the day.',
      'Improves Insulin Sensitivity \u2013 Supports healthy blood sugar response.',
      'Promotes Digestive Regulation \u2013 Supports gastric emptying and satiety signals.',
    ],
    benefitsEs: [
      'Apoya el Control del Apetito \u2013 Ayuda a regular las se\u00f1ales de hambre y reducir los antojos.',
      'Favorece el Control del Peso \u2013 Apoya la p\u00e9rdida de grasa y una mejor composici\u00f3n corporal.',
      'Mejora la Funci\u00f3n Metab\u00f3lica \u2013 Optimiza la regulaci\u00f3n de la glucosa y la eficiencia metab\u00f3lica.',
      'Apoya el Equilibrio Energ\u00e9tico \u2013 Ayuda a mantener niveles de energ\u00eda estables durante el d\u00eda.',
      'Mejora la Sensibilidad a la Insulina \u2013 Favorece una respuesta saludable de la glucosa en sangre.',
      'Favorece la Regulaci\u00f3n Digestiva \u2013 Apoya el vaciamiento g\u00e1strico y las se\u00f1ales de saciedad.',
    ],
    protocol: 'metabolic',
  },
  {
    id: 'mots-c',
    name: 'MOTS-C',
    nameEs: 'MOTS-C',
    description: 'Supports advanced metabolic function, efficient energy utilization, and optimized body composition.',
    descriptionEs: 'Apoya la funci\u00f3n metab\u00f3lica avanzada, la utilizaci\u00f3n eficiente de energ\u00eda y la composici\u00f3n corporal optimizada.',
    price: 145.00,
    stock: 60,
    category: 'peptides',
    img: 'https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&q=80&w=400&h=400',
    benefits: [
      'Supports Metabolic Function \u2013 Helps regulate glucose utilization and overall metabolic balance.',
      'Enhances Fat Metabolism \u2013 Promotes efficient use of fat for energy.',
      'Supports Cellular Energy \u2013 Improves mitochondrial function and energy production.',
      'Enhances Physical Performance \u2013 Supports endurance and exercise capacity.',
      'Supports Insulin Sensitivity \u2013 Associated with improved insulin response and metabolic health.',
      'Promotes Healthy Aging \u2013 Linked to cellular resilience and longevity pathways.',
    ],
    benefitsEs: [
      'Apoya la Funci\u00f3n Metab\u00f3lica \u2013 Ayuda a regular la utilizaci\u00f3n de la glucosa y el equilibrio metab\u00f3lico general.',
      'Optimiza el Metabolismo de Grasas \u2013 Promueve el uso eficiente de la grasa como fuente de energ\u00eda.',
      'Apoya la Energ\u00eda Celular \u2013 Mejora la funci\u00f3n mitocondrial y la producci\u00f3n de energ\u00eda.',
      'Mejora el Rendimiento F\u00edsico \u2013 Favorece la resistencia y la capacidad de ejercicio.',
      'Apoya la Sensibilidad a la Insulina \u2013 Asociado con una mejor respuesta a la insulina y salud metab\u00f3lica.',
      'Promueve un Envejecimiento Saludable \u2013 Vinculado con la resiliencia celular y los procesos de longevidad.',
    ],
    protocol: 'metabolic',
  },
  {
    id: 'tesamorelin',
    name: 'Tesamorelin',
    nameEs: 'Tesamorelin',
    description: 'Clinically studied for its ability to reduce visceral fat, support lean body composition, and enhance growth hormone activity.',
    descriptionEs: 'Estudiado cl\u00ednicamente por su capacidad para reducir la grasa visceral, favorecer la composici\u00f3n corporal magra y potenciar la actividad de la hormona del crecimiento.',
    price: 175.00,
    stock: 45,
    category: 'peptides',
    img: 'https://images.unsplash.com/photo-1628771065518-0d82f1938462?auto=format&fit=crop&q=80&w=400&h=400',
    benefits: [
      'Reduces Visceral Fat \u2013 Clinically associated with reduction of deep abdominal fat.',
      'Supports Lean Body Composition \u2013 Helps preserve lean muscle while improving fat distribution.',
      'Enhances Growth Hormone Activity \u2013 Stimulates natural GH and IGF-1 production.',
      'Supports Metabolic Health \u2013 May improve lipid profiles and overall metabolic function.',
      'Promotes Liver Health \u2013 Studied for reducing liver fat and supporting hepatic function.',
      'Improves Physical Definition \u2013 Contributes to a more refined and sculpted appearance.',
    ],
    benefitsEs: [
      'Reduce la Grasa Visceral \u2013 Asociado cl\u00ednicamente con la disminuci\u00f3n de la grasa abdominal profunda.',
      'Favorece la Composici\u00f3n Corporal Magra \u2013 Ayuda a preservar la masa muscular mientras mejora la distribuci\u00f3n de grasa.',
      'Potencia la Actividad de la Hormona del Crecimiento \u2013 Estimula la producci\u00f3n natural de GH e IGF-1.',
      'Apoya la Salud Metab\u00f3lica \u2013 Puede mejorar el perfil lip\u00eddico y la funci\u00f3n metab\u00f3lica general.',
      'Promueve la Salud Hep\u00e1tica \u2013 Estudiado por su capacidad para reducir la grasa en el h\u00edgado y apoyar su funci\u00f3n.',
      'Mejora la Definici\u00f3n F\u00edsica \u2013 Contribuye a una apariencia m\u00e1s definida y esculpida.',
    ],
    protocol: 'metabolic',
  },
  {
    id: 'cjc-1295-ipamorelin',
    name: 'CJC-1295 + Ipamorelin',
    nameEs: 'CJC-1295 + Ipamorelin',
    description: 'A synergistic growth hormone releasing peptide blend supporting lean muscle development, fat metabolism, recovery, sleep quality, and overall vitality.',
    descriptionEs: 'Una mezcla sin\u00e9rgica de p\u00e9ptidos liberadores de hormona de crecimiento que apoya el desarrollo muscular magro, metabolismo de grasas, recuperaci\u00f3n, calidad del sue\u00f1o y vitalidad general.',
    price: 155.00,
    stock: 70,
    category: 'peptides',
    img: 'https://images.unsplash.com/photo-1614948064977-8494916a04cb?auto=format&fit=crop&q=80&w=400&h=400',
    benefits: [
      'Lean Muscle Development \u2013 Supports muscle growth & strength.',
      'Fat Metabolism \u2013 Helps utilize stored fat as energy.',
      'Recovery \u2013 Enhances muscle repair & tissue regeneration.',
      'Sleep Quality \u2013 Promotes deeper, restorative sleep.',
      'Skin Quality \u2013 Supports collagen production & elasticity.',
      'Bone & Joint Health \u2013 Supports bone density & joint function.',
      'Mental Clarity & Energy \u2013 Promotes focus, energy & cognitive performance.',
    ],
    benefitsEs: [
      'Desarrollo de Masa Muscular Magra \u2013 Favorece el crecimiento muscular y la fuerza.',
      'Metabolismo de Grasas \u2013 Ayuda a utilizar la grasa almacenada como fuente de energ\u00eda.',
      'Recuperaci\u00f3n \u2013 Favorece la reparaci\u00f3n muscular y la regeneraci\u00f3n de tejidos.',
      'Calidad del Sue\u00f1o \u2013 Promueve un sue\u00f1o m\u00e1s profundo y reparador.',
      'Calidad de la Piel \u2013 Favorece la producci\u00f3n de col\u00e1geno y la elasticidad.',
      'Salud \u00d3sea y Articular \u2013 Contribuye a la densidad \u00f3sea y la funci\u00f3n articular.',
      'Claridad Mental y Energ\u00eda \u2013 Favorece la concentraci\u00f3n, la energ\u00eda y el rendimiento cognitivo.',
    ],
    protocol: 'metabolic',
  },

  // ═══════════════════════════════════════════════════
  // CATEGORY: Regenerative & Structural Restoration
  // ═══════════════════════════════════════════════════
  {
    id: 'bpc-157',
    name: 'BPC-157',
    nameEs: 'BPC-157',
    description: 'Body Protection Compound supporting deep tissue repair, structural integrity, and cellular regeneration.',
    descriptionEs: 'Compuesto de Protecci\u00f3n Corporal que optimiza la reparaci\u00f3n tisular profunda, refuerza la integridad estructural y promueve la regeneraci\u00f3n celular.',
    price: 65.00,
    stock: 100,
    category: 'recovery',
    img: 'https://images.unsplash.com/photo-1614948064977-8494916a04cb?auto=format&fit=crop&q=80&w=400&h=400',
    benefits: [
      'Supports Tissue Repair \u2013 Enhances natural healing in muscles, tendons, and ligaments.',
      'Enhances Recovery \u2013 Supports faster recovery from physical stress.',
      'Supports Joint and Tendon Health \u2013 Promotes flexibility, mobility, and connective tissue strength.',
      'Gastrointestinal Support \u2013 Supports gut lining integrity and digestive balance.',
      'Supports Inflammation Balance \u2013 Helps regulate the body\'s inflammatory response.',
      'Promotes Vascular Health \u2013 Supports healthy blood flow and microvascular development.',
    ],
    benefitsEs: [
      'Favorece la Reparaci\u00f3n de Tejidos \u2013 Mejora los procesos naturales de curaci\u00f3n en m\u00fasculos, tendones y ligamentos.',
      'Optimiza la Recuperaci\u00f3n \u2013 Favorece una recuperaci\u00f3n m\u00e1s r\u00e1pida del estr\u00e9s f\u00edsico.',
      'Salud de Articulaciones y Tendones \u2013 Promueve la flexibilidad, movilidad y fortaleza del tejido conectivo.',
      'Soporte Gastrointestinal \u2013 Favorece la integridad del revestimiento intestinal y el equilibrio digestivo.',
      'Equilibrio Inflamatorio \u2013 Ayuda a regular la respuesta inflamatoria del cuerpo.',
      'Salud Vascular \u2013 Favorece una circulaci\u00f3n sangu\u00ednea saludable y el desarrollo microvascular.',
    ],
    protocol: 'recovery',
  },
  {
    id: 'bpc-157-tb-500',
    name: 'BPC-157 + TB-500',
    nameEs: 'BPC-157 + TB-500',
    description: 'A powerful recovery blend combining two leading tissue repair peptides for accelerated healing.',
    descriptionEs: 'Una potente mezcla de recuperaci\u00f3n que combina dos p\u00e9ptidos l\u00edderes en reparaci\u00f3n de tejidos para una curaci\u00f3n acelerada.',
    price: 95.00,
    stock: 80,
    category: 'recovery',
    img: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=80&w=400&h=400',
    benefits: [
      'Supports Tissue Repair \u2013 Promotes healing of muscles, tendons, and ligaments.',
      'Enhances Recovery \u2013 Accelerates recovery from physical stress, training, and minor injuries.',
      'Supports Joint & Mobility Health \u2013 Improves flexibility, movement, and overall joint function.',
      'Reduces Inflammation \u2013 Helps regulate inflammation for improved comfort and recovery.',
      'Promotes Cellular Regeneration \u2013 Supports repair at the cellular level.',
      'Enhances Circulation \u2013 Supports blood flow and nutrient delivery to affected areas.',
    ],
    benefitsEs: [
      'Favorece la Reparaci\u00f3n de Tejidos \u2013 Promueve la recuperaci\u00f3n de m\u00fasculos, tendones y ligamentos.',
      'Optimiza la Recuperaci\u00f3n \u2013 Acelera la recuperaci\u00f3n del estr\u00e9s f\u00edsico y lesiones menores.',
      'Apoya la Salud Articular y la Movilidad \u2013 Mejora la flexibilidad y la funci\u00f3n articular.',
      'Reduce la Inflamaci\u00f3n \u2013 Ayuda a regular la inflamaci\u00f3n para mayor comodidad y recuperaci\u00f3n.',
      'Promueve la Regeneraci\u00f3n Celular \u2013 Favorece la reparaci\u00f3n a nivel celular.',
      'Mejora la Circulaci\u00f3n \u2013 Favorece el flujo sangu\u00edneo y la entrega de nutrientes.',
    ],
    protocol: 'recovery',
  },
  {
    id: 'ghk-cu',
    name: 'GHK-Cu',
    nameEs: 'GHK-Cu',
    description: 'Copper peptide for skin renewal, healing, and anti-aging. Promotes collagen production and protects against oxidative stress.',
    descriptionEs: 'P\u00e9ptido de cobre para la renovaci\u00f3n de la piel, curaci\u00f3n y anti-envejecimiento.',
    price: 55.00,
    stock: 90,
    category: 'peptides',
    img: 'https://images.unsplash.com/photo-1628771065518-0d82f1938462?auto=format&fit=crop&q=80&w=400&h=400',
    benefits: [
      'Supports Skin Renewal \u2013 Promotes collagen production and improves skin firmness.',
      'Enhances Healing \u2013 Supports tissue repair and accelerates skin recovery.',
      'Improves Skin Appearance \u2013 Helps reduce fine lines and supports a smoother texture.',
      'Supports Hair Health \u2013 Associated with improved hair strength and follicle support.',
      'Antioxidant Support \u2013 Helps protect cells from oxidative stress.',
    ],
    benefitsEs: [
      'Favorece la Renovaci\u00f3n de la Piel \u2013 Promueve la producci\u00f3n de col\u00e1geno y mejora la firmeza.',
      'Mejora la Cicatrizaci\u00f3n \u2013 Apoya la reparaci\u00f3n de tejidos y acelera la recuperaci\u00f3n de la piel.',
      'Mejora la Apariencia de la Piel \u2013 Ayuda a reducir l\u00edneas finas y favorece una textura m\u00e1s uniforme.',
      'Apoya la Salud Capilar \u2013 Asociado con una mayor fortaleza del cabello.',
      'Soporte Antioxidante \u2013 Ayuda a proteger las c\u00e9lulas del estr\u00e9s oxidativo.',
    ],
    protocol: 'recovery',
  },
  {
    id: 'glow',
    name: 'GLOW (BPC-157, TB-500 & GHK-Cu)',
    nameEs: 'GLOW (BPC-157, TB-500 y GHK-Cu)',
    description: 'A premium skin regeneration blend combining three powerful peptides for enhanced skin radiance, collagen production, and anti-aging support.',
    descriptionEs: 'Una mezcla premium de regeneraci\u00f3n cut\u00e1nea que combina tres p\u00e9ptidos poderosos para mejorar la luminosidad, col\u00e1geno y soporte anti-envejecimiento.',
    price: 120.00,
    stock: 55,
    category: 'blends',
    img: 'https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&q=80&w=400&h=400',
    benefits: [
      'Enhances Skin Radiance \u2013 Promotes a brighter, more even complexion.',
      'Supports Collagen Production \u2013 Improves skin firmness, elasticity, and texture.',
      'Improves Skin Hydration \u2013 Helps maintain moisture balance.',
      'Supports Skin Repair \u2013 Encourages cellular renewal and recovery.',
      'Reduces Visible Signs of Aging \u2013 Helps soften fine lines and improve skin quality.',
      'Antioxidant Support \u2013 Protects skin from environmental stress and damage.',
    ],
    benefitsEs: [
      'Mejora la Luminosidad de la Piel \u2013 Promueve un tono m\u00e1s uniforme y radiante.',
      'Favorece la Producci\u00f3n de Col\u00e1geno \u2013 Mejora la firmeza, elasticidad y textura de la piel.',
      'Mejora la Hidrataci\u00f3n de la Piel \u2013 Ayuda a mantener el equilibrio de humedad.',
      'Apoya la Reparaci\u00f3n de la Piel \u2013 Favorece la renovaci\u00f3n celular y la recuperaci\u00f3n.',
      'Reduce los Signos Visibles del Envejecimiento \u2013 Ayuda a suavizar l\u00edneas finas.',
      'Soporte Antioxidante \u2013 Protege la piel del estr\u00e9s ambiental y del da\u00f1o oxidativo.',
    ],
    protocol: 'recovery',
  },

  // ═══════════════════════════════════════════════════
  // CATEGORY: Cognitive, Energy & Hormonal Optimization
  // ═══════════════════════════════════════════════════
  {
    id: 'nad-plus',
    name: 'NAD+ 500mg',
    nameEs: 'NAD+ 500mg',
    description: 'Essential coenzyme supporting cognitive performance, cellular energy production, and hormonal balance.',
    descriptionEs: 'Coenzima esencial que apoya el rendimiento cognitivo, la producci\u00f3n de energ\u00eda celular y el equilibrio hormonal.',
    price: 85.00,
    stock: 100,
    category: 'nad',
    img: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=80&w=400&h=400',
    benefits: [
      'Supports Cellular Energy \u2013 Enhances mitochondrial function and ATP production.',
      'Promotes Healthy Aging \u2013 Supports cellular repair and longevity pathways.',
      'Enhances Cognitive Function \u2013 Supports mental clarity, focus, and brain performance.',
      'Supports Metabolic Function \u2013 Helps regulate energy metabolism and cellular efficiency.',
      'Promotes DNA Repair \u2013 Supports cellular repair processes and resilience.',
      'Reduces Fatigue \u2013 Helps improve energy levels and overall vitality.',
    ],
    benefitsEs: [
      'Apoya la Energ\u00eda Celular \u2013 Mejora la funci\u00f3n mitocondrial y la producci\u00f3n de ATP.',
      'Promueve un Envejecimiento Saludable \u2013 Favorece la reparaci\u00f3n celular y los procesos de longevidad.',
      'Mejora la Funci\u00f3n Cognitiva \u2013 Apoya la claridad mental, la concentraci\u00f3n y el rendimiento cerebral.',
      'Apoya la Funci\u00f3n Metab\u00f3lica \u2013 Ayuda a regular el metabolismo energ\u00e9tico y la eficiencia celular.',
      'Favorece la Reparaci\u00f3n del ADN \u2013 Apoya los procesos de reparaci\u00f3n celular y la resiliencia.',
      'Reduce la Fatiga \u2013 Ayuda a mejorar los niveles de energ\u00eda y la vitalidad general.',
    ],
    protocol: 'cognitive',
  },
  {
    id: 'semax',
    name: 'Semax 30mg',
    nameEs: 'Semax 30mg',
    description: 'Nootropic peptide known for cognitive enhancement, sustained concentration, and neuroprotection.',
    descriptionEs: 'P\u00e9ptido nootr\u00f3pico conocido por la mejora cognitiva, la concentraci\u00f3n sostenida y la neuroprotecci\u00f3n.',
    price: 72.00,
    stock: 75,
    category: 'nootropics',
    img: 'https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&q=80&w=400&h=400',
    benefits: [
      'Improves Mental Performance \u2013 Promotes sustained concentration and productivity.',
      'Supports Mood Balance \u2013 Associated with improved mood and reduced mental fatigue.',
      'Neuroprotective Support \u2013 Supports brain health and resilience under stress.',
      'Enhances Stress Response \u2013 Helps regulate the body\'s response to mental stress.',
      'Supports Neurological Function \u2013 Studied for its role in brain function and recovery.',
    ],
    benefitsEs: [
      'Mejora el Rendimiento Mental \u2013 Promueve la concentraci\u00f3n sostenida y la productividad.',
      'Apoya el Equilibrio del Estado de \u00c1nimo \u2013 Asociado con una mejora del \u00e1nimo y reducci\u00f3n de la fatiga mental.',
      'Soporte Neuroprotector \u2013 Favorece la salud cerebral y la resiliencia ante el estr\u00e9s.',
      'Optimiza la Respuesta al Estr\u00e9s \u2013 Ayuda a regular la respuesta del cuerpo al estr\u00e9s mental.',
      'Apoya la Funci\u00f3n Neurol\u00f3gica \u2013 Estudiado por su papel en la funci\u00f3n cerebral y la recuperaci\u00f3n.',
    ],
    protocol: 'cognitive',
  },
  {
    id: 'selank',
    name: 'Selank',
    nameEs: 'Selank',
    description: 'Anxiolytic peptide supporting stress reduction, emotional stability, and cognitive function without sedation.',
    descriptionEs: 'P\u00e9ptido ansiol\u00edtico que favorece la reducci\u00f3n del estr\u00e9s, la estabilidad emocional y la funci\u00f3n cognitiva sin causar sedaci\u00f3n.',
    price: 68.00,
    stock: 65,
    category: 'nootropics',
    img: 'https://images.unsplash.com/photo-1628771065518-0d82f1938462?auto=format&fit=crop&q=80&w=400&h=400',
    benefits: [
      'Supports Stress Reduction \u2013 Promotes a calmer response to stress without sedation.',
      'Supports Mood Balance \u2013 Associated with improved emotional stability and well-being.',
      'Enhances Cognitive Function \u2013 Supports focus, memory, and mental clarity.',
      'Reduces Anxiety Symptoms \u2013 Studied for its role in lowering anxiety levels.',
      'Supports Immune Balance \u2013 May help regulate immune system response.',
      'Promotes Mental Clarity \u2013 Encourages clear thinking and improved cognitive performance.',
    ],
    benefitsEs: [
      'Favorece la Reducci\u00f3n del Estr\u00e9s \u2013 Promueve una respuesta m\u00e1s calmada al estr\u00e9s sin causar sedaci\u00f3n.',
      'Apoya el Equilibrio del Estado de \u00c1nimo \u2013 Asociado con una mayor estabilidad emocional y bienestar.',
      'Mejora la Funci\u00f3n Cognitiva \u2013 Favorece la concentraci\u00f3n, la memoria y la claridad mental.',
      'Reduce los S\u00edntomas de Ansiedad \u2013 Estudiado por su capacidad para disminuir los niveles de ansiedad.',
      'Apoya el Equilibrio del Sistema Inmunol\u00f3gico \u2013 Puede ayudar a regular la respuesta inmunitaria.',
      'Promueve la Claridad Mental \u2013 Favorece un pensamiento claro y un mejor rendimiento cognitivo.',
    ],
    protocol: 'cognitive',
  },
  {
    id: 'pt-141',
    name: 'PT-141',
    nameEs: 'PT-141',
    description: 'A melanocortin receptor agonist supporting sexual desire, arousal, and performance through non-hormonal pathways.',
    descriptionEs: 'Un agonista del receptor melanocort\u00ednico que favorece el deseo sexual, la excitaci\u00f3n y el rendimiento a trav\u00e9s de v\u00edas no hormonales.',
    price: 78.00,
    stock: 50,
    category: 'peptides',
    img: 'https://images.unsplash.com/photo-1614948064977-8494916a04cb?auto=format&fit=crop&q=80&w=400&h=400',
    benefits: [
      'Enhances Sexual Desire \u2013 Acts on the central nervous system to support libido.',
      'Supports Arousal Response \u2013 Promotes improved sexual arousal in both men and women.',
      'Non-Hormonal Mechanism \u2013 Works independently of hormone levels and vascular pathways.',
      'Supports Sexual Performance \u2013 Associated with improved responsiveness.',
      'Targets Brain Pathways \u2013 Activates melanocortin receptors linked to desire and motivation.',
    ],
    benefitsEs: [
      'Aumenta el Deseo Sexual \u2013 Act\u00faa sobre el sistema nervioso central para favorecer la libido.',
      'Apoya la Respuesta de Excitaci\u00f3n \u2013 Promueve una mejor respuesta de excitaci\u00f3n en hombres y mujeres.',
      'Mecanismo No Hormonal \u2013 Act\u00faa de forma independiente de los niveles hormonales.',
      'Mejora el Rendimiento Sexual \u2013 Asociado con una mejor respuesta y experiencia general.',
      'Act\u00faa sobre V\u00edas Cerebrales \u2013 Activa receptores melanocort\u00ednicos relacionados con el deseo y la motivaci\u00f3n.',
    ],
    protocol: 'hormonal',
  },
];

async function seed() {
  console.log(`Seeding ${products.length} products to Firestore...`);

  for (const p of products) {
    const { id, ...data } = p;
    await db.collection('products').doc(id).set(data);
    console.log(`  \u2713 ${id} (${p.name})`);
  }

  console.log('\nDone! All products uploaded successfully.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
