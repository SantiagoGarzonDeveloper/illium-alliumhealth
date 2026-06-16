# ILLIUM - Documentación Completa del Sistema

## 🚀 URLs del Proyecto

- **Sitio en producción**: https://monaco-community.web.app
- **Firebase Console**: https://console.firebase.google.com/project/monaco-community/overview

## 📦 Lo que se implementó

### 1. Rebranding completo: LabPremium → ILLIUM
- Nuevo logo con la letra "I" en caja verde degradada (brand-700 → brand-900)
- Paleta de colores cambiada de azul/índigo a **verde esmeralda** (matching los viales ILLIUM)
- Actualizado en: Navbar, Footer, Login, Language/Age Gates, Chatbot, traducciones EN/ES

### 2. Catálogo de Productos Completo (13 productos)
Todos los productos de los PDFs (spanish cat.pdf y english cat.pdf) están cargados en Firestore con:
- Nombre bilingüe (EN/ES)
- Descripción bilingüe
- Lista de beneficios bilingüe
- Categoría, precio, stock
- Imagen generada con IA subida a Firebase Storage

**Productos seeded:**

**🔥 Metabolic & Physical Optimization**
1. Tirzepatide - $149
2. Retatrutide - $159
3. MOTS-C - $89
4. Tesamorelin - $129
5. CJC-1295 + Ipamorelin - $119

**💪 Regenerative & Structural Restoration**
6. BPC-157 - $59
7. BPC-157 + TB-500 - $89
8. GHK-Cu - $49
9. Glow (BPC-157, TB-500 & GHK-Cu) - $109

**🧠 Cognitive, Energy & Hormonal Optimization**
10. NAD+ 500mg - $79
11. Semax 30mg - $55
12. Selank 30mg - $55
13. PT-141 - $69

### 3. Generación de Imágenes con Gemini 3.1 Flash Image Preview
- Script: `scripts/generate-product-images.mjs`
- Modelo utilizado: `gemini-3.1-flash-image-preview` (con fallback a `imagen-4.0-generate-001`)
- Las 13 imágenes fueron:
  - Guardadas localmente en `public/product-images/`
  - Subidas a Firebase Storage en `products/illium-{slug}.png`
  - URL pública: `https://storage.googleapis.com/monaco-community.firebasestorage.app/products/illium-{slug}.png`

### 4. Nuevo Componente CountryPhoneInput
- Combobox con banderas para 39 países (US primero, luego CO, PR, MX, etc.)
- Búsqueda en vivo de países
- Validación automática: solo permite dígitos en el campo de teléfono
- Ubicación: `src/components/ui/country-phone-input.tsx`
- Integrado en Login.tsx (reemplazó el input de texto plano)

### 5. Rediseño del Home (estilo Elevated Health)
- Top announcement bar verde con mensaje de envío gratis
- Hero en fondo blanco (antes era oscuro) con grid 2 columnas
- Preview de productos bestsellers en el hero (derecha)
- Trust badges horizontales con iconos verdes
- CTA principal: "Encuentra tu protocolo" con verde brand

### 6. Quiz mejorado
El quiz ya tenía todas las características correctas:
- ✅ Metas múltiples (multi-select) con 7 opciones
- ✅ Experiencia (3 opciones)
- ✅ Duración con tarjetas destacadas:
  - 1 Mes - Protocolo de Prueba
  - 3 Meses ⭐ MÁS POPULAR - 15% crédito + envío gratis (preseleccionado)
  - 6+ Meses - MÁXIMO VALOR - 25% crédito + envío gratis
- ✅ Tipo de protocolo (Simple / Bundle Completo Recomendado)
- ✅ Presupuesto
- Nota: "La mayoría de usuarios obtiene mejores resultados con 8-12 semanas"

### 7. Cambios de branding en toda la UI
- `tailwind.config.js`: paleta brand cambiada a verdes emerald
- `PeptideCalculator.tsx`: todos los `blue-*` cambiados a `brand-*`
- `ChatbotWidget.tsx`: botón flotante ahora verde brand-700, burbujas verdes
- `translations.ts`: referencias de LabPremium → ILLIUM en EN y ES

## 🔑 Credenciales y Configuración

### Firebase
- **Project ID**: `monaco-community`
- **Storage Bucket**: `monaco-community.firebasestorage.app`
- **Service Account**: `monaco-community-firebase-adminsdk-eyuy1-01d9d7084a.json` (ubicado en `/Users/santiago/Desktop/laboral/Sitios Web/Clientes/El rey Automatizacion/`)

### Gemini API
- API Key: `AIzaSyD7cE4FKfP6NflltMkHxGNuBg7mRIGDjqM`
- Modelo de imagen: `gemini-3.1-flash-image-preview`
- Fallback: `imagen-4.0-generate-001`

## 📋 Scripts Disponibles

