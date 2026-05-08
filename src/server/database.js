'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

const TOKEN_EXPIRY_SECONDS = 86400 * 30;
const CODE_EXPIRY_SECONDS = 600;
let tokenSecret = process.env.MUSIQ_TOKEN_SECRET || process.env.XCLOUD_TOKEN_SECRET || '';
let sqlJsPromise;

async function createDataStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const releaseLock = acquireDataStoreLock(dataDir);
  ensureTokenSecret(dataDir);
  try {
    const dbPath = resolveDataFile(dataDir, 'musiq.db', 'xcloud_music.db');
    const SQL = await loadSqlJs();
    const db = new PersistentSqlJsDatabase(SQL, dbPath);
    db.pragma('journal_mode = DELETE');
    db.pragma('foreign_keys = ON');
    initDb(db);

    return {
      db,
      dbPath,
      dataDir,
      close: () => {
        try {
          db.close();
        } finally {
          releaseLock();
        }
      }
    };
  } catch (error) {
    releaseLock();
    throw error;
  }
}

function loadSqlJs() {
  if (!sqlJsPromise) {
    const wasmDir = path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist');
    sqlJsPromise = initSqlJs({
      locateFile: (file) => path.join(wasmDir, file)
    });
  }
  return sqlJsPromise;
}

function resolveDataFile(dataDir, fileName, legacyFileName) {
  const dbPath = path.join(dataDir, fileName);
  const legacyPath = path.join(dataDir, legacyFileName);
  if (!fs.existsSync(dbPath) && fs.existsSync(legacyPath)) {
    fs.copyFileSync(legacyPath, dbPath);
  }
  return dbPath;
}

class PersistentSqlJsDatabase {
  constructor(SQL, dbPath) {
    this.dbPath = dbPath;
    this.transactionDepth = 0;
    const bytes = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
    this.raw = bytes && bytes.length ? new SQL.Database(bytes) : new SQL.Database();
  }

  exec(sql) {
    const result = this.raw.run(sql);
    this.persistIfNeeded(sql);
    return result;
  }

  prepare(sql) {
    return new SqlJsStatement(this, sql);
  }

  pragma(sql) {
    this.raw.run(`PRAGMA ${sql}`);
    this.persistIfNeeded(`PRAGMA ${sql}`);
  }

  transaction(fn) {
    return (...args) => {
      this.raw.run('BEGIN IMMEDIATE');
      this.transactionDepth += 1;
      try {
        const result = fn(...args);
        this.transactionDepth -= 1;
        this.raw.run('COMMIT');
        this.persist();
        return result;
      } catch (error) {
        this.transactionDepth -= 1;
        this.raw.run('ROLLBACK');
        throw error;
      }
    };
  }

  persistIfNeeded(sql) {
    if (this.transactionDepth > 0) return;
    if (!isWriteSql(sql)) return;
    this.persist();
  }

  persist() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const data = Buffer.from(this.raw.export());
    const tempPath = `${this.dbPath}.tmp`;
    fs.writeFileSync(tempPath, data);
    fs.renameSync(tempPath, this.dbPath);
  }

  close() {
    this.persist();
    this.raw.close();
  }
}

class SqlJsStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  run(...params) {
    const statement = this.db.raw.prepare(this.sql);
    try {
      statement.run(flattenParams(params));
      this.db.persistIfNeeded(this.sql);
      return { changes: this.db.raw.getRowsModified(), lastInsertRowid: this.lastInsertRowid() };
    } finally {
      statement.free();
    }
  }

  get(...params) {
    const statement = this.db.raw.prepare(this.sql);
    try {
      statement.bind(flattenParams(params));
      return statement.step() ? statement.getAsObject() : undefined;
    } finally {
      statement.free();
    }
  }

  all(...params) {
    const statement = this.db.raw.prepare(this.sql);
    const rows = [];
    try {
      statement.bind(flattenParams(params));
      while (statement.step()) {
        rows.push(statement.getAsObject());
      }
      return rows;
    } finally {
      statement.free();
    }
  }

  lastInsertRowid() {
    const rows = this.db.raw.exec('SELECT last_insert_rowid() AS id');
    return rows[0]?.values?.[0]?.[0] ?? 0;
  }
}

function flattenParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}

function isWriteSql(sql) {
  const firstToken = String(sql || '').trim().split(/\s+/, 1)[0]?.toUpperCase();
  return ['INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'CREATE', 'DROP', 'ALTER', 'PRAGMA'].includes(firstToken);
}

function acquireDataStoreLock(dataDir) {
  const lockPath = path.join(dataDir, 'musiq.lock');

  for (;;) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, created_at: formatDateTime(new Date()) }));
      let released = false;
      return () => {
        if (released) return;
        released = true;
        try {
          fs.closeSync(fd);
        } catch {}
        try {
          fs.unlinkSync(lockPath);
        } catch {}
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      const owner = readLockOwner(lockPath);
      if (owner.pid && isProcessAlive(owner.pid)) {
        throw new Error(`SQLite data directory is already in use by process ${owner.pid}: ${dataDir}`);
      }

      try {
        fs.unlinkSync(lockPath);
      } catch (unlinkError) {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      }
    }
  }
}

