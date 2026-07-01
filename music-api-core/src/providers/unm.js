'use strict';

const { validateAudioUrl, withTimeout } = require('../http');

let providerModules;
let unmSelect;

function tryRequire(id) {
  try {
    return require(id);
  } catch {
    return null;
  }
}

function loadUnmModules() {
  if (providerModules) return true;
  try {
    if (!process.env.ENABLE_FLAC) process.env.ENABLE_FLAC = 'true';

    providerModules = {
      kuwo: tryRequire('@unblockneteasemusic/server/src/provider/kuwo'),
      kugou: tryRequire('@unblockneteasemusic/server/src/provider/kugou'),
      migu: tryRequire('@unblockneteasemusic/server/src/provider/migu'),
      bilibili: tryRequire('@unblockneteasemusic/server/src/provider/bilibili'),
      bodian: tryRequire('@unblockneteasemusic/server/src/provider/bodian'),
    };

    try {
      const selectPath = require.resolve('@unblockneteasemusic/server/src/provider/select');
      unmSelect = require(selectPath);
      if (!unmSelect.ENABLE_FLAC) unmSelect.ENABLE_FLAC = true;
    } catch {
      // Some package versions do not expose provider/select.
    }

    return Object.values(providerModules).some(Boolean);
  } catch (error) {
    console.warn('[UnmProvider] failed to load UNM modules:', error.message);
    return false;
  }
}

class UnmProvider {
  constructor(options = {}) {
    this.name = 'unm';
    this.sources = options.sources || ['kuwo', 'kugou', 'bodian', 'bilibili'];
    this.timeout = options.timeout || 10000;
    this.syntheticSongs = new Map();
  }

  supportsSearch(platform) {
    return this.sources.includes(platform);
  }

  async search(platform, keyword, count = 30) {
    if (!loadUnmModules()) return [];

    const results = [];
    for (const sourceName of this._filterSources(platform)) {
      const mod = providerModules[sourceName];
      const checkFn = mod?.check || mod?.search;
      if (!checkFn) continue;

      try {
        const result = await withTimeout(
          Promise.resolve(checkFn({ keyword, duration: 0 })),
          this.timeout,
          'UNM search timeout'
        );
        const song = this._normalizeSearchResult(result, sourceName, keyword, results.length);
        if (!song) continue;
        this.syntheticSongs.set(song.id, song);
        results.push(song);
        if (results.length >= count) break;
      } catch {
        // Try next UNM source.
      }
    }

    return results;
  }

  async url(song, quality = '320') {
    if (!loadUnmModules() || !song) return null;

    const cached = this.syntheticSongs.get(String(song.id));
    if (cached?.directUrl) {
      return {
        url: cached.directUrl,
        br: normalizeQuality(quality),
        source: `unm-${cached.source}`,
      };
    }

    const keyword = buildKeyword(song);
    if (!keyword) return null;

    const isLossless = normalizeQuality(quality) >= 900;
    let bestLossy = null;

    for (const sourceName of this._sourcesForUrl(song.source)) {
      const mod = providerModules[sourceName];
      const checkFn = mod?.check || mod?.search;
      if (!checkFn) continue;

      try {
        const url = await withTimeout(
          Promise.resolve(checkFn({ keyword, duration: Number(song.duration) || 0 })),
          this.timeout,
          'UNM url timeout'
        );
        if (!url || typeof url !== 'string' || !url.startsWith('http')) continue;

        const validation = await validateAudioUrl(url, {
          duration: song.duration,
          br: quality,
          quality,
        });
        if (!validation.valid) continue;

        const result = {
          url,
          br: normalizeQuality(quality),
          source: `unm-${sourceName}`,
          verified_audio: true,
          codec: validation.codec,
          lossless: validation.lossless,
          size: validation.size,
        };

        if (!isLossless || validation.lossless) return result;
        if (!bestLossy || (result.size || 0) > (bestLossy.size || 0)) bestLossy = result;
      } catch {
        // Try next UNM source.
      }
    }

    return bestLossy;
  }

  async lyric() {
    return null;
  }

  async pic() {
    return null;
  }

  _filterSources(platform) {
    if (platform && this.sources.includes(platform)) return [platform];
    return this.sources;
  }

  _sourcesForUrl(source) {
    const normalized = String(source || '').split('-via-')[0];
    if (normalized && this.sources.includes(normalized)) {
      return [normalized, ...this.sources.filter((item) => item !== normalized)];
    }
    return this.sources;
  }

  _normalizeSearchResult(result, sourceName, keyword, index) {
    if (!result) return null;

    if (typeof result === 'string' && result.startsWith('http')) {
      const id = `${sourceName}_${Date.now()}_${index}`;
      return {
        id,
        name: keyword,
        title: keyword,
        artist: '',
        source: sourceName,
        directUrl: result,
      };
    }

    if (result && typeof result === 'object' && result.id) {
      const artists = result.artists ? [].concat(result.artists).map((artist) => artist.name || artist).filter(Boolean) : [];
      return {
        id: String(result.id),
        name: result.name || keyword,
        title: result.name || keyword,
        artist: artists.join(', '),
        album: result.album?.name || '',
        source: sourceName,
      };
    }

    return null;
  }
}

function normalizeQuality(quality) {
  if (String(quality).toLowerCase() === 'flac') return 999;
  const n = Number(quality);
  return Number.isFinite(n) && n > 0 ? n : 320;
}

function buildKeyword(song) {
  const title = song.name || song.title || '';
  const artist = Array.isArray(song.artist) ? song.artist.join(' ') : (song.artist || '');
  return [title, artist].filter(Boolean).join(' ').trim();
}

module.exports = { UnmProvider };
