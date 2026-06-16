# CLAUDE.md — Memoria del proyecto ILLIUM (alliumhealth.net)

> Este archivo lo lee **Claude Code automáticamente** al abrir el proyecto. Contiene
> todo el contexto necesario para retomar el trabajo en cualquier sesión nueva.
> Si haces cambios importantes, **actualiza este archivo** para que la próxima sesión
> tenga la memoria al día.

---

## 1. Qué es el proyecto

**ILLIUM** — ecommerce de **compuestos de investigación / péptidos** (marca ILLIUM,
paleta verde esmeralda). Sitio público: **https://alliumhealth.net**

Incluye tienda, recomendador con IA (Quiz), generador de **protocolos clínicos** por
pedido, sistema de **afiliados/MLM** (comisiones 40% directo + 10% upline), panel de
**administración** completo y panel de **trabajador/socio**.

> Nota legal: la marca está posicionada como "compuestos de investigación in vitro"
> (NO para rendimiento humano). Mantener ese marco en textos, claims y prompts de IA.

---

## 2. Stack y arquitectura

- **Frontend:** Vite + React 19 + TypeScript + TailwindCSS. Estado global con Zustand
  (`src/store/index.ts`, carrito persistido en `lab-cart-storage`).
- **Backend:** Firebase — proyecto **`monaco-community`** (ver `.firebaserc`).
  - **Firestore** (base de datos), **Storage** (imágenes), **Cloud Functions Gen2**
    (`functions/`, región `us-central1`, Node 20).
- **IA:** **Groq** (`src/lib/groq.ts`, modelo `openai/gpt-oss-120b`, fallback
  `llama-3.1-70b`). Usada por el chatbot, el Quiz y el generador de protocolos.
- **Hosting real: SiteGround vía FTP** (NO Firebase Hosting, aunque exista
  `firebase.json`). El dominio público apunta a SiteGround.

### Carpetas clave
```
src/
  pages/            Home, Shop (ProductList), ProductDetail, Cart, Quiz,
                    PeptideCalculator, Consulta (chatbot), Login, MyOrders, etc.
    admin/          18 páginas del panel admin (ver §5)
    worker/         WorkerPanel (panel del socio/trabajador)
  components/       UI, carrito, chatbot, órdenes (OrderProtocolModal), layout
  lib/              groq.ts, commissions.ts, orderCommission.ts, orderProtocol.ts,
                    pricing.ts, productLocale.ts, firebase.ts
  store/            estado global (Zustand), tipo Product, CartItem
  i18n/             traducciones EN/ES
functions/src/      index.ts (~1900 líneas): triggers + callables (ver §6)
scripts/            seeds, migraciones, generación de imágenes/tutoriales
e2e/                tests Playwright
```

---

## 3. Cómo correr el proyecto (local)

```bash
npm install                 # dependencias del frontend
cp .env.example .env        # luego pon la key de Groq en VITE_GROQ_API_KEY
cd functions && npm install # dependencias de Cloud Functions (opcional)
cd ..
npm run dev                 # arranca Vite en http://localhost:5173
```

Scripts (`package.json`):
- `npm run dev` — servidor de desarrollo.
- `npm run build` — `tsc -b && vite build` + genera `donaton.html` (postbuild). Salida en `dist/`.
- `npm run lint` — ESLint.
- `npm run test:e2e` — Playwright (requiere `npm run test:e2e:install` la 1ª vez).
- `npm run deploy:rules` — despliega reglas de Firestore.

---

## 4. Deploy a producción

### 4.1 Sitio web (alliumhealth.net) — FTP a SiteGround
> Las credenciales FTP están en `DEPLOY_FTP.md` (NO está en el repo, es secreto).
> Pídeselas a Santiago si vas a desplegar.

- Host: `ftp.alliumhealth.net`, puerto 21, usuario `admin@alliumhealth.net`.
- **Destino remoto:** `/alliumhealth.net/public_html/` ⚠️ (NO `/public_html/` de la raíz).
- Flujo: `npm run build` → `./deploy-ftp.sh` (usa `lftp mirror --reverse`, sin
  `--delete` para preservar `.htaccess` y logs; fuerza re-subir `index.html`).
