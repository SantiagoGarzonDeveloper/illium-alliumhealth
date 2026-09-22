# CLAUDE.md — Memoria del proyecto ILLIUM (alliumhealth.net)

> Este archivo lo lee **Claude Code automáticamente** al abrir el proyecto. Contiene
> todo el contexto necesario para retomar el trabajo en cualquier sesión nueva.
> Si haces cambios importantes, **actualiza este archivo** para que la próxima sesión
> tenga la memoria al día.

---

## 0. ⚡ CÓMO PUBLICAR (leer siempre antes de tocar nada)

**El usuario de este proyecto NO es técnico.** No le pidas que ejecute comandos en su
terminal, no le pidas tokens ni claves, no le pegues logs. Haz tú el trabajo y
respóndele en español sencillo.

Cuando diga cualquier cosa parecida a *"publica"*, *"sube los cambios"*, *"ponlo en la
página"*, *"que se vea en el sitio"*, *"ya quedó, súbelo"* → **ejecuta directamente**:

```bash
./publicar.sh
```

Ese script hace TODO: instala dependencias, construye, sube `dist/` por FTP a
SiteGround, publica las reglas de Firestore/Storage, despliega las Cloud Functions y
verifica contra el sitio en vivo. Variantes: `--web` (solo la página) y `--funciones`.

Reglas:
- ❌ **NUNCA** `firebase deploy --only hosting` — el sitio público se sirve desde
  SiteGround por FTP; ese comando no cambia nada en alliumhealth.net.
- Si falta `.env.deploy`, dile que se lo pida a Santiago y que lo guarde en la carpeta
  del proyecto. No intentes reconstruirlo ni le pidas las claves por chat.
- Si el build falla, **arregla tú el código** y reintenta; no le traslades el error.
- Si Firebase pide login, avísale que se abrirá el navegador y que entre con su cuenta
  de Google (solo la primera vez).
- Al terminar bien, haz `git add -A && git commit && git push origin master`.

### 🔒 El repositorio es PÚBLICO
`github.com/SantiagoGarzonDeveloper/illium-alliumhealth` es **público**. Jamás hagas
commit de `.env`, `.env.deploy`, `deploy-ftp.sh`, `DEPLOY_FTP.md` ni de ningún archivo
de service account. Si el usuario te pide subir claves "para que sea más fácil",
explícale en una frase que eso dejaría el hosting expuesto y hazlo por el archivo
local `.env.deploy` en su lugar. Antes de cualquier `git add -A`, confirma con
`git status` que no aparezca ninguno de esos archivos.

Detalles técnicos de cada paso: secciones 4.1–4.4 más abajo.

---

## 0.1 ⚠️ LA FACTURACIÓN DE FIREBASE ESTÁ CERRADA (22-sep-2026) — LEER

La cuenta de facturación del proyecto `monaco-community` está **cerrada**. Consecuencias
reales, comprobadas:

- **Firebase Storage está muerto**: toda descarga devuelve `HTTP 402 "The billing
  account for the owning project is disabled in state closed"`. Por eso las fotos de
  producto dejaron de verse. Ni siquiera el service account puede descargar (403).
- **Las Cloud Functions están caídas**: responden `HTTP 503`. No se pueden redesplegar
  (`Error: ...secretmanager... 403, This API method requires billing`).
  → Correos, WhatsApp, Stripe y OTP **no funcionan** hasta que se reactive la facturación.
- **Firestore SÍ funciona** (plan Spark) y **el hosting de SiteGround también**.

### Cómo se resolvió lo de las imágenes
**Todos los medios viven ahora en el propio dominio**, no en Firebase Storage:
- Imágenes de producto: `public/product-images/*.png` → `https://alliumhealth.net/product-images/…`
- Categorías: `public/category-images/*.png` · Logos, `hero-video.mp4` y `zelle-qr.png`: en `public/`
- Las URLs en Firestore (`products.img`, `settings/general.{logoUrl,logoUrlDark,heroVideoUrl,zelleQrUrl,categories[].imageUrl}`)
  se reescribieron a `https://alliumhealth.net/...`.
