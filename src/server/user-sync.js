'use strict';

const {
  getUserFavorites,
  getUserPlaylistsObject,
  getUserSyncState,
  setUserSyncState,
  ensurePlaylist,
  insertPlaylistSong,
  songFromBody,
  parseJson,
  stringValue
} = require('./database');
const { getRecentPlays, replaceRecentPlays } = require('./play-history');

const SYNC_LIMITS = {
  favorites: 10000,
  playlists: 300,
  playlistSongs: 10000,
  recentPlays: 1000,
  queue: 500
};

function snapshotUserSync(db, userId) {
  return {
    favorites: getUserFavorites(db, userId),
    playlists: getUserPlaylistsObject(db, userId),
    recent_plays: getRecentPlays(db, userId, SYNC_LIMITS.recentPlays),
    sync_state: getUserSyncState(db, userId)
  };
}

function syncUserData(db, userId, rawPayload, { mode = 'merge' } = {}) {
  const payload = normalizeSyncPayload(rawPayload);
  const replace = mode === 'replace';
  let result;

  const sync = db.transaction(() => {
    const nextFavorites = replace
      ? payload.favorites
      : mergeSongs(payload.favorites, getUserFavorites(db, userId), SYNC_LIMITS.favorites);
    replaceFavorites(db, userId, nextFavorites);

    const nextPlaylists = replace
      ? payload.playlists
      : mergePlaylists(payload.playlists, getUserPlaylistsObject(db, userId));
    replacePlaylists(db, userId, nextPlaylists);

    const nextRecentPlays = replace
      ? payload.recent_plays
      : mergeSongs(payload.recent_plays, getRecentPlays(db, userId, SYNC_LIMITS.recentPlays), SYNC_LIMITS.recentPlays);
    replaceRecentPlays(db, userId, nextRecentPlays, SYNC_LIMITS.recentPlays);

    const currentState = replace ? { queue: [], client_state: {} } : getUserSyncState(db, userId);
    const nextQueue = mergeSongs(payload.sync_state.queue, currentState.queue || [], SYNC_LIMITS.queue);
    const nextClientState = {
      ...(currentState.client_state || {}),
      ...(payload.sync_state.client_state || {})
    };
    setUserSyncState(db, userId, {
      queue: nextQueue,
      client_state: nextClientState
    });

    result = snapshotUserSync(db, userId);
  });

  sync();
  return result;
}

function normalizeSyncPayload(rawPayload) {
  const payload = typeof rawPayload === 'string'
    ? parseJson(rawPayload, {})
    : (rawPayload && typeof rawPayload === 'object' ? rawPayload : {});
  const syncState = payload.sync_state && typeof payload.sync_state === 'object' ? payload.sync_state : {};

  return {
    favorites: normalizeSongList(payload.favorites).slice(0, SYNC_LIMITS.favorites),
    playlists: normalizePlaylists(payload.playlists),
    recent_plays: normalizeSongList(payload.recent_plays || payload.history).slice(0, SYNC_LIMITS.recentPlays),
    sync_state: {
      queue: normalizeSongList(syncState.queue || payload.queue).slice(0, SYNC_LIMITS.queue),
      client_state: normalizeClientState(syncState.client_state || payload.client_state)
    }
  };
}

function replaceFavorites(db, userId, favorites) {
  db.prepare('DELETE FROM favorites WHERE user_id = ?').run(userId);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO favorites (user_id, song_id, source, name, artist, album, pic_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const song of favorites) {
    insert.run(userId, song.id, song.source, song.name, song.artist, song.album, song.pic_id);
  }
}

function replacePlaylists(db, userId, playlists) {
  const existing = db.prepare('SELECT id FROM playlists WHERE user_id = ?').all(userId);
  for (const playlist of existing) {
    db.prepare('DELETE FROM playlist_songs WHERE playlist_id = ?').run(playlist.id);
  }
  db.prepare('DELETE FROM playlists WHERE user_id = ?').run(userId);

  for (const [name, songs] of Object.entries(playlists).slice(0, SYNC_LIMITS.playlists)) {
    const playlist = ensurePlaylist(db, userId, name);
    if (!playlist) continue;
    for (const song of songs.slice(0, SYNC_LIMITS.playlistSongs)) {
      insertPlaylistSong(db, playlist.id, song);
    }
  }
}

function normalizePlaylists(playlists) {
  const result = {};
  if (Array.isArray(playlists)) {
    for (const playlist of playlists) {
      const name = normalizePlaylistName(playlist.name);
      if (!name || result[name]) continue;
      result[name] = normalizeSongList(playlist.songs).slice(0, SYNC_LIMITS.playlistSongs);
      if (Object.keys(result).length >= SYNC_LIMITS.playlists) break;
    }
    return result;
  }

  if (!playlists || typeof playlists !== 'object') return result;
  for (const [rawName, songs] of Object.entries(playlists)) {
    const name = normalizePlaylistName(rawName);
    if (!name || result[name]) continue;
    result[name] = normalizeSongList(songs).slice(0, SYNC_LIMITS.playlistSongs);
    if (Object.keys(result).length >= SYNC_LIMITS.playlists) break;
  }
  return result;
}

function mergePlaylists(primary, secondary) {
  const result = {};
  const names = [...Object.keys(primary || {}), ...Object.keys(secondary || {})];
  for (const name of names) {
    const playlistName = normalizePlaylistName(name);
    if (!playlistName || result[playlistName]) continue;
    result[playlistName] = mergeSongs(primary?.[name] || [], secondary?.[name] || [], SYNC_LIMITS.playlistSongs);
    if (Object.keys(result).length >= SYNC_LIMITS.playlists) break;
  }
  return result;
}

function mergeSongs(primary, secondary, limit) {
  const seen = new Set();
  const result = [];
  for (const song of [...normalizeSongList(primary), ...normalizeSongList(secondary)]) {
    const key = `${song.source}:${song.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(song);
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeSongList(list) {
  return (Array.isArray(list) ? list : []).map(normalizeSong).filter((song) => song.id);
}

function normalizeSong(raw) {
  const song = songFromBody(raw || {});
  if (!song.id && raw?.id) song.id = stringValue(raw.id);
  if (!song.name && raw?.title) song.name = stringValue(raw.title);
  return {
    id: song.id,
    source: song.source || 'netease',
    name: song.name || '',
    artist: song.artist || '',
    album: song.album || '',
    pic_id: song.pic_id || '',
    original_title: song.original_title || '',
    original_artist: song.original_artist || ''
  };
}

function normalizePlaylistName(name) {
  return stringValue(name).slice(0, 80);
}

function normalizeClientState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowed = {};
  for (const key of ['current_song', 'current_index', 'quality', 'play_mode', 'updated_at']) {
    if (value[key] !== undefined) allowed[key] = value[key];
  }
  return allowed;
}

module.exports = {
  SYNC_LIMITS,
  normalizeSyncPayload,
  snapshotUserSync,
  syncUserData
};
