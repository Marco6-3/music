<?php
require_once __DIR__ . '/../config.php';

$data = getRequestData();
$userId = intval($data['user_id'] ?? 0);
$action = $data['action'] ?? '';

if (empty($userId)) {
    jsonResponse(['success' => false, 'message' => '缺少用户ID']);
}

$db = getDB();

switch ($action) {
    case 'create':
        $name = trim($data['name'] ?? '');
        if (empty($name)) {
            jsonResponse(['success' => false, 'message' => '歌单名称不能为空']);
        }
        $stmt = $db->prepare("INSERT OR IGNORE INTO playlists (user_id, name) VALUES (?, ?)");
        $stmt->execute([$userId, $name]);
        $playlistId = $db->lastInsertId() ?: $db->query("SELECT id FROM playlists WHERE user_id = {$userId} AND name = " . $db->quote($name))->fetchColumn();
        jsonResponse(['success' => true, 'playlist_id' => $playlistId, 'name' => $name]);
        
    case 'add_song':
        $playlistId = intval($data['playlist_id'] ?? 0);
        $songId = $data['song_id'] ?? '';
        $source = $data['source'] ?? 'netease';
        
        if (empty($playlistId) || empty($songId)) {
            jsonResponse(['success' => false, 'message' => '缺少必要参数']);
        }
        
        // Verify playlist belongs to user
        $stmt = $db->prepare("SELECT id FROM playlists WHERE id = ? AND user_id = ?");
        $stmt->execute([$playlistId, $userId]);
        if (!$stmt->fetch()) {
            jsonResponse(['success' => false, 'message' => '歌单不存在']);
        }
        
        $name = $data['song_title'] ?? ($data['name'] ?? '');
        $artist = $data['song_artist'] ?? ($data['artist'] ?? '');
        $album = $data['album'] ?? '';
        $picId = $data['song_cover'] ?? ($data['pic_id'] ?? '');
        $originalTitle = $data['original_title'] ?? '';
        $originalArtist = $data['original_artist'] ?? '';
        
        $stmt = $db->prepare("INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, source, name, artist, album, pic_id, original_title, original_artist) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$playlistId, $songId, $source, $name, $artist, $album, $picId, $originalTitle, $originalArtist]);
        
        jsonResponse(['success' => true, 'message' => '已添加到歌单']);
        
    case 'remove_song':
        $playlistId = intval($data['playlist_id'] ?? 0);
        $songId = $data['song_id'] ?? '';
        $source = $data['source'] ?? 'netease';
        
        $stmt = $db->prepare("DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ? AND source = ?");
        $stmt->execute([$playlistId, $songId, $source]);
        jsonResponse(['success' => true, 'message' => '已从歌单移除']);
        
    case 'delete':
        $playlistId = intval($data['playlist_id'] ?? 0);
        $stmt = $db->prepare("DELETE FROM playlists WHERE id = ? AND user_id = ?");
        $stmt->execute([$playlistId, $userId]);
        jsonResponse(['success' => true, 'message' => '歌单已删除']);
        
    case 'get':
        $playlistId = intval($data['playlist_id'] ?? 0);
        $stmt = $db->prepare("SELECT id, name FROM playlists WHERE id = ? AND user_id = ?");
        $stmt->execute([$playlistId, $userId]);
        $playlist = $stmt->fetch();
        
        if (!$playlist) {
            jsonResponse(['success' => false, 'message' => '歌单不存在']);
        }
        
        $stmt = $db->prepare("SELECT song_id AS id, source, name, artist, album, pic_id, original_title, original_artist FROM playlist_songs WHERE playlist_id = ? ORDER BY created_at DESC");
        $stmt->execute([$playlistId]);
        $songs = $stmt->fetchAll();
        
        jsonResponse(['success' => true, 'playlist' => $playlist, 'songs' => $songs]);
        
    case 'update_songs':
    case 'import_songs':
        $playlistId = intval($data['playlist_id'] ?? 0);
        $songsJson = $data['songs'] ?? '[]';
        $songs = json_decode($songsJson, true);
        
        if (!is_array($songs)) {
            jsonResponse(['success' => false, 'message' => '歌曲数据格式错误']);
        }
        
        // Verify ownership
        $stmt = $db->prepare("SELECT id FROM playlists WHERE id = ? AND user_id = ?");
        $stmt->execute([$playlistId, $userId]);
        if (!$stmt->fetch()) {
            jsonResponse(['success' => false, 'message' => '歌单不存在']);
        }
        
        if ($action === 'import_songs') {
            // Clear existing for import
            $stmt = $db->prepare("DELETE FROM playlist_songs WHERE playlist_id = ?");
            $stmt->execute([$playlistId]);
        }
        
        $insertStmt = $db->prepare("INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, source, name, artist, album, pic_id, original_title, original_artist) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        
        foreach ($songs as $song) {
            $sid = $song['id'] ?? ($song['song_id'] ?? '');
            if (empty($sid)) continue;
            
            $insertStmt->execute([
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
        
        jsonResponse(['success' => true, 'message' => '歌曲导入成功']);
        
    default:
        jsonResponse(['success' => false, 'message' => '未知操作']);
}
