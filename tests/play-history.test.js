'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createDataStore } = require('../src/server/database');
const { getRecentPlays, initPlayHistory, recordPlay } = require('../src/server/play-history');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'music-history-test-'));
}

function removeTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

test('recent plays returns each song once with the latest play first', async () => {
  const dataDir = createTempDir();
  let store;

  try {
    store = await createDataStore(dataDir);
    initPlayHistory(store.db);

    recordPlay(store.db, 1, {
      id: 'song-a',
      source: 'netease',
      name: 'First Title',
      artist: 'Artist A'
    });
    recordPlay(store.db, 1, {
      id: 'song-b',
      source: 'netease',
      name: 'Second Title',
      artist: 'Artist B'
    });
    recordPlay(store.db, 1, {
      id: 'song-a',
      source: 'netease',
      name: 'Latest Title',
      artist: 'Artist A'
    });

    const recent = getRecentPlays(store.db, 1, 8);

    assert.deepEqual(recent.map((song) => song.id), ['song-a', 'song-b']);
    assert.equal(recent[0].name, 'Latest Title');
  } finally {
    if (store) store.close();
    removeTempDir(dataDir);
  }
});
