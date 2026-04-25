<?php
require_once __DIR__ . '/../config.php';

// Logout is mainly client-side, but we can log it if needed
jsonResponse(['success' => true, 'message' => '已安全退出登录']);
