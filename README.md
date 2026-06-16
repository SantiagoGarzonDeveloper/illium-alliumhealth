# ILLIUM — alliumhealth.net

Ecommerce de compuestos de investigación / péptidos (marca **ILLIUM**) con tienda,
recomendador con IA, generador de protocolos clínicos por pedido, sistema de
afiliados (MLM) y paneles de administración y de socio/trabajador.

- 🌐 **Sitio en vivo:** https://alliumhealth.net
- 📦 **Repositorio:** https://github.com/SantiagoGarzonDeveloper/illium-alliumhealth
- 🧠 **Memoria técnica completa para Claude:** ver [`CLAUDE.md`](./CLAUDE.md)

> **Stack:** Vite + React 19 + TypeScript + Tailwind · Firebase (`monaco-community`):
> Firestore, Storage, Cloud Functions · IA con Groq · Hosting en SiteGround (FTP).

---

## 🚀 Guía rápida para usar el proyecto con Claude Code

Esta guía es para abrir el proyecto en tu computador y poder pedirle cambios a Claude
(igual que lo hacemos nosotros). No necesitas saber programar.

### 1. Instalar lo necesario (una sola vez)

1. **Node.js** (incluye `npm`). Descárgalo de https://nodejs.org → versión **LTS** →
   instálalo con "Siguiente / Siguiente".
2. **Claude Code** (la herramienta de IA en la terminal). Abre la **Terminal**
   (en Mac: app "Terminal"; en Windows: "PowerShell") y pega:
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```
3. **Git** (para descargar el proyecto):
   - Mac: ya viene; si no, al escribir `git` te ofrece instalarlo.
   - Windows: descarga de https://git-scm.com → instalar con opciones por defecto.

### 2. Descargar el proyecto

**Opción A — con Git (recomendada):**
```bash
git clone https://github.com/SantiagoGarzonDeveloper/illium-alliumhealth.git
cd illium-alliumhealth
```

**Opción B — sin Git (descargar ZIP):**
Entra a https://github.com/SantiagoGarzonDeveloper/illium-alliumhealth →
botón verde **"Code"** → **"Download ZIP"** → descomprime → abre esa carpeta en la
terminal con `cd ruta/de/la/carpeta`.

### 3. Instalar las dependencias del proyecto
```bash
npm install
```

### 3.1 Configurar la clave de la IA (para chatbot/Quiz/protocolos)
Copia el archivo `.env.example` como `.env` y pega la clave de Groq que te dé Santiago
(o crea una gratis en https://console.groq.com/keys):
```bash
cp .env.example .env
# luego abre .env y pega la clave en VITE_GROQ_API_KEY=...
```
> Si no la configuras, el sitio funciona igual pero el chatbot, el Quiz y los
> protocolos con IA no responderán.

### 4. Verlo en tu navegador (modo desarrollo)
```bash
npm run dev
```
Abre el link que aparece (normalmente http://localhost:5173).

### 5. Pedirle cambios a Claude
Dentro de la carpeta del proyecto, en la terminal escribe:
```bash
claude
```
La primera vez te pedirá iniciar sesión con tu cuenta de Anthropic (sigue el link que
muestra). Luego, simplemente **escríbele en español lo que quieres cambiar**, por
ejemplo: *"cambia el texto del botón de inicio"* o *"agrega un campo nuevo al editor de
productos"*. Claude ya tiene toda la memoria del proyecto en [`CLAUDE.md`](./CLAUDE.md).

---

## 🛠️ Comandos útiles

| Comando | Para qué |
|---|---|
| `npm run dev` | Levanta el sitio en tu computador para ver cambios en vivo |
| `npm run build` | Compila la versión final lista para producción (carpeta `dist/`) |
| `npm run lint` | Revisa errores de código |
| `npm run deploy:rules` | Despliega las reglas de seguridad de Firestore |

---

## 🌍 Publicar cambios en alliumhealth.net

El sitio se publica por **FTP a SiteGround** (no Firebase Hosting). El flujo es:
```bash
npm run build
./deploy-ftp.sh
```
> ⚠️ Las **credenciales FTP** y los **archivos secretos** NO están en este repositorio
> por seguridad. Para publicar necesitas que Santiago te pase el archivo `DEPLOY_FTP.md`.
> Si solo quieres probar cambios en tu computador, con `npm run dev` es suficiente.

Detalles completos de despliegue, arquitectura, funciones, comisiones y el sistema de
protocolos con IA están en **[`CLAUDE.md`](./CLAUDE.md)** y en `ILLIUM_DOCUMENTATION.md`.

---

## 🔐 Notas de seguridad
- Credenciales FTP, service accounts y archivos `.env` están excluidos del repo
  (`.gitignore`).
- La clave de Firebase del frontend (`src/lib/firebase.ts`) es **pública por diseño**
  (la seguridad real está en las reglas de Firestore).
- Los secretos del backend (Stripe, Resend, WhatsApp) viven en GCP Secret Manager.
