#!/usr/bin/env node
// Builds tutorial-illium.mp4 fully automatically:
//  1) Generates Spanish narration audio for each slide via Gemini TTS
//  2) Renders each slide of tutorial-illium.html as a 1920x1080 PNG via Playwright
//  3) Combines per-slide image + audio into mp4 segments via ffmpeg, then concatenates
//
// Usage:  node scripts/build-tutorial-video.mjs
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'tutorial-illium.html');
const OUT_DIR = path.join(ROOT, '.tutorial-build');
const FINAL = path.join(ROOT, 'tutorial-illium.mp4');

const API_KEY = 'AIzaSyD7cE4FKfP6NflltMkHxGNuBg7mRIGDjqM';
const VOICE = 'Aoede';
const TTS_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${API_KEY}`;

const NARRATIONS = [
  'Hola. En este tutorial te muestro paso a paso cómo funciona el sistema de autenticidad y certificados COA de ILLIUM. Vas a aprender a entrar al panel, generar lotes con códigos QR únicos, crear el certificado de análisis automático en formato laboratorio, y ver cómo lo recibe tu cliente final. Empecemos.',
  'Primer paso. Abre tu navegador, puede ser Chrome, Safari o el que prefieras, y entra a la siguiente dirección: monaco community punto web punto app, slash login. Esta es la entrada al sistema.',
  'Aquí pones tu correo de administrador y tu contraseña, y le das click al botón verde Iniciar sesión.',
  'Una vez dentro, ve a esta dirección: monaco community punto web punto app, slash admin, slash authenticity. Este es el panel donde manejas todos los códigos de autenticidad y los certificados.',
  'Esta es la pantalla principal. Arriba ves cuatro contadores: total de códigos generados, cuántos fueron escaneados por clientes, cuántas alertas tienes y cuántos códigos están anulados. Para crear tu primer lote, busca el botón verde que dice Generar lote, arriba a la derecha, y haz click ahí.',
  'Ahora llena el formulario. Primero elige el producto, por ejemplo Tesamorelin diez miligramos. Luego escribe el número de lote, por ejemplo S E M X cero cero once guion cero dos. Después la pureza, ejemplo noventa y nueve punto doscientos cincuenta y tres por ciento. La cantidad de viales que quieres, máximo quinientos por lote. La fecha del análisis. El nombre del laboratorio, por ejemplo A C S Laboratory. Y los métodos, normalmente H P L C coma L C M S. Si tienes el COA en PDF lo subes en el campo de abajo. Si no lo tienes, déjalo vacío y lo generamos automático en el siguiente paso. Cuando todo esté listo, click en Generar códigos.',
  'Listo. Tu navegador descarga automáticamente un PDF con los diez códigos QR. Cada QR es único y apunta a la URL de verificación de ese vial específico. Imprime este PDF en papel adhesivo, recorta cada código y pégalo en su vial correspondiente.',
  'Ahora el certificado de análisis. Vuelve a la pantalla del panel y baja un poco hasta la tabla que dice Lotes. Ahí verás tu lote recién creado. En la columna de la derecha hay dos botones: el primero dice QRs para volver a descargar los códigos, y el segundo dice Auto guion COA. Haz click en Auto guion COA. El sistema genera el certificado en formato laboratorio profesional, y lo asigna automáticamente a los diez viales del lote.',
  'Este es el certificado de análisis que se descarga. Tiene formato profesional de laboratorio, igual al que usan los grandes labs. Incluye: encabezado con logo y título, número de accession y datos del cliente, fechas de recepción y reporte, tabla con producto, contenido neto, identidad, lote, pureza y apariencia. El banner rosado indica los métodos usados, en este caso H P L C con detección por espectrometría de masas. Abajo se muestra la pureza grande en verde, el cromatograma del análisis, la firma del químico principal, y el número de COA. Este es el archivo que tu cliente puede descargar.',
  'Cuando tu cliente entra a la URL del lote, monaco community punto web punto app, slash COA, slash el número de lote, ve esta pantalla. Tiene el nombre del producto, el batch, la pureza grande en verde, y un botón negro abajo para descargar el certificado en PDF.',
  'Cuando el cliente escanea el QR del vial con su celular, llega a una pantalla de aviso de privacidad, acepta, y ve el resultado: VERIFIED AUTHENTIC en verde, junto con el nombre del producto, su pureza, su lote, y el estado PASS. Desde ahí puede descargar el COA o ver la página completa del lote.',
  'Una última cosa muy importante: la protección anti falsificación. Si alguien intenta escanear un código que ya fue verificado antes, el sistema lo detecta y muestra una alerta naranja que dice YA ESCANEADO, indicando posible falsificación. Tú lo ves marcado en rojo en tu panel de admin, con la cantidad de veces que se escaneó. Y desde ahí puedes anular el código para invalidarlo. Eso es todo. Tu sistema está listo para operar. Si tienes dudas, escríbeme. Hasta la próxima.'
];

function pcmToWav(pcm, sampleRate) {
  const dataSize = pcm.length;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);              // PCM
  buf.writeUInt16LE(1, 22);              // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  pcm.copy(buf, 44);
  return buf;
}

async function ttsGemini(text, outPath) {
  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } }
    }
  };
  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini TTS ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const inline = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;
  if (!inline?.data) throw new Error('No audio in TTS response: ' + JSON.stringify(data).slice(0, 400));
  const m = (inline.mimeType || '').match(/rate=(\d+)/);
  const sr = m ? parseInt(m[1], 10) : 24000;
  const pcm = Buffer.from(inline.data, 'base64');
  await fs.writeFile(outPath, pcmToWav(pcm, sr));
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log('━━━ STEP 1: Generando voces con Gemini TTS ━━━');
  for (let i = 0; i < NARRATIONS.length; i++) {
    const out = path.join(OUT_DIR, `audio-${String(i).padStart(2, '0')}.wav`);
    process.stdout.write(`  [${i + 1}/${NARRATIONS.length}] generando audio... `);
    await ttsGemini(NARRATIONS[i], out);
    console.log('✓');
    // gentle pacing to avoid rate limits
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('\n━━━ STEP 2: Renderizando diapositivas a PNG (1920x1080) ━━━');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto('file://' + HTML + '?capture=1');
  await page.waitForTimeout(800);
  for (let i = 0; i < NARRATIONS.length; i++) {
    await page.evaluate((idx) => window.showSlide(idx), i);
    await page.waitForTimeout(900);
    const out = path.join(OUT_DIR, `slide-${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`  [${i + 1}/${NARRATIONS.length}] ${path.basename(out)} ✓`);
  }
  await browser.close();

  console.log('\n━━━ STEP 3: Construyendo segmentos mp4 con ffmpeg ━━━');
  const segments = [];
  for (let i = 0; i < NARRATIONS.length; i++) {
    const ii = String(i).padStart(2, '0');
    const img = path.join(OUT_DIR, `slide-${ii}.png`);
    const aud = path.join(OUT_DIR, `audio-${ii}.wav`);
    const seg = path.join(OUT_DIR, `seg-${ii}.mp4`);
    const cmd = [
      'ffmpeg -y -hide_banner -loglevel error',
      `-loop 1 -i "${img}"`,
      `-i "${aud}"`,
      '-c:v libx264 -tune stillimage -pix_fmt yuv420p -r 30',
      '-c:a aac -b:a 192k -ac 2 -ar 48000',
      '-shortest',
      '-vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fade=in:0:10"',
      `"${seg}"`
    ].join(' ');
    execSync(cmd, { stdio: 'inherit' });
    segments.push(seg);
    console.log(`  [${i + 1}/${NARRATIONS.length}] seg-${ii}.mp4 ✓`);
  }

  console.log('\n━━━ STEP 4: Concatenando segmentos a tutorial-illium.mp4 ━━━');
  const list = segments.map(s => `file '${s}'`).join('\n');
  const listFile = path.join(OUT_DIR, 'list.txt');
  await fs.writeFile(listFile, list);
  execSync(
    `ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i "${listFile}" -c copy "${FINAL}"`,
    { stdio: 'inherit' }
  );

  const stat = await fs.stat(FINAL);
  console.log(`\n✓ LISTO: ${FINAL}`);
  console.log(`  Tamaño: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(e => { console.error('\n✗ ERROR:', e.message); process.exit(1); });
