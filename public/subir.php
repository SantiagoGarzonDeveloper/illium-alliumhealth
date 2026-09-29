<?php
/**
 * ILLIUM — endpoint de subida de archivos (reemplaza Firebase Storage).
 * Guarda imágenes/PDF en /medios/ y devuelve la URL pública.
 * Se sube por FTP a /alliumhealth.net/public_html/subir.php
 */
$ORIGENES = ['https://alliumhealth.net', 'https://www.alliumhealth.net', 'https://illiumlab.com', 'https://www.illiumlab.com', 'http://localhost:5173'];
$origen = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . (in_array($origen, $ORIGENES, true) ? $origen : 'https://alliumhealth.net'));
header('Access-Control-Allow-Headers: Content-Type, X-Illium-Token');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'method_not_allowed']); exit; }

$TOKEN = 'illium-2026-9f3c7a1e';
$sent = $_SERVER['HTTP_X_ILLIUM_TOKEN'] ?? ($_POST['token'] ?? '');
if (!hash_equals($TOKEN, (string) $sent)) { http_response_code(403); echo json_encode(['error' => 'forbidden']); exit; }

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
  http_response_code(400); echo json_encode(['error' => 'no_file']); exit;
}

$MAX = 25 * 1024 * 1024; // 25 MB
if ($_FILES['file']['size'] > $MAX) { http_response_code(413); echo json_encode(['error' => 'too_large']); exit; }

$ALLOWED = [
  'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
  'image/gif' => 'gif', 'image/heic' => 'heic', 'image/avif' => 'avif',
  'application/pdf' => 'pdf', 'video/mp4' => 'mp4',
];
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($_FILES['file']['tmp_name']);
if (!isset($ALLOWED[$mime])) { http_response_code(415); echo json_encode(['error' => 'bad_type', 'mime' => $mime]); exit; }
$ext = $ALLOWED[$mime];

$folder = preg_replace('/[^a-z0-9_-]/i', '', (string) ($_POST['folder'] ?? 'varios'));
if ($folder === '') { $folder = 'varios'; }

$raiz = __DIR__ . '/medios';
$base = $raiz . '/' . $folder;
if (!is_dir($base) && !mkdir($base, 0755, true) && !is_dir($base)) {
  http_response_code(500); echo json_encode(['error' => 'mkdir_failed']); exit;
}
// Nada dentro de /medios se ejecuta: solo se sirve como archivo estático.
$ht = $raiz . '/.htaccess';
if (!file_exists($ht)) {
  @file_put_contents($ht, "<FilesMatch \"\\.(php|php5|php7|phtml|pl|py|cgi|sh|shtml)$\">\n  Require all denied\n</FilesMatch>\nOptions -ExecCGI -Indexes\nAddHandler default-handler .php .phtml .php5 .php7\n");
}

$name = date('Ymd_His') . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
$dest = $base . '/' . $name;
if (!move_uploaded_file($_FILES['file']['tmp_name'], $dest)) {
  http_response_code(500); echo json_encode(['error' => 'move_failed']); exit;
}
@chmod($dest, 0644);

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'alliumhealth.net';
echo json_encode(['ok' => true, 'url' => $scheme . '://' . $host . '/medios/' . $folder . '/' . $name]);
