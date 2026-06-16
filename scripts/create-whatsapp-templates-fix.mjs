#!/usr/bin/env node
const WABA_ID = process.env.META_WABA_ID;
const TOKEN = process.env.META_TOKEN;
if (!WABA_ID || !TOKEN) { console.error('Set META_WABA_ID and META_TOKEN'); process.exit(1); }
const BASE = `https://graph.facebook.com/v21.0/${WABA_ID}/message_templates`;

// Only the 6 that failed. Fixes: no emojis in headers, longer body for admin_new_user.
const TEMPLATES = [
  // admin_new_user — expanded text to balance 4 variables
  {
    name: 'illium_admin_new_user',
    category: 'UTILITY',
    language: 'es_MX',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Nuevo registro en ILLIUM' },
      {
        type: 'BODY',
        text: 'Un nuevo usuario acaba de crear una cuenta en la plataforma ILLIUM con los siguientes datos.\n\nRol del usuario: {{1}}\nNombre completo: {{2}}\nCorreo electrónico: {{3}}\nFecha y hora del registro: {{4}}\n\nPuedes ver todos los detalles en el panel de administración.',
        example: { body_text: [['Partner', 'Juan Pérez', 'juan@email.com', '2026-04-13 18:30']] },
      },
      { type: 'FOOTER', text: 'Panel administrativo de ILLIUM' },
    ],
  },
  {
    name: 'illium_admin_new_user',
    category: 'UTILITY',
    language: 'en_US',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'New registration on ILLIUM' },
      {
        type: 'BODY',
        text: 'A new user just created an account on the ILLIUM platform with the following details.\n\nUser role: {{1}}\nFull name: {{2}}\nEmail address: {{3}}\nRegistration date and time: {{4}}\n\nYou can view all details on the administration panel.',
        example: { body_text: [['Partner', 'John Smith', 'john@email.com', '2026-04-13 18:30']] },
      },
      { type: 'FOOTER', text: 'ILLIUM admin panel' },
    ],
  },

  // new_sale — no emoji in header
  {
    name: 'illium_new_sale',
    category: 'UTILITY',
    language: 'es_MX',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Nueva venta ILLIUM' },
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
      { type: 'HEADER', format: 'TEXT', text: 'New ILLIUM sale' },
      {
        type: 'BODY',
        text: 'Order: #{{1}}\nCustomer: {{2}}\nTotal: ${{3}}\nYour commission: ${{4}}\n\nCheck your dashboard for payout details.',
        example: { body_text: [['ABC12345', 'John Smith', '190.00', '76.00']] },
      },
      { type: 'FOOTER', text: 'ILLIUM' },
    ],
  },

  // order_shipped — no emoji in header
  {
    name: 'illium_order_shipped',
    category: 'UTILITY',
    language: 'es_MX',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Tu pedido ILLIUM fue enviado' },
      {
        type: 'BODY',
        text: 'Hola {{1}}, tu pedido #{{2}} ya está en camino.\n\nNúmero de seguimiento: {{3}}\n\nGracias por elegir ILLIUM.',
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
      { type: 'HEADER', format: 'TEXT', text: 'Your ILLIUM order shipped' },
      {
        type: 'BODY',
        text: 'Hi {{1}}, your order #{{2}} is on the way.\n\nTracking number: {{3}}\n\nThanks for choosing ILLIUM.',
        example: { body_text: [['John', 'ABC12345', '1Z999AA10123456784']] },
      },
      { type: 'FOOTER', text: 'ILLIUM · Research-grade wellness' },
    ],
  },
];

async function create(tpl) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(tpl),
  });
  const data = await res.json();
  return { ok: res.ok, name: tpl.name, lang: tpl.language, data };
}

(async () => {
  console.log('Retrying 6 failed templates...\n');
  for (const tpl of TEMPLATES) {
    process.stdout.write(`  ${tpl.name}:${tpl.language}... `);
    const r = await create(tpl);
    if (r.ok) {
      console.log(`✓ ${r.data.status} (${r.data.id})`);
    } else {
      console.log(`✗ ${JSON.stringify(r.data.error?.error_user_msg || r.data.error?.message)}`);
    }
  }
})();