function readLockOwner(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return {};
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function ensureTokenSecret(dataDir) {
  if (tokenSecret) return tokenSecret;

  const secretFile = path.join(dataDir, 'token-secret');
  try {
    if (fs.existsSync(secretFile)) {
      tokenSecret = fs.readFileSync(secretFile, 'utf8').trim();
    }

    if (!tokenSecret) {
      tokenSecret = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(secretFile, tokenSecret, { encoding: 'utf8', mode: 0o600 });
    }
  } catch {
    tokenSecret = crypto.randomBytes(32).toString('hex');
  }

  return tokenSecret;
}

function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar TEXT DEFAULT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      verification_code TEXT DEFAULT NULL,
      code_expires_at INTEGER DEFAULT NULL,
      email_verified INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS favorites (
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
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS playlist_songs (
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
    );

    CREATE TABLE IF NOT EXISTS api_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      search TEXT DEFAULT 'true',
      play TEXT DEFAULT 'true',
      last_check TEXT DEFAULT NULL
    );
  `);

  const now = formatDateTime(new Date());
  const insertStatus = db.prepare(`
    INSERT OR IGNORE INTO api_status (source, name, search, play, last_check)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertStatus.run('netease', '网易云音乐', 'true', 'true', now);
  insertStatus.run('kuwo', '酷我音乐', 'true', 'true', now);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;

  const parts = String(storedHash).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, salt, expected] = parts;
  const actual = crypto.scryptSync(String(password), salt, 32);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}

function generateToken(userId) {
  const time = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ uid: Number(userId), iat: time, exp: time + TOKEN_EXPIRY_SECONDS });
  const signature = crypto.createHmac('sha256', tokenSecret || ensureTokenSecret(process.cwd())).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64')}.${signature}`;
}

function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;

  const payload = Buffer.from(parts[0], 'base64').toString('utf8');
  const expected = crypto.createHmac('sha256', tokenSecret || ensureTokenSecret(process.cwd())).update(payload).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(parts[1]);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    const data = JSON.parse(payload);
    if (!data || data.exp < Math.floor(Date.now() / 1000)) return null;
    return Number(data.uid) || null;
  } catch {
    return null;
  }
}

function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function publicUser(db, userId) {
  const user = db.prepare(`
    SELECT id, username, email, avatar, created_at, email_verified
    FROM users
    WHERE id = ?
  `).get(userId);

  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    created_at: user.created_at,
    email_verified: user.email_verified
  };
}

function userWithCollections(db, userId) {
  const user = publicUser(db, userId);
  if (!user) return null;

  return {
    ...user,
    favorites: getUserFavorites(db, userId),
    playlists: getUserPlaylistsObject(db, userId)
  };
}

function getUserFavorites(db, userId) {
  return db.prepare(`
    SELECT song_id AS id, source, name, artist, album, pic_id
    FROM favorites
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);
}

function getUserPlaylistsObject(db, userId) {
  const playlists = db.prepare(`
    SELECT id, name, created_at
    FROM playlists
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);

  const songsStmt = db.prepare(`
    SELECT song_id AS id, source, name, artist, album, pic_id, original_title, original_artist
    FROM playlist_songs
    WHERE playlist_id = ?
    ORDER BY created_at DESC
  `);

  const result = {};
  for (const playlist of playlists) {
    result[playlist.name] = songsStmt.all(playlist.id);
  }
  return result;
}

function getUserPlaylistsArray(db, userId) {
  const object = getUserPlaylistsObject(db, userId);
  return Object.entries(object).map(([name, songs]) => ({
    name,
    songs,
    song_count: songs.length
  }));
}

function ensurePlaylist(db, userId, name) {
  const playlistName = String(name || '').trim();
  if (!playlistName) return null;

  db.prepare('INSERT OR IGNORE INTO playlists (user_id, name) VALUES (?, ?)').run(userId, playlistName);
  return db.prepare('SELECT id, name FROM playlists WHERE user_id = ? AND name = ?').get(userId, playlistName);
}

function songFromBody(body) {
  return {
    id: stringValue(body.song_id || body.id),
    source: stringValue(body.source || 'netease'),
    name: stringValue(body.song_title || body.song_name || body.name || body.title),
    artist: normalizeArtist(body.song_artist || body.artist),
    album: stringValue(body.album),
    pic_id: stringValue(body.song_cover || body.pic_id || body.pic),
    original_title: stringValue(body.original_title || body.original_name),
    original_artist: stringValue(body.original_artist)
  };
}

function insertPlaylistSong(db, playlistId, song) {
  db.prepare(`
    INSERT OR IGNORE INTO playlist_songs
      (playlist_id, song_id, source, name, artist, album, pic_id, original_title, original_artist)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    playlistId,
    song.id,
    song.source || 'netease',
    song.name || '',
    song.artist || '',
    song.album || '',
    song.pic_id || '',
    song.original_title || '',
    song.original_artist || ''
  );
}

function normalizeArtist(value) {
  if (Array.isArray(value)) return value.join(', ');
  return stringValue(value);
}

function stringValue(value) {
  return String(value ?? '').trim();
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(String(value ?? ''));
  } catch {
    return fallback;
  }
}

function formatDateTime(date) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

module.exports = {
  CODE_EXPIRY_SECONDS,
  createDataStore,
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  generateCode,
  publicUser,
  userWithCollections,
  getUserFavorites,
  getUserPlaylistsObject,
  getUserPlaylistsArray,
  ensurePlaylist,
  songFromBody,
  insertPlaylistSong,
  parseJson,
  stringValue,
  normalizeArtist,
  formatDateTime
};
