<?php
require_once __DIR__ . '/../config.php';

$playlistId = $_GET['id'] ?? '';
$link = $_GET['link'] ?? '';

if (empty($playlistId) && !empty($link)) {
    // Extract playlist ID from link
    // Supports: https://music.163.com/#/playlist?id=123, https://163cn.tv/xxxxx, etc.
    if (preg_match('/[?&]id=(\d+)/', $link, $matches)) {
        $playlistId = $matches[1];
    } elseif (preg_match('/playlist\/(\d+)/', $link, $matches)) {
        $playlistId = $matches[1];
    } elseif (preg_match('/163cn\.tv\/(\w+)/', $link, $matches)) {
        // Short link - try to resolve (simplified, may not work for all)
        $shortUrl = $link;
        if (strpos($shortUrl, 'http') !== 0) {
            $shortUrl = 'https://' . $shortUrl;
        }
        $ch = curl_init($shortUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_NOBODY, true);
        curl_exec($ch);
        $finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
        curl_close($ch);
        
        if (preg_match('/[?&]id=(\d+)/', $finalUrl, $matches)) {
            $playlistId = $matches[1];
        }
    }
}

if (empty($playlistId) || !is_numeric($playlistId)) {
    jsonResponse(['code' => 400, 'message' => '无法识别的歌单链接或ID', 'playlist' => null]);
}

$url = "https://music.163.com/api/playlist/detail?id={$playlistId}";

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer: https://music.163.com/',
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200 || empty($response)) {
    jsonResponse(['code' => 500, 'message' => '获取歌单失败', 'playlist' => null]);
}

$data = json_decode($response, true);
if (empty($data['result'])) {
    jsonResponse(['code' => 500, 'message' => '歌单数据为空', 'playlist' => null]);
}

$result = $data['result'];
$tracks = [];

foreach ($result['tracks'] ?? [] as $track) {
    $artists = [];
    foreach ($track['artists'] ?? [] as $artist) {
        $artists[] = $artist['name'];
    }
    
    $album = $track['album'] ?? [];
    
    $tracks[] = [
        'id' => (string)$track['id'],
        'name' => $track['name'],
        'artist' => $artists,
        'album' => $album['name'] ?? '',
        'pic_id' => isset($album['picId']) ? (string)$album['picId'] : '',
        'source' => 'netease'
    ];
}

jsonResponse([
    'code' => 200,
    'playlist' => [
        'id' => (string)$result['id'],
        'name' => $result['name'] ?? '未知歌单',
        'cover' => $result['coverImgUrl'] ?? '',
        'description' => $result['description'] ?? '',
        'track_count' => count($tracks),
        'tracks' => $tracks
    ]
]);
