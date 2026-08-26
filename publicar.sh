#!/usr/bin/env bash
# ============================================================
#  ILLIUM / alliumhealth.net  —  PUBLICAR TODO CON UN COMANDO
#  Uso:  ./publicar.sh              (web + reglas + funciones)
#        ./publicar.sh --web        (solo la página)
#        ./publicar.sh --funciones  (solo Cloud Functions + reglas)
#  Los secretos NO viven aquí: van en el archivo .env.deploy
#  (Santiago te lo envía aparte; nunca se sube a GitHub).
# ============================================================
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROYECTO="monaco-community"
REMOTE_DIR="/alliumhealth.net/public_html"

rojo()  { printf '\033[1;31m%s\033[0m\n' "$*"; }
verde() { printf '\033[1;32m%s\033[0m\n' "$*"; }
azul()  { printf '\033[1;36m\n▶ %s\033[0m\n' "$*"; }
morir() { echo; rojo "✖ $*"; echo; exit 1; }

HACER_WEB=1; HACER_FUN=1
case "${1:-}" in
  --web)       HACER_FUN=0 ;;
  --funciones) HACER_WEB=0 ;;
  "" ) ;;
  * ) morir "Opción desconocida: $1  (usa --web, --funciones, o nada)" ;;
esac

# ---------- 0. Secretos ----------
azul "Revisando configuración"
if [[ ! -f .env.deploy ]]; then
  cat <<'AYUDA'

  Falta el archivo .env.deploy (tiene las claves de FTP y de la IA).
  Pídeselo a Santiago, guárdalo en ESTA misma carpeta con el nombre
  exacto  .env.deploy  y vuelve a correr:  ./publicar.sh

  (Se ignora en git a propósito: nunca debe subirse a GitHub.)

AYUDA
  exit 1
fi
set -a; . ./.env.deploy; set +a
for v in FTP_HOST FTP_USER FTP_PASS; do
  [[ -n "${!v:-}" ]] || morir "En .env.deploy falta la variable $v"
done
verde "✔ .env.deploy cargado"

# El build necesita la clave de la IA en un archivo .env
if [[ -n "${VITE_GROQ_API_KEY:-}" ]]; then
  echo "VITE_GROQ_API_KEY=$VITE_GROQ_API_KEY" > .env
  verde "✔ .env generado para el build"
fi

# ---------- 1. Herramientas ----------
command -v node >/dev/null || morir "Falta Node.js. Instálalo desde https://nodejs.org (versión 20 o mayor)."

FIREBASE=(npx --yes firebase-tools@latest)
if command -v firebase >/dev/null 2>&1; then
  MAJOR="$(firebase --version 2>/dev/null | cut -d. -f1)"
  [[ "${MAJOR:-0}" =~ ^[0-9]+$ ]] && (( MAJOR >= 15 )) && FIREBASE=(firebase)
fi

if (( HACER_WEB )) && ! command -v lftp >/dev/null 2>&1; then
  azul "Instalando lftp (necesario para subir la página)"
  if command -v brew >/dev/null 2>&1; then
    brew install lftp || morir "No se pudo instalar lftp. Corre a mano:  brew install lftp"
  else
    morir "Falta 'lftp'. Instala Homebrew (https://brew.sh) y luego:  brew install lftp"
  fi
fi
verde "✔ Herramientas listas"

# ---------- 2. Dependencias ----------
azul "Instalando dependencias (puede tardar la primera vez)"
npm install --no-audit --no-fund || morir "Falló 'npm install'"
verde "✔ Dependencias instaladas"

# ---------- 3. Construir y subir la página ----------
if (( HACER_WEB )); then
  azul "Construyendo la página"
  npm run build || morir "Falló el build. Arriba está el error de TypeScript/Vite: arréglalo y vuelve a correr."
  [[ -f dist/index.html ]] || morir "El build no generó dist/index.html"
  verde "✔ Build listo"

  azul "Subiendo la página a alliumhealth.net (FTP)"
  lftp -p "${FTP_PORT:-21}" -u "$FTP_USER","$FTP_PASS" "$FTP_HOST" <<EOF || morir "Falló la subida por FTP. Revisa internet y las claves de .env.deploy."
set ftp:ssl-allow no
set net:max-retries 3
set net:reconnect-interval-base 5
set xfer:clobber on
mirror --reverse --parallel=4 --verbose --exclude-glob .DS_Store "$PWD/dist/" "$REMOTE_DIR/"
put "$PWD/dist/index.html" -o "$REMOTE_DIR/index.html"
put "$PWD/dist/donaton.html" -o "$REMOTE_DIR/donaton.html"
bye
EOF
  verde "✔ Página subida"
fi

# ---------- 4. Firebase: sesión ----------
if (( HACER_FUN )); then
  azul "Revisando tu sesión de Firebase"
  if ! "${FIREBASE[@]}" login:list 2>/dev/null | grep -qi '@'; then
    echo "  Se va a abrir el navegador: inicia sesión con la cuenta de Google que Santiago autorizó."
    "${FIREBASE[@]}" login || morir "No se pudo iniciar sesión en Firebase."
  fi
  verde "✔ Sesión de Firebase activa"

  azul "Publicando reglas de Firestore y Storage"
  "${FIREBASE[@]}" deploy --only firestore:rules,storage --project "$PROYECTO" \
    || morir "Falló el deploy de reglas. Si dice 'permission denied', pídele a Santiago que te dé rol Editor en el proyecto $PROYECTO."
  verde "✔ Reglas publicadas"

  azul "Compilando Cloud Functions"
  ( cd functions && npm install --no-audit --no-fund && npm run build ) || morir "Falló la compilación de las funciones (functions/)."
  verde "✔ Funciones compiladas"

  azul "Publicando Cloud Functions"
  "${FIREBASE[@]}" deploy --only functions --project "$PROYECTO" \
    || morir "Falló el deploy de funciones. Si el error menciona 'runtime', tu firebase-tools está viejo: corre  npm i -g firebase-tools@latest"
  verde "✔ Funciones publicadas"
fi

# ---------- 5. Verificación ----------
azul "Verificando que el sitio quedó actualizado"
LOCAL_JS="$(grep -oE 'index-[A-Za-z0-9_-]+\.js' dist/index.html 2>/dev/null | head -1)"
REMOTO="$(curl -fsS --max-time 20 "https://alliumhealth.net/index.html?nocache=$RANDOM" 2>/dev/null | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)"
echo "   local:  ${LOCAL_JS:-?}"
echo "   online: ${REMOTO:-no se pudo leer}"
if [[ -n "$LOCAL_JS" && "$LOCAL_JS" == "$REMOTO" ]]; then
  verde "✔ Confirmado: alliumhealth.net está sirviendo tu versión."
elif [[ -n "$REMOTO" ]]; then
  rojo  "⚠ El sitio todavía muestra una versión distinta."
  echo  "  Suele ser la caché del hosting: espera 1-2 min y recarga con Cmd+Shift+R."
fi

echo
verde "════════════════════════════════════════"
verde "  LISTO ✅   https://alliumhealth.net"
verde "════════════════════════════════════════"
echo
