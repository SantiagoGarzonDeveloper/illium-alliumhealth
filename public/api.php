<?php
/**
 * ILLIUM — API propia (sustituye a las Cloud Functions).
 * En public_html, pero SIN secretos: la configuración vive en ../illium-privado/.
 *
 * Acciones: estado · validar-correo · otp-crear · otp-verificar ·
 *           factura · pedido-creado · notificar-pedido
 */
declare(strict_types=1);

$ORIGENES = ['https://alliumhealth.net', 'https://www.alliumhealth.net', 'https://illiumlab.com', 'https://www.illiumlab.com', 'http://localhost:5173'];
$origen = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . (in_array($origen, $ORIGENES, true) ? $origen : 'https://alliumhealth.net'));
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

require_once dirname(__DIR__) . '/illium-privado/illium-nucleo.php';

function responder(array $d, int $c = 200) { http_response_code($c); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function fallo(string $m, int $c = 400) { responder(['ok' => false, 'error' => $m], $c); }

$entrada = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($entrada)) $entrada = $_POST;
$accion = (string) ($entrada['accion'] ?? $_GET['accion'] ?? '');
$ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '0');

/** Resumen del pedido en HTML, a partir de lo que manda la web. */
function illium_tabla_pedido(array $p): string {
  $filas = '';
  foreach ((array) ($p['items'] ?? []) as $it) {
    $n = htmlspecialchars((string) ($it['name'] ?? ''), ENT_QUOTES);
    $c = max(1, (int) ($it['quantity'] ?? 1));
    $pu = (float) ($it['price'] ?? 0);
    $filas .= "<tr><td style='padding:7px 0;border-bottom:1px solid #e2e8f0;'>$n</td>"
      . "<td style='padding:7px 0;border-bottom:1px solid #e2e8f0;text-align:center;'>x$c</td>"
      . "<td style='padding:7px 0;border-bottom:1px solid #e2e8f0;text-align:right;'>$" . number_format($pu * $c, 2) . '</td></tr>';
  }
  return "<table style='width:100%;border-collapse:collapse;font-size:14px;'>$filas"
    . "<tr><td style='padding:12px 0;font-weight:700;'>Total</td><td></td>"
    . "<td style='padding:12px 0;text-align:right;font-weight:800;font-size:18px;'>$"
    . number_format((float) ($p['total'] ?? 0), 2) . '</td></tr></table>';
}

