<?php
require_once __DIR__ . '/../config.php';

$data = getRequestData();
$action = $data['action'] ?? '';

if ($action === 'send_code') {
    $userId = intval($data['user_id'] ?? 0);
    $email = trim($data['email'] ?? '');
    
    if (empty($userId)) {
        jsonResponse(['success' => false, 'message' => '缺少用户ID']);
    }
    
    $db = getDB();
    $stmt = $db->prepare("SELECT email FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    
    if (!$user) {
        jsonResponse(['success' => false, 'message' => '用户不存在']);
    }
    
    // Support both 'email' and 'temp_email' (frontend uses temp_email when changing)
    $tempEmail = trim($data['temp_email'] ?? '');
    $targetEmail = !empty($tempEmail) ? $tempEmail : (!empty($email) ? $email : $user['email']);
    
    if (!filter_var($targetEmail, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['success' => false, 'message' => '邮箱格式不正确']);
    }
    
    $code = generateCode();
    $expires = time() + CODE_EXPIRY;
    
    $stmt = $db->prepare("UPDATE users SET verification_code = ?, code_expires_at = ? WHERE id = ?");
    $stmt->execute([$code, $expires, $userId]);
    
    sendVerificationEmail($targetEmail, $code, 'verify_email');
    
    jsonResponse(['success' => true, 'message' => '验证码已发送']);
    
} elseif ($action === 'verify') {
    $userId = intval($data['user_id'] ?? 0);
    $code = trim($data['code'] ?? '');
    
    if (empty($userId) || empty($code)) {
        jsonResponse(['success' => false, 'message' => '缺少必要参数']);
    }
    
    $db = getDB();
    $stmt = $db->prepare("SELECT verification_code, code_expires_at FROM users WHERE id = ?");
    $stmt->execute([$userId]);
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
    
    $stmt = $db->prepare("UPDATE users SET email_verified = 1, verification_code = NULL, code_expires_at = NULL WHERE id = ?");
    $stmt->execute([$userId]);
    
    jsonResponse(['success' => true, 'message' => '邮箱验证成功']);
    
} else {
    jsonResponse(['success' => false, 'message' => '未知操作']);
}
