/**
 * Subida de archivos al propio hosting (SiteGround), NO a Firebase Storage.
 *
 * Firebase Storage quedó inutilizable cuando se cerró la cuenta de facturación
 * del proyecto `monaco-community` (toda descarga devuelve HTTP 402 "billing
 * account ... disabled"). Por eso las fotos de producto dejaron de verse.
 * Ahora los archivos viven en el mismo dominio que la web: se suben con
 * `subir.php` y quedan en https://alliumhealth.net/medios/<carpeta>/<archivo>.
 */

const ENDPOINT = '/subir.php';
const TOKEN = 'illium-2026-9f3c7a1e';

export type MediaFolder = 'products' | 'branding' | 'payments' | 'coa' | 'avatars' | 'varios';

/** Sube un archivo y devuelve su URL pública definitiva. */
export async function uploadMedia(file: Blob, folder: MediaFolder = 'varios'): Promise<string> {
  const form = new FormData();
  const name = (file as File).name || 'archivo';
  form.append('file', file, name);
  form.append('folder', folder);
  form.append('token', TOKEN);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'X-Illium-Token': TOKEN },
    body: form,
  });

  let payload: { ok?: boolean; url?: string; error?: string } = {};
  try {
    payload = await res.json();
  } catch {
    throw new Error(`El servidor no respondió correctamente (HTTP ${res.status}).`);
  }
  if (!res.ok || !payload.ok || !payload.url) {
    throw new Error(`No se pudo subir el archivo: ${payload.error || `HTTP ${res.status}`}`);
  }
  return payload.url;
}

/**
 * URLs viejas de Firebase Storage que ya no cargan (cuenta de facturación
 * cerrada). Se usa para no renderizar imágenes rotas y caer al placeholder.
 */
export function isDeadStorageUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return url.includes('firebasestorage.googleapis.com') ||
    url.includes('storage.googleapis.com/monaco-community');
}
