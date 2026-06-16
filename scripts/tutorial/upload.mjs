#!/usr/bin/env node
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const sa = JSON.parse(fs.readFileSync(path.resolve(ROOT, '..', 'monaco-community-firebase-adminsdk-eyuy1-01d9d7084a.json'), 'utf-8'));
const app = initializeApp({ credential: cert(sa), storageBucket: 'monaco-community.firebasestorage.app' });
const bucket = getStorage(app).bucket();

const files = ['illium-tutorial-es.mp4', 'illium-tutorial-en.mp4'];
for (const f of files) {
  const local = path.join(__dirname, 'final', f);
  const remote = `tutorials/${f}`;
  const buf = fs.readFileSync(local);
  const file = bucket.file(remote);
  await file.save(buf, { metadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=31536000' } });
  await file.makePublic();
  console.log(`✓ https://storage.googleapis.com/monaco-community.firebasestorage.app/${remote} (${(buf.length/1024/1024).toFixed(1)} MB)`);
}
