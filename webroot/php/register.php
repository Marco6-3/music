<?php
require_once __DIR__ . '/../config.php';

$data = getRequestData();
$username = trim($data['username'] ?? '');
$email = trim($data['email'] ?? '');
$password = $data['password'] ?? '';
$verificationCode = trim($data['verification_code'] ?? '');

if (empty($username) || empty($email) || empty($password) || empty($verificationCode)) {
    jsonResponse(['success' => false, 'message' => '所有字段均为必填项']);
}

if (strlen($username) < 3 || strlen($username) > 30) {
    jsonResponse(['success' => false, 'message' => '用户名长度需在3-30位之间']);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(['success' => false, 'message' => '邮箱格式不正确']);
}

if (strlen($password) < 6) {
    jsonResponse(['success' => false, 'message' => '密码长度不能少于6位']);
}

$db = getDB();

// Verify code
$stmt = $db->prepare("SELECT id, verification_code, code_expires_at FROM users WHERE email = ? ORDER BY id DESC LIMIT 1");
$stmt->execute([$email]);
$existing = $stmt->fetch();

if ($existing) {
    if ($existing['verification_code'] !== $verificationCode) {
        jsonResponse(['success' => false, 'message' => '验证码错误']);
    }
    if ($existing['code_expires_at'] < time()) {
        jsonResponse(['success' => false, 'message' => '验证码已过期，请重新获取']);
    }
    // Update existing pending user
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $db->prepare("UPDATE users SET username = ?, password_hash = ?, email_verified = 1, verification_code = NULL, code_expires_at = NULL WHERE id = ?");
    try {
        $stmt->execute([$username, $passwordHash, $existing['id']]);
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'UNIQUE constraint failed: users.username') !== false) {
            jsonResponse(['success' => false, 'message' => '用户名已被注册']);
        }
        throw $e;
    }
    $userId = $existing['id'];
} else {
    jsonResponse(['success' => false, 'message' => '请先获取验证码']);
}

$user = getUserById($userId);
$token = generateToken($userId);

jsonResponse([
    'success' => true,
    'token' => $token,
    'user' => [
        'id' => $user['id'],
        'username' => $user['username'],
        'email' => $user['email'],
        'avatar' => $user['avatar'],
        'favorites' => [],
        'playlists' => []
    ]
]);
