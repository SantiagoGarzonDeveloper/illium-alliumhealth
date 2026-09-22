<?php
/**
 * ILLIUM — núcleo del backend propio (sustituye a las Cloud Functions caídas).
 *
 * Vive FUERA de public_html: no se puede abrir desde el navegador.
 * NO guarda ninguna llave maestra de Firebase. Solo necesita:
 *   - el servidor de correo del propio dominio,
 *   - los certificados PÚBLICOS de Google (para comprobar quién es admin),
 *   - una carpeta de datos para los códigos de acceso.
 */
declare(strict_types=1);

define('ILLIUM_PRIVADO', __DIR__);
define('ILLIUM_PROYECTO', 'monaco-community');

function illium_config(): array {
  static $cfg = null;
  if ($cfg === null) {
    $f = ILLIUM_PRIVADO . '/config.php';
    $cfg = file_exists($f) ? (array) (require $f) : [];
  }
  return $cfg;
}

function illium_log(string $msg): void {
  @file_put_contents(ILLIUM_PRIVADO . '/registro.log', date('Y-m-d H:i:s') . " $msg\n", FILE_APPEND);
}

function illium_datos_dir(): string {
  $d = ILLIUM_PRIVADO . '/datos';
  if (!is_dir($d)) @mkdir($d, 0700, true);
  return $d;
}

// ───────────────────────────────── HTTP ─────────────────────────────────

function illium_http(string $metodo, string $url, $datos = null, array $cabeceras = [], string $formato = 'json'): array {
  $ch = curl_init($url);
  $h = $cabeceras;
  if ($datos !== null) {
    if ($formato === 'form') { $cuerpo = http_build_query($datos); $h[] = 'Content-Type: application/x-www-form-urlencoded'; }
    else { $cuerpo = json_encode($datos, JSON_UNESCAPED_UNICODE); $h[] = 'Content-Type: application/json'; }
    curl_setopt($ch, CURLOPT_POSTFIELDS, $cuerpo);
  }
  curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => $h, CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 10,
  ]);
  $raw = curl_exec($ch);
  $cod = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err = curl_error($ch);
  curl_close($ch);
  if ($raw === false) throw new RuntimeException("fallo de red: $err");
  return ['codigo' => $cod, 'cuerpo' => json_decode((string) $raw, true), 'texto' => (string) $raw];
}

// ─────────────── Identidad: comprobar el token de sesión de Firebase ───────────────

/**
 * Comprueba la firma del token que manda el navegador contra los certificados
 * PÚBLICOS de Google. No hace falta ninguna llave privada para esto.
 */
