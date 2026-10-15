<?php
/**
 * GravyBlock static-site connector (v1, PHP shim).
 *
 * For sites made of plain HTML files on a PHP-capable host. Directory pages (/about/ -> about/index.html)
 * are routed through this file by one .htaccess rule. It serves the original file unchanged unless GravyBlock
 * has published a signed override for that path, in which case it patches ONLY head metadata:
 * title, description, og:/twitter: social preview image, and JSON-LD. It never edits files on disk.
 *
 * Fail-open by design: any missing extension, network error, bad signature or unexpected input serves the
 * original file exactly as the web server would have.
 *
 * The business id and the declared capabilities live in /.well-known/gravyblock.json (single source of truth).
 * Authenticity: the feed is signed with Ed25519; only the PUBLIC key is embedded here.
 */

const GB_PUBLIC_KEY_B64 = 'LCDWzuoPOCXYqSf8s4SOwjeZ4wjJbEnZw37HDA+c320=';
const GB_FEED_BASE = 'https://gravyblock.com/api/managed-site/';
const GB_CACHE_TTL = 60;
const GB_STALE_MAX = 86400;

function gb_root(): string
{
    return rtrim(str_replace('\\', '/', (string) ($_SERVER['DOCUMENT_ROOT'] ?? '')), '/');
}

function gb_business_id(): ?string
{
    $f = gb_root() . '/.well-known/gravyblock.json';
    if (!is_file($f)) {
        return null;
    }
    $j = json_decode((string) @file_get_contents($f), true);
    $id = is_array($j) ? ($j['businessId'] ?? null) : null;
    return is_string($id) && preg_match('/^[0-9a-f\-]{36}$/i', $id) ? strtolower($id) : null;
}

function gb_http_get(string $url, ?string &$signature): ?string
{
    $signature = null;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $sig = null;
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 3,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_USERAGENT => 'GravyBlock-Connector/1',
            CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$sig) {
                if (stripos($h, 'x-gravyblock-signature:') === 0) {
                    $sig = trim(substr($h, 23));
                }
                return strlen($h);
            },
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        $signature = $sig;
        return ($body !== false && $code === 200) ? (string) $body : null;
    }
    $ctx = stream_context_create(['http' => ['timeout' => 3, 'ignore_errors' => true, 'header' => "User-Agent: GravyBlock-Connector/1\r\n"]]);
    $body = @file_get_contents($url, false, $ctx);
    if ($body === false) {
        return null;
    }
    foreach (($http_response_header ?? []) as $h) {
        if (stripos($h, 'x-gravyblock-signature:') === 0) {
            $signature = trim(substr($h, 23));
        }
    }
    return (string) $body;
}

/** Returns the verified feed (array) or null. Cached briefly on disk; a stale copy is used if GravyBlock is unreachable. */
function gb_feed(string $bid): ?array
{
    $cache = sys_get_temp_dir() . '/gb-feed-' . md5($bid) . '.json';
    if (is_file($cache) && time() - (int) filemtime($cache) < GB_CACHE_TTL) {
        $j = json_decode((string) @file_get_contents($cache), true);
        if (is_array($j) && ($j['businessId'] ?? '') === $bid) {
            return $j;
        }
    }
    $body = null;
    $sig = null;
    $body = gb_http_get(GB_FEED_BASE . $bid . '/feed', $sig);
    if ($body !== null && $sig !== null && function_exists('sodium_crypto_sign_verify_detached')) {
        $raw = base64_decode($sig, true);
        $key = base64_decode(GB_PUBLIC_KEY_B64, true);
        if ($raw !== false && $key !== false && strlen($key) === 32 && strlen($raw) === 64 && sodium_crypto_sign_verify_detached($raw, $body, $key)) {
            $j = json_decode($body, true);
            if (is_array($j) && ($j['businessId'] ?? '') === $bid) {
                @file_put_contents($cache, $body, LOCK_EX);
                return $j;
            }
        }
    }
    if (is_file($cache) && time() - (int) filemtime($cache) < GB_STALE_MAX) {
        $j = json_decode((string) @file_get_contents($cache), true);
        if (is_array($j) && ($j['businessId'] ?? '') === $bid) {
            return $j;
        }
    }
    return null;
}

function gb_norm(string $p): string
{
    $p = '/' . trim($p, '/');
    return $p === '/' ? '/' : $p;
}

