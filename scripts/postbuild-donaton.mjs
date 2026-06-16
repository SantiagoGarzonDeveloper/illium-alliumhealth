#!/usr/bin/env node
/**
 * Post-build step: create dist/donaton.html with Donaton-specific meta tags,
 * but reusing the same React bundle (same <div id="root"> + <script src=..hash..>).
 *
 * Firebase Hosting serves this HTML when /donaton is requested, so the OG/Twitter
 * preview when shared on WhatsApp/Facebook uses the donaton meta tags, not ILLIUM's.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const SRC = path.join(DIST, 'index.html');
const OUT = path.join(DIST, 'donaton.html');

if (!fs.existsSync(SRC)) {
  console.error(`Missing ${SRC}. Run \`npm run build\` first.`);
  process.exit(1);
}

const original = fs.readFileSync(SRC, 'utf8');

const DONATON_HEAD = `  <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#052e16" />

    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

    <title>Gran Donatón Ambiental · Ciénaga Barbacoas te necesita 🌳</title>
    <meta name="description" content="La naturaleza nos necesita hoy más que nunca. Dona un árbol y sé parte del cambio. Ayúdanos a restaurar la Ciénaga de Barbacoas — Yondó, Antioquia. ¡Cada árbol cuenta!" />
    <link rel="canonical" href="https://monaco-community.web.app/donaton" />

    <!-- OpenGraph (Facebook, WhatsApp, LinkedIn, Discord) -->
    <meta property="og:site_name" content="Gran Donatón Ambiental" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://monaco-community.web.app/donaton" />
    <meta property="og:title" content="Gran Donatón Ambiental · Ciénaga Barbacoas te necesita" />
    <meta property="og:description" content="Dona un árbol 🌳 y sé parte del cambio. Restauremos la Ciénaga de Barbacoas juntos. ¡Cada árbol cuenta, cada aporte suma!" />
    <meta property="og:image" content="https://storage.googleapis.com/monaco-community.firebasestorage.app/donaton/hero-cienaga.png" />
    <meta property="og:image:secure_url" content="https://storage.googleapis.com/monaco-community.firebasestorage.app/donaton/hero-cienaga.png" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="800" />
    <meta property="og:image:alt" content="Ciénaga de Barbacoas — Gran Donatón Ambiental" />
    <meta property="og:locale" content="es_CO" />

    <!-- Twitter / X -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Gran Donatón Ambiental · Ciénaga Barbacoas" />
    <meta name="twitter:description" content="Dona un árbol 🌳 y sé parte del cambio. Restauremos la Ciénaga de Barbacoas juntos." />
    <meta name="twitter:image" content="https://storage.googleapis.com/monaco-community.firebasestorage.app/donaton/hero-cienaga.png" />
    <meta name="twitter:image:alt" content="Ciénaga de Barbacoas — Gran Donatón Ambiental" />

    <!-- Mobile PWA -->
    <meta name="apple-mobile-web-app-title" content="Donatón" />
    <meta name="apple-mobile-web-app-capable" content="yes" />

    <!-- Structured data: Fundraising campaign -->
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": "Gran Donatón Ambiental — Ciénaga Barbacoas",
        "description": "Campaña para restaurar la Ciénaga de Barbacoas donando árboles nativos.",
        "location": {
          "@type": "Place",
          "name": "Ciénaga de Barbacoas",
          "address": { "@type": "PostalAddress", "addressLocality": "Yondó", "addressRegion": "Antioquia", "addressCountry": "CO" }
        },
        "image": "https://storage.googleapis.com/monaco-community.firebasestorage.app/donaton/hero-cienaga.png",
        "url": "https://monaco-community.web.app/donaton"
      }
    </script>`;

// Replace everything inside <head>...</head> up to the closing </head>
// The rest (title, og tags, scripts, etc.) from the original index.html is discarded
// for the donaton variant, but we keep the <script type="module" src="...hash.js"> line
// because Vite injects it inside <head>.

// Extract the script tags (Vite injects them in head)
const scriptTags = [...original.matchAll(/<script[^>]*src="[^"]+"[^>]*><\/script>/g)].map((m) => m[0]).join('\n    ');
const styleTags = [...original.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map((m) => m[0]).join('\n    ');
const moduleLinks = [...original.matchAll(/<link[^>]*rel="modulepreload"[^>]*>/g)].map((m) => m[0]).join('\n    ');

const donatonHtml = `<!doctype html>
<html lang="es">
  <head>
${DONATON_HEAD}

    ${styleTags}
    ${moduleLinks}
    ${scriptTags}
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

fs.writeFileSync(OUT, donatonHtml);
console.log(`✓ Generated ${OUT} (${(donatonHtml.length / 1024).toFixed(1)} KB)`);
console.log(`  Scripts injected: ${(scriptTags.match(/<script/g) || []).length}`);
console.log(`  Styles injected: ${(styleTags.match(/<link/g) || []).length}`);
console.log(`  Modulepreloads: ${(moduleLinks.match(/<link/g) || []).length}`);
