<?php
require_once __DIR__ . '/../config.php';

$db = getDB();
$stmt = $db->query("SELECT source, name, search, play, last_check FROM api_status");
$rows = $stmt->fetchAll();

$result = [];
foreach ($rows as $row) {
    $result[$row['source']] = [
        'name' => $row['name'],
        'search' => $row['search'],
        'play' => $row['play'],
        'last_check' => $row['last_check']
    ];
}

// Ensure both sources exist
if (empty($result['netease'])) {
    $result['netease'] = [
        'name' => '网易云音乐',
        'search' => 'true',
        'play' => 'true',
        'last_check' => date('Y-m-d H:i:s')
    ];
}
if (empty($result['kuwo'])) {
    $result['kuwo'] = [
        'name' => '酷我音乐',
        'search' => 'true',
        'play' => 'true',
        'last_check' => date('Y-m-d H:i:s')
    ];
}

jsonResponse($result);
