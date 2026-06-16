#!/usr/bin/env node
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
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

const GEMINI_API_KEY = 'AIzaSyD7cE4FKfP6NflltMkHxGNuBg7mRIGDjqM';

const MISSING = [
  { slug: 'semax', name: 'Semax' },
  { slug: 'selank', name: 'Selank' },
  { slug: 'pt-141', name: 'PT-141' },
];

const LOCAL_DIR = path.join(ROOT, 'public', 'product-images');

async function generateImage(productName) {
  const prompt = `A single pharmaceutical research peptide vial labeled "ILLIUM ${productName}" on a dark, moody background. The vial has a dark green metallic cap, a dark matte label with elegant white text reading "ILLIUM" at the top and "${productName}" below it, with "Sterile Formula" and "5 mL" at the bottom. Professional product photography, soft studio lighting, dark emerald green and black color scheme, luxury medical aesthetic. No other objects, clean composition, photorealistic.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: `Generate a product photo: ${prompt}` }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`Error for ${productName}:`, res.status, (await res.text()).slice(0, 200));
    return null;
  }
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
  const urls = {};
  // First, rebuild the full URL mapping from known uploaded files
  const ALL_SLUGS = [
    'tirzepatide', 'retatrutide', 'mots-c', 'tesamorelin', 'cjc1295-ipamorelin',
    'bpc-157', 'bpc157-tb500', 'ghk-cu', 'glow', 'nad-plus',
    'semax', 'selank', 'pt-141',
  ];
  for (const slug of ALL_SLUGS) {
    urls[slug] = `https://storage.googleapis.com/monaco-community.firebasestorage.app/products/illium-${slug}.png`;
  }

  for (const product of MISSING) {
    console.log(`Generating: ${product.name}...`);
    const buffer = await generateImage(product.name);
    if (!buffer) {
      console.log(`  SKIP`);
      continue;
    }
    const localPath = path.join(LOCAL_DIR, `illium-${product.slug}.png`);
    fs.writeFileSync(localPath, buffer);

    const filename = `products/illium-${product.slug}.png`;
    const file = bucket.file(filename);
    await file.save(buffer, {
      metadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000' },
    });
    await file.makePublic();
    console.log(`  ✓ uploaded`);
  }

  const mappingPath = path.join(ROOT, 'scripts', 'product-image-urls.json');
  fs.writeFileSync(mappingPath, JSON.stringify(urls, null, 2));
  console.log('URL mapping saved.');
}

main().catch(console.error);
