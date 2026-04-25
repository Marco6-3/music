<?php
require_once __DIR__ . '/../config.php';

// Current backend version (should match frontend expectation)
$currentVersion = '1.7.2';

jsonResponse([
    'version' => $currentVersion,
    'require_update' => false,
    'download_url' => 'https://music.xcloudv.top/download/',
    'message' => '当前已是最新版本'
]);
