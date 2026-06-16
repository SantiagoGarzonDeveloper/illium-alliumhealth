#!/usr/bin/env node
/**
 * Generate the ILLIUM hero background video with Veo 3 Fast.
 * Uploads to Firebase Storage and saves the URL in settings/general.heroVideoUrl
 */

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
// Fast is cheaper and enough for a background loop
const MODEL = 'veo-3.0-fast-generate-001';

const PROMPT = `Cinematic luxury product presentation for ILLIUM, a premium research peptide brand. Slow hypnotic camera orbit around a single dark glass pharmaceutical vial with a dark emerald green metallic cap. The vial has a matte black label with elegant white serif "ILLIUM" typography. Deep black background with subtle emerald green smoke and volumetric light rays flowing from above. Tiny floating glowing green particles drift around the vial. Shallow depth of field. Cinematic color grading: deep blacks, emerald highlights, minimal contrast. 4K, hyperrealistic, luxury perfume commercial aesthetic. No text overlays. Silent. 8 seconds. Slow, mesmerizing, premium wellness brand mood.`;

async function startGeneration() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predictLongRunning?key=${GEMINI_API_KEY}`;
  const body = {
    instances: [{ prompt: PROMPT }],
    parameters: {
      aspectRatio: '16:9',
      durationSeconds: 8,
      personGeneration: 'allow_all',
      sampleCount: 1,
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Veo start error:', res.status, JSON.stringify(data).slice(0, 800));
    process.exit(1);
  }
  return data.name; // operation name
}

async function pollOperation(opName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/${opName}?key=${GEMINI_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data;
}

async function downloadVideo(fileUri) {
  // The response includes a video file URI; fetch it with the API key
  const sep = fileUri.includes('?') ? '&' : '?';
  const res = await fetch(`${fileUri}${sep}key=${GEMINI_API_KEY}`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Download failed ${res.status}: ${t.slice(0, 500)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

async function main() {
  console.log('=== ILLIUM Hero Video (Veo 3 Fast) ===\n');
  console.log(`Model: ${MODEL}`);
  console.log(`Prompt: ${PROMPT.slice(0, 120)}...\n`);

  console.log('Starting generation...');
  const opName = await startGeneration();
  console.log(`Operation: ${opName}\n`);

  console.log('Polling (this takes 1–5 min)...');
  let attempts = 0;
  const maxAttempts = 60; // 60 × 10s = 10 min max
  let op = null;
  while (attempts < maxAttempts) {
    attempts++;
    await new Promise((r) => setTimeout(r, 10000));
    op = await pollOperation(opName);
    if (op.done) break;
    process.stdout.write(`  attempt ${attempts}/${maxAttempts}...\r`);
  }
  if (!op || !op.done) {
    console.error('\nTimeout waiting for Veo generation');
    process.exit(1);
  }

  console.log('\n✓ Generation complete. Response keys:', Object.keys(op.response || {}));

  // Extract video URI
  const videos = op.response?.generateVideoResponse?.generatedSamples
    || op.response?.videos
    || [];

  let videoBytes = null;
  // Try different shapes
  if (Array.isArray(videos) && videos.length > 0) {
    const v = videos[0];
    const uri = v.video?.uri || v.uri || v.video;
    const b64 = v.video?.bytesBase64Encoded || v.bytesBase64Encoded;
    if (uri) {
      console.log(`Video URI: ${uri}`);
      videoBytes = await downloadVideo(uri);
    } else if (b64) {
      videoBytes = Buffer.from(b64, 'base64');
    }
  }

  if (!videoBytes) {
    console.error('Could not extract video from response.');
    console.error(JSON.stringify(op.response, null, 2).slice(0, 1500));
    process.exit(1);
  }

  // Save locally
  const LOCAL_DIR = path.join(ROOT, 'public');
  const localPath = path.join(LOCAL_DIR, 'hero-video.mp4');
  fs.writeFileSync(localPath, videoBytes);
  console.log(`\n✓ Saved local: ${localPath} (${(videoBytes.length / 1024 / 1024).toFixed(2)} MB)`);

  // Upload to Firebase Storage
  const file = bucket.file('branding/hero-video.mp4');
  await file.save(videoBytes, {
    metadata: {
      contentType: 'video/mp4',
      cacheControl: 'public, max-age=31536000',
    },
  });
  await file.makePublic();
  const publicUrl = `https://storage.googleapis.com/monaco-community.firebasestorage.app/branding/hero-video.mp4`;
  console.log(`✓ Uploaded: ${publicUrl}`);

  // Save in settings/general
  await db.doc('settings/general').set({ heroVideoUrl: publicUrl }, { merge: true });
  console.log(`✓ Saved heroVideoUrl in settings/general\n`);
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
