'use strict';

const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const username = args.username || process.env.MUSIQ_SYNC_USERNAME || 'mingzhe';
  const dataDir = path.resolve(args.dataDir || process.env.MUSIC_DATA_DIR || process.env.MUSIQ_DATA_DIR || 'data');
  const outFile = args.out ? path.resolve(args.out) : '';
  if (!outFile) throw new Error('请使用 --out 指定导出文件路径');

  const dbPath = resolveDataFile(dataDir);
  if (!dbPath) throw new Error(`没有找到数据库文件: ${dataDir}`);

  const SQL = await initSqlJs({
    locateFile: (file) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
  });
  const db = new SQL.Database(fs.readFileSync(dbPath));
  try {
    const user = getUser(db, username);
    if (!user) throw new Error(`本地数据库里没有找到用户: ${username}`);

    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      user,
      favorites: getFavorites(db, user.id),
      playlists: getPlaylists(db, user.id),
      recent_plays: getRecentPlays(db, user.id),
      sync_state: getSyncState(db, user.id)
    };

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    const playlistSongs = Object.values(payload.playlists).reduce((sum, songs) => sum + songs.length, 0);
    console.log(JSON.stringify({
      ok: true,
      out: outFile,
      username: user.username,
      favorites: payload.favorites.length,
      playlists: Object.keys(payload.playlists).length,
      playlist_songs: playlistSongs,
      recent_plays: payload.recent_plays.length
    }));
  } finally {
    db.close();
  }
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--username') result.username = argv[++i];
    else if (arg === '--data-dir') result.dataDir = argv[++i];
    else if (arg === '--out') result.out = argv[++i];
  }
  return result;
}

function resolveDataFile(dataDir) {
  for (const name of ['music.db', 'musiq.db', 'xcloud_music.db']) {
    const candidate = path.join(dataDir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function getUser(db, username) {
  const user = first(db, `
    SELECT id, username, email, password_hash, avatar, created_at, email_verified
    FROM users
    WHERE username = ?
  `, [username]);
  return user && user.id !== undefined ? user : null;
}

function getFavorites(db, userId) {
  return all(db, `
    SELECT song_id AS id, source, name, artist, album, pic_id
    FROM favorites
    WHERE user_id = ?
    ORDER BY created_at DESC
  `, [userId]);
}

function getPlaylists(db, userId) {
  const playlists = all(db, `
    SELECT id, name
    FROM playlists
    WHERE user_id = ?
    ORDER BY created_at DESC
  `, [userId]);
  const result = {};
  for (const playlist of playlists) {
    result[playlist.name] = all(db, `
      SELECT song_id AS id, source, name, artist, album, pic_id, original_title, original_artist
      FROM playlist_songs
      WHERE playlist_id = ?
      ORDER BY created_at DESC
    `, [playlist.id]);
  }
  return result;
}

function getRecentPlays(db, userId) {
  try {
    return all(db, `
      SELECT song_id AS id, source, name, artist, album, pic_id, played_at
      FROM play_history
      WHERE user_id = ?
      ORDER BY played_at DESC, id DESC
      LIMIT 200
    `, [userId]);
  } catch {
    return [];
  }
}

function getSyncState(db, userId) {
  let row = null;
  try {
    row = first(db, `
      SELECT queue_json, client_state_json, updated_at
      FROM user_sync_state
      WHERE user_id = ?
    `, [userId]);
  } catch {
    row = null;
  }
  if (!row) return { queue: [], client_state: {}, updated_at: 0 };
  return {
    queue: parseJson(row.queue_json, []),
    client_state: parseJson(row.client_state_json, {}),
    updated_at: Number(row.updated_at || 0)
  };
}

function all(db, sql, params) {
  const stmt = db.prepare(sql);
  const rows = [];
  try {
    stmt.bind(params);
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function first(db, sql, params) {
  return all(db, sql, params)[0] || null;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
