'use strict';

const MAX_HISTORY_ROWS_PER_USER = 200;

const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS play_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    song_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'netease',
    name TEXT DEFAULT '',
    artist TEXT DEFAULT '',
    album TEXT DEFAULT '',
    pic_id TEXT DEFAULT '',
    played_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_play_history_user ON play_history(user_id, played_at DESC);
  CREATE INDEX IF NOT EXISTS idx_play_history_song_recent ON play_history(user_id, song_id, source, id DESC);
`;

function initPlayHistory(db) {
  db.exec(TABLE_SQL);
}

function recordPlay(db, userId, song) {
  if (!userId || !song || !song.id) return;
  db.prepare(`
    INSERT INTO play_history (user_id, song_id, source, name, artist, album, pic_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(userId),
    String(song.id),
    String(song.source || 'netease'),
    String(song.name || ''),
    String(song.artist || ''),
    String(song.album || ''),
    String(song.pic_id || '')
  );
  pruneHistory(db, userId);
}

function getRecentPlays(db, userId, limit = 50) {
  return db.prepare(`
    SELECT ph.song_id AS id, ph.source, ph.name, ph.artist, ph.album, ph.pic_id, ph.played_at
    FROM play_history ph
    INNER JOIN (
      SELECT song_id, source, MAX(id) AS latest_id
      FROM play_history
      WHERE user_id = ?
      GROUP BY song_id, source
    ) latest ON latest.latest_id = ph.id
    WHERE ph.user_id = ?
    ORDER BY ph.played_at DESC, ph.id DESC
    LIMIT ?
  `).all(Number(userId), Number(userId), Math.min(Number(limit) || 50, 200));
}

function getDailyTop(db, userId, days = 7, limit = 30) {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  return db.prepare(`
    SELECT song_id AS id, source, name, artist, album, pic_id,
           COUNT(*) AS play_count,
           MAX(played_at) AS last_played
    FROM play_history
    WHERE user_id = ? AND played_at >= ?
    GROUP BY song_id, source
    ORDER BY play_count DESC, last_played DESC
    LIMIT ?
  `).all(Number(userId), since, Math.min(Number(limit) || 30, 100));
}

function clearHistory(db, userId) {
  db.prepare('DELETE FROM play_history WHERE user_id = ?').run(Number(userId));
}

function replaceRecentPlays(db, userId, songs, limit = MAX_HISTORY_ROWS_PER_USER) {
  const normalized = normalizeHistorySongs(songs).slice(0, Math.min(Number(limit) || MAX_HISTORY_ROWS_PER_USER, MAX_HISTORY_ROWS_PER_USER));
  db.prepare('DELETE FROM play_history WHERE user_id = ?').run(Number(userId));
  const insert = db.prepare(`
    INSERT INTO play_history (user_id, song_id, source, name, artist, album, pic_id, played_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = Math.floor(Date.now() / 1000);
  normalized.forEach((song, index) => {
    insert.run(
      Number(userId),
      song.id,
      song.source,
      song.name,
      song.artist,
      song.album,
      song.pic_id,
      Number(song.played_at || 0) || now - index
    );
  });
}

function normalizeHistorySongs(songs) {
  const seen = new Set();
  const result = [];
  for (const raw of Array.isArray(songs) ? songs : []) {
    const id = String(raw.id || raw.song_id || '').trim();
    const source = String(raw.source || 'netease').trim() || 'netease';
    if (!id) continue;
    const key = `${source}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id,
      source,
      name: String(raw.name || raw.song_name || raw.song_title || raw.title || ''),
      artist: normalizeArtist(raw.artist || raw.song_artist),
      album: String(raw.album || ''),
      pic_id: String(raw.pic_id || raw.song_cover || raw.pic || ''),
      played_at: Number(raw.played_at || raw.last_played || 0)
    });
  }
  return result;
}

function normalizeArtist(value) {
  if (Array.isArray(value)) return value.join(', ');
  return String(value || '');
}

function pruneHistory(db, userId, limit = MAX_HISTORY_ROWS_PER_USER) {
  db.prepare(`
    DELETE FROM play_history
    WHERE user_id = ?
      AND id NOT IN (
        SELECT id
        FROM play_history
        WHERE user_id = ?
        ORDER BY played_at DESC, id DESC
        LIMIT ?
      )
  `).run(Number(userId), Number(userId), Math.min(Number(limit) || MAX_HISTORY_ROWS_PER_USER, MAX_HISTORY_ROWS_PER_USER));
}

function registerPlayHistory(app, db, authMiddleware = null) {
  initPlayHistory(db);

  const middlewares = authMiddleware ? [authMiddleware] : [];
  app.post('/php/play_history.php', ...middlewares, (req, res) => {
    const userId = Number(req.authUserId || req.body.user_id || 0);
    if (!userId) return res.json({ success: false, message: '缺少用户ID' });

    const action = String(req.body.action || 'record');

    if (action === 'record') {
      recordPlay(db, userId, {
        id: req.body.song_id,
        source: req.body.source || 'netease',
        name: req.body.name || req.body.song_name,
        artist: req.body.artist || req.body.song_artist,
        album: req.body.album,
        pic_id: req.body.pic_id
      });
      return res.json({ success: true });
    }

    if (action === 'recent') {
      return res.json({ success: true, history: getRecentPlays(db, userId, req.body.limit) });
    }

    if (action === 'top') {
      return res.json({ success: true, songs: getDailyTop(db, userId, Number(req.body.days) || 7, req.body.limit) });
    }

    if (action === 'clear') {
      clearHistory(db, userId);
      return res.json({ success: true, message: '播放记录已清除' });
    }

    return res.json({ success: false, message: '未知操作' });
  });
}

module.exports = {
  initPlayHistory,
  recordPlay,
  getRecentPlays,
  getDailyTop,
  clearHistory,
  replaceRecentPlays,
  registerPlayHistory
};
