'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  createDataStore,
  userWithCollections,
  stringValue
} = require('../src/server/database');
const { initPlayHistory, getRecentPlays } = require('../src/server/play-history');
const { syncUserData } = require('../src/server/user-sync');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputFile = args.input ? path.resolve(args.input) : '';
  const dataDir = path.resolve(args.dataDir || process.env.MUSIC_DATA_DIR || process.env.MUSIQ_DATA_DIR || 'data');
  const mode = args.mode === 'replace' ? 'replace' : 'merge';
  if (!inputFile) throw new Error('请使用 --input 指定导入文件路径');

  const payload = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  validatePayload(payload);

  const store = await createDataStore(dataDir);
  try {
    initPlayHistory(store.db);
    const userId = upsertUser(store.db, payload.user);
    const synced = syncUserData(store.db, userId, payload, { mode });
    store.db.persist();
    const user = userWithCollections(store.db, userId);
    const playlistSongs = Object.values(user.playlists || {}).reduce((sum, songs) => sum + songs.length, 0);
    console.log(JSON.stringify({
      ok: true,
      mode,
      username: user.username,
      user_id: userId,
      favorites: (user.favorites || []).length,
      playlists: Object.keys(user.playlists || {}).length,
      playlist_songs: playlistSongs,
      recent_plays: (synced.recent_plays || getRecentPlays(store.db, userId, 200)).length
    }));
  } finally {
    store.close();
  }
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') result.input = argv[++i];
    else if (arg === '--data-dir') result.dataDir = argv[++i];
    else if (arg === '--mode') result.mode = argv[++i];
  }
  return result;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('导入文件格式错误');
  if (!payload.user || typeof payload.user !== 'object') throw new Error('导入文件缺少用户信息');
  if (!stringValue(payload.user.username)) throw new Error('导入文件缺少用户名');
  if (!stringValue(payload.user.email)) throw new Error('导入文件缺少邮箱');
  if (!stringValue(payload.user.password_hash)) throw new Error('导入文件缺少密码哈希');
}

function upsertUser(db, user) {
  const username = stringValue(user.username);
  const email = stringValue(user.email).toLowerCase();
  const existing = db.prepare(`
    SELECT id
    FROM users
    WHERE username = ? OR lower(email) = ?
    ORDER BY username = ? DESC
    LIMIT 1
  `).get(username, email, username);

  if (existing) {
    db.prepare(`
      UPDATE users
      SET username = ?, email = ?, password_hash = ?, avatar = ?, email_verified = 1
      WHERE id = ?
    `).run(
      username,
      email,
      user.password_hash,
      stringValue(user.avatar),
      existing.id
    );
    return existing.id;
  }

  db.prepare(`
    INSERT INTO users (username, email, password_hash, avatar, email_verified)
    VALUES (?, ?, ?, ?, 1)
  `).run(
    username,
    email,
    user.password_hash,
    stringValue(user.avatar)
  );
  return db.prepare('SELECT id FROM users WHERE username = ?').get(username).id;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
