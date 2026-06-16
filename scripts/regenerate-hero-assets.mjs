#!/usr/bin/env node
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const sa = JSON.parse(fs.readFileSync(path.resolve(ROOT, '..', 'monaco-community-firebase-adminsdk-eyuy1-01d9d7084a.json'), 'utf-8'));
const app = initializeApp({ credential: cert(sa), storageBucket: 'monaco-community.firebasestorage.app' });
const bucket = getStorage(app).bucket();
const db = getFirestore(app);
const API_KEY = 'AIzaSyD7cE4FKfP6NflltMkHxGNuBg7mRIGDjqM';

// 1. New age gate image (NOT DNA — use an elegant ILLIUM shield/vial image)
async function genAgeGateImage() {
  console.log('Generating age gate image...');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${API_KEY}`;
  const prompt = `A luxury pharmaceutical brand badge/shield icon for age verification. Elegant rounded shield shape with emerald green gradient (#14532d to #052e16), containing a stylized white letter "I" in serif typography (like ILLIUM brand), with a thin gold checkmark at the bottom. No text other than "I". Premium, minimal, clean on transparent background. 256x256 square.`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    }),
  });
  if (!res.ok) { console.error('Age gate failed', res.status); return; }
  const data = await res.json();
  for (const p of data.candidates?.[0]?.content?.parts || []) {
    if (p.inlineData?.mimeType?.startsWith('image/')) {
      const buf = Buffer.from(p.inlineData.data, 'base64');
      const local = path.join(ROOT, 'public', 'age-gate-icon.png');
      fs.writeFileSync(local, buf);
      const file = bucket.file('branding/age-gate-icon.png');
      await file.save(buf, { metadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000' } });
      await file.makePublic();
      console.log('  ✓ age-gate-icon.png');
      return;
    }
  }
}

// 2. New hero video with ILLIUM brand MORE visible (brighter, white text clear)
async function genHeroVideo() {
  console.log('Generating hero video v2...');
  const MODEL = 'veo-3.0-fast-generate-001';
  const PROMPT = `Cinematic luxury product showcase. A single glass pharmaceutical vial with a shiny emerald green metallic cap sits center-frame on a black reflective surface. The vial has a clearly readable white "ILLIUM" text label that is very bright and prominent. Dramatic backlight makes the vial glow. Slow orbiting camera movement. Volumetric emerald green light beams and floating golden bokeh particles. Extremely bright label text — the word ILLIUM must be the brightest element in the scene. Premium perfume commercial aesthetic, shallow depth of field, 4K cinematic. 8 seconds, no sound.`;

  // Rename old video
  const oldLocal = path.join(ROOT, 'public', 'hero-video.mp4');
  const oldBackup = path.join(ROOT, 'public', 'hero-video-v1.mp4');
  if (fs.existsSync(oldLocal) && !fs.existsSync(oldBackup)) {
    fs.renameSync(oldLocal, oldBackup);
    console.log('  Backed up old video → hero-video-v1.mp4');
  }

  const startUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predictLongRunning?key=${API_KEY}`;
  const startRes = await fetch(startUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: PROMPT }],
      parameters: { aspectRatio: '16:9', durationSeconds: 8, personGeneration: 'allow_all', sampleCount: 1 },
    }),
  });
  const startData = await startRes.json();
  if (!startRes.ok) { console.error('Veo start failed', startRes.status, JSON.stringify(startData).slice(0, 400)); return; }
  const opName = startData.name;
  console.log(`  Operation: ${opName}`);
  console.log('  Polling...');

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${opName}?key=${API_KEY}`);
    const op = await pollRes.json();
    if (op.done) {
      const videos = op.response?.generateVideoResponse?.generatedSamples || op.response?.videos || [];
      if (videos.length > 0) {
        const v = videos[0];
        const uri = v.video?.uri || v.uri;
        const b64 = v.video?.bytesBase64Encoded || v.bytesBase64Encoded;
        let buf;
        if (uri) {
          const sep = uri.includes('?') ? '&' : '?';
          const dlRes = await fetch(`${uri}${sep}key=${API_KEY}`);
          buf = Buffer.from(await dlRes.arrayBuffer());
        } else if (b64) {
          buf = Buffer.from(b64, 'base64');
        }
        if (buf) {
          fs.writeFileSync(path.join(ROOT, 'public', 'hero-video.mp4'), buf);
          const file = bucket.file('branding/hero-video.mp4');
          await file.save(buf, { metadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=31536000' } });
          await file.makePublic();
          await db.doc('settings/general').set({ heroVideoUrl: 'https://storage.googleapis.com/monaco-community.firebasestorage.app/branding/hero-video.mp4' }, { merge: true });
          console.log(`  ✓ hero-video.mp4 (${(buf.length/1024/1024).toFixed(1)} MB)`);
          return;
        }
      }
      console.error('  No video in response');
      return;
    }
    process.stdout.write(`  ${i+1}/60\r`);
  }
  console.error('  Timeout');
}

async function main() {
  await genAgeGateImage();
  await genHeroVideo();
  console.log('\nDone.');
}
main().catch(e => { console.error(e); process.exit(1); });
