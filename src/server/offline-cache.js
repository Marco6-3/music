'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const axios = require('axios');

const DEFAULT_QUALITY = '999';
const DOWNLOAD_CONCURRENCY = 2;

class OfflineMusicCache {
  constructor({ db, dataDir, dispatcher, quality = DEFAULT_QUALITY, concurrency = DOWNLOAD_CONCURRENCY } = {}) {
    this.db = db;
    this.dataDir = dataDir;
    this.dispatcher = dispatcher;
    this.quality = String(quality || DEFAULT_QUALITY);
    this.concurrency = Math.max(1, Number(concurrency) || DOWNLOAD_CONCURRENCY);
    this.audioDir = path.join(dataDir, 'offline-audio');
    this.queue = [];
    this.queued = new Set();
    this.active = 0;
    this.syncTimer = null;
    this.closed = false;
    fs.mkdirSync(this.audioDir, { recursive: true });
  }

  scheduleSync(delayMs = 250) {
    if (this.closed) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.syncAll().catch((error) => {
        console.warn('[offline-cache] sync failed:', error.message);
      });
    }, delayMs);
    if (this.syncTimer.unref) this.syncTimer.unref();
  }

  async syncAll() {
    if (this.closed) return;
    await fsp.mkdir(this.audioDir, { recursive: true });

    const desired = this._playlistSongs();
    const desiredKeys = new Set(desired.map((song) => song.cache_key));
    const existing = this.db.prepare('SELECT cache_key, file_path FROM offline_tracks').all();

    for (const row of existing) {
      if (desiredKeys.has(row.cache_key)) continue;
      await this._deleteTrack(row.cache_key, row.file_path);
    }

    for (const song of desired) {
      this._upsertPending(song);
      const track = this.getTrack(song.source, song.id);
      if (track?.status === 'downloaded' && track.file_path && fs.existsSync(track.file_path)) {
        continue;
      }
      this.enqueue(song);
    }
  }

  enqueue(song) {
    if (this.closed || !song?.id) return;
    const item = normalizeSong(song);
    item.cache_key = cacheKey(item.source, item.id);
    if (this.queued.has(item.cache_key)) return;
    this.queued.add(item.cache_key);
    this.queue.push(item);
    this._pump();
  }

  getTrack(source, songId) {
    return this.db.prepare(`
      SELECT cache_key, song_id, source, name, artist, album, pic_id, status, file_path, content_type, br, size
      FROM offline_tracks
      WHERE source = ? AND song_id = ?
    `).get(String(source || 'netease'), String(songId || ''));
  }

  getTrackByKey(cacheKeyValue) {
    return this.db.prepare(`
      SELECT cache_key, song_id, source, name, artist, album, pic_id, status, file_path, content_type, br, size
      FROM offline_tracks
      WHERE cache_key = ?
    `).get(String(cacheKeyValue || ''));
  }

  getPlayableTrack(source, songId) {
    const track = this.getTrack(source, songId);
    if (!track || track.status !== 'downloaded' || !track.file_path || !fs.existsSync(track.file_path)) {
      return null;
    }
    return track;
  }

  close() {
    this.closed = true;
    clearTimeout(this.syncTimer);
  }

  _pump() {
    while (!this.closed && this.active < this.concurrency && this.queue.length) {
      const song = this.queue.shift();
      this.active += 1;
      this._download(song)
        .catch((error) => {
          if (this.closed) return;
          this._markError(song.cache_key, error);
          console.warn(`[offline-cache] download failed (${song.source}:${song.id}):`, error.message);
        })
        .finally(() => {
          this.active -= 1;
          this.queued.delete(song.cache_key);
          this._pump();
        });
    }
  }

  async _download(song) {
    this._markDownloading(song);
    const audio = await this._resolveAudio(song);
    if (!audio.url) throw new Error('没有可下载的播放地址');

    const response = await axios.get(audio.url, {
      timeout: 45_000,
      responseType: 'stream',
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'audio/*,*/*'
      }
    });

    const contentType = response.headers['content-type'] || audio.contentType || 'audio/mpeg';
    const ext = extensionFor(contentType, audio.url);
    const finalPath = path.join(this.audioDir, `${song.cache_key}${ext}`);
    const tempPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
    await pipeline(response.data, fs.createWriteStream(tempPath));
    if (this.closed) {
      await fsp.rm(tempPath, { force: true });
      return;
    }
    const stat = await fsp.stat(tempPath);
    if (stat.size <= 0) {
      await fsp.rm(tempPath, { force: true });
      throw new Error('下载结果为空');
    }

    await this._removeSiblingAudioFiles(song.cache_key, finalPath);
    await fsp.rename(tempPath, finalPath);
    if (this.closed) return;
    this._markDownloaded(song, {
      filePath: finalPath,
      contentType,
      br: normalizeBitrate(audio.br || this.quality),
      size: stat.size
    });
  }

  async _resolveAudio(song) {
    if (!this.dispatcher) throw new Error('音乐源调度器不可用');
    const result = await this.dispatcher.proxy('url', {
      source: song.source || 'netease',
      id: song.id,
      br: this.quality
    });
    const parsed = parseProviderBody(result);
    return {
      url: parsed?.url || parsed?.data?.url || '',
      br: parsed?.br || parsed?.data?.br || this.quality,
      contentType: result?.contentType
    };
  }

  _playlistSongs() {
    const rows = this.db.prepare(`
      SELECT ps.source, ps.song_id AS id, ps.name, ps.artist, ps.album, ps.pic_id
      FROM playlist_songs ps
      INNER JOIN playlists p ON p.id = ps.playlist_id
      ORDER BY ps.created_at DESC
    `).all();

    const byKey = new Map();
    for (const row of rows) {
      const song = normalizeSong(row);
      if (!song.id) continue;
      song.cache_key = cacheKey(song.source, song.id);
      if (!byKey.has(song.cache_key)) byKey.set(song.cache_key, song);
    }
    return [...byKey.values()];
  }

  _upsertPending(song) {
    this.db.prepare(`
      INSERT INTO offline_tracks
        (cache_key, song_id, source, name, artist, album, pic_id, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', strftime('%s', 'now'))
      ON CONFLICT(cache_key) DO UPDATE SET
        name = excluded.name,
        artist = excluded.artist,
        album = excluded.album,
        pic_id = excluded.pic_id,
        updated_at = strftime('%s', 'now')
    `).run(
      song.cache_key,
      song.id,
      song.source,
      song.name || '',
      song.artist || '',
      song.album || '',
      song.pic_id || ''
    );
  }

  _markDownloading(song) {
    this.db.prepare(`
      UPDATE offline_tracks
      SET status = 'downloading',
          error = NULL,
          attempts = attempts + 1,
          updated_at = strftime('%s', 'now')
      WHERE cache_key = ?
    `).run(song.cache_key);
  }

  _markDownloaded(song, { filePath, contentType, br, size }) {
    this.db.prepare(`
      UPDATE offline_tracks
      SET status = 'downloaded',
          file_path = ?,
          content_type = ?,
          br = ?,
          size = ?,
          error = NULL,
          updated_at = strftime('%s', 'now'),
          downloaded_at = strftime('%s', 'now')
      WHERE cache_key = ?
    `).run(filePath, contentType, br, size, song.cache_key);
  }

  _markError(cacheKey, error) {
    this.db.prepare(`
      UPDATE offline_tracks
      SET status = 'error',
          error = ?,
          updated_at = strftime('%s', 'now')
      WHERE cache_key = ?
    `).run(String(error?.message || error || '下载失败').slice(0, 500), cacheKey);
  }

  async _deleteTrack(cacheKeyValue, filePath) {
    if (filePath) await fsp.rm(filePath, { force: true }).catch(() => {});
    await this._removeSiblingAudioFiles(cacheKeyValue, '');
    this.db.prepare('DELETE FROM offline_tracks WHERE cache_key = ?').run(cacheKeyValue);
  }

  async _removeSiblingAudioFiles(cacheKeyValue, keepPath) {
    const keep = keepPath ? path.resolve(keepPath) : '';
    const entries = await fsp.readdir(this.audioDir).catch(() => []);
    await Promise.all(entries
      .filter((name) => name.startsWith(`${cacheKeyValue}.`))
      .filter((name) => !name.includes('.tmp-'))
      .map(async (name) => {
        const target = path.join(this.audioDir, name);
        if (keep && path.resolve(target) === keep) return;
        await fsp.rm(target, { force: true }).catch(() => {});
      }));
  }
}

