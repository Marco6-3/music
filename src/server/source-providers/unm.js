'use strict';

const http = require('node:http');
const https = require('node:https');
const { BaseProvider } = require('./base');
const { errorMessage } = require('./dispatcher');

let providerModules;

function loadUnmModules() {
  if (providerModules) return true;
  try {
    providerModules = {
      kuwo: tryRequire('@unblockneteasemusic/server/src/provider/kuwo'),
      kugou: tryRequire('@unblockneteasemusic/server/src/provider/kugou'),
      bilibili: tryRequire('@unblockneteasemusic/server/src/provider/bilibili'),
      bodian: tryRequire('@unblockneteasemusic/server/src/provider/bodian'),
      migu: tryRequire('@unblockneteasemusic/server/src/provider/migu'),
    };
    return true;
  } catch (error) {
    console.warn('[UnmProvider] failed to load UNM modules:', error.message);
    return false;
  }
}

const MIN_SONG_SIZE_BYTES = 500 * 1024; // 500KB — ads/jingles are typically < 200KB

function headContentLength(url) {
  return new Promise((resolve) => {
    const transport = url.startsWith('https') ? https : http;
    const req = transport.request(url, { method: 'HEAD', timeout: 5000 }, (res) => {
      const size = Number(res.headers['content-length']) || 0;
      res.resume();
      resolve(size);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.end();
  });
}

function tryRequire(id) {
  try {
    return require(id);
  } catch {
    return null;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('UNM timeout')), ms))
  ]);
}

// UNM-based provider for multi-source URL resolution and search fallback.
class UnmProvider extends BaseProvider {
  constructor(options = {}) {
    super('unm', options);
    this.sources = options.sources || ['kuwo', 'kugou', 'bodian', 'bilibili'];
    this.timeout = options.timeout || 10_000;
    this.syntheticSongs = new Map();
  }