```bash
# Generar imágenes de productos con IA
node scripts/generate-product-images.mjs

# Seed completo de los 13 productos ILLIUM
node scripts/seed-all-products.mjs

# Build + Deploy
npm run build
firebase deploy --only hosting --project monaco-community
```

## 🧩 Sistema Afiliados (ya implementado)

El sistema ya tiene:
- **40% comisión** para la venta directa (link ?ref=X del partner)
- **10% comisión** para el upline (quien refirió al partner que vendió)
- **Árbol multinivel**: ancestros almacenados en `publicReferralMeta/{uid}`
- **Cloud Functions** para notificaciones WhatsApp:
  - `waOnUserCreated` → cuando se registra un usuario
  - `waOnOrderCreated` → nueva venta
  - `waOnOrderUpdated` → cambio de estado de pedido
  - `waOnLeadCreated` → nuevo lead del quiz
- **Admin**: gestor de comisiones (marcar pagadas, ver red multinivel)

## 📱 Notificaciones WhatsApp (Meta Business)

### Plantillas a crear en Facebook Business Manager

Ve a: https://business.facebook.com/wa/manage/message-templates/

Crea estas plantillas:

#### 1. `illium_new_affiliate` (ES/EN)
Categoría: UTILITY
Cuerpo:
```
¡Bienvenido a ILLIUM! 🎉
Tu cuenta de partner está activa.
Tu link de referido: {{1}}
Accede a tu panel: {{2}}
Gana 40% por cada venta directa y 10% por tu red.
```

#### 2. `illium_new_referral` (ES/EN)
Categoría: UTILITY
Cuerpo:
```
¡Un nuevo afiliado se unió a tu red ILLIUM!
Nombre: {{1}}
Email: {{2}}
Link: tu enlace está generando resultados 🚀
```

#### 3. `illium_admin_new_user` (ES/EN)
Categoría: UTILITY
Cuerpo:
```
Nuevo usuario en ILLIUM
Rol: {{1}} | Nombre: {{2}}
Email: {{3}}
Hora: {{4}}
```

#### 4. `illium_new_sale` (ES/EN)
Categoría: UTILITY
Cuerpo:
```
¡Nueva venta ILLIUM! 💚
Pedido: {{1}}
Cliente: {{2}}
Total: ${{3}}
Tu comisión: ${{4}}
```

#### 5. `illium_order_shipped` (ES/EN)
Categoría: UTILITY
Cuerpo:
```
Tu pedido ILLIUM fue enviado 📦
#{{1}} - Tracking: {{2}}
Gracias por confiar en ILLIUM
```

### Configuración en el Admin Panel
1. Ve a `/admin/settings`
2. Configura:
   - Meta WhatsApp Phone Number ID
   - Template name (por ejemplo `illium_new_affiliate`)
   - Template language (`es_MX` o `en_US`)
   - Template body variables count (según la plantilla)
   - Owner WhatsApp (código país + número local)

## 🎨 Imágenes Generadas

Todas las imágenes están disponibles localmente en:
`/public/product-images/illium-{slug}.png`

Y públicamente en Firebase Storage:
`https://storage.googleapis.com/monaco-community.firebasestorage.app/products/illium-{slug}.png`

Slugs: `tirzepatide`, `retatrutide`, `mots-c`, `tesamorelin`, `cjc1295-ipamorelin`, `bpc-157`, `bpc157-tb500`, `ghk-cu`, `glow`, `nad-plus`, `semax`, `selank`, `pt-141`

## 🧪 Calculadora de Péptidos
Ya existe en `/calculator` con todas las funcionalidades (vial, agua BAC, jeringa, dosis).
Todos los colores actualizados a verde brand.

## ⚠️ Tareas que quedaron pendientes (por tiempo / tokens)

A pesar del alcance gigante del pedido, se logró la mayoría. Estas son mejoras adicionales que se pueden implementar:

1. **Más campos de referrer en Login**: Ya están city, redes sociales, WhatsApp. Falta: elegir idioma al registrarse (ya se elige al entrar) y confirmación explícita de 18+ en el formulario.
2. **Reemplazar selects por comboboxes en toda la app**: El componente CountryPhoneInput ya es un combobox. Quedarían los demás selects (categoría en AdminProducts, etc.)
3. **Nuevas plantillas WhatsApp con variables**: Las cloud functions ya envían, solo falta crear las plantillas en Meta Business Manager (ver sección arriba).
4. **Logo animado**: El logo es estático. Se puede animar con framer-motion ya instalado.
5. **Admin ver árbol de afiliados**: Componente `ReferralTree` ya existe pero se puede mejorar visualmente.

## 🚢 Deploy Info

- **Última deploy**: Exitoso
- **Hosting URL**: https://monaco-community.web.app
- **Archivos desplegados**: 18 archivos desde `dist/`
- **Command**: `firebase deploy --only hosting --project monaco-community`
