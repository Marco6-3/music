'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createDataStore, generateToken, hashPassword } = require('../src/server/database');
const { createExpressApp } = require('../src/server/index');
const { getRecentPlays } = require('../src/server/play-history');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'music-sync-test-'));
}

function removeTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function startSyncApp() {
  const dataDir = createTempDir();
  const uploadsDir = path.join(dataDir, 'uploads', 'avatars');
  const cacheDir = path.join(dataDir, 'cache');
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  const store = await createDataStore(dataDir);
  const app = createExpressApp({
    store,
    uploadsDir,
    cacheDir,
    dispatcher: {
      async proxy() {
        throw new Error('music provider should not be called during sync tests');
      }
    }
  });
  const server = http.createServer(app);
  const baseUrl = await listen(server);
  return { baseUrl, dataDir, server, store };
}

function closeSyncApp(ctx) {
  if (!ctx) return;
  ctx.server?.close();
  ctx.store?.close();
  removeTempDir(ctx.dataDir);
}

async function postForm(baseUrl, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams(body)
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

function insertUser(db, { username, email, password = 'CorrectPass123' }) {
  db.prepare(`
    INSERT INTO users (username, email, password_hash, email_verified)
    VALUES (?, ?, ?, 1)
  `).run(username, email, hashPassword(password));
  return db.prepare('SELECT id FROM users WHERE username = ?').get(username).id;
}

test('sync bundle merges local collections into the cloud account', async () => {
  let ctx;
  try {
    ctx = await startSyncApp();
    const userId = insertUser(ctx.store.db, {
      username: 'sync_user',
      email: 'sync@example.test'
    });
    const token = generateToken(userId);

    const missingToken = await postForm(ctx.baseUrl, '/php/sync_bundle.php', {
      user_id: String(userId),
      payload: '{}'
    });
    assert.equal(missingToken.status, 401);
    assert.equal(missingToken.body.success, false);

    const payload = {
      favorites: [
        { id: 'fav-a', source: 'netease', name: 'Favorite A', artist: 'Artist A' }
      ],
      playlists: {
        '本地歌单': [
          { id: 'song-a', source: 'netease', name: 'Song A', artist: 'Artist A' },
          { id: 'song-b', source: 'kuwo', name: 'Song B', artist: 'Artist B' }
        ]
      },
      recent_plays: [
        { id: 'song-b', source: 'kuwo', name: 'Song B', artist: 'Artist B' }
      ],
      sync_state: {
        queue: [
          { id: 'song-a', source: 'netease', name: 'Song A', artist: 'Artist A' }
        ],
        client_state: {
          quality: '999',
          play_mode: 'order',
          ignored_key: 'not persisted'
        }
      }
    };

    const synced = await postForm(ctx.baseUrl, '/php/sync_bundle.php', {
      user_id: String(userId),
      token,
      payload: JSON.stringify(payload)
    });
    assert.equal(synced.status, 200);
    assert.equal(synced.body.success, true);
    assert.equal(synced.body.user.favorites.length, 1);
    assert.deepEqual(Object.keys(synced.body.user.playlists), ['本地歌单']);
    assert.equal(synced.body.user.playlists['本地歌单'].length, 2);
    assert.equal(synced.body.sync_state.queue.length, 1);
    assert.equal(synced.body.sync_state.client_state.quality, '999');
    assert.equal('ignored_key' in synced.body.sync_state.client_state, false);

    const second = await postForm(ctx.baseUrl, '/php/sync_bundle.php', {
      user_id: String(userId),
      token,
      payload: JSON.stringify({
        favorites: [
          { id: 'fav-b', source: 'netease', name: 'Favorite B', artist: 'Artist B' }
        ],
        playlists: {
          '本地歌单': [
            { id: 'song-c', source: 'netease', name: 'Song C', artist: 'Artist C' }
          ]
        }
      })
    });
    assert.equal(second.body.success, true);
    assert.deepEqual(new Set(second.body.user.favorites.map((song) => song.id)), new Set(['fav-b', 'fav-a']));
    assert.deepEqual(new Set(second.body.user.playlists['本地歌单'].map((song) => song.id)), new Set(['song-c', 'song-a', 'song-b']));
  } finally {
    closeSyncApp(ctx);
  }
});

test('sync bundle stores only a bounded recent play list', async () => {
  let ctx;
  try {
    ctx = await startSyncApp();
    const userId = insertUser(ctx.store.db, {
      username: 'history_sync_user',
      email: 'history-sync@example.test'
    });
    const token = generateToken(userId);
    const recentPlays = Array.from({ length: 230 }, (_, index) => ({
      id: `song-${index}`,
      source: 'netease',
      name: `Song ${index}`,
      artist: 'Artist'
    }));

    const synced = await postForm(ctx.baseUrl, '/php/sync_bundle.php', {
      user_id: String(userId),
      token,
      payload: JSON.stringify({ recent_plays: recentPlays })
    });
    assert.equal(synced.status, 200);
    assert.equal(synced.body.success, true);
    assert.equal(synced.body.recent_plays.length, 200);
    assert.equal(getRecentPlays(ctx.store.db, userId, 250).length, 200);
  } finally {
    closeSyncApp(ctx);
  }
});

test('sync bundle keeps large private playlists beyond the old 1000 song cap', async () => {
  let ctx;
  try {
    ctx = await startSyncApp();
    const userId = insertUser(ctx.store.db, {
      username: 'large_playlist_user',
      email: 'large-playlist@example.test'
    });
    const token = generateToken(userId);
    const songs = Array.from({ length: 1205 }, (_, index) => ({
      id: `song-${index}`,
      source: 'netease',
      name: `Song ${index}`,
      artist: 'Artist'
    }));

    const synced = await postForm(ctx.baseUrl, '/php/sync_bundle.php', {
      user_id: String(userId),
      token,
      payload: JSON.stringify({
        playlists: {
          '服务器大歌单': songs
        }
      })
    });

    assert.equal(synced.status, 200);
    assert.equal(synced.body.success, true);
    assert.equal(synced.body.user.playlists['服务器大歌单'].length, songs.length);

    const verified = await postForm(ctx.baseUrl, '/php/verify_token.php', {
      user_id: String(userId),
      token
    });
    assert.equal(verified.body.success, true);
    assert.equal(verified.body.user.playlists['服务器大歌单'].length, songs.length);
  } finally {
    closeSyncApp(ctx);
  }
});
