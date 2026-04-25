<?php
require_once __DIR__ . '/../config.php';

$data = getRequestData();
$userId = intval($data['user_id'] ?? 0);

if (empty($userId)) {
    jsonResponse(['success' => false, 'message' => '缺少用户ID']);
}

$favorites = getUserFavorites($userId);

jsonResponse(['success' => true, 'favorites' => $favorites]);
