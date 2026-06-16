#!/usr/bin/env node
/** Playwright-driven screen recording for ILLIUM admin tutorial.
 *  Records each chapter as a separate WebM, which we later convert to MP4
 *  and sync with narration audio via ffmpeg. */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'video-raw');
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'https://monaco-community.web.app';
const ADMIN_EMAIL = 'admin@illium.health';
const ADMIN_PASS = 'XDkt62#!Xd&*4y8SnB9V';

const VIEWPORT = { width: 1600, height: 900 };

/** Roughly match each chapter's narration length. Adjust slightly. */
const DURATIONS = {
  dashboard: 26,
  products: 25,
  finance: 36,
  settings: 23,
  flows: 30,
};

async function waitMs(page, ms) {
  await page.waitForTimeout(ms);
}

async function hover(page, selector, ms = 800) {
  try {
    const el = await page.$(selector);
    if (el) {
      await el.scrollIntoViewIfNeeded();
      await el.hover({ timeout: 2000 }).catch(() => {});
      await waitMs(page, ms);
    }
  } catch { /* ignore */ }
}

async function smoothScroll(page, toY, duration = 1500) {
  await page.evaluate(({ toY, duration }) => {
    return new Promise((resolve) => {
      const startY = window.scrollY;
      const startT = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - startT) / duration);
        const eased = 0.5 * (1 - Math.cos(Math.PI * t));
        window.scrollTo(0, startY + (toY - startY) * eased);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }, { toY, duration });
}

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  // Dismiss age/lang gates if visible
  await page.click('button:has-text("English")', { timeout: 3000 }).catch(() => {});
  await page.click('button:has-text("Yes")', { timeout: 3000 }).catch(() => {});
  await waitMs(page, 500);
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin', { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
}

async function recordChapter(browser, chapterId, actions) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: {
      dir: OUT,
      size: VIEWPORT,
    },
  });
  const page = await context.newPage();
  try {
    await login(page);
    await actions(page);
  } finally {
    const targetPath = path.join(OUT, `${chapterId}.webm`);
    await page.close();
    const video = await page.video();
    await context.close();
    if (video) {
      try {
        await video.saveAs(targetPath);
        console.log(`  ✓ saved ${chapterId}.webm`);
      } catch (e) {
        console.warn(`  ⚠ could not save ${chapterId}:`, e.message);
      }
    }
  }
}

// ──────────── CHAPTER ACTIONS ────────────

async function chapDashboard(page) {
  // Already at /admin after login. Let hero load.
  await waitMs(page, 2500);
  await smoothScroll(page, 300, 1500);
  await waitMs(page, 2000);
  // Hover quick actions
  await hover(page, 'a[href="/admin/products"]', 1000);
  await hover(page, 'a[href="/admin/finance"]', 1000);
  await smoothScroll(page, 600, 1500);
  await waitMs(page, 2500);
  // Open AI Assistant
  await page.click('button:has-text("Assistant")').catch(() => {});
  await waitMs(page, 4000);
  // Click a quick prompt
  const prompt = await page.$('button:has-text("How many users")');
  if (prompt) {
    await prompt.click();
    await waitMs(page, 6000);
  }
  await waitMs(page, 2000);
  // Close assistant
  await page.keyboard.press('Escape').catch(() => {});
  await waitMs(page, 1000);
}

async function chapProducts(page) {
  await page.goto(`${BASE}/admin/products`);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await waitMs(page, 2500);
  await smoothScroll(page, 200, 1200);
  await waitMs(page, 1500);
  // Hover a pencil
  await hover(page, 'button:has(svg.lucide-pencil)', 1500);
  await waitMs(page, 2000);
  // Click Add product
  await page.click('button:has-text("Add")').catch(() => {});
  await waitMs(page, 3500);
  // Hover fields
  await hover(page, 'input#product-name-en', 1000);
  await hover(page, 'input#product-price', 1000);
  await waitMs(page, 2000);
  // Cancel
  await page.click('button:has-text("Cancel")').catch(() => {});
  await waitMs(page, 1500);
}

async function chapFinance(page) {
  await page.goto(`${BASE}/admin/finance`);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await waitMs(page, 2500);
  await smoothScroll(page, 300, 1500);
  await waitMs(page, 2500);
  // Switch to Users tab
  await page.click('button:has-text("Users")').catch(() => {});
  await waitMs(page, 3000);
  // Switch to Tree tab
  await page.click('button:has-text("Árbol")').catch(() => {});
  await page.click('button:has-text("Tree")').catch(() => {});
  await waitMs(page, 4000);
  await smoothScroll(page, 400, 1500);
  await waitMs(page, 3000);
}

async function chapSettings(page) {
  await page.goto(`${BASE}/admin/settings`);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await waitMs(page, 2000);
  await smoothScroll(page, 400, 1500);
  await waitMs(page, 2500);
  await smoothScroll(page, 900, 1500);
  await waitMs(page, 3000);
  await smoothScroll(page, 1500, 1500);
  await waitMs(page, 3000);
  await smoothScroll(page, 2200, 1500);
  await waitMs(page, 2500);
}

async function chapFlows(page) {
  // Show the public site (what customer sees)
  await page.goto(BASE);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await waitMs(page, 3000);
  await smoothScroll(page, 600, 2000);
  await waitMs(page, 2500);
  await smoothScroll(page, 1400, 2000);
  await waitMs(page, 2500);
  // Quiz
  await page.goto(`${BASE}/quiz`);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await waitMs(page, 3000);
  // Shop
  await page.goto(`${BASE}/shop`);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await waitMs(page, 3000);
  await smoothScroll(page, 500, 1500);
  await waitMs(page, 2500);
}

async function main() {
  console.log('=== ILLIUM Tutorial Recording ===\n');
  const skip = (process.env.SKIP || '').split(',').filter(Boolean);
  const only = (process.env.ONLY || '').split(',').filter(Boolean);
  const browser = await chromium.launch({ headless: true });
  try {
    const chapters = [
      ['dashboard', chapDashboard],
      ['products', chapProducts],
      ['finance', chapFinance],
      ['settings', chapSettings],
      ['flows', chapFlows],
    ];
    for (const [id, fn] of chapters) {
      if (skip.includes(id)) { console.log(`  skip ${id}`); continue; }
      if (only.length > 0 && !only.includes(id)) { console.log(`  not in ONLY: ${id}`); continue; }
      console.log(`\n▶ Chapter: ${id} (target ~${DURATIONS[id]}s)`);
      try {
        await recordChapter(browser, id, fn);
      } catch (e) {
        console.error(`  ✗ ${id} failed:`, e.message?.slice(0, 200));
      }
    }
  } finally {
    await browser.close();
  }
  console.log('\nRecording done.');
}
main().catch((e) => { console.error(e); process.exit(1); });