function offlineAudioUrl(track) {
  return `/offline/audio/${encodeURIComponent(track.cache_key)}`;
}

function cacheKey(source, songId) {
  return crypto.createHash('sha256').update(`${source || 'netease'}:${songId}`).digest('hex').slice(0, 32);
}

function normalizeSong(song) {
  return {
    id: String(song?.id || song?.song_id || '').trim(),
    source: String(song?.source || 'netease').trim() || 'netease',
    name: String(song?.name || '').trim(),
    artist: String(song?.artist || '').trim(),
    album: String(song?.album || '').trim(),
    pic_id: String(song?.pic_id || '').trim()
  };
}

function parseProviderBody(result) {
  if (!result) return null;
  if (typeof result === 'string') return parseJson(result);
  if (typeof result.data === 'string') return parseJson(result.data);
  if (result.data && typeof result.data === 'object') return result.data;
  if (typeof result === 'object') return result;
  return null;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeBitrate(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric > 5000 ? Math.round(numeric / 1000) : Math.round(numeric);
}

function extensionFor(contentType, url) {
  const type = String(contentType || '').toLowerCase();
  if (type.includes('flac')) return '.flac';
  if (type.includes('mp4') || type.includes('aac') || type.includes('m4a')) return '.m4a';
  if (type.includes('ogg')) return '.ogg';
  if (type.includes('wav')) return '.wav';
  const pathname = safeUrlPath(url).toLowerCase();
  const ext = path.extname(pathname);
  if (['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.wav'].includes(ext)) return ext;
  return '.mp3';
}

function safeUrlPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

module.exports = {
  OfflineMusicCache,
  offlineAudioUrl,
  cacheKey,
  extensionFor,
  parseProviderBody
};
