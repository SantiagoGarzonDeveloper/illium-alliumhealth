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

async function generateLogo(variant) {
  // variant: 'dark' | 'light' - we'll generate the dark one first, then colors
  const prompt = variant === 'dark'
    ? `A horizontal wordmark logo that reads "ILLIUM" in elegant classical serif typography (Roman serif style, similar to Trajan or Bodoni). The letters are crisp white on a pure transparent background (alpha channel). Wide letter spacing (tracking) between each letter. Minimalist, luxury pharmaceutical brand aesthetic. No icon, no decoration, no background, just the clean serif wordmark. High resolution, very sharp edges, premium editorial quality. The word should be perfectly centered and fill most of the canvas width. Aspect ratio: horizontal banner 4:1. PNG with transparency.`
    : `A horizontal wordmark logo that reads "ILLIUM" in elegant classical serif typography (Roman serif style, similar to Trajan or Bodoni). The letters are crisp dark green (#14532d) on a pure transparent background (alpha channel). Wide letter spacing (tracking) between each letter. Minimalist, luxury pharmaceutical brand aesthetic. No icon, no decoration, no background, just the clean serif wordmark. High resolution, very sharp edges, premium editorial quality. The word should be perfectly centered and fill most of the canvas width. Aspect ratio: horizontal banner 4:1. PNG with transparency.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`Error ${variant}:`, res.status, (await res.text()).slice(0, 400));
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
  const LOCAL_DIR = path.join(ROOT, 'public');

  for (const variant of ['dark', 'light']) {
    console.log(`Generating ${variant} logo...`);
    const buffer = await generateLogo(variant);
    if (!buffer) {
      console.log(`  FAILED`);
      continue;
    }
    const filename = `illium-logo-${variant}.png`;
    const localPath = path.join(LOCAL_DIR, filename);
    fs.writeFileSync(localPath, buffer);

    const file = bucket.file(`branding/${filename}`);
    await file.save(buffer, {
      metadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000' },
    });
    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/monaco-community.firebasestorage.app/branding/${filename}`;
    console.log(`  ✓ ${publicUrl}`);
  }
}

main().catch(console.error);
