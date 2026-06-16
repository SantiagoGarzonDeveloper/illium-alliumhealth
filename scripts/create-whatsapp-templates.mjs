#!/usr/bin/env node
/**
 * Create all ILLIUM WhatsApp templates via Meta Graph API.
 *
 * Required env vars:
 *   META_WABA_ID  — WhatsApp Business Account ID (NOT the phone number ID)
 *   META_TOKEN    — Permanent System User access token with
 *                   `whatsapp_business_management` scope
 *
 * Usage:
 *   META_WABA_ID=123... META_TOKEN=EAAx... node scripts/create-whatsapp-templates.mjs
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
 */

const WABA_ID = process.env.META_WABA_ID;
const TOKEN = process.env.META_TOKEN;

if (!WABA_ID || !TOKEN) {
  console.error('ERROR: Set META_WABA_ID and META_TOKEN env vars.');
  console.error('Example:');
  console.error('  META_WABA_ID=123456789 META_TOKEN=EAAxxx node scripts/create-whatsapp-templates.mjs');
  process.exit(1);
}

const BASE = `https://graph.facebook.com/v21.0/${WABA_ID}/message_templates`;

/**
 * Templates to create. Each has 2 locales (es, en).
 * Variables in body are {{1}}, {{2}}, etc.
 * Categories available: UTILITY (notifications), MARKETING, AUTHENTICATION.
 * We use UTILITY for transactional notifications (highest approval rate).
 */
const TEMPLATES = [
  // ───────────── 1. Welcome new affiliate / partner ─────────────
  {
    name: 'illium_new_affiliate',
    category: 'UTILITY',
    language: 'es_MX',
    components: [
      { type: 'HEADER', format: 'TEXT', text: '¡Bienvenido a ILLIUM!' },
      {
        type: 'BODY',
        text: 'Hola {{1}}, tu cuenta de partner en ILLIUM está activa.\n\nTu enlace de referido: {{2}}\n\nAccede a tu panel para ver ventas, comisiones y tu red.\n\nGanas 40% por cada venta directa y 10% por tu red.',
        example: { body_text: [['Santiago', 'https://illium.health/?ref=abc123']] },
      },
      { type: 'FOOTER', text: 'ILLIUM · Research-grade wellness' },
    ],
  },
  {
    name: 'illium_new_affiliate',
    category: 'UTILITY',
    language: 'en_US',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Welcome to ILLIUM!' },
      {
        type: 'BODY',
        text: 'Hi {{1}}, your ILLIUM partner account is now active.\n\nYour referral link: {{2}}\n\nAccess your dashboard to track sales, commissions and your network.\n\nYou earn 40% on direct sales and 10% from your network.',
        example: { body_text: [['Santiago', 'https://illium.health/?ref=abc123']] },
      },
      { type: 'FOOTER', text: 'ILLIUM · Research-grade wellness' },
    ],
  },

  // ───────────── 2. New referral joined under you ─────────────
  {
    name: 'illium_new_referral',
    category: 'UTILITY',
    language: 'es_MX',
    components: [
      {
        type: 'BODY',
        text: 'Un nuevo afiliado se unió a tu red ILLIUM 🚀\n\nNombre: {{1}}\nCorreo: {{2}}\n\nTu enlace está generando resultados. Revisa tu panel para ver la red completa.',
        example: { body_text: [['Juan Pérez', 'juan@email.com']] },
      },
      { type: 'FOOTER', text: 'ILLIUM' },
    ],
  },
  {
    name: 'illium_new_referral',
    category: 'UTILITY',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'A new affiliate joined your ILLIUM network 🚀\n\nName: {{1}}\nEmail: {{2}}\n\nYour link is converting. Check your dashboard for the full network.',
        example: { body_text: [['John Smith', 'john@email.com']] },
      },
      { type: 'FOOTER', text: 'ILLIUM' },
    ],
  },

  // ───────────── 3. Admin: new user ─────────────
  {
    name: 'illium_admin_new_user',
    category: 'UTILITY',
    language: 'es_MX',
    components: [
      {
        type: 'BODY',
        text: 'Nuevo usuario en ILLIUM\n\nRol: {{1}}\nNombre: {{2}}\nCorreo: {{3}}\nFecha: {{4}}',
        example: { body_text: [['Partner', 'Juan Pérez', 'juan@email.com', '2026-04-13 18:30']] },
      },
      { type: 'FOOTER', text: 'Panel admin' },
    ],
  },
  {
    name: 'illium_admin_new_user',
    category: 'UTILITY',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'New user on ILLIUM\n\nRole: {{1}}\nName: {{2}}\nEmail: {{3}}\nDate: {{4}}',
        example: { body_text: [['Partner', 'John Smith', 'john@email.com', '2026-04-13 18:30']] },
      },
      { type: 'FOOTER', text: 'Admin panel' },
    ],
  },

  // ───────────── 4. New sale (notifies partner) ─────────────
  {
    name: 'illium_new_sale',
    category: 'UTILITY',
    language: 'es_MX',
    components: [
      { type: 'HEADER', format: 'TEXT', text: '¡Nueva venta ILLIUM! 💚' },
      {
        type: 'BODY',
        text: 'Pedido: #{{1}}\nCliente: {{2}}\nTotal: ${{3}}\nTu comisión: ${{4}}\n\nRevisa tu panel para ver detalles de pago.',
        example: { body_text: [['ABC12345', 'Juan Pérez', '190.00', '76.00']] },
      },
      { type: 'FOOTER', text: 'ILLIUM' },
    ],
  },
  {
    name: 'illium_new_sale',
    category: 'UTILITY',
    language: 'en_US',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'New ILLIUM sale! 💚' },
      {
        type: 'BODY',
        text: 'Order: #{{1}}\nCustomer: {{2}}\nTotal: ${{3}}\nYour commission: ${{4}}\n\nCheck your dashboard for payout details.',
        example: { body_text: [['ABC12345', 'John Smith', '190.00', '76.00']] },
      },
      { type: 'FOOTER', text: 'ILLIUM' },
    ],
  },

  // ───────────── 5. Order shipped (notifies customer) ─────────────
  {
    name: 'illium_order_shipped',
    category: 'UTILITY',
    language: 'es_MX',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Tu pedido ILLIUM fue enviado 📦' },
      {
        type: 'BODY',
        text: 'Hola {{1}}, tu pedido #{{2}} ya está en camino.\n\nTracking: {{3}}\n\nGracias por elegir ILLIUM.',
        example: { body_text: [['Juan', 'ABC12345', '1Z999AA10123456784']] },
      },
      { type: 'FOOTER', text: 'ILLIUM · Research-grade wellness' },
    ],
  },
  {
    name: 'illium_order_shipped',
    category: 'UTILITY',
    language: 'en_US',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Your ILLIUM order shipped 📦' },
      {
        type: 'BODY',
        text: 'Hi {{1}}, your order #{{2}} is on the way.\n\nTracking: {{3}}\n\nThanks for choosing ILLIUM.',
        example: { body_text: [['John', 'ABC12345', '1Z999AA10123456784']] },
      },
      { type: 'FOOTER', text: 'ILLIUM · Research-grade wellness' },
    ],
  },
];

