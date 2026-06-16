#!/usr/bin/env node
/** Generate hero + wildlife images for Gran Donatón Ambiental page. */
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const sa = JSON.parse(fs.readFileSync(path.resolve(ROOT, '..', 'monaco-community-firebase-adminsdk-eyuy1-01d9d7084a.json'), 'utf-8'));
const app = initializeApp({ credential: cert(sa), storageBucket: 'monaco-community.firebasestorage.app' });
const bucket = getStorage(app).bucket();

const API_KEY = 'AIzaSyD7cE4FKfP6NflltMkHxGNuBg7mRIGDjqM';

const IMAGES = [
  {
    slug: 'hero-cienaga',
    prompt: 'Breathtaking panoramic view of Ciénaga de Barbacoas wetlands in Colombia at golden hour sunset. Lush tropical jungle reflections on calm water, dramatic orange and pink sky, dense green palm trees and foliage on both sides, a few birds flying in the distance. Cinematic nature photography, ultra detailed, professional environmental conservation ad aesthetic, warm golden tones. Aspect 3:2.',
  },
  {
    slug: 'jaguar',
    prompt: 'Majestic wild jaguar close-up portrait in Colombian jungle, intense eyes, dramatic side lighting, green tropical leaves in background, photo-realistic wildlife photography, shallow depth of field. No people.',
  },
  {
    slug: 'manatee',
    prompt: 'Peaceful Antillean manatee swimming in clear Colombian wetland water, underwater light rays filtering through, green aquatic plants, gentle giant, National Geographic style wildlife photography. No people.',
  },
  {
    slug: 'capybara',
    prompt: 'Cute capybara resting in shallow water of a Colombian wetland at sunset, warm golden light, surrounded by reeds, peaceful scene, wildlife photography. No people.',
  },
  {
    slug: 'turpial-bird',
    prompt: 'Vibrant orange and black Turpial bird (Colombia national bird) perched on a tropical tree branch, crisp detail on feathers, lush green jungle blurred in background. Wildlife photo. No people.',
  },
  {
    slug: 'caiman',
    prompt: 'Spectacled caiman with only head emerging from still jungle water, glowing eyes, water lilies around, dramatic low angle, Colombia wetland, wildlife photography. No people.',
  },
  {
    slug: 'tree-planting',
    prompt: 'Close-up of human hands planting a young tree sapling in rich dark soil, jungle background softly blurred, hopeful environmental restoration photograph, warm golden backlight.',
  },
  {
    slug: 'aerial-wetland',
    prompt: 'Aerial drone shot of vast Ciénaga de Barbacoas wetlands in Colombia, winding rivers and green tropical forest, morning mist, breathtaking conservation photography, bird\'s eye view.',
  },
];

async function gen(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    }),
  });
  if (!res.ok) { console.error(res.status, (await res.text()).slice(0, 300)); return null; }
  const data = await res.json();
  for (const p of data.candidates?.[0]?.content?.parts || []) {
    if (p.inlineData?.mimeType?.startsWith('image/')) return Buffer.from(p.inlineData.data, 'base64');
  }
  return null;
}

async function upload(name, buf) {
  const localDir = path.join(ROOT, 'public', 'donaton');
  fs.mkdirSync(localDir, { recursive: true });
  fs.writeFileSync(path.join(localDir, `${name}.png`), buf);

  const file = bucket.file(`donaton/${name}.png`);
  await file.save(buf, { metadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000' } });
  await file.makePublic();
  return `https://storage.googleapis.com/monaco-community.firebasestorage.app/donaton/${name}.png`;
}

async function main() {
  console.log('=== Donatón Ambiental — Image generation ===\n');
  const urls = {};
  for (const img of IMAGES) {
    process.stdout.write(`  ${img.slug}... `);
    const buf = await gen(img.prompt);
    if (!buf) { console.log('✗'); continue; }
    const url = await upload(img.slug, buf);
    urls[img.slug] = url;
    console.log(`✓`);
  }
  const outPath = path.join(ROOT, 'scripts', 'donaton-images.json');
  fs.writeFileSync(outPath, JSON.stringify(urls, null, 2));
  console.log(`\nSaved URLs to ${outPath}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
