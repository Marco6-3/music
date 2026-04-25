<?php
require_once __DIR__ . '/../config.php';

$data = getRequestData();
$action = $data['action'] ?? '';

if ($action === 'send_code') {
    $email = trim($data['email'] ?? '');
    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['success' => false, 'message' => '请填写正确的邮箱地址']);
    }
    
    $db = getDB();
    $stmt = $db->prepare("SELECT id FROM users WHERE email = ? AND email_verified = 1");
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    
    if (!$user) {
        jsonResponse(['success' => false, 'message' => '该邮箱未注册或未验证']);
    }
    
    $code = generateCode();
    $expires = time() + CODE_EXPIRY;
    
    $stmt = $db->prepare("UPDATE users SET verification_code = ?, code_expires_at = ? WHERE id = ?");
    $stmt->execute([$code, $expires, $user['id']]);
    
    sendVerificationEmail($email, $code, 'reset_password');
    
    jsonResponse(['success' => true, 'message' => '验证码已发送']);
    
} elseif ($action === 'reset_password') {
    $email = trim($data['email'] ?? '');
    $code = trim($data['code'] ?? '');
    $newPassword = $data['new_password'] ?? '';
    
    if (empty($email) || empty($code) || empty($newPassword)) {
        jsonResponse(['success' => false, 'message' => '请填写所有必填项']);
    }
    
    if (strlen($newPassword) < 6) {
        jsonResponse(['success' => false, 'message' => '密码长度不能少于6位']);
    }
    
    $db = getDB();
    $stmt = $db->prepare("SELECT id, verification_code, code_expires_at FROM users WHERE email = ? AND email_verified = 1");
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    
    if (!$user) {
        jsonResponse(['success' => false, 'message' => '用户不存在']);
    }
    
    if ($user['verification_code'] !== $code) {
        jsonResponse(['success' => false, 'message' => '验证码错误']);
    }
    
    if ($user['code_expires_at'] < time()) {
        jsonResponse(['success' => false, 'message' => '验证码已过期']);
    }
    
    $passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);
    $stmt = $db->prepare("UPDATE users SET password_hash = ?, verification_code = NULL, code_expires_at = NULL WHERE id = ?");
    $stmt->execute([$passwordHash, $user['id']]);
    
    jsonResponse(['success' => true, 'message' => '密码重置成功，请使用新密码登录']);
    
} else {
    jsonResponse(['success' => false, 'message' => '未知操作']);
}