- **Subidas nuevas desde el panel:** ya NO usan Storage. Usan `public/subir.php`
  (endpoint propio en SiteGround) mediante `src/lib/uploadMedia.ts`; los archivos quedan
  en `https://alliumhealth.net/medios/<carpeta>/<archivo>`. Afecta a: foto de producto,
  QR de Zelle, imagen de categoría, COA (PDF) y foto de perfil.
  El token del endpoint está en `subir.php` y en `uploadMedia.ts` (es un token de
  cliente, no un secreto de servidor: solo evita subidas anónimas casuales).
- `isDeadStorageUrl()` (en `uploadMedia.ts`) detecta URLs viejas de Storage y las
  sustituye por una imagen de respaldo, para que nunca se vea una imagen rota.

### Verificación de QR sin backend
`VerifyAuthenticity.tsx` ya **no llama a la Cloud Function**: lee `authCodes/{code}`
directamente de Firestore (las reglas permiten lectura pública). Así el QR verifica
aunque las funciones estén caídas. **Escaneos ILIMITADOS**: ningún código se bloquea ni
se marca como sospechoso por escanearse varias veces. Efecto secundario: el contador de
escaneos del panel ya no sube (la función que lo incrementaba está caída).

---

## 0.2 Cambios pedidos por el cliente el 22-sep-2026 (todos aplicados y publicados)

1. **Fotos de producto** — arregladas migrando todos los medios al dominio (ver §0.1).
2. **Cuestionario eliminado** — fuera del menú, del pie, de la portada y de la ficha de
   producto. `/quiz` redirige a `/shop` (los enlaces viejos no dan 404). `Quiz.tsx` sigue
   en el repo pero ya no se enruta.
3. **"Consulting" quitado** del menú y de la portada (la ruta `/consulta` sigue viva por
   si hay enlaces antiguos, pero no se enlaza desde ningún sitio).
4. **QR sin restricciones** (ver §0.1).
5. **Sin referencias de uso humano**: se reescribieron los textos de resultado humano
   («pasión por el potencial humano», «pérdida de grasa», «recuperación muscular»,
   «clientes satisfechos») a lenguaje de vías de investigación, y se quitó la línea
   «Indicado para: male/female» del protocolo. **Los avisos legales de "NO para consumo
   humano" se mantienen a propósito** — son los que dejan claro que es solo laboratorio.
6. **Catálogo completo en la portada**: sección `#catalogo` con los 23 productos y
   filtros por categoría, sin salir de la home.
7. **Best-sellers al final** de la portada.
8. **Portal del socio: solo Zelle o link de pago** (`WorkerSaleForm.tsx`). Se quitaron
   efectivo, transferencia, tarjeta y «otro». El link de pago reutiliza el sistema de
   carritos compartidos (`/c/:id`), conserva la comisión del vendedor y se puede copiar
   o mandar por WhatsApp.
9. **QR copiable/descargable como imagen** en Admin → Autenticidad: botones «Copiar QR»
   (al portapapeles, PNG 1024px) y «PNG» (descarga) en cada código, para las etiquetas.

---

## 0.3 BACKEND PROPIO EN PHP (22-sep-2026) — sustituye a las Cloud Functions

Como las funciones responden 503 y no se pueden redesplegar, lo que dependía de
ellas se movió al hosting de SiteGround. **Ya no hace falta Firebase para esto.**

**Archivos:**
- `public/api.php` — la API pública (viaja con `npm run build`, NO tiene secretos).
- `servidor-privado/illium-nucleo.php` y `config.php` — se suben por FTP a
  `/alliumhealth.net/illium-privado/` (un nivel POR ENCIMA de `public_html`, así
  que no se pueden abrir desde internet). `config.php` está en `.gitignore`.