function gb_esc(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function gb_set_meta(string $head, string $attr, string $name, string $content): string
{
    $re = '/<meta\s+[^>]*\b' . $attr . '\s*=\s*["\']' . preg_quote($name, '/') . '["\'][^>]*>/i';
    $tag = '<meta ' . $attr . '="' . $name . '" content="' . gb_esc($content) . '">';
    if (preg_match($re, $head)) {
        return (string) preg_replace_callback($re, function () use ($tag) {
            return $tag;
        }, $head, 1);
    }
    return $head . "\n" . $tag;
}

function gb_https(?string $u): ?string
{
    if (!$u) {
        return null;
    }
    $p = parse_url($u);
    return ($p && ($p['scheme'] ?? '') === 'https' && !empty($p['host'])) ? $u : null;
}

function gb_apply(string $html, array $ov): string
{
    $end = stripos($html, '</head>');
    if ($end === false) {
        return $html;
    }
    $head = substr($html, 0, $end);
    $rest = substr($html, $end);
    if (!empty($ov['title']) && is_string($ov['title'])) {
        $t = '<title>' . gb_esc($ov['title']) . '</title>';
        $head = preg_match('/<title[^>]*>.*?<\/title>/is', $head)
            ? (string) preg_replace_callback('/<title[^>]*>.*?<\/title>/is', function () use ($t) {
                return $t;
            }, $head, 1)
            : $head . "\n" . $t;
        $head = gb_set_meta($head, 'property', 'og:title', $ov['title']);
    }
    if (!empty($ov['description']) && is_string($ov['description'])) {
        $head = gb_set_meta($head, 'name', 'description', $ov['description']);
        $head = gb_set_meta($head, 'property', 'og:description', $ov['description']);
    }
    $img = gb_https(isset($ov['ogImage']) && is_string($ov['ogImage']) ? $ov['ogImage'] : null);
    if ($img) {
        $head = gb_set_meta($head, 'property', 'og:image', $img);
        $head = gb_set_meta($head, 'name', 'twitter:image', $img);
    }
    if (!empty($ov['jsonLd']) && is_array($ov['jsonLd'])) {
        $json = json_encode($ov['jsonLd'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG);
        if (is_string($json)) {
            $head .= "\n" . '<script type="application/ld+json" data-gravyblock="1">' . $json . '</script>';
        }
    }
    return $head . "\n" . $rest;
}

function gb_send(string $file, bool $head, ?string $html, bool $patched, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: text/html; charset=UTF-8');
    header('Cache-Control: no-cache, must-revalidate, max-age=0');
    if ($patched) {
        header('X-GravyBlock-Connector: applied');
    }
    if ($head) {
        return;
    }
    if ($html === null) {
        readfile($file);
        return;
    }
    echo $html;
}

// --- request handling ---------------------------------------------------------------------------------------

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$headOnly = $method === 'HEAD';
$uriPath = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);

// Test mode (only when this file is requested directly): ?gb_test=/about/ renders that page through the same code path.
$direct = preg_match('#/gravyblock-connector\.php$#', $uriPath) === 1;
if ($direct) {
    $uriPath = isset($_GET['gb_test']) ? (string) $_GET['gb_test'] : '/';
}

$root = gb_root();
$rel = '/' . ltrim($uriPath, '/');
if (substr($rel, -1) !== '/' || strpos($rel, '..') !== false || strpos($rel, "\0") !== false || !preg_match('#^/[A-Za-z0-9_\-./]*$#', $rel)) {
    http_response_code(404);
    if (is_file($root . '/404.html')) {
        readfile($root . '/404.html');
    }
    exit;
}
$file = $root . $rel . 'index.html';
if ($root === '' || !is_file($file)) {
    http_response_code(404);
    if (is_file($root . '/404.html')) {
        readfile($root . '/404.html');
    }
    exit;
}

$html = null;
$patched = false;
try {
    $bid = gb_business_id();
    $feed = $bid ? gb_feed($bid) : null;
    if ($feed && isset($feed['overrides']) && is_array($feed['overrides'])) {
        $want = gb_norm($rel);
        foreach ($feed['overrides'] as $ov) {
            if (is_array($ov) && isset($ov['path']) && is_string($ov['path']) && gb_norm($ov['path']) === $want) {
                $orig = (string) @file_get_contents($file);
                $out = gb_apply($orig, $ov);
                if ($out !== $orig) {
                    $html = $out;
                    $patched = true;
                }
                break;
            }
        }
    }
} catch (\Throwable $e) {
    $html = null;
    $patched = false;
}

gb_send($file, $headOnly, $html, $patched);
