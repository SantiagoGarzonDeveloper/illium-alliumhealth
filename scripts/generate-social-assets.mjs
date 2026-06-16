#!/usr/bin/env node
/**
 * Generate:
 *  - favicon (green "I" on dark bg, 512x512 PNG + SVG)
 *  - og-image (1200x630 social share card)
 * Uploads to Firebase Storage.
 */
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

async function generateImage(prompt) {
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
  if (!res.ok) { console.error(res.status, (await res.text()).slice(0, 300)); return null; }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    if (p.inlineData?.mimeType?.startsWith('image/')) {
      return Buffer.from(p.inlineData.data, 'base64');
    }
  }
  return null;
}

async function upload(localPath, bucketPath, buffer) {
  fs.writeFileSync(localPath, buffer);
  const file = bucket.file(bucketPath);
  await file.save(buffer, { metadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000' } });
  await file.makePublic();
  return `https://storage.googleapis.com/monaco-community.firebasestorage.app/${bucketPath}`;
}

async function main() {
  const pub = path.join(ROOT, 'public');

  // 1) Favicon PNG (512x512, square, dark+green)
  console.log('Generating favicon (512x512)...');
  const faviconBuf = await generateImage(
    `App icon for a luxury pharmaceutical brand called ILLIUM. A bold serif capital letter "I" in white, centered on a dark emerald green to black radial gradient background, rounded square. No other text, no decorations. Premium logo aesthetic. 512x512 aspect ratio 1:1, perfectly square. Sharp edges, high contrast, easily readable at 16x16 pixels.`
  );
  if (faviconBuf) {
    const url = await upload(path.join(pub, 'favicon-512.png'), 'branding/favicon-512.png', faviconBuf);
    console.log(`  ✓ ${url}`);
    // Also save as favicon-32.png (browsers will scale)
    fs.writeFileSync(path.join(pub, 'favicon.png'), faviconBuf);
  } else {
    console.log('  favicon failed, will use SVG fallback');
  }

  // 2) Apple touch icon (same image, different name)
  if (faviconBuf) {
    fs.writeFileSync(path.join(pub, 'apple-touch-icon.png'), faviconBuf);
  }

  // 3) OG image (1200x630)
  console.log('\nGenerating OG share image (1200x630)...');
  const ogBuf = await generateImage(
    `Social media preview banner 1200x630 for ILLIUM luxury research peptide brand. Layout: centered large white serif text "ILLIUM" as main title, below in smaller text "Advanced Research Peptides · 99%+ Purity · HPLC & MS Tested". Background: dark black to emerald green gradient with subtle glowing particles, a single dark glass vial with green metallic cap on the right side in shadow. Premium wellness brand aesthetic. Wide banner aspect ratio 1.91:1 (Facebook/WhatsApp share card format).`
  );
  if (ogBuf) {
    const url = await upload(path.join(pub, 'og-image.png'), 'branding/og-image.png', ogBuf);
    console.log(`  ✓ ${url}`);
  }

  // 4) SVG favicon (scalable)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#15803d"/>
      <stop offset="100%" stop-color="#052e16"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <text x="32" y="46" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="900" font-size="42" fill="white" letter-spacing="-2">I</text>
</svg>`;
  fs.writeFileSync(path.join(pub, 'favicon.svg'), svg);
  console.log('\n✓ SVG favicon written');

  console.log('\nDone.');
}
main().catch((e) => { console.error(e); process.exit(1); });
