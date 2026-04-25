<?php
require_once __DIR__ . '/../config.php';

$data = getRequestData();
$userId = intval($data['user_id'] ?? 0);
$favoritesJson = $data['favorites'] ?? '[]';

if (empty($userId)) {
    jsonResponse(['success' => false, 'message' => '缺少用户ID']);
}

$favorites = json_decode($favoritesJson, true);
if (!is_array($favorites)) {
    jsonResponse(['success' => false, 'message' => '收藏数据格式错误']);
}

$db = getDB();
$db->beginTransaction();

try {
    // Clear existing favorites and re-insert
    $stmt = $db->prepare("DELETE FROM favorites WHERE user_id = ?");
    $stmt->execute([$userId]);
    
    $insertStmt = $db->prepare("INSERT OR IGNORE INTO favorites (user_id, song_id, source, name, artist, album, pic_id) VALUES (?, ?, ?, ?, ?, ?, ?)");
    
    foreach ($favorites as $song) {
        $songId = $song['id'] ?? ($song['song_id'] ?? '');
        if (empty($songId)) continue;
        
        $insertStmt->execute([
            $userId,
            $songId,
            $song['source'] ?? 'netease',
            $song['name'] ?? '',
            is_array($song['artist'] ?? null) ? implode(', ', $song['artist']) : ($song['artist'] ?? ''),
            $song['album'] ?? '',
            $song['pic_id'] ?? ($song['pic'] ?? '')
        ]);
    }
    
    $db->commit();
    jsonResponse(['success' => true, 'message' => '收藏同步成功']);
    
} catch (Exception $e) {
    $db->rollBack();
    jsonResponse(['success' => false, 'message' => '同步失败: ' . $e->getMessage()]);
}
