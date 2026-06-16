#!/usr/bin/env node
/** Combine recorded WebM + TTS WAV into a single MP4 per language,
 *  with intro/outro titles. Output: tutorial-es.mp4, tutorial-en.mp4 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CHAPTERS } from './narrations.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR_VIDEO = path.join(__dirname, 'video-raw');
const DIR_AUDIO = path.join(__dirname, 'audio');
const DIR_TMP = path.join(__dirname, 'tmp');
const DIR_OUT = path.join(__dirname, 'final');
fs.mkdirSync(DIR_TMP, { recursive: true });
fs.mkdirSync(DIR_OUT, { recursive: true });

function sh(cmd) {
  console.log(`$ ${cmd.slice(0, 200)}${cmd.length > 200 ? '…' : ''}`);
  execSync(cmd, { stdio: 'inherit' });
}

function audioDuration(file) {
  const out = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`, { encoding: 'utf8' });
  return parseFloat(out.trim());
}

function videoDuration(file) {
  const out = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`, { encoding: 'utf8' });
  return parseFloat(out.trim());
}

function escFF(txt) {
  return txt.replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function buildChapter(chapter, lang) {
  const videoRaw = path.join(DIR_VIDEO, `${chapter.id}.webm`);
  const audio = path.join(DIR_AUDIO, `${chapter.id}-${lang}.wav`);
  const outMp4 = path.join(DIR_TMP, `${chapter.id}-${lang}.mp4`);

  if (!fs.existsSync(videoRaw)) {
    console.warn(`  skip ${chapter.id}: no video`);
    return null;
  }
  if (!fs.existsSync(audio)) {
    console.warn(`  skip ${chapter.id} ${lang}: no audio`);
    return null;
  }

  const audDur = audioDuration(audio);
  const vidDur = videoDuration(videoRaw);
  const target = Math.max(audDur + 0.8, 6); // audio length + 0.8s tail
  const rate = vidDur / target; // speed factor

  // Scale + pad + stretch video to match narration length, normalize pix fmt
  const filter = `[0:v]setpts=${(1/rate).toFixed(4)}*PTS,scale=1600:900:force_original_aspect_ratio=decrease,pad=1600:900:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p,fps=30[v];[1:a]aformat=sample_rates=48000:channel_layouts=stereo[a]`;

  sh(`ffmpeg -y -i "${videoRaw}" -i "${audio}" -filter_complex "${filter}" -map "[v]" -map "[a]" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 22 -c:a aac -b:a 128k -shortest -t ${target.toFixed(2)} "${outMp4}"`);
  return outMp4;
}

function concat(files, outFile) {
  const listPath = path.join(DIR_TMP, 'concat.txt');
  fs.writeFileSync(listPath, files.map((f) => `file '${f}'`).join('\n'));
  sh(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outFile}"`);
}

async function main() {
  console.log('=== Combining tutorial ===\n');
  for (const lang of ['es', 'en']) {
    console.log(`\n▶ Building ${lang.toUpperCase()} version`);
    const parts = [];
    for (const ch of CHAPTERS) {
      const part = buildChapter(ch, lang);
      if (part) parts.push(part);
    }
    if (parts.length === 0) {
      console.warn(`No parts for ${lang}, skipping`);
      continue;
    }
    const finalOut = path.join(DIR_OUT, `illium-tutorial-${lang}.mp4`);
    concat(parts, finalOut);
    const size = fs.statSync(finalOut).size;
    console.log(`\n✓ ${finalOut} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  }
  console.log('\nDone.');
}
main().catch((e) => { console.error(e); process.exit(1); });
