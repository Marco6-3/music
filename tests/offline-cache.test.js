'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const test = require('node:test');

const { createDataStore, hashPassword, ensurePlaylist, insertPlaylistSong } = require('../src/server/database');
const { createExpressApp } = require('../src/server/index');
const { OfflineMusicCache } = require('../src/server/offline-cache');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'music-offline-test-'));
}

function removeTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function insertUser(db) {
  db.prepare(`
    INSERT INTO users (username, email, password_hash, email_verified)
    VALUES ('offline_user', 'offline@example.test', ?, 1)
  `).run(hashPassword('secret123'));
  return db.prepare('SELECT id FROM users WHERE username = ?').get('offline_user').id;
}

function startAudioServer({
  audio = Buffer.from('fake-audio-content'),
  contentType = 'audio/mpeg',
  pathname = '/song.mp3'
} = {}) {
  const server = http.createServer((req, res) => {
    if (req.url !== pathname) {
      res.statusCode = 404;
      res.end('missing');
      return;
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', audio.length);
    res.end(audio);
  });
  return listen(server).then((url) => ({ server, url: `${url}${pathname}`, audio }));
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

async function waitFor(predicate, timeoutMs = 3000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out waiting for condition');
}

test('offline cache downloads playlist songs and deletes unreferenced files', async () => {
  const dataDir = createTempDir();
  const audioServer = await startAudioServer();
  let store;
  let cache;

  try {
    store = await createDataStore(dataDir);
    const userId = insertUser(store.db);
    const playlist = ensurePlaylist(store.db, userId, '常听');
    insertPlaylistSong(store.db, playlist.id, {
      id: 'song-1',
      source: 'netease',
      name: 'Song 1',
      artist: 'Artist',
      album: '',
      pic_id: ''
    });

    const dispatcher = {
      async proxy(types, params) {
        assert.equal(types, 'url');
        assert.equal(params.br, '999');
        return {
          data: JSON.stringify({ url: audioServer.url, br: 999 }),
          contentType: 'application/json',
          providerName: 'fake'
        };
      }
    };
    cache = new OfflineMusicCache({ db: store.db, dataDir, dispatcher });
    await cache.syncAll();

    const downloaded = await waitFor(() => cache.getPlayableTrack('netease', 'song-1'));
    assert.equal(downloaded.status, 'downloaded');
    assert.ok(fs.existsSync(downloaded.file_path));
    assert.equal(fs.readFileSync(downloaded.file_path, 'utf8'), 'fake-audio-content');

    store.db.prepare('DELETE FROM playlist_songs WHERE playlist_id = ?').run(playlist.id);
    await cache.syncAll();

    assert.equal(cache.getTrack('netease', 'song-1'), undefined);
    assert.equal(fs.existsSync(downloaded.file_path), false);
  } finally {
    if (cache) cache.close();
    if (store) store.close();
    audioServer.server.close();
    removeTempDir(dataDir);
  }
});

test('music API returns local offline URL when the track is downloaded', async () => {
  const dataDir = createTempDir();
  const audioServer = await startAudioServer();
  let store;
  let cache;
  let appServer;

  try {
    store = await createDataStore(dataDir);
    const userId = insertUser(store.db);
    const playlist = ensurePlaylist(store.db, userId, '常听');
    insertPlaylistSong(store.db, playlist.id, {
      id: 'song-2',
      source: 'netease',
      name: 'Song 2',
      artist: 'Artist'
    });

    cache = new OfflineMusicCache({
      db: store.db,
      dataDir,
      dispatcher: {
        async proxy() {
          return { data: JSON.stringify({ url: audioServer.url, br: 999 }) };
        }
      }
    });
    await cache.syncAll();
    await waitFor(() => cache.getPlayableTrack('netease', 'song-2'));

    const app = createExpressApp({
      store,
      uploadsDir: path.join(dataDir, 'uploads', 'avatars'),
      cacheDir: path.join(dataDir, 'cache'),
      dispatcher: {
        async proxy() {
          throw new Error('online provider should not be called for downloaded track');
        }
      },
      offlineCache: cache
    });
    appServer = http.createServer(app);
    const baseUrl = await listen(appServer);

    const response = await fetch(`${baseUrl}/api.php?types=url&source=netease&id=song-2&br=320`);
    const body = await response.json();

    assert.equal(response.headers.get('x-cache'), 'OFFLINE');
    assert.equal(response.headers.get('x-music-source'), 'offline');
    assert.equal(body.offline, true);
    assert.match(body.url, /^\/offline\/audio\//);

    const audioResponse = await fetch(`${baseUrl}${body.url}`, {
      headers: { Range: 'bytes=0-3' }
    });
    assert.equal(audioResponse.status, 206);
    assert.equal(await audioResponse.text(), 'fake');

    const originalCreateReadStream = fs.createReadStream;
    fs.createReadStream = () => new Readable({
      read() {
        const error = new Error('simulated missing file');
        error.code = 'ENOENT';
        this.destroy(error);
      }
    });
    try {
      const failedAudioResponse = await fetch(`${baseUrl}${body.url}`);
      assert.equal(failedAudioResponse.status, 404);
    } finally {
      fs.createReadStream = originalCreateReadStream;
    }
  } finally {
    if (appServer) appServer.close();
    if (cache) cache.close();
    if (store) store.close();
    audioServer.server.close();
    removeTempDir(dataDir);
  }
});

test('offline cache detects FLAC content when provider metadata is wrong', async () => {
  const dataDir = createTempDir();
  const flacAudio = Buffer.concat([Buffer.from('fLaC'), Buffer.alloc(16, 1)]);
  const audioServer = await startAudioServer({
    audio: flacAudio,
    contentType: 'audio/mpeg',
    pathname: '/wrong-type.mp3'
  });
  let store;
  let cache;

  try {
    store = await createDataStore(dataDir);
    const userId = insertUser(store.db);
    const playlist = ensurePlaylist(store.db, userId, '常听');
    insertPlaylistSong(store.db, playlist.id, {
      id: 'song-flac',
      source: 'netease',
      name: 'FLAC Song',
      artist: 'Artist'
    });

    cache = new OfflineMusicCache({
      db: store.db,
      dataDir,
      dispatcher: {
        async proxy() {
          return { data: JSON.stringify({ url: audioServer.url, br: 811 }) };
        }
      }
    });
    await cache.syncAll();

    const downloaded = await waitFor(() => cache.getPlayableTrack('netease', 'song-flac'));
    assert.equal(path.extname(downloaded.file_path), '.flac');
    assert.equal(downloaded.content_type, 'audio/x-flac');
    assert.equal(downloaded.br, 999);
    assert.deepEqual(fs.readFileSync(downloaded.file_path), flacAudio);
  } finally {
    if (cache) cache.close();
    if (store) store.close();
    audioServer.server.close();
    removeTempDir(dataDir);
  }
});

test('offline cache preserves URL extension when content type is generic and format is unknown', async () => {
  const dataDir = createTempDir();
  const audioServer = await startAudioServer({
    audio: Buffer.from('unknown-audio-content'),
    contentType: 'application/octet-stream',
    pathname: '/provider-file.flac'
  });
  let store;
  let cache;

  try {
    store = await createDataStore(dataDir);
    const userId = insertUser(store.db);
    const playlist = ensurePlaylist(store.db, userId, '常听');
    insertPlaylistSong(store.db, playlist.id, {
      id: 'song-generic',
      source: 'netease',
      name: 'Generic Song',
      artist: 'Artist'
    });

    cache = new OfflineMusicCache({
      db: store.db,
      dataDir,
      dispatcher: {
        async proxy() {
          return { data: JSON.stringify({ url: audioServer.url, br: 999 }) };
        }
      }
    });
    await cache.syncAll();

    const downloaded = await waitFor(() => cache.getPlayableTrack('netease', 'song-generic'));
    assert.equal(path.extname(downloaded.file_path), '.flac');
    assert.equal(downloaded.content_type, 'application/octet-stream');
    assert.equal(fs.readFileSync(downloaded.file_path, 'utf8'), 'unknown-audio-content');
  } finally {
    if (cache) cache.close();
    if (store) store.close();
    audioServer.server.close();
    removeTempDir(dataDir);
  }
});
