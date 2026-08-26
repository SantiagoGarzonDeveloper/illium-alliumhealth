---
description: Publica todos los cambios en alliumhealth.net (web + reglas + funciones)
allowed-tools: Bash, Read, Edit
---

Publica el proyecto en producción. El usuario **no es técnico**: no le expliques
comandos, no le pidas que ejecute nada en su terminal, no le muestres logs crudos.
Hazlo tú y repórtale el resultado en una o dos frases en español sencillo.

Pasos:

1. Ejecuta desde la raíz del proyecto:
   ```bash
   ./publicar.sh
   ```
   (Si el usuario pidió explícitamente solo la página, usa `./publicar.sh --web`;
   si pidió solo las funciones o reglas de la base de datos, `./publicar.sh --funciones`.)

2. **Si falta `.env.deploy`**, no intentes arreglarlo tú ni pidas las claves.
   Dile exactamente esto:
   > Me falta el archivo de claves para poder publicar. Escríbele a Santiago
   > pidiéndole el archivo `.env.deploy` y, cuando te lo mande, guárdalo dentro de la
   > carpeta del proyecto. Después dime "publica" otra vez y yo sigo.

3. **Si el script pide iniciar sesión en Firebase**, avísale que se le va a abrir el
   navegador y que entre con su cuenta de Google (la que Santiago le autorizó).
   Es solo la primera vez.

4. **Si falla el build (TypeScript/Vite)**, arregla tú el error en el código y vuelve
   a correr `./publicar.sh`. No le pases el error al usuario a menos que no puedas
   resolverlo; en ese caso explícale en una frase qué está roto.

5. **Si el script termina con `⚠ El sitio todavía muestra una versión distinta`**,
   espera un minuto y vuelve a verificar con:
   ```bash
   curl -s "https://alliumhealth.net/index.html?nocache=$RANDOM" | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1
   ```
   y compáralo con el de `dist/index.html`.

6. Cuando termine bien, guarda también el trabajo en GitHub:
   ```bash
   git add -A && git commit -m "<resumen corto de los cambios>" && git push origin master
   ```

7. Cierra con algo así: **"Listo ✅ Ya puedes verlo en https://alliumhealth.net
   (si lo ves igual, recarga con Cmd+Shift+R)."**

Nunca uses `firebase deploy --only hosting`: el sitio público se sirve desde
SiteGround por FTP y ese comando no lo actualiza.
