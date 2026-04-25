<?php
require_once __DIR__ . '/../config.php';

$data = getRequestData();
$userId = intval($data['user_id'] ?? 0);
$songId = $data['song_id'] ?? '';
$source = $data['source'] ?? 'netease';
$action = $data['action'] ?? 'add';

if (empty($userId) || empty($songId)) {
    jsonResponse(['success' => false, 'message' => '缺少必要参数']);
}

$db = getDB();

if ($action === 'check') {
    $stmt = $db->prepare("SELECT id FROM favorites WHERE user_id = ? AND song_id = ? AND source = ?");
    $stmt->execute([$userId, $songId, $source]);
    $exists = $stmt->fetch();
    jsonResponse(['success' => true, 'is_favorite' => !!$exists]);
}

if ($action === 'add') {
    $name = $data['song_title'] ?? ($data['name'] ?? '');
    $artist = $data['song_artist'] ?? ($data['artist'] ?? '');
    $album = $data['album'] ?? '';
    $picId = $data['song_cover'] ?? ($data['pic_id'] ?? '');
    
    $stmt = $db->prepare("INSERT OR IGNORE INTO favorites (user_id, song_id, source, name, artist, album, pic_id) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$userId, $songId, $source, $name, $artist, $album, $picId]);
    jsonResponse(['success' => true, 'is_favorite' => true]);
}

if ($action === 'update') {
    // Update song metadata if exists, otherwise ignore (should be added first)
    $album = $data['album'] ?? '';
    $picId = $data['song_cover'] ?? ($data['pic_id'] ?? '');
    
    $stmt = $db->prepare("UPDATE favorites SET album = ?, pic_id = ? WHERE user_id = ? AND song_id = ? AND source = ?");
    $stmt->execute([$album, $picId, $userId, $songId, $source]);
    jsonResponse(['success' => true, 'is_favorite' => true]);
}

if ($action === 'remove') {
    $stmt = $db->prepare("DELETE FROM favorites WHERE user_id = ? AND song_id = ? AND source = ?");
    $stmt->execute([$userId, $songId, $source]);
    jsonResponse(['success' => true, 'is_favorite' => false]);
}

jsonResponse(['success' => false, 'message' => '未知操作']);