try {
  switch ($accion) {

    case 'estado': {
      $cfg = illium_config();
      responder([
        'ok' => true,
        'php' => PHP_VERSION,
        'correo' => function_exists('mail'),
        'admins' => count((array) ($cfg['admins'] ?? [])),
        'whatsapp_configurado' => !empty($cfg['meta_token']),
        'stripe_configurado' => !empty($cfg['stripe_secreto']),
      ]);
    }

    // ── Comprobar que un correo existe de verdad ──
    case 'validar-correo': {
      $email = strtolower(trim((string) ($entrada['email'] ?? '')));
      if (!filter_var($email, FILTER_VALIDATE_EMAIL)) responder(['valid' => false, 'reason' => 'bad_format']);
      [$local, $dominio] = explode('@', $email, 2);
      if (strlen($local) < 2) responder(['valid' => false, 'reason' => 'local_too_short']);
      $desechables = ['mailinator.com','tempmail.com','10minutemail.com','guerrillamail.com','yopmail.com','trashmail.com','sharklasers.com','getnada.com','temp-mail.org','dispostable.com','maildrop.cc','fakeinbox.com'];
      if (in_array($dominio, $desechables, true)) responder(['valid' => false, 'reason' => 'disposable']);
      foreach (['gmail.com','hotmail.com','outlook.com','yahoo.com','icloud.com','live.com','protonmail.com','aol.com'] as $d) {
        if ($dominio !== $d && levenshtein($dominio, $d) <= 2) {
          responder(['valid' => false, 'reason' => 'typo', 'suggestion' => $local . '@' . $d]);
        }
      }
      if (!checkdnsrr($dominio, 'MX') && !checkdnsrr($dominio, 'A')) responder(['valid' => false, 'reason' => 'no_mx']);
      responder(['valid' => true]);
    }

    // ── Código de acceso por correo (se guarda en el servidor, no en la base de datos) ──
    case 'otp-crear': {
      $email = strtolower(trim((string) ($entrada['email'] ?? '')));
      $es = (string) ($entrada['locale'] ?? 'es') === 'es';
      if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fallo('correo_invalido');
      if (!illium_limite("otp_ip_$ip", 20, 3600)) fallo('demasiados_intentos', 429);

      $clave = 'otp_' . md5($email);
      $previo = illium_cargar($clave);
      $ahora = time();
      if ($previo && ($ahora - (int) ($previo['creado'] ?? 0)) < 30) {
        responder(['sent' => false, 'reason' => 'too_fast'], 429);
      }
      $codigo = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
      illium_guardar($clave, ['email' => $email, 'codigo' => $codigo, 'creado' => $ahora, 'expira' => $ahora + 600, 'intentos' => 0]);

      $cuerpo = '<p style="margin:0 0 18px;color:#475569;">'
        . ($es ? 'Usa este código para continuar. Caduca en 10 minutos.' : 'Use this code to continue. It expires in 10 minutes.')
        . '</p><div style="text-align:center;margin:26px 0;"><span style="display:inline-block;background:#0b1a12;color:#6ee7b7;font-size:34px;font-weight:800;letter-spacing:12px;padding:18px 26px;border-radius:12px;font-family:monospace;">'
        . $codigo . '</span></div><p style="margin:0;color:#94a3b8;font-size:13px;">'
        . ($es ? 'Si no pediste este código, ignora este correo.' : 'If you did not request this code, ignore this email.') . '</p>';
      $enviado = illium_correo($email, ($es ? 'ILLIUM · Tu código ' : 'ILLIUM · Your code ') . $codigo,
        illium_plantilla($es ? 'Tu código de acceso' : 'Your access code', $cuerpo, $codigo));
      responder($enviado ? ['sent' => true] : ['sent' => false, 'reason' => 'mail_failed']);
    }

    case 'otp-verificar': {
      $email = strtolower(trim((string) ($entrada['email'] ?? '')));
      $codigo = trim((string) ($entrada['code'] ?? ''));
      if (!$email || !$codigo) fallo('faltan_datos');
      $clave = 'otp_' . md5($email);
      $d = illium_cargar($clave);
      if (!$d) responder(['valid' => false, 'reason' => 'not_requested']);
      if ((int) ($d['expira'] ?? 0) < time()) { illium_borrar($clave); responder(['valid' => false, 'reason' => 'expired']); }
      $intentos = (int) ($d['intentos'] ?? 0);
      if ($intentos >= 5) responder(['valid' => false, 'reason' => 'too_many_attempts']);
      if (!hash_equals((string) ($d['codigo'] ?? ''), $codigo)) {
        $d['intentos'] = $intentos + 1;
        illium_guardar($clave, $d);
        responder(['valid' => false, 'reason' => 'wrong_code', 'attemptsLeft' => 5 - $d['intentos']]);
      }
      $d['verificado'] = true;
      illium_guardar($clave, $d);
      responder(['valid' => true]);
    }

    // ── Enviar una factura (solo administradores) ──
    case 'factura': {
      if (!illium_es_admin(illium_usuario_actual())) fallo('no_autorizado', 403);
      $para = strtolower(trim((string) ($entrada['to'] ?? '')));
      $asunto = trim((string) ($entrada['subject'] ?? 'ILLIUM'));
      $html = (string) ($entrada['html'] ?? '');
      if (!filter_var($para, FILTER_VALIDATE_EMAIL) || $html === '') fallo('faltan_datos');
      if (!illium_correo($para, $asunto, $html)) fallo('no_se_pudo_enviar', 500);
      responder(['ok' => true, 'recipient' => $para]);
    }

    // ── Pedido nuevo: avisar al cliente, a los admins y por WhatsApp ──
    case 'pedido-creado': {
      $pedido = (array) ($entrada['pedido'] ?? []);
      $orderId = trim((string) ($entrada['orderId'] ?? ''));
      if ($orderId === '') fallo('falta_orderId');
      if (!illium_limite("pedido_ip_$ip", 30, 3600)) fallo('demasiados_envios', 429);
      // Un pedido solo avisa una vez, aunque la web reintente.
      if (illium_cargar('ped_' . md5($orderId))) responder(['ok' => true, 'ya_avisado' => true]);
      illium_guardar('ped_' . md5($orderId), ['t' => time()]);

      $cfg = illium_config();
      $nombre = trim((string) ($pedido['nombre'] ?? ''));
      $correoCliente = strtolower(trim((string) ($pedido['email'] ?? '')));
      $total = (float) ($pedido['total'] ?? 0);
      $ref = substr($orderId, 0, 8);
      $tabla = illium_tabla_pedido($pedido);
      $res = ['ok' => true, 'correos' => []];

      if (filter_var($correoCliente, FILTER_VALIDATE_EMAIL)) {
        $c = '<p style="margin:0 0 6px;">' . htmlspecialchars($nombre ?: 'Hola', ENT_QUOTES) . ',</p>'
          . '<p style="margin:0 0 18px;color:#475569;">Recibimos tu pedido. Te avisamos en cuanto salga el envío.</p>'
          . $tabla . '<p style="margin:20px 0 0;color:#64748b;font-size:13px;">Referencia: ' . $ref . '</p>';
        $res['correos']['cliente'] = illium_correo($correoCliente, "ILLIUM · Pedido recibido ($ref)",
          illium_plantilla('Pedido recibido', $c, 'Total $' . number_format($total, 2)));
      }

      $cAdmin = '<p style="margin:0 0 14px;color:#475569;">Entró un pedido nuevo.</p>'
        . '<p style="margin:0 0 4px;"><b>Cliente:</b> ' . htmlspecialchars($nombre, ENT_QUOTES) . '</p>'
        . '<p style="margin:0 0 4px;"><b>Correo:</b> ' . htmlspecialchars($correoCliente, ENT_QUOTES) . '</p>'
        . '<p style="margin:0 0 4px;"><b>WhatsApp:</b> ' . htmlspecialchars((string) ($pedido['whatsapp'] ?? '—'), ENT_QUOTES) . '</p>'
        . '<p style="margin:0 0 14px;"><b>Pago:</b> ' . htmlspecialchars((string) ($pedido['pago'] ?? '—'), ENT_QUOTES) . '</p>'
        . $tabla . '<p style="margin:20px 0 0;color:#64748b;font-size:13px;">Referencia: ' . $ref . '</p>';
      foreach ((array) ($cfg['admins'] ?? []) as $a) {
        if (is_string($a) && filter_var($a, FILTER_VALIDATE_EMAIL)) {
          $res['correos'][$a] = illium_correo($a, 'ILLIUM · Pedido nuevo $' . number_format($total, 2),
            illium_plantilla('Pedido nuevo', $cAdmin));
        }
      }

      $texto = "ILLIUM · Pedido nuevo\nCliente: $nombre\nTotal: $" . number_format($total, 2) . "\nRef: $ref";
      foreach ((array) ($cfg['whatsapp_avisos'] ?? []) as $n) { if (is_string($n) && $n) illium_whatsapp($n, $texto); }

      responder($res);
    }

    // ── Reenviar el aviso de un pedido desde el panel (solo admin) ──
    case 'notificar-pedido': {
      if (!illium_es_admin(illium_usuario_actual())) fallo('no_autorizado', 403);
      $para = strtolower(trim((string) ($entrada['to'] ?? '')));
      $asunto = trim((string) ($entrada['subject'] ?? 'ILLIUM · Tu pedido'));
      $html = (string) ($entrada['html'] ?? '');
      if (!filter_var($para, FILTER_VALIDATE_EMAIL)) fallo('sin_correo_destino');
      if ($html === '') fallo('faltan_datos');
      if (!illium_correo($para, $asunto, illium_plantilla('Tu pedido', $html))) fallo('no_se_pudo_enviar', 500);
      responder(['ok' => true, 'recipient' => $para, 'count' => 1, 'template' => 'estado_pedido']);
    }

    default:
      fallo('accion_desconocida: ' . $accion, 404);
  }
} catch (Throwable $e) {
  illium_log("ERROR $accion :: " . $e->getMessage());
  fallo('error_interno', 500);
}
