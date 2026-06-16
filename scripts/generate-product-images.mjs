#!/usr/bin/env node
/**
 * Generate product images using Google Gemini Imagen API
 * and upload them to Firebase Storage.
 *
 * Usage: node scripts/generate-product-images.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Firebase Admin init
const serviceAccountPath = path.resolve(ROOT, '..', 'monaco-community-firebase-adminsdk-eyuy1-01d9d7084a.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

const app = initializeApp({
  credential: cert(serviceAccount),
  storageBucket: 'monaco-community.firebasestorage.app',
});
const bucket = getStorage(app).bucket();

const GEMINI_API_KEY = 'AIzaSyD7cE4FKfP6NflltMkHxGNuBg7mRIGDjqM';

const PRODUCTS = [
  { slug: 'tirzepatide', name: 'Tirzepatide' },
  { slug: 'retatrutide', name: 'Retatrutide' },
  { slug: 'mots-c', name: 'MOTS-C' },
  { slug: 'tesamorelin', name: 'Tesamorelin' },
  { slug: 'cjc1295-ipamorelin', name: 'CJC-1295 + Ipamorelin' },
  { slug: 'bpc-157', name: 'BPC-157' },
  { slug: 'bpc157-tb500', name: 'BPC-157 + TB-500' },
  { slug: 'ghk-cu', name: 'GHK-Cu' },
  { slug: 'glow', name: 'Glow' },
  { slug: 'nad-plus', name: 'NAD+' },
  { slug: 'semax', name: 'Semax' },
  { slug: 'selank', name: 'Selank' },
  { slug: 'pt-141', name: 'PT-141' },
];

const LOCAL_DIR = path.join(ROOT, 'public', 'product-images');
fs.mkdirSync(LOCAL_DIR, { recursive: true });

async function generateImage(productName) {
  const prompt = `A single pharmaceutical research peptide vial labeled "ILLIUM ${productName}" on a dark, moody background. The vial has a dark green metallic cap, a dark matte label with elegant white text reading "ILLIUM" at the top and "${productName}" below it, with "Sterile Formula" and "5 mL" at the bottom. Professional product photography, soft studio lighting, dark emerald green and black color scheme, luxury medical aesthetic. No other objects, clean composition, photorealistic.`;

  // Try gemini-3.1-flash-image-preview (image generation capable model)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [{
      parts: [{ text: `Generate a product photo: ${prompt}` }]
    }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Gemini image error for ${productName}: ${res.status} ${errText.slice(0, 200)}`);
    // Fallback to Imagen 4
    return generateImageFallback(productName, prompt);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith('image/')) {
      return Buffer.from(part.inlineData.data, 'base64');
    }
  }

  console.error(`No image in Gemini response for ${productName}, trying Imagen 4...`);
  return generateImageFallback(productName, prompt);
}

async function generateImageFallback(productName, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${GEMINI_API_KEY}`;

  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: '1:1',
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Imagen 4 error for ${productName}: ${res.status} ${errText.slice(0, 200)}`);
    return null;
  }

  const data = await res.json();
  if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
    return Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
  }

  console.error(`No image data from Imagen 4 for ${productName}`);
  return null;
}

async function uploadToFirebase(buffer, slug) {
  const filename = `products/illium-${slug}.png`;
  const file = bucket.file(filename);

  await file.save(buffer, {
    metadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000',
    },
  });

  await file.makePublic();
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
  return publicUrl;
}

async function main() {
  console.log('=== ILLIUM Product Image Generator ===\n');
  const results = {};

  for (const product of PRODUCTS) {
    console.log(`Generating image for: ${product.name}...`);
    try {
      const buffer = await generateImage(product.name);
      if (!buffer) {
        console.log(`  SKIP: No image generated for ${product.name}`);
        continue;
      }

      // Save locally
      const localPath = path.join(LOCAL_DIR, `illium-${product.slug}.png`);
      fs.writeFileSync(localPath, buffer);
      console.log(`  Saved locally: ${localPath}`);

      // Upload to Firebase
      const url = await uploadToFirebase(buffer, product.slug);
      console.log(`  Uploaded: ${url}`);
      results[product.slug] = url;
    } catch (err) {
      console.error(`  ERROR for ${product.name}:`, err.message);
    }
  }

  // Save URL mapping
  const mappingPath = path.join(ROOT, 'scripts', 'product-image-urls.json');
  fs.writeFileSync(mappingPath, JSON.stringify(results, null, 2));
  console.log(`\nURL mapping saved to: ${mappingPath}`);
  console.log('Done!');
}

main().catch(console.error);
