<?php
require_once __DIR__ . '/../config.php';

$data = getRequestData();
$userId = intval($data['user_id'] ?? 0);

if (empty($userId)) {
    jsonResponse(['success' => false, 'message' => '缺少用户ID']);
}

$playlists = getUserPlaylists($userId);

// Format for frontend
$result = [];
foreach ($playlists as $name => $songs) {
    $result[] = [
        'name' => $name,
        'songs' => $songs,
        'song_count' => count($songs)
    ];
}

jsonResponse(['success' => true, 'playlists' => $result]);
