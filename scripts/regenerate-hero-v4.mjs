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
  console.log('=== Hero Video v4 — same as v3 but ILLIUM label VERY bright white ===\n');

  // Backup v3
  const cur = path.join(ROOT, 'public', 'hero-video.mp4');
  const v3b = path.join(ROOT, 'public', 'hero-video-v3.mp4');
  if (fs.existsSync(cur) && !fs.existsSync(v3b)) {
    fs.copyFileSync(cur, v3b);
    console.log('Backed up v3 → hero-video-v3.mp4');
  }

  const PROMPT = `Cinematic luxury product video. A single dark glass pharmaceutical vial with a shiny emerald green metallic cap is positioned on the RIGHT side of the frame, slightly angled. The vial has a dark matte label with VERY BRIGHT, GLOWING WHITE serif text "ILLIUM" — the text is the brightest element in the entire scene, almost glowing with a soft white aura. The label text must be extremely clear, crisp, and readable. Deep black background. Emerald green smoke drifts slowly from behind and around the vial. Subtle volumetric green light rays from above-left. Tiny floating emerald particles in the air. Slow gentle camera movement. The LEFT side of the frame is empty dark space. Shallow depth of field. The vial should NOT be too large — medium size, positioned in the right third of the frame. Cinematic color grading: deep blacks, emerald accents, the white ILLIUM text is the focal point. 4K hyperrealistic. 8 seconds. Silent.`;

  const MODEL = 'veo-3.0-fast-generate-001';
  const startRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predictLongRunning?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: PROMPT }],
      parameters: { aspectRatio: '16:9', durationSeconds: 8, personGeneration: 'allow_all', sampleCount: 1 },
    }),
  });
  const startData = await startRes.json();
  if (!startRes.ok) { console.error('Failed', startRes.status, JSON.stringify(startData).slice(0, 400)); return; }
  console.log(`Operation: ${startData.name}\nPolling...`);

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const op = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/${startData.name}?key=${API_KEY}`)).json();
    if (op.done) {
      const videos = op.response?.generateVideoResponse?.generatedSamples || [];
      if (videos.length > 0) {
        const v = videos[0];
        const uri = v.video?.uri || v.uri;
        const b64 = v.video?.bytesBase64Encoded || v.bytesBase64Encoded;
        let buf;
        if (uri) buf = Buffer.from(await (await fetch(`${uri}${uri.includes('?') ? '&' : '?'}key=${API_KEY}`)).arrayBuffer());
        else if (b64) buf = Buffer.from(b64, 'base64');
        if (buf) {
          fs.writeFileSync(path.join(ROOT, 'public', 'hero-video.mp4'), buf);
          const file = bucket.file('branding/hero-video.mp4');
          await file.save(buf, { metadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=31536000' } });
          await file.makePublic();
          await db.doc('settings/general').set({ heroVideoUrl: `https://storage.googleapis.com/monaco-community.firebasestorage.app/branding/hero-video.mp4?v=${Date.now()}` }, { merge: true });
          console.log(`\n✓ hero-video.mp4 v4 (${(buf.length/1024/1024).toFixed(1)} MB)`);
          return;
        }
      }
      console.error('No video'); return;
    }
    process.stdout.write(`  ${i+1}/60\r`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
