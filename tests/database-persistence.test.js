'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const initSqlJs = require('sql.js');
const { createDataStore, hashPassword } = require('../src/server/database');

let sqlJsPromise;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'music-db-test-'));
}

function removeTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

async function loadSqlJs() {
  if (!sqlJsPromise) {
    const wasmDir = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist');
    sqlJsPromise = initSqlJs({
      locateFile: (file) => path.join(wasmDir, file)
    });
  }
  return sqlJsPromise;
}

async function readPersistedRows(dbPath, sql) {
  const SQL = await loadSqlJs();
  const bytes = fs.readFileSync(dbPath);
  const db = new SQL.Database(bytes);
  try {
    const result = db.exec(sql);
    if (!result.length) return [];
    const columns = result[0].columns;
    return result[0].values.map((values) => Object.fromEntries(columns.map((column, index) => [column, values[index]])));
  } finally {
    db.close();
  }
}

function insertUser(db, username) {
  db.prepare(`
    INSERT INTO users (username, email, password_hash, email_verified)
    VALUES (?, ?, ?, 1)
  `).run(username, `${username}@example.test`, hashPassword('secret123'));
}

test('ordinary INSERT is persisted after the debounce window', async () => {
  const dataDir = createTempDir();
  let store;

  try {
    store = await createDataStore(dataDir);
    insertUser(store.db, 'debounce_user');

    await delay(750);

    const rows = await readPersistedRows(store.dbPath, "SELECT username FROM users WHERE username = 'debounce_user'");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].username, 'debounce_user');
  } finally {
    if (store) store.close();
    removeTempDir(dataDir);
  }
});

test('close flushes a pending debounced persist before raw close', async () => {
  const dataDir = createTempDir();
  let store;
  let reopened;

  try {
    store = await createDataStore(dataDir);
    insertUser(store.db, 'close_flush_user');
    store.close();
    store = null;

    reopened = await createDataStore(dataDir);
    const row = reopened.db.prepare('SELECT username FROM users WHERE username = ?').get('close_flush_user');
    assert.equal(row.username, 'close_flush_user');
  } finally {
    if (store) store.close();
    if (reopened) reopened.close();
    removeTempDir(dataDir);
  }
});

test('transaction COMMIT is persisted immediately', async () => {
  const dataDir = createTempDir();
  let store;

  try {
    store = await createDataStore(dataDir);
    const insertMany = store.db.transaction(() => {
      insertUser(store.db, 'transaction_user_a');
      insertUser(store.db, 'transaction_user_b');
    });

    insertMany();

    const rows = await readPersistedRows(
      store.dbPath,
      "SELECT username FROM users WHERE username LIKE 'transaction_user_%' ORDER BY username"
    );
    assert.deepEqual(rows.map((row) => row.username), ['transaction_user_a', 'transaction_user_b']);
  } finally {
    if (store) store.close();
    removeTempDir(dataDir);
  }
});
