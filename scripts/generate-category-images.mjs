#!/usr/bin/env node
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
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
  storageBucket: 'monaco-community.firebasestorage.app',
});
const bucket = getStorage(app).bucket();
const db = getFirestore(app);

const GEMINI_API_KEY = 'AIzaSyD7cE4FKfP6NflltMkHxGNuBg7mRIGDjqM';

const CATEGORIES = [
  {
    slug: 'metabolic',
    name: { en: 'Metabolic & Physical', es: 'Metabólico y Físico' },
    path: '/shop?category=metabolic',
    prompt: 'Multiple dark premium pharmaceutical peptide vials with green metallic caps and dark labels arranged artistically on a dark black surface, moody lighting, luxury medical aesthetic, product photography, dark emerald green accents, minimal composition, shallow depth of field. Fitness and performance theme.',
  },
  {
    slug: 'recovery',
    name: { en: 'Recovery & Regeneration', es: 'Recuperación' },
    path: '/shop?category=recovery',
    prompt: 'Multiple dark premium pharmaceutical peptide vials with green metallic caps arranged near a coiled bandage and a small stone, on a dark moody surface, luxury medical product photography, soft lighting, dark emerald green theme, minimal, shallow depth of field. Healing and regeneration theme.',
  },
  {
    slug: 'nootropics',
    name: { en: 'Nootropics', es: 'Nootrópicos' },
    path: '/shop?category=nootropics',
    prompt: 'Multiple dark premium pharmaceutical peptide vials with green metallic caps and an open anatomy book or brain model on a dark moody surface, luxury medical product photography, soft lighting, dark emerald green theme, minimal, shallow depth of field. Cognition and focus theme.',
  },
  {
    slug: 'nad',
    name: { en: 'NAD+ & Longevity', es: 'NAD+ y Longevidad' },
    path: '/shop?category=nad',
    prompt: 'A single dark premium pharmaceutical NAD+ vial with a green metallic cap glowing against a dark background, luxury medical product photography, ethereal light, dark emerald green theme, minimal, cinematic lighting. Energy and longevity theme.',
  },
  {
    slug: 'blends',
    name: { en: 'Custom Blends', es: 'Mezclas Premium' },
    path: '/shop?category=blends',
    prompt: 'Three dark premium pharmaceutical peptide vials with green metallic caps grouped tightly together on a dark moody surface, luxury medical product photography, soft lighting, dark emerald green theme, minimal, shallow depth of field. Premium blend theme.',
  },
];

async function generateImage(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: `Generate a photo: ${prompt} Wide aspect ratio 4:3.` }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  };
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) { console.error(res.status, (await res.text()).slice(0, 200)); return null; }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith('image/')) {
      return Buffer.from(part.inlineData.data, 'base64');
    }
  }
  return null;
}

async function main() {
  const LOCAL_DIR = path.join(ROOT, 'public', 'category-images');
  fs.mkdirSync(LOCAL_DIR, { recursive: true });

  const finalCategories = [];
  for (const cat of CATEGORIES) {
    console.log(`Generating: ${cat.slug}...`);
    const buf = await generateImage(cat.prompt);
    let imageUrl = '';
    if (buf) {
      const localPath = path.join(LOCAL_DIR, `${cat.slug}.png`);
      fs.writeFileSync(localPath, buf);
      const filename = `categories/${cat.slug}.png`;
      const file = bucket.file(filename);
      await file.save(buf, { metadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000' } });
      await file.makePublic();
      imageUrl = `https://storage.googleapis.com/monaco-community.firebasestorage.app/${filename}`;
      console.log(`  ✓ ${imageUrl}`);
    }
    finalCategories.push({
      name: cat.name.en,
      nameEs: cat.name.es,
      path: cat.path,
      color: 'bg-slate-900 text-white',
      imageUrl,
    });
  }

  await db.doc('settings/general').set({ categories: finalCategories }, { merge: true });
  console.log('\n✓ Categories saved to settings/general');
}

main().catch(console.error);
