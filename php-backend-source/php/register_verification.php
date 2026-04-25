<?php
require_once __DIR__ . '/../config.php';

$data = getRequestData();
$email = trim($data['email'] ?? '');

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(['success' => false, 'message' => '请填写正确的邮箱地址']);
}

$db = getDB();

// Check if email already registered and verified
$stmt = $db->prepare("SELECT id, email_verified FROM users WHERE email = ?");
$stmt->execute([$email]);
$existing = $stmt->fetch();

if ($existing && $existing['email_verified']) {
    jsonResponse(['success' => false, 'message' => '该邮箱已被注册']);
}

$code = generateCode();
$expires = time() + CODE_EXPIRY;

if ($existing) {
    // Update unverified user
    $stmt = $db->prepare("UPDATE users SET verification_code = ?, code_expires_at = ? WHERE id = ?");
    $stmt->execute([$code, $expires, $existing['id']]);
} else {
    // Create placeholder user (will be updated on register)
    $stmt = $db->prepare("INSERT INTO users (username, email, password_hash, verification_code, code_expires_at) VALUES (?, ?, ?, ?, ?)");
    $tempUsername = 'temp_' . uniqid();
    $stmt->execute([$tempUsername, $email, password_hash(uniqid(), PASSWORD_DEFAULT), $code, $expires]);
}

sendVerificationEmail($email, $code, 'register');

jsonResponse(['success' => true, 'message' => '验证码已发送，请查收邮件（如未收到请检查垃圾箱）']);
