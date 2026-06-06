'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createDataStore,
  ensurePlaylist,
  generateToken,
  hashPassword,
  insertPlaylistSong
} = require('../src/server/database');
const { createExpressApp } = require('../src/server/index');
const { createHeuristicPlan } = require('../src/server/agent-assistant');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'music-agent-test-'));
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

async function startAgentApp({ agentModelClient } = {}) {
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
    agentModelClient,
    dispatcher: {
      async search(source, keyword) {
        if (/晴天/.test(keyword)) {
          return [{
            id: '186016',
            source,
            name: '晴天',
            artist: ['周杰伦'],
            album: '叶惠美',
            pic_id: '109951'
          }];
        }
        if (/七里香/.test(keyword)) {
          return [{
            id: '186001',
            source,
            name: '七里香',
            artist: ['周杰伦'],
            album: '七里香',
            pic_id: '109952'
          }];
        }
        return [];
      },
      async proxy() {
        return null;
      }
    }
  });
  const server = http.createServer(app);
  const baseUrl = await listen(server);
  return { baseUrl, dataDir, server, store };
}

function closeAgentApp(ctx) {
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

function insertUser(db) {
  db.prepare(`
    INSERT INTO users (username, email, password_hash, email_verified)
    VALUES (?, ?, ?, 1)
  `).run('agent_user', 'agent@example.test', hashPassword('CorrectPass123'));
  return db.prepare('SELECT id FROM users WHERE username = ?').get('agent_user').id;
}

test('agent assistant adds resolved songs to a playlist', async () => {
  let ctx;
  try {
    ctx = await startAgentApp({
      agentModelClient: async () => ({
        action: 'add_songs_to_playlist',
        playlist_name: '通勤',
        songs: [
          { title: '晴天', artist: '周杰伦' },
          { title: '七里香', artist: '周杰伦' }
        ],
        reply: ''
      })
    });
    const userId = insertUser(ctx.store.db);
    const token = generateToken(userId);

    const response = await postForm(ctx.baseUrl, '/php/agent_assistant.php', {
      user_id: String(userId),
      token,
      message: '把晴天和七里香加入通勤歌单'
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.action, 'add_songs_to_playlist');
    assert.equal(response.body.playlist.name, '通勤');
    assert.deepEqual(response.body.added_songs.map((song) => song.name), ['晴天', '七里香']);
    assert.deepEqual(new Set(response.body.user.playlists['通勤'].map((song) => song.name)), new Set(['晴天', '七里香']));
  } finally {
    closeAgentApp(ctx);
  }
});

test('agent assistant endpoint requires a matching token', async () => {
  let ctx;
  try {
    ctx = await startAgentApp();
    const userId = insertUser(ctx.store.db);

    const response = await postForm(ctx.baseUrl, '/php/agent_assistant.php', {
      user_id: String(userId),
      message: '把晴天加入通勤歌单'
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
  } finally {
    closeAgentApp(ctx);
  }
});

test('agent assistant returns songs from a requested playlist', async () => {
  let ctx;
  try {
    ctx = await startAgentApp({
      agentModelClient: async () => ({
        action: 'query_playlist_songs',
        playlist_name: '外部导入歌单',
        songs: [],
        reply: ''
      })
    });
    const userId = insertUser(ctx.store.db);
    const token = generateToken(userId);
    const playlist = ensurePlaylist(ctx.store.db, userId, '外部导入歌单');
    insertPlaylistSong(ctx.store.db, playlist.id, {
      id: '186016',
      source: 'netease',
      name: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
      pic_id: '109951'
    });

    const response = await postForm(ctx.baseUrl, '/php/agent_assistant.php', {
      user_id: String(userId),
      token,
      message: '外部导入歌单里有哪些歌'
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.action, 'query_playlist_songs');
    assert.equal(response.body.playlist.name, '外部导入歌单');
    assert.deepEqual(response.body.playlist_songs.map((song) => song.name), ['晴天']);
    assert.match(response.body.reply, /外部导入歌单/);
    assert.match(response.body.reply, /晴天/);
  } finally {
    closeAgentApp(ctx);
  }
});

test('heuristic plan can parse a simple Chinese add-to-playlist request', () => {
  const plan = createHeuristicPlan('把周杰伦的晴天、七里香加入通勤歌单');
  assert.equal(plan.action, 'add_songs_to_playlist');
  assert.equal(plan.playlist_name, '通勤');
  assert.deepEqual(plan.songs, [
    { title: '晴天', artist: '周杰伦' },
    { title: '七里香', artist: '' }
  ]);
});

test('heuristic plan can parse a Chinese playlist query request', () => {
  const plan = createHeuristicPlan('外部导入歌单里有哪些歌', {
    playlists: [{ name: '外部导入歌单', song_count: 23 }]
  });
  assert.equal(plan.action, 'query_playlist_songs');
  assert.equal(plan.playlist_name, '外部导入歌单');
  assert.deepEqual(plan.songs, []);
});