  async search(platform, keyword, count = 30) {
    if (!loadUnmModules()) return [];

    const info = { keyword, duration: 0 };
    const results = [];

    const promises = this._filterSources(platform).map(async (sourceName) => {
      const mod = providerModules[sourceName];
      if (!mod) return;

      try {
        const checkFn = mod.check || mod.search;
        if (!checkFn) return;

        const result = await withTimeout(checkFn(info), this.timeout);
        if (!result) return;

        if (typeof result === 'string' && result.startsWith('http')) {
          // Validate file size to filter out ads
          const size = await headContentLength(result);
          if (size > 0 && size < MIN_SONG_SIZE_BYTES) {
            console.warn(`[UnmProvider] search: "${sourceName}" returned suspicious file (${(size / 1024).toFixed(0)}KB), skipping`);
            return;
          }

          const id = this._syntheticId(sourceName, results.length);
          const song = this._buildSyntheticSong({
            id,
            keyword,
            sourceName,
            directUrl: result
          });
          this.syntheticSongs.set(id, song);
          results.push({
            id,
            name: song.name,
            artist: song.artist,
            source: sourceName
          });
        } else if (result && result.id) {
          const artists = result.artists ? [].concat(result.artists).map(a => a.name || a).filter(Boolean) : [];
          const id = String(result.id);
          const song = {
            id,
            name: result.name || keyword.split(' ')[0],
            artist: artists.join(', '),
            source: sourceName,
            album: result.album?.name || ''
          };
          this.syntheticSongs.set(id, song);
          results.push({
            id: String(result.id),
            name: song.name,
            artist: song.artist,
            source: sourceName,
            album: song.album
          });
        }
      } catch {
        // source failed, skip
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  async url(song, quality = '320') {
    if (!loadUnmModules()) return null;

    // Check if this is a synthetic song from our search results
    const cached = this.syntheticSongs.get(String(song.id));
    if (cached?.directUrl) {
      return { url: cached.directUrl, br: Number(quality) * 1000 || 320000 };
    }

    const source = song.source || 'netease';

    const songInfo = {
      keyword: [song.name || song.title, song.artist].filter(Boolean).join(' '),
      duration: Number(song.duration) || 0
    };

    const url = await this._resolveWithValidation(songInfo, source);
    if (url) {
      return { url, br: Number(quality) * 1000 || 320000 };
    }
    return null;
  }

  async lyric(song) {
    // UNM doesn't provide lyric resolution, let next provider handle it
    return null;
  }

  async pic(song, size = 300) {
    // UNM doesn't provide cover resolution, let next provider handle it
    return null;
  }

  async proxy(types, params) {
    if (!loadUnmModules()) return null;

    if (types === 'url') {
      const id = params.id;
      if (!id) return null;

      const cachedSong = this.syntheticSongs.get(String(id));
      if (cachedSong?.directUrl) {
        return {
          ok: true,
          data: JSON.stringify({ url: cachedSong.directUrl, br: Number(params.br) * 1000 || 320000 }),
          contentType: 'application/json',
          providerName: this.name
        };
      }

      const songInfo = {
        keyword: [params.name, params.artist, cachedSong?.name, cachedSong?.artist].filter(Boolean).join(' '),
        duration: Number(params.duration) || 0
      };

      if (!songInfo.keyword.trim()) return null;

      try {
        const url = await this._resolveWithValidation(songInfo, params.source || 'netease');
        if (url) {
          return {
            ok: true,
            data: JSON.stringify({ url, br: Number(params.br) * 1000 || 320000 }),
            contentType: 'application/json',
            providerName: this.name
          };
        }
      } catch (error) {
        console.warn('[UnmProvider] proxy url failed:', errorMessage(error));
      }
      return null;
    }

    if (types === 'search') {
      const keyword = params.name || params.keyword;
      if (!keyword) return null;
      try {
        const results = await this.search(params.source, keyword, Number(params.count) || 30);
        if (!results.length) return null;
        return {
          ok: true,
          data: JSON.stringify(results),
          contentType: 'application/json',
          providerName: this.name
        };
      } catch {
        return null;
      }
    }

    // lyric and pic: UNM doesn't support these
    return null;
  }

  _filterSources(preferredSource) {
    if (preferredSource && this.sources.includes(preferredSource)) {
      return [preferredSource];
    }
    return this.sources;
  }

  async _resolveWithValidation(songInfo, requestedSource = 'netease') {
    for (const sourceName of this._sourcesForUrl(requestedSource)) {
      const mod = providerModules[sourceName];
      if (!mod) continue;

      try {
        const checkFn = mod.check;
        if (!checkFn) continue;

        const url = await withTimeout(checkFn(songInfo), this.timeout);
        if (!url || typeof url !== 'string' || !url.startsWith('http')) continue;

        const size = await headContentLength(url);
        if (size > 0 && size < MIN_SONG_SIZE_BYTES) {
          console.warn(`[UnmProvider] source "${sourceName}" returned suspicious file (${(size / 1024).toFixed(0)}KB), skipping`);
          continue;
        }

        console.log(`[UnmProvider] resolved via ${sourceName} (${size > 0 ? (size / 1024).toFixed(0) + 'KB' : 'size unknown'})`);
        return url;
      } catch {
        continue;
      }
    }
    return null;
  }

  _sourcesForUrl(requestedSource) {
    if (requestedSource === 'kuwo') {
      return this.sources.filter((source) => source !== 'kuwo');
    }
    if (requestedSource && this.sources.includes(requestedSource)) {
      return [requestedSource, ...this.sources.filter((source) => source !== requestedSource)];
    }
    return this.sources;
  }

  _syntheticId(sourceName, index) {
    return `${sourceName}_${Date.now()}_${index}`;
  }

  _buildSyntheticSong({ id, keyword, sourceName, directUrl }) {
    const [namePart, artistPart] = keyword.includes(' - ')
      ? keyword.split(' - ', 2)
      : keyword.split(/\s+/, 2);

    return {
      id,
      name: namePart || keyword,
      artist: artistPart || '',
      source: sourceName,
      directUrl
    };
  }
}

module.exports = { UnmProvider };
