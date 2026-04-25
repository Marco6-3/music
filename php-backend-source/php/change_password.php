<?php
require_once __DIR__ . '/../config.php';

$data = getRequestData();
$userId = intval($data['user_id'] ?? 0);
$currentPassword = $data['current_password'] ?? '';
$newPassword = $data['new_password'] ?? '';

if (empty($userId) || empty($currentPassword) || empty($newPassword)) {
    jsonResponse(['success' => false, 'message' => '请填写所有必填项']);
}

if (strlen($newPassword) < 6) {
    jsonResponse(['success' => false, 'message' => '新密码长度不能少于6位']);
}

$db = getDB();
$stmt = $db->prepare("SELECT password_hash FROM users WHERE id = ?");
$stmt->execute([$userId]);
$user = $stmt->fetch();

if (!$user) {
    jsonResponse(['success' => false, 'message' => '用户不存在']);
}

if (!password_verify($currentPassword, $user['password_hash'])) {
    jsonResponse(['success' => false, 'message' => '当前密码错误']);
}

$passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);
$stmt = $db->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
$stmt->execute([$passwordHash, $userId]);

jsonResponse(['success' => true, 'message' => '密码修改成功']);