- **Verificar:** el hash debe coincidir:
  ```bash
  curl -sS https://alliumhealth.net/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'
  grep -oE 'index-[A-Za-z0-9_-]+\.js' dist/index.html
  ```
- **Caché de SiteGround:** tras desplegar, la respuesta puede quedar congelada
  (NGINX Dynamic Cache). Si no ves el cambio: Site Tools → Velocidad → Caché
  **dinámica** → Limpiar. Recomendado: desactivar Dynamic Cache para esta SPA.

### 4.2 Cloud Functions
```bash
cd functions && npm run build      # tsc → functions/lib/
firebase deploy --only functions:NOMBRE --project monaco-community
```
Node 20 (deprecado, decom 2026-10-30 — eventualmente subir runtime).

---

## 5. Panel de administración (`/admin/*`)

| Página | Archivo | Qué hace |
|---|---|---|
| Panel | `AdminDashboard.tsx` | Resumen / métricas |
| Finanzas y red | `AdminFinance.tsx` | Órdenes, comisiones, pagos, árbol MLM, **Ventas por vendedor** |
| Productos e inventario | `AdminProducts.tsx` | Editor de productos (incluye campos para la IA) |
| Inventario y Ganancias | `AdminInventory.tsx` | Stock, costos, márgenes |
| Registro de Ventas | `AdminSales.tsx` | Ventas manuales (`manualSales`), POS del admin |
| Ventas Referidas | `AdminReferrals.tsx` | Atribución de referidos |
| Cupones | `AdminCoupons.tsx` | Cupones de descuento |
| Vendedores y Clientes | `AdminVendors.tsx` | **Configuración de comisión por vendedor** |
| Pagos a Vendedores | `AdminPayouts.tsx` | Estados de pago de comisiones |
| Leads y ventas | `AdminLeads.tsx` | Leads |
| Autenticidad | `AdminAuthenticity.tsx` | QR de autenticidad de producto |
| Clases / Exámenes | `AdminTraining.tsx` | Lecciones (`lessons`) que alimentan la IA del protocolo |
| Contenido diario | `AdminContent.tsx` | Contenido |
| Ajustes | `AdminSettings.tsx` | Tasas globales, prompts de IA, llaves, etc. |
| Asistente / Guía | `AdminAssistant.tsx` / `AdminGuide.tsx` | Ayuda interna |

Panel del socio/trabajador: `src/pages/worker/WorkerPanel.tsx`.

---

## 6. Cloud Functions (`functions/src/index.ts`)

- **`waOnOrderCreated`** — al crear orden web/POS: envía WhatsApp + email, calcula y
  escribe comisiones (40% directo / 10% upline), **descuenta stock** idempotente
  (flag `stockApplied`) + escribe `inventoryLogs`.
- **`waOnOrderUpdated`** — notifica al cliente cuando la orden pasa a `shipped`.
- **`onManualSaleCreated`** — al crear venta manual (`manualSales`): **descuenta stock**
  idempotente + `inventoryLogs`. ⚠️ **NO calcula comisión** (ver §8).
- **Stripe:** `createStripePaymentIntent` (re-precia server-side anti-tampering;
  `payment_method_types[0]=card` para mostrar solo tarjeta + Apple/Google Pay) +
  `stripeWebhook`.
- **Otros:** OTP por email, reset de contraseña branded, validación de email (MX),
  `scanAuthCode` (QR de autenticidad).