**Qué resuelve cada acción de `api.php`:**
| acción | sustituye a | notas |
|---|---|---|
| `validar-correo` | `validateEmail` | MX, desechables, erratas ("gmial.com") |
| `otp-crear` / `otp-verificar` | `requestEmailOTP` / `verifyEmailOTP` | el código se guarda en el servidor, **ya no en Firestore** |
| `factura` | `sendInvoiceEmail` | solo admin |
| `notificar-pedido` | `notifyOrderStatus` | solo admin |
| `pedido-creado` | `waOnOrderCreated` (avisos) | correo al cliente + a los admins + WhatsApp |
| `estado` | — | diagnóstico: `curl "https://alliumhealth.net/api.php?accion=estado"` |

**Seguridad:** las acciones de admin comprueban la firma del token de Firebase
contra los **certificados públicos** de Google (`illium_usuario_actual()`), y
luego que el correo esté en `config.php → admins`. **No hay ninguna llave
privada de Firebase en el hosting** — se intentó y se descartó a propósito:
subir el service account a un hosting compartido es demasiado riesgo.

**Correo:** sale del propio servidor (`mail()`, remitente
`no-reply@alliumhealth.net`). No usa Resend ni ninguna API externa.

**Restablecer contraseña:** ahora lo manda Firebase Authentication directamente
(`sendPasswordResetEmail`), que funciona sin funciones. Se pierde el diseño de
marca del correo, pero llega siempre.

**Inventario:** `src/lib/stockPedido.ts` descuenta el stock desde la web al
cerrar la venta. ⚠️ Las reglas de Firestore solo dejan escribir productos a
usuarios **con sesión iniciada**: en una compra de invitado el stock NO baja y
queda avisado en la consola. Para cubrirlo haría falta una de dos cosas, y
ambas las tiene que decidir el dueño: (a) una regla que permita bajar SOLO el
campo `stock`, o (b) el service account en el servidor.

### Lo que SIGUE necesitando las Cloud Functions (o una llave)
- **Stripe** (`createStripePaymentIntent`): hace falta la clave secreta
  `sk_live_...` en `config.php`. Hoy `cardPaymentsEnabled` está en `false`, así
  que el cliente no ve la opción y nada parece roto.
- **WhatsApp**: hace falta el token permanente de Meta en `config.php →
  meta_token` (el `meta_phone_id` ya está puesto).
- **`createSubAdmin` y `adminDeleteUserAccount`**: crean/borran usuarios de
  Firebase Authentication; eso solo se puede con el Admin SDK.

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
⚠️ Usa **firebase-tools v15+** (`npm i -g firebase-tools@latest`). La v14 tiene un bug
`Cannot read properties of undefined (reading 'runtime')` que rompe el deploy de funciones.

### 4.3 Cambiar reglas de Firestore/Storage o la base de datos
Los archivos ya están en el repo: `firestore.rules`, `storage.rules`, `firebase.json`,
`.firebaserc`. Para aplicar cambios:
```bash
firebase login                                       # 1ª vez: inicia sesión con tu cuenta Google
firebase deploy --only firestore:rules --project monaco-community
firebase deploy --only storage --project monaco-community     # reglas de Storage
```
> Tu cuenta de Google debe tener acceso al proyecto Firebase `monaco-community`
> (rol Editor/Owner). Esto se concede UNA vez desde la Consola de Firebase →
> Configuración → Usuarios y permisos. **No se necesita ningún archivo de clave** para
> esto: `firebase login` autentica como tu usuario.

### 4.4 Service account (clave de admin) — NUNCA se sube al repo
El JSON del service account (`*-adminsdk-*.json`) da acceso TOTAL a la base de datos.
Por eso está en `.gitignore` y NO está en GitHub. Solo lo necesitan los **scripts de
administración** (`scripts/*.mjs`: seeds, migraciones, lecturas masivas). Para usarlos:
```bash
export FIREBASE_SERVICE_ACCOUNT="/ruta/absoluta/a/serviceAccount.json"
node scripts/seed-products-firestore.mjs
```
o coloca el JSON junto a `package.json` / carpeta padre (lo resuelve
`scripts/resolve-firebase-credentials.mjs`). El archivo se comparte de forma privada
(no por el repositorio).

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
