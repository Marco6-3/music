<?php
require_once __DIR__ . '/../config.php';

$data = getRequestData();
$userId = intval($data['user_id'] ?? 0);
$playlistsJson = $data['playlists'] ?? '{}';

if (empty($userId)) {
    jsonResponse(['success' => false, 'message' => '缺少用户ID']);
}

$playlists = json_decode($playlistsJson, true);
if (!is_array($playlists)) {
    jsonResponse(['success' => false, 'message' => '歌单数据格式错误']);
}

$db = getDB();
$db->beginTransaction();

try {
    // Get existing playlists
    $stmt = $db->prepare("SELECT id, name FROM playlists WHERE user_id = ?");
    $stmt->execute([$userId]);
    $existing = $stmt->fetchAll();
    $existingMap = [];
    foreach ($existing as $pl) {
        $existingMap[$pl['name']] = $pl['id'];
    }
    
    $insertPlaylistStmt = $db->prepare("INSERT INTO playlists (user_id, name) VALUES (?, ?)");
    $insertSongStmt = $db->prepare("INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, source, name, artist, album, pic_id, original_title, original_artist) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    
    foreach ($playlists as $name => $songs) {
        if (!is_array($songs)) continue;
        
        $playlistId = $existingMap[$name] ?? null;
        if (!$playlistId) {
            $insertPlaylistStmt->execute([$userId, $name]);
            $playlistId = $db->lastInsertId();
        } else {
            // Clear existing songs for this playlist to sync fresh
            $stmt = $db->prepare("DELETE FROM playlist_songs WHERE playlist_id = ?");
            $stmt->execute([$playlistId]);
        }
        
        foreach ($songs as $song) {
            $sid = $song['id'] ?? ($song['song_id'] ?? '');
            if (empty($sid)) continue;
            
            $insertSongStmt->execute([
                $playlistId,
                $sid,
                $song['source'] ?? 'netease',
                $song['name'] ?? '',
                is_array($song['artist'] ?? null) ? implode(', ', $song['artist']) : ($song['artist'] ?? ''),
                $song['album'] ?? '',
                $song['pic_id'] ?? ($song['pic'] ?? ''),
                $song['original_title'] ?? '',
                $song['original_artist'] ?? ''
            ]);
        }
    }
    
    $db->commit();
    jsonResponse(['success' => true, 'message' => '歌单同步成功']);
    
} catch (Exception $e) {
    $db->rollBack();
    jsonResponse(['success' => false, 'message' => '同步失败: ' . $e->getMessage()]);
}
