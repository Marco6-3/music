<?php
require_once __DIR__ . '/../config.php';

$data = getRequestData();
$token = $data['token'] ?? '';
$userId = intval($data['user_id'] ?? 0);

if (empty($token) && empty($userId)) {
    jsonResponse(['success' => false, 'message' => '缺少认证信息']);
}

$uid = null;
if (!empty($token)) {
    $uid = verifyToken($token);
}
if (!$uid && $userId > 0) {
    $uid = $userId;
}

if (!$uid) {
    jsonResponse(['success' => false, 'message' => '登录已过期，请重新登录']);
}

$user = getUserById($uid);
if (!$user) {
    jsonResponse(['success' => false, 'message' => '用户不存在']);
}

$favorites = getUserFavorites($uid);
$playlists = getUserPlaylists($uid);

jsonResponse([
    'success' => true,
    'user' => [
        'id' => $user['id'],
        'username' => $user['username'],
        'email' => $user['email'],
        'avatar' => $user['avatar'],
        'favorites' => $favorites,
        'playlists' => $playlists
    ]
]);
