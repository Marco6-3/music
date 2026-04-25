<?php
require_once __DIR__ . '/../config.php';

$userId = intval($_POST['user_id'] ?? 0);

if (empty($userId)) {
    jsonResponse(['success' => false, 'message' => '缺少用户ID']);
}

if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] !== UPLOAD_ERR_OK) {
    jsonResponse(['success' => false, 'message' => '头像上传失败']);
}

$file = $_FILES['avatar'];
$allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
$maxSize = 2 * 1024 * 1024; // 2MB

if (!in_array($file['type'], $allowedTypes)) {
    jsonResponse(['success' => false, 'message' => '仅支持 JPG、PNG 格式']);
}

if ($file['size'] > $maxSize) {
    jsonResponse(['success' => false, 'message' => '头像大小不能超过2MB']);
}

$ext = pathinfo($file['name'], PATHINFO_EXTENSION);
if (empty($ext)) {
    $ext = $file['type'] === 'image/png' ? 'png' : 'jpg';
}

$filename = 'avatar_' . $userId . '_' . time() . '.' . $ext;
$uploadPath = __DIR__ . '/../uploads/avatars/' . $filename;

if (!move_uploaded_file($file['tmp_name'], $uploadPath)) {
    jsonResponse(['success' => false, 'message' => '文件保存失败']);
}

$avatarUrl = 'uploads/avatars/' . $filename;

$db = getDB();
$stmt = $db->prepare("UPDATE users SET avatar = ? WHERE id = ?");
$stmt->execute([$avatarUrl, $userId]);

jsonResponse(['success' => true, 'avatar_url' => $avatarUrl]);
