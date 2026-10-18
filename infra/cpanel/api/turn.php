<?php
declare(strict_types=1);

/**
 * Meshly TURN credential endpoint.
 *
 * Issues short-lived coturn credentials using the TURN REST API scheme
 * (coturn "use-auth-secret"): username = "<expiry>:<random>",
 * credential = base64(HMAC-SHA1(secret, username)).
 *
 * Stateless apart from a tiny per-IP rate-limit counter (file names are
 * salted hashes, so no IP addresses are stored in clear). Requires PHP 8.1+.
 *
 * Config is read from ~/meshly-config.php (cPanel home folder, outside any
 * document root). If it is missing, the endpoint answers 503 and the client
 * stays on free STUN only, which is the intended behaviour before coturn exists.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

function fail(int $code, string $error): never
{
    http_response_code($code);
    echo json_encode(['error' => $error]);
    exit;
}

function home_dir(): string
{
    if (function_exists('posix_getpwuid') && function_exists('posix_geteuid')) {
        $pw = posix_getpwuid(posix_geteuid());
        if (is_array($pw) && !empty($pw['dir']) && is_dir($pw['dir'])) {
            return rtrim($pw['dir'], '/');
        }
    }
    $env = getenv('HOME');
    if (is_string($env) && $env !== '' && is_dir($env)) {
        return rtrim($env, '/');
    }
    // Fallback: parent of the document root (docroot/api/turn.php -> parent of docroot)
    return dirname(__DIR__, 2);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    fail(405, 'method_not_allowed');
}

$home = home_dir();
$configFile = $home . '/meshly-config.php';
if (!is_file($configFile)) {
    // Jailed-FTP fallback: the file inside the document root itself. It is
    // denied to HTTP by the .htaccess FilesMatch rule and read only by PHP.
    $configFile = dirname(__DIR__) . '/meshly-config.php';
}
if (!is_file($configFile)) {
    fail(503, 'turn_not_configured');
}

/** @var mixed $config */
$config = require $configFile;
if (
    !is_array($config)
    || !isset($config['turn_secret'], $config['turn_host'])
    || !is_string($config['turn_secret'])
    || strlen($config['turn_secret']) < 32
    || !is_string($config['turn_host'])
    || !preg_match('/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i', $config['turn_host'])
) {
    fail(503, 'turn_not_configured');
}

// ---- Same-origin check -------------------------------------------------------
// Modern browsers send Sec-Fetch-Site. The client also sends a same-origin
// Referer (fetch option referrerPolicy: "same-origin") as a fallback.
$requestHost = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
$allowedHosts = array_map('strtolower', (array)($config['allowed_hosts'] ?? [$requestHost]));
if (!in_array($requestHost, $allowedHosts, true)) {
    fail(403, 'forbidden');
}
$fetchSite = (string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
if ($fetchSite !== '') {
    if ($fetchSite !== 'same-origin') {
        fail(403, 'forbidden');
    }
} else {
    $source = (string)($_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? ''));
    $sourceHost = strtolower((string)(parse_url($source, PHP_URL_HOST) ?? ''));
    if ($sourceHost === '' || !in_array($sourceHost, $allowedHosts, true)) {
        fail(403, 'forbidden');
    }
}

// ---- Per-IP rate limit (sliding window, 1 hour) -------------------------------
$now = time();
$limit = max(1, (int)($config['rate_per_hour'] ?? 30));
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
$dir = $home . '/.meshly-ratelimit';
if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
    fail(500, 'storage_error');
}
$bucket = $dir . '/' . hash('sha256', $ip . '|' . $config['turn_secret']);
$fh = @fopen($bucket, 'c+');
if ($fh === false) {
    fail(500, 'storage_error');
}
flock($fh, LOCK_EX);
$raw = stream_get_contents($fh);
$hits = json_decode($raw !== false && $raw !== '' ? $raw : '[]', true);
if (!is_array($hits)) {
    $hits = [];
}
$hits = array_values(array_filter($hits, static fn($t): bool => is_int($t) && $t > $now - 3600));
if (count($hits) >= $limit) {
    flock($fh, LOCK_UN);
    fclose($fh);
    header('Retry-After: 600');
    fail(429, 'rate_limited');
}
$hits[] = $now;
ftruncate($fh, 0);
rewind($fh);
fwrite($fh, json_encode($hits));
fflush($fh);
flock($fh, LOCK_UN);
fclose($fh);

// Opportunistic cleanup of stale buckets (about 1 in 100 requests)
if (random_int(1, 100) === 1) {
    foreach (glob($dir . '/*') ?: [] as $file) {
        if (is_file($file) && filemtime($file) < $now - 7200) {
            @unlink($file);
        }
    }
}

// ---- Credentials ----------------------------------------------------------------
$ttl = max(600, min(86400, (int)($config['ttl'] ?? 7200)));
$expiresAt = $now + $ttl;
$username = $expiresAt . ':' . bin2hex(random_bytes(4));
$credential = base64_encode(hash_hmac('sha1', $username, $config['turn_secret'], true));
$host = strtolower($config['turn_host']);
$tlsPort = (int)($config['tls_port'] ?? 443);

echo json_encode([
    'ttl' => $ttl,
    'expiresAt' => $expiresAt,
    'iceServers' => [[
        'urls' => [
            "turn:{$host}:3478?transport=udp",
            "turn:{$host}:3478?transport=tcp",
            "turns:{$host}:{$tlsPort}?transport=tcp",
        ],
        'username' => $username,
        'credential' => $credential,
    ]],
], JSON_UNESCAPED_SLASHES);
