<?php
/**
 * music Music Backend Configuration
 * Reverse-engineered from frontend code
 */

// Enable CORS for all origins (adjust in production)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Error reporting (disable in production)
error_reporting(E_ALL);
ini_set('display_errors', '1');

// Database configuration (SQLite)
define('DB_PATH', __DIR__ . '/data/music.db');
define('JWT_SECRET', 'music_secret_key_change_in_production');
define('TOKEN_EXPIRY', 86400 * 30); // 30 days
define('CODE_EXPIRY', 600); // 10 minutes for verification codes

// Ensure data directory exists
if (!is_dir(__DIR__ . '/data')) {
    mkdir(__DIR__ . '/data', 0755, true);
}

/**
 * Get PDO database connection
 */
function getDB(): PDO {
    static $db = null;
    if ($db === null) {
        $db = new PDO('sqlite:' . DB_PATH);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $db->exec("PRAGMA foreign_keys = ON;");
    }
    return $db;
}

/**
 * Initialize database tables
 */
function initDB(): void {
    $db = getDB();
    
    $db->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        avatar TEXT DEFAULT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        verification_code TEXT DEFAULT NULL,
        code_expires_at INTEGER DEFAULT NULL,
        email_verified INTEGER DEFAULT 0
    )");
    
    $db->exec("CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        song_id TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'netease',
        name TEXT DEFAULT NULL,
        artist TEXT DEFAULT NULL,
        album TEXT DEFAULT NULL,
        pic_id TEXT DEFAULT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(user_id, song_id, source)
    )");
    
    $db->exec("CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(user_id, name)
    )");
    
    $db->exec("CREATE TABLE IF NOT EXISTS playlist_songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        song_id TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'netease',
        name TEXT DEFAULT NULL,
        artist TEXT DEFAULT NULL,
        album TEXT DEFAULT NULL,
        pic_id TEXT DEFAULT NULL,
        original_title TEXT DEFAULT NULL,
        original_artist TEXT DEFAULT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(playlist_id, song_id, source)
    )");
    
    $db->exec("CREATE TABLE IF NOT EXISTS api_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        search TEXT DEFAULT 'true',
        play TEXT DEFAULT 'true',
        last_check TEXT DEFAULT NULL
    )");
    
    // Insert default API status
    $stmt = $db->prepare("INSERT OR IGNORE INTO api_status (source, name, search, play, last_check) VALUES (?, ?, ?, ?, ?)");
    $now = date('Y-m-d H:i:s');
    $stmt->execute(['netease', '网易云音乐', 'true', 'true', $now]);
    $stmt->execute(['kuwo', '酷我音乐', 'true', 'true', $now]);
}

// Auto-init on first run
try {
    initDB();
} catch (Exception $e) {
    // Table may already exist
}

/**
 * Send JSON response
 */
function jsonResponse(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Generate a simple token
 */
function generateToken(int $userId): string {
    $time = time();
    $payload = json_encode(['uid' => $userId, 'iat' => $time, 'exp' => $time + TOKEN_EXPIRY]);
    $signature = hash_hmac('sha256', $payload, JWT_SECRET);
    return base64_encode($payload) . '.' . $signature;
}

/**
 * Verify token and return user ID
 */
function verifyToken(string $token): ?int {
    $parts = explode('.', $token);
    if (count($parts) !== 2) return null;
    
    $payload = base64_decode($parts[0]);
    $signature = $parts[1];
    
    if (!hash_equals(hash_hmac('sha256', $payload, JWT_SECRET), $signature)) {
        return null;
    }
    
    $data = json_decode($payload, true);
    if (!$data || ($data['exp'] ?? 0) < time()) {
        return null;
    }
    
    return $data['uid'] ?? null;
}

/**
 * Generate random verification code
 */
function generateCode(): string {
    return str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
}

/**
 * Send email (simulated - logs to file if no mail server)
 * In production, configure SMTP here
 */
function sendVerificationEmail(string $to, string $code, string $purpose = 'verification'): bool {
    $subject = 'music - 验证码';
    $message = "您的验证码是：{$code}\n\n验证码10分钟内有效，请勿泄露给他人。\n\n如非本人操作，请忽略此邮件。";
    $headers = 'From: noreply@xcloudv.top' . "\r\n";
    
    // Try mail(), fallback to log file
    $sent = @mail($to, $subject, $message, $headers);
    
    if (!$sent) {
        $logFile = __DIR__ . '/data/email_log.txt';
        $log = date('Y-m-d H:i:s') . " | To: {$to} | Code: {$code} | Purpose: {$purpose}\n";
        file_put_contents($logFile, $log, FILE_APPEND | LOCK_EX);
    }
    
    return true; // Always return true so frontend works even without SMTP
}

/**
 * Get user by ID
 */
function getUserById(int $id): ?array {
    $db = getDB();
    $stmt = $db->prepare("SELECT id, username, email, avatar, created_at, email_verified FROM users WHERE id = ?");
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    return $user ?: null;
}

/**
 * Get user favorites
 */
function getUserFavorites(int $userId): array {
    $db = getDB();
    $stmt = $db->prepare("SELECT song_id, source, name, artist, album, pic_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC");
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
}

/**
 * Get user playlists with songs
 */
function getUserPlaylists(int $userId): array {
    $db = getDB();
    $stmt = $db->prepare("SELECT id, name, created_at FROM playlists WHERE user_id = ? ORDER BY created_at DESC");
    $stmt->execute([$userId]);
    $playlists = $stmt->fetchAll();
    
    $result = [];
    foreach ($playlists as $pl) {
        $stmt2 = $db->prepare("SELECT song_id AS id, source, name, artist, album, pic_id, original_title, original_artist FROM playlist_songs WHERE playlist_id = ? ORDER BY created_at DESC");
        $stmt2->execute([$pl['id']]);
        $songs = $stmt2->fetchAll();
        
        $result[$pl['name']] = $songs;
    }
    return $result;
}

/**
 * Get request data (supports both JSON and form-data)
 */
function getRequestData(): array {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (strpos($contentType, 'application/json') !== false) {
        $json = file_get_contents('php://input');
        return json_decode($json, true) ?: [];
    }
    return $_POST;
}
