<?php
/**
 * XCloud Music API Proxy
 * Compatible with GD-Studio API format
 * Provides caching and fallback for music data
 */

require_once __DIR__ . '/config.php';

// Allow longer execution for search requests
set_time_limit(30);

$types = $_GET['types'] ?? '';
$source = $_GET['source'] ?? 'netease';

// Validate source
$allowedSources = ['netease', 'kuwo'];
if (!in_array($source, $allowedSources)) {
    jsonResponse(['error' => '不支持的音乐源'], 400);
}

// Target upstream API
$upstreamBase = 'https://music-api.gdstudio.xyz/api.php';
$cacheDir = __DIR__ . '/data/cache';
if (!is_dir($cacheDir)) {
    mkdir($cacheDir, 0755, true);
}

// Build upstream URL
$params = $_GET;
$queryString = http_build_query($params);
$upstreamUrl = $upstreamBase . '?' . $queryString;

// Cache key
$cacheKey = md5($queryString);
$cacheFile = $cacheDir . '/' . $cacheKey . '.json';
$cacheExpiry = 300; // 5 minutes cache for most requests

// Adjust cache time by type
if ($types === 'url') {
    $cacheExpiry = 60; // URL expires quickly (1 min)
} elseif ($types === 'pic') {
    $cacheExpiry = 86400; // Images cache for 1 day
} elseif ($types === 'lyric') {
    $cacheExpiry = 86400 * 7; // Lyrics cache for 7 days
}

// Try cache first
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheExpiry) {
    $cached = file_get_contents($cacheFile);
    if ($cached) {
        // Return cached content with proper headers
        header('Content-Type: application/json; charset=UTF-8');
        header('X-Cache: HIT');
        echo $cached;
        exit;
    }
}

// Forward request to upstream
$ch = curl_init($upstreamUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept: application/json, text/plain, */*',
    'Referer: https://music.xcloudv.top/',
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($httpCode !== 200 || empty($response)) {
    // Try to return stale cache if available
    if (file_exists($cacheFile)) {
        $cached = file_get_contents($cacheFile);
        if ($cached) {
            header('Content-Type: application/json; charset=UTF-8');
            header('X-Cache: STALE');
            echo $cached;
            exit;
        }
    }
    
    jsonResponse(['error' => '音乐服务暂时不可用，请稍后重试'], 503);
}

// Save to cache (only if it's valid JSON)
if (strpos($contentType, 'json') !== false || strpos($response, '[') === 0 || strpos($response, '{') === 0) {
    file_put_contents($cacheFile, $response, LOCK_EX);
}

// Forward response
header('Content-Type: ' . ($contentType ?: 'application/json; charset=UTF-8'));
header('X-Cache: MISS');
echo $response;
exit;
