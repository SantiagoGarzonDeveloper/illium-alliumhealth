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

async function main() {
  console.log('=== Hero Video v3 — vial on the RIGHT, ILLIUM label clear, green smoke ===\n');

  // Backup v2
  const v2Path = path.join(ROOT, 'public', 'hero-video.mp4');
  const v2Backup = path.join(ROOT, 'public', 'hero-video-v2.mp4');
  if (fs.existsSync(v2Path) && !fs.existsSync(v2Backup)) {
    fs.copyFileSync(v2Path, v2Backup);
    console.log('Backed up v2 → hero-video-v2.mp4');
  }

  // Same style as v1 (the one you loved) but vial on the RIGHT + ILLIUM label clearer
  const PROMPT = `Cinematic luxury product presentation for a premium research peptide brand. A single dark glass pharmaceutical vial with a dark emerald green metallic cap is positioned on the RIGHT side of the frame. The vial has a matte black label with elegant white serif text reading "ILLIUM" — the text is clearly readable and well-lit but not overexposed. Deep black background. Subtle emerald green smoke drifts slowly from the left side behind the vial. Volumetric green light rays filter from above. Tiny floating green particles drift gently in the air. Slow hypnotic camera movement. Shallow depth of field. Cinematic color grading: deep blacks, emerald green highlights, minimal contrast. The left side of the frame is mostly empty dark space (for text overlay). Luxury perfume commercial aesthetic. 4K, hyperrealistic. 8 seconds. Silent. Mesmerizing, premium wellness brand mood.`;

  const MODEL = 'veo-3.0-fast-generate-001';
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
  if (!startRes.ok) { console.error('Start failed', startRes.status, JSON.stringify(startData).slice(0, 400)); return; }

  const opName = startData.name;
  console.log(`Operation: ${opName}\nPolling...`);

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${opName}?key=${API_KEY}`);
    const op = await pollRes.json();
    if (op.done) {
      const videos = op.response?.generateVideoResponse?.generatedSamples || [];
      if (videos.length > 0) {
        const v = videos[0];
        const uri = v.video?.uri || v.uri;
        const b64 = v.video?.bytesBase64Encoded || v.bytesBase64Encoded;
        let buf;
        if (uri) {
          const sep = uri.includes('?') ? '&' : '?';
          buf = Buffer.from(await (await fetch(`${uri}${sep}key=${API_KEY}`)).arrayBuffer());
        } else if (b64) {
          buf = Buffer.from(b64, 'base64');
        }
        if (buf) {
          fs.writeFileSync(path.join(ROOT, 'public', 'hero-video.mp4'), buf);
          const file = bucket.file('branding/hero-video.mp4');
          await file.save(buf, { metadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=31536000' } });
          await file.makePublic();
          await db.doc('settings/general').set({
            heroVideoUrl: `https://storage.googleapis.com/monaco-community.firebasestorage.app/branding/hero-video.mp4?v=${Date.now()}`
          }, { merge: true });
          console.log(`\n✓ hero-video.mp4 (${(buf.length/1024/1024).toFixed(1)} MB) — uploaded + settings updated`);
          return;
        }
      }
      console.error('No video in response');
      return;
    }
    process.stdout.write(`  ${i+1}/60\r`);
  }
  console.error('Timeout');
}
main().catch(e => { console.error(e); process.exit(1); });
