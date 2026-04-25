<?php
require_once __DIR__ . '/../config.php';

$data = getRequestData();
$userId = intval($data['user_id'] ?? 0);
$oldName = trim($data['old_name'] ?? '');
$newName = trim($data['new_name'] ?? '');

if (empty($userId) || empty($oldName) || empty($newName)) {
    jsonResponse(['success' => false, 'message' => '缺少必要参数']);
}

if ($oldName === $newName) {
    jsonResponse(['success' => true, 'message' => '名称未变更']);
}

$db = getDB();

// Check if new name already exists
$stmt = $db->prepare("SELECT id FROM playlists WHERE user_id = ? AND name = ?");
$stmt->execute([$userId, $newName]);
if ($stmt->fetch()) {
    jsonResponse(['success' => false, 'message' => '该歌单名称已存在']);
}

$stmt = $db->prepare("UPDATE playlists SET name = ? WHERE user_id = ? AND name = ?");
$stmt->execute([$newName, $userId, $oldName]);

jsonResponse(['success' => true, 'message' => '歌单重命名成功']);
