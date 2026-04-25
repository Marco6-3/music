<?php
require_once __DIR__ . '/../config.php';

$data = getRequestData();
$username = trim($data['username'] ?? '');
$password = $data['password'] ?? '';
$remember = ($data['remember'] ?? '0') === '1';

if (empty($username) || empty($password)) {
    jsonResponse(['success' => false, 'message' => '用户名和密码不能为空']);
}

$db = getDB();
$stmt = $db->prepare("SELECT id, username, email, password_hash, avatar, email_verified FROM users WHERE username = ? OR email = ?");
$stmt->execute([$username, $username]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    jsonResponse(['success' => false, 'message' => '用户名或密码错误']);
}

// Check if email verification is needed (registered but not verified)
if (!$user['email_verified']) {
    jsonResponse([
        'success' => true,
        'need_email_verification' => true,
        'user_id' => $user['id'],
        'email' => $user['email']
    ]);
}

$token = generateToken($user['id']);
$favorites = getUserFavorites($user['id']);
$playlists = getUserPlaylists($user['id']);

jsonResponse([
    'success' => true,
    'token' => $token,
    'user' => [
        'id' => $user['id'],
        'username' => $user['username'],
        'email' => $user['email'],
        'avatar' => $user['avatar'],
        'favorites' => $favorites,
        'playlists' => $playlists
    ]
]);