function illium_usuario_actual(): ?array {
  $cab = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
  if (!preg_match('/Bearer\s+(.+)/i', (string) $cab, $m)) return null;
  $partes = explode('.', trim($m[1]));
  if (count($partes) !== 3) return null;

  $cabecera = json_decode((string) base64_decode(strtr($partes[0], '-_', '+/')), true);
  $cuerpo   = json_decode((string) base64_decode(strtr($partes[1], '-_', '+/')), true);
  if (!is_array($cabecera) || !is_array($cuerpo)) return null;
  if (($cuerpo['aud'] ?? '') !== ILLIUM_PROYECTO) return null;
  if (($cuerpo['iss'] ?? '') !== 'https://securetoken.google.com/' . ILLIUM_PROYECTO) return null;
  if ((int) ($cuerpo['exp'] ?? 0) < time()) return null;
  if (empty($cuerpo['sub'])) return null;

  $cache = illium_datos_dir() . '/certs.json';
  $certs = (file_exists($cache) && (time() - filemtime($cache)) < 3600)
    ? json_decode((string) file_get_contents($cache), true) : null;
  if (!is_array($certs) || !$certs) {
    $r = illium_http('GET', 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    $certs = is_array($r['cuerpo']) ? $r['cuerpo'] : [];
    @file_put_contents($cache, json_encode($certs));
  }
  $kid = (string) ($cabecera['kid'] ?? '');
  if (empty($certs[$kid])) return null;
  if (openssl_verify($partes[0] . '.' . $partes[1], (string) base64_decode(strtr($partes[2], '-_', '+/')), $certs[$kid], 'sha256WithRSAEncryption') !== 1) return null;

  return ['uid' => (string) $cuerpo['sub'], 'email' => strtolower((string) ($cuerpo['email'] ?? ''))];
}

function illium_es_admin(?array $u): bool {
  if (!$u || !$u['email']) return false;
  $admins = array_map('strtolower', (array) (illium_config()['admins'] ?? []));
  return in_array($u['email'], $admins, true);
}

// ────────────────────────── Almacén simple en disco ──────────────────────────

function illium_guardar(string $clave, array $valor): void {
  $f = illium_datos_dir() . '/' . preg_replace('/[^a-z0-9_.-]/i', '', $clave) . '.json';
  @file_put_contents($f, json_encode($valor), LOCK_EX);
  @chmod($f, 0600);
}

function illium_cargar(string $clave): ?array {
  $f = illium_datos_dir() . '/' . preg_replace('/[^a-z0-9_.-]/i', '', $clave) . '.json';
  if (!file_exists($f)) return null;
  $v = json_decode((string) file_get_contents($f), true);
  return is_array($v) ? $v : null;
}

function illium_borrar(string $clave): void {
  @unlink(illium_datos_dir() . '/' . preg_replace('/[^a-z0-9_.-]/i', '', $clave) . '.json');
}

/** Freno anti-abuso: como máximo $max acciones por $ventana segundos. */
function illium_limite(string $clave, int $max, int $ventana): bool {
  $c = 'lim_' . md5($clave);
  $d = illium_cargar($c) ?? ['inicio' => time(), 'n' => 0];
  if (time() - (int) $d['inicio'] > $ventana) $d = ['inicio' => time(), 'n' => 0];
  $d['n'] = (int) $d['n'] + 1;
  illium_guardar($c, $d);
  return $d['n'] <= $max;
}

// ───────────────────────────────── Correo ─────────────────────────────────

function illium_correo(string $para, string $asunto, string $html): bool {
  if (!filter_var($para, FILTER_VALIDATE_EMAIL)) return false;
  $cfg = illium_config();
  $remitente = (string) ($cfg['correo_remitente'] ?? 'no-reply@alliumhealth.net');
  $nombre    = (string) ($cfg['correo_nombre'] ?? 'ILLIUM');
  $cabeceras = implode("\r\n", [
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'From: ' . sprintf('=?UTF-8?B?%s?= <%s>', base64_encode($nombre), $remitente),
    'Reply-To: ' . $remitente,
    'X-Mailer: ILLIUM',
  ]);
  $ok = @mail($para, '=?UTF-8?B?' . base64_encode($asunto) . '?=', $html, $cabeceras, '-f' . $remitente);
  illium_log(($ok ? 'CORREO OK    ' : 'CORREO FALLO ') . "$para :: $asunto");
  return $ok;
}

function illium_plantilla(string $titulo, string $cuerpoHtml, string $preheader = ''): string {
  $t = htmlspecialchars($titulo, ENT_QUOTES, 'UTF-8');
  return '<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;">'
    . ($preheader ? '<div style="display:none;max-height:0;overflow:hidden;">' . htmlspecialchars($preheader, ENT_QUOTES, 'UTF-8') . '</div>' : '')
    . '<table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 14px;"><tr><td align="center">'
    . '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">'
    . '<tr><td style="background:#0b1a12;padding:20px 26px;">'
    . '<div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:7px;">ILLIUM</div>'
    . '<div style="color:#6ee7b7;font-size:10px;letter-spacing:2px;margin-top:4px;">COMPUESTOS DE INVESTIGACIÓN · 99%+</div>'
    . '</td></tr><tr><td style="padding:26px;color:#0f172a;font-size:15px;line-height:1.6;">'
    . '<h1 style="margin:0 0 14px;font-size:20px;color:#0f172a;">' . $t . '</h1>' . $cuerpoHtml
    . '</td></tr><tr><td style="padding:16px 26px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;line-height:1.5;">'
    . 'ILLIUM · alliumhealth.net<br>Solo para investigación de laboratorio in vitro. No apto para consumo humano o animal.'
    . '</td></tr></table></td></tr></table></body></html>';
}

// ───────────────────────────────── WhatsApp ─────────────────────────────────

function illium_whatsapp(string $numero, string $texto): bool {
  $cfg = illium_config();
  $token = (string) ($cfg['meta_token'] ?? '');
  $phoneId = (string) ($cfg['meta_phone_id'] ?? '');
  if (!$token || !$phoneId) { illium_log("WHATSAPP saltado (sin token) -> $numero"); return false; }
  try {
    $r = illium_http('POST', "https://graph.facebook.com/v21.0/$phoneId/messages", [
      'messaging_product' => 'whatsapp',
      'to' => preg_replace('/\D/', '', $numero),
      'type' => 'text',
      'text' => ['body' => mb_substr($texto, 0, 3800)],
    ], ['Authorization: Bearer ' . $token]);
    $ok = $r['codigo'] < 400;
    illium_log(($ok ? 'WHATSAPP OK   ' : 'WHATSAPP FALLO ') . mb_substr($r['texto'], 0, 160));
    return $ok;
  } catch (Throwable $e) { illium_log('WHATSAPP ERROR ' . $e->getMessage()); return false; }
}