**Secretos en GCP Secret Manager** (NO en código): `META_WHATSAPP_TOKEN`,
`RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

---

## 7. Sistema de comisiones (MLM)

- **Directo 40%** (`?ref=UID`) + **Upline 10%**. Tasas globales por defecto en
  `settings/general` (`commissionDirectRate` / `commissionUplineRate`).
- **Upline 10% = 10% de la comisión del socio directo**, NO del total de la orden.
- **Comisión por vendedor** (`users/{uid}.commissionMode`): `percentage` /
  `fixed_global` (monto fijo por unidad) / `fixed_per_product`. Se configura en
  **Admin → Vendedores y Clientes** (`AdminVendors.tsx`), NO en Ajustes.
- Lógica: `src/lib/commissions.ts` (tasas) + `src/lib/orderCommission.ts`
  (`buildNewOrderCommissionFields` al crear orden, `resolveOrderCommissions` al leer
  con retrocompatibilidad).
- El panel del socio (`WorkerPanel.tsx`) recalcula la comisión directa desde el config
  ACTUAL del vendedor; el upline usa el monto guardado en la orden.

---

## 8. Generador de PROTOCOLOS con IA (importante)

Archivo: `src/lib/orderProtocol.ts`. Modal: `src/components/orders/OrderProtocolModal.tsx`.

Al generar el protocolo de un pedido, la IA recibe **por cada producto** (de Firestore):
- **`dosageNote`** → "Nota de dosis (para la IA)" — la **dosis exacta** por toma.
- **`protocol`** → "📋 Protocolo de uso (cómo se usa — para la IA)" — **cómo se usa**:
  veces al día/semana, vía, momento, duración del ciclo, reconstitución. La IA lo usa
  **tal cual**. Mientras más completo, menos campos quedan entre `[corchetes]` para
  que el médico complete.
- `monthsSupplyPerVial`, `targetGender`.
- Además: **lecciones** globales (`lessons`, editables en Admin → Clases/Exámenes) y el
  **system prompt** (`settings/general.protocolPrompt{Es,En}`, o el default del código).

👉 **Dónde se define la info del protocolo por producto:** en el **editor de producto**
(Admin → Productos e inventario), sección "Datos para la IA del Quiz", campos
**"Nota de dosis"** (dosis) y **"📋 Protocolo de uso"** (cómo usarse).

---

## 9. Gotchas / cosas que duelen

- **Ventas manuales (`manualSales`) tienen otro shape que las órdenes:**
  `customerName`/`customerEmail` top-level (no `customer.{name,email}`),
  `items[].productName`/`unitPrice` (no `.name`/`.price`), y `channel` (no `status`).
  Cualquier código que lea ventas debe soportar AMBOS shapes.
- **`normalizeProductFromFirestore`** (`src/lib/productLocale.ts`) DEBE mapear cada
  campo nuevo del producto; si no, el editor "pierde" el valor al recargar y la IA no
  lo ve. Ya mapea `cost`, `dosageNote`, `protocol`, `monthsSupplyPerVial`, `targetGender`.
- **Caché de SiteGround** congela el sitio tras deploy (ver §4.1).
- **Editor de producto con `min`/`step` raros** rompe el submit en el navegador
  (un `min=0.25 step=0.5` rechazaba enteros). Usar `step="any" min={0}`.
- La key de **Groq** se lee de `VITE_GROQ_API_KEY` (archivo `.env`, NO se commitea).
  Ver `.env.example`. Si la IA no responde en local, falta configurar el `.env`.

---

## 10. Historial de cambios recientes

### 2026-06-16 (hash `index-DdE50NeP.js`) — Sistema de FACTURAS
- **Nuevo:** botón **"Factura"** en cada venta de **Registro de Ventas** (`AdminSales.tsx`,
  sirve para órdenes web y ventas manuales) → abre `InvoiceModal`
  (`src/components/invoices/InvoiceModal.tsx`).
- El modal: **ver** la factura (preview), **Imprimir / Guardar PDF** (abre ventana de
  impresión → "Guardar como PDF") y **Enviar al cliente** por correo.
- `buildInvoiceHtml()` genera el HTML de la factura (inline styles, email-safe) y es
  la ÚNICA fuente para preview + impresión + email. Datos del cliente salen de la venta;
  número de factura = `prefix + últimos 6 del id`.
- **Datos de la empresa configurables** en **Ajustes** (`AdminSettings.tsx`, sección
  "Datos de facturación") → se guardan en `settings/general`: `invoiceCompanyName`,
  `invoiceLogoUrl`, `invoiceAddress`, `invoiceTaxId`, `invoiceEmail`, `invoicePhone`,
  `invoiceWebsite`, `invoiceBank`, `invoiceTerms`, `invoiceCurrency` (def. USD),
  `invoiceTaxRate` (PORCENTAJE, ej. 21; el modal lo divide /100), `invoicePrefix` (def. ILL-).
- **Backend:** nueva callable **`sendInvoiceEmail`** (`functions/src/index.ts`, admin-only
  vía `assertRequestIsAdmin`, usa `sendEmailViaResend` + secret `RESEND_API_KEY`). Recibe
  `{to, subject, html}` del cliente y lo envía. Desplegada con
  `firebase deploy --only functions:sendInvoiceEmail`.

### 2026-06-16 (hash `index-PNxO-N9q.js`) — Fidelidad estricta del protocolo IA
- **Problema:** el generador inventaba/derivaba cifras no provistas (dosis como
  0.5mg, conversiones a mL "0.25mg=0.025mL", calibre de jeringa, incrementos de
  titulación).
- **Fix** (`src/lib/orderProtocol.ts` + `src/lib/groq.ts`): prompt del sistema (ES/EN)
  reescrito con **FIDELIDAD ABSOLUTA** (usar verbatim, prohibido inventar/aproximar/
  derivar, mantener rangos exactos, `[corchetes]` si falta dato); campos del producto
  marcados como **FUENTE AUTORITATIVA**; **reglas obligatorias inyectadas en el mensaje
  de cada pedido** (aplican aunque haya prompt custom en `settings/general`);
  **temperatura del modelo = 0.1** (salida determinista). REGLA: cada producto trae su
  info en "Nota de dosis" + "📋 Protocolo de uso"; la IA debe respetarla al pie de la letra.

### 2026-06-16 (hash `index-Bvxja6rH.js`)
- **Detalle expandible "Ventas por vendedor"** (`AdminFinance.tsx`,
  `VendorBreakdownCard`): cada tarjeta despliega TODAS las ventas del vendedor (fecha,
  cliente, productos, total, estado/canal, badge directo/upline/manual, comisión). Lee
  shape de órdenes Y de ventas manuales.
- **Editor de producto: botón "Volver a productos"** (`AdminProducts.tsx`) arriba y en
  el footer — antes había que refrescar la página tras Guardar.
- **Campo nuevo "📋 Protocolo de uso (para la IA)"** (`AdminProducts.tsx`) mapeado a
  `product.protocol`; lo usa el generador de protocolos.
- **Editor de protocolo más interactivo** (`OrderProtocolModal.tsx`): barra de formato
  (Título/Negrita/Cursiva/Listas/Tabla) + vista previa en vivo al lado en pantallas grandes.

### Diagnóstico (sin cambio de código)
- La comisión de **ventas manuales** sale en $0 cuando el vendedor no tiene comisión
  configurada, porque `manualSales` no guarda comisión y el fallback usa la tasa global
  (que está en `0`). Solución: configurar la comisión del vendedor en Admin → Vendedores,
  o hacer que `onManualSaleCreated` calcule y guarde la comisión.

### Antes de 2026-06-16
- Reposicionamiento legal/marketing (compuestos de investigación), disclaimers, páginas
  `/terms-of-sale` y `/lab-results`, age gate 21+, rebrand de productos con marca
  registrada, descuento de stock en ventas manuales, checkout "recoger en persona",
  POS de trabajadores con Stripe, y arreglos de comisiones (upline 10% sobre comisión
  directa). Ver `ILLIUM_DOCUMENTATION.md` y `DOCUMENTACION-ILLIUM-CAMBIOS.html`.

---

## 11. Pendientes conocidos
- Video tutorial para trabajadores (infra: `scripts/build-tutorial-video.mjs`).
- Activar WhatsApp en producción (plantillas `illium_*`, `metaWhatsappPhoneNumberId`,
  secret `META_WHATSAPP_TOKEN`).
- Comisión de ventas manuales (decisión del cliente).