async function createTemplate(tpl) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(tpl),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    return { ok: false, name: tpl.name, lang: tpl.language, status: res.status, error: data };
  }
  return { ok: true, name: tpl.name, lang: tpl.language, id: data.id, status: data.status };
}

async function listExisting() {
  const url = `${BASE}?fields=name,language,status&limit=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) {
    console.error('Could not list existing templates:', res.status, await res.text());
    return [];
  }
  const data = await res.json();
  return data.data || [];
}

async function main() {
  console.log('=== ILLIUM WhatsApp Templates — Meta API ===\n');
  console.log(`WABA ID: ${WABA_ID}`);
  console.log(`Templates to create: ${TEMPLATES.length}\n`);

  console.log('Checking existing templates...');
  const existing = await listExisting();
  const existingKeys = new Set(existing.map((t) => `${t.name}:${t.language}`));
  console.log(`Found ${existing.length} existing templates.\n`);

  const results = [];
  for (const tpl of TEMPLATES) {
    const key = `${tpl.name}:${tpl.language}`;
    if (existingKeys.has(key)) {
      console.log(`  SKIP (already exists): ${key}`);
      results.push({ ok: true, name: tpl.name, lang: tpl.language, skipped: true });
      continue;
    }
    process.stdout.write(`  Creating ${key}... `);
    const result = await createTemplate(tpl);
    if (result.ok) {
      console.log(`✓ ${result.status} (id ${result.id})`);
    } else {
      console.log(`✗ ${result.status}`);
      console.log(`    ${JSON.stringify(result.error.error || result.error)}`);
    }
    results.push(result);
  }

  console.log('\n=== Summary ===');
  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`Successful: ${ok}/${results.length}`);
  if (failed.length > 0) {
    console.log(`Failed: ${failed.length}`);
    failed.forEach((f) => console.log(`  - ${f.name} (${f.lang}): ${JSON.stringify(f.error?.error?.message || f.error)}`));
  }

  console.log('\nNext steps:');
  console.log('  1. Meta will review templates (usually 1–24h, UTILITY is fastest).');
  console.log('  2. Check status at: https://business.facebook.com/wa/manage/message-templates/');
  console.log('  3. Once APPROVED, they are usable. Cloud Functions will send them automatically.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
