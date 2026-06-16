#!/usr/bin/env node
/** Generate TTS narration for each chapter in ES + EN using Gemini TTS. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CHAPTERS } from './narrations.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'audio');
fs.mkdirSync(OUT, { recursive: true });

const API_KEY = 'AIzaSyD7cE4FKfP6NflltMkHxGNuBg7mRIGDjqM';
const MODEL = 'gemini-2.5-flash-preview-tts';

// Gemini prebuilt voices. Charon=warm narrator, Kore=friendly female.
const VOICE_ES = 'Charon';
const VOICE_EN = 'Aoede';

/** Convert raw PCM 24kHz mono 16-bit LE from Gemini to WAV with header. */
function pcmToWav(pcm, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM format chunk size
  header.writeUInt16LE(1, 20);  // PCM format (1)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

async function tts(text, voice) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`TTS ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    if (p.inlineData?.mimeType?.startsWith('audio/')) {
      return Buffer.from(p.inlineData.data, 'base64');
    }
  }
  throw new Error('No audio in response');
}

async function main() {
  console.log('=== ILLIUM Tutorial TTS ===\n');
  for (const ch of CHAPTERS) {
    for (const lang of ['es', 'en']) {
      const text = ch[lang];
      const voice = lang === 'es' ? VOICE_ES : VOICE_EN;
      process.stdout.write(`  ${ch.id} [${lang}] (${voice})... `);
      try {
        const pcm = await tts(text, voice);
        const wav = pcmToWav(pcm);
        const out = path.join(OUT, `${ch.id}-${lang}.wav`);
        fs.writeFileSync(out, wav);
        console.log(`✓ ${(wav.length / 1024).toFixed(0)} KB`);
      } catch (e) {
        console.log(`✗ ${e.message}`);
      }
    }
  }
  console.log('\nDone.');
}
main().catch((e) => { console.error(e); process.exit(1); });
