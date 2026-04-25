<?php
require_once __DIR__ . '/../config.php';

$type = $_GET['type'] ?? 'soaring';

// NetEase playlist IDs for each toplist
$toplistMap = [
    'soaring' => 19723756,      // 飙升榜
    'new' => 3779629,           // 新歌榜
    'original' => 2884035,      // 原创榜
    'hot' => 3778678,           // 热歌榜
    'rap' => 5213356842,        // 说唱榜 (云音乐说唱榜)
    'electronic' => 1978921795, // 云音乐电音榜
    'euro_america' => 2809513713, // 欧美热歌榜
    'billboard' => 60198,       // Billboard榜
    'beatport' => 3812895,      // Beatport电子榜
    'korean' => 745956260,      // 云音乐韩国榜
    'uk' => 180106,             // UK排行榜
];

$playlistId = $toplistMap[$type] ?? $toplistMap['soaring'];

// Try to fetch from NetEase API
$url = "https://music.163.com/api/playlist/detail?id={$playlistId}";

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer: https://music.163.com/',
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200 || empty($response)) {
    jsonResponse(['code' => 500, 'message' => '获取榜单数据失败', 'data' => []]);
}

$data = json_decode($response, true);
if (empty($data['result']['tracks'])) {
    jsonResponse(['code' => 500, 'message' => '榜单数据为空', 'data' => []]);
}

$tracks = $data['result']['tracks'];
$result = [];
$rank = 1;

foreach ($tracks as $track) {
    $artists = [];
    foreach ($track['artists'] ?? [] as $artist) {
        $artists[] = $artist['name'];
    }
    
    $album = $track['album'] ?? [];
    $picId = isset($album['picId']) ? (string)$album['picId'] : '';
    
    $result[] = [
        'id' => (string)$track['id'],
        'name' => $track['name'],
        'artist' => $artists,
        'album' => $album['name'] ?? '',
        'pic_id' => $picId,
        'source' => 'netease',
        'rank' => $rank
    ];
    
    $rank++;
    if ($rank > 100) break; // Limit to top 100
}

jsonResponse(['code' => 200, 'data' => $result]);
