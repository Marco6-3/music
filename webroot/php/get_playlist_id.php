<?php
require_once __DIR__ . '/../config.php';

$data = getRequestData();
$userId = intval($data['user_id'] ?? 0);
$playlistName = trim($data['playlist_name'] ?? '');

if (empty($userId) || empty($playlistName)) {
    jsonResponse(['success' => false, 'message' => '缺少必要参数']);
}

$db = getDB();
$stmt = $db->prepare("SELECT id FROM playlists WHERE user_id = ? AND name = ?");
$stmt->execute([$userId, $playlistName]);
$playlist = $stmt->fetch();

if ($playlist) {
    jsonResponse(['success' => true, 'playlist_id' => $playlist['id']]);
}

// Auto-create if not exists
$stmt = $db->prepare("INSERT INTO playlists (user_id, name) VALUES (?, ?)");
$stmt->execute([$userId, $playlistName]);
$playlistId = $db->lastInsertId();

jsonResponse(['success' => true, 'playlist_id' => $playlistId]);
