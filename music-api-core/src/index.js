'use strict';

const { KuwoProvider } = require('./providers/kuwo');
const { KugouProvider } = require('./providers/kugou');
const { MiguProvider } = require('./providers/migu');
const { NeteaseProvider } = require('./providers/netease');
const { TencentProvider } = require('./providers/tencent');
const { GdstudioProvider } = require('./providers/gdstudio');
const { MetingProvider } = require('./providers/meting');
const { UnmProvider } = require('./providers/unm');
const { validateAudioUrl } = require('./http');

// ============================================================
// Unified Music API
// ============================================================

/**
 * MusicAPI - Unified interface for multiple music platforms.
 *
 * Supported platforms: netease, tencent, kuwo, kugou, migu
 * Supported operations: search, url, lyric, pic
 *
 * Uses a fallback strategy: tries providers in order, validates playback
 * URLs, and returns the first complete audio result.
 */
class MusicAPI {
  /**
   * @param {object} options
   * @param {object} options.netease - { cookie: string }
   * @param {object} options.tencent - { cookie: string }
 * @param {object} options.kuwo - { timeout: number }
 * @param {object} options.kugou - { timeout: number }
 * @param {object} options.migu - { timeout: number }
 * @param {object} options.gdstudio - { baseUrl: string, timeout: number }
 * @param {object} options.meting - { cookies: object, supportedPlatforms: string[] }
 * @param {object} options.unm - { sources: string[], timeout: number }
 * @param {string} options.strategy - 'fallback' (default) or 'race'
   */
  constructor(options = {}) {
    this.strategy = options.strategy || 'fallback';
    this.defaultPlatforms = options.platforms || ['netease', 'tencent', 'kugou', 'kuwo', 'migu'];
    this.providers = {};

    // Initialize providers
    if (options.kuwo !== false) {
      this.providers.kuwo = new KuwoProvider(options.kuwo || {});
    }
    if (options.kugou !== false) {
      this.providers.kugou = new KugouProvider(options.kugou || {});
    }
    if (options.migu !== false) {
      this.providers.migu = new MiguProvider(options.migu || {});
    }
    if (options.netease !== false) {
      this.providers.netease = new NeteaseProvider(options.netease || {});
    }
    if (options.tencent !== false) {
      this.providers.tencent = new TencentProvider(options.tencent || {});
    }
    if (options.gdstudio !== false) {
      this.providers.gdstudio = new GdstudioProvider(options.gdstudio || {});
    }
    if (options.meting !== false) {
      this.providers.meting = new MetingProvider(options.meting || {});
    }
    if (options.unm !== false) {
      this.providers.unm = new UnmProvider(options.unm || {});
    }

    // Provider priority for fallback (most reliable first)
    this._priority = ['gdstudio', 'meting', 'unm', 'kuwo', 'kugou', 'migu', 'netease', 'tencent']
      .filter((name) => this.providers[name]);
  }

  /**
   * Search songs across platforms.
   * @param {string} platform - 'netease' | 'tencent' | 'kuwo' | 'kugou' | 'migu'
   * @param {string} keyword - Search keyword
   * @param {number} count - Max results (default 30)
   * @returns {Promise<Array>} Array of song objects
   */
  async search(platform, keyword, count = 30) {
    const providers = this._searchProviders(platform);
    if (providers.length === 0) {
      console.warn(`[MusicAPI] unknown platform: ${platform}`);
      return [];
    }

    const results = [];
    for (const { provider, name } of providers) {
      try {
        const list = await this._providerSearch(provider, name, platform, keyword, count);
        for (const song of list || []) {
          const normalized = this._normalizeSong(song, platform);
          if (normalized.id && normalized.name && !hasSong(results, normalized)) {
            results.push(normalized);
          }
          if (results.length >= count) return results;
        }
      } catch (error) {
        console.warn(`[MusicAPI] search failed on ${name}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Search every enabled platform and merge results.
   */
  async searchAll(keyword, count = 30, platforms = this.defaultPlatforms, perPlatformCount = 8) {
    const settled = await Promise.allSettled(
      platforms.map(async (platform) => ({
        platform,
        songs: await this.search(platform, keyword, perPlatformCount),
      }))
    );

    const merged = [];
    for (const item of settled) {
      if (item.status !== 'fulfilled') continue;
      for (const song of item.value.songs) {
        if (!hasSong(merged, song)) merged.push(song);
      }
    }
    return rankSongs(merged, keyword).slice(0, count);
  }

  /**
   * Get playback URL for a song.
   * Uses fallback strategy across all providers.
   * @param {object} song - Song object { id, name, artist, source }
   * @param {string} quality - '128' | '320' | 'flac'
   * @returns {Promise<object|null>} { url, br, format, source }
   */
  async url(song, quality = '320') {
    if (this.strategy === 'race') {
      return this._raceUrl(song, quality);
    }
    return this._fallbackUrl(song, quality);
  }

  /**
   * Search and resolve a playable URL from a keyword in one call.
   */
  async resolve(keyword, options = {}) {
    const quality = options.quality || '320';
    const platforms = options.platforms || this.defaultPlatforms;
    const searchCount = options.searchCount || 8;
    const candidates = await this.searchAll(keyword, searchCount * platforms.length, platforms, searchCount);
    const attempts = [];

    for (const song of rankSongs(candidates, keyword)) {
      const diagnosis = await this.diagnoseUrl(song, quality);
      attempts.push({ song, attempts: diagnosis.attempts });
      if (diagnosis.result) {
        return options.diagnostics
          ? { song, url: diagnosis.result, attempts }
          : { song, url: diagnosis.result };
      }
    }

    return options.diagnostics ? { song: null, url: null, attempts } : null;
  }

  /**
   * Resolve URL and return provider-by-provider diagnostics.
   */
  async diagnoseUrl(song, quality = '320') {
    return this._resolveUrlWithDiagnostics(song, quality, { race: false });
  }

  /**
   * Get lyrics for a song.
   * @param {string} platform - 'netease' | 'tencent' | 'kuwo' | 'kugou'
   * @param {object} song - Song object
   * @returns {Promise<object|null>} { lyric, tlyric? }
   */
  async lyric(platform, song) {
    // Try the native platform first, then fallback to others
    const nativeProvider = this._getProvider(platform);
    if (nativeProvider?.lyric) {
      try {
        const result = await nativeProvider.lyric(song);
        if (result?.lyric) return result;
      } catch {
        // fallback
      }
    }

    // Fallback: try other providers
    for (const name of this._priority) {
      if (name === platform) continue;
      const provider = this.providers[name];
      if (!provider?.lyric) continue;
      try {
        const result = await provider.lyric(song);
        if (result?.lyric) return result;
      } catch {
        // try next
      }
    }
    return null;
  }

  /**
   * Get album art URL.
   * @param {string} platform - 'netease' | 'tencent' | 'kuwo' | 'kugou' | 'migu'
   * @param {object} song - Song object
   * @returns {Promise<object|null>} { url }
   */
  async pic(platform, song) {
    const provider = this._getProvider(platform);
    if (!provider?.pic) return null;

    try {
      return await provider.pic(song);
    } catch {
      return null;
    }
  }

  /**
   * Verify that a playback URL actually returns valid audio.
   * @param {string} url - Audio URL to verify
   * @returns {Promise<object>} { codec, lossless, valid }
   */
  async verifyUrl(url) {
    try {
      return await validateAudioUrl(url);
    } catch (error) {
      return { codec: '', lossless: false, valid: false, reason: error.message };
    }
  }

  /**
   * List available platforms.
   */
  platforms() {
    return Object.keys(this.providers);
  }

  // ---- internal ----

  _getProvider(platform) {
    return this.providers[platform] || null;
  }

  _searchProviders(platform) {
    const ordered = [];
    const nativeProvider = this._getProvider(platform);
    if (nativeProvider) ordered.push({ name: platform, provider: nativeProvider });

    for (const name of this._priority) {
      if (name === platform) continue;
      const provider = this.providers[name];
      if (!provider?.search) continue;
      if (typeof provider.supportsSearch === 'function' && !provider.supportsSearch(platform)) continue;
      if (!nativeProvider && !provider.supportsSearch) continue;
      ordered.push({ name, provider });
    }

    return ordered;
  }

  async _providerSearch(provider, name, platform, keyword, count) {
    if (typeof provider.supportsSearch === 'function' || name === 'gdstudio' || name === 'meting' || name === 'unm') {
      return provider.search(platform, keyword, count);
    }
    return provider.search(keyword, count);
  }

  async _fallbackUrl(song, quality) {
    const { result } = await this._resolveUrlWithDiagnostics(song, quality, { race: false });
    return result;
  }

  async _raceUrl(song, quality) {
    const nativeSource = song.source || '';
    const order = [
      nativeSource,
      ...this._priority.filter((name) => name !== nativeSource),
    ].filter((name) => this.providers[name]);

    // Fire all providers in parallel
    const promises = order.map(async (name) => {
      const provider = this.providers[name];
      try {
        const result = await provider.url(song, quality);
        if (result?.url) return { ...result, _provider: name };
      } catch {
        // ignore
      }
      return null;
    });

    const results = await Promise.allSettled(promises);
    const candidates = results
      .filter((r) => r.status === 'fulfilled' && r.value?.url)
      .map((r) => r.value);

    for (const candidate of candidates) {
      const providerName = candidate._provider || candidate.source || 'unknown';
      const validation = await this._validateUrlResult(providerName, candidate, song, quality);
      if (!validation.valid) continue;

      return {
        ...candidate,
        verified_audio: true,
        codec: validation.codec,
        lossless: validation.lossless,
        size: validation.size || candidate.size,
      };
    }

    return null;
  }

  async _validateUrlResult(providerName, result, song, quality) {
    const validation = await validateAudioUrl(result.url, {
      duration: song?.duration,
      br: result.br,
      quality,
    });
    if (!validation.valid) {
      console.warn(`[MusicAPI] ${providerName} returned invalid audio: ${validation.reason}`);
    }
    return validation;
  }

  async _resolveUrlWithDiagnostics(song, quality, { race = false } = {}) {
    const order = this._urlProviderOrder(song);
    const attempts = [];

    const tryProvider = async (name) => {
      const provider = this.providers[name];
      const startedAt = Date.now();
      try {
        const raw = await provider.url(song, quality);
        if (!raw?.url) {
          return { provider: name, ok: false, reason: 'empty result', ms: Date.now() - startedAt };
        }
        const validation = await this._validateUrlResult(name, raw, song, quality);
        if (!validation.valid) {
          return { provider: name, ok: false, reason: validation.reason, validation, ms: Date.now() - startedAt };
        }
        const result = {
          ...raw,
          provider: name,
          verified_audio: true,
          codec: validation.codec,
          lossless: validation.lossless,
          size: validation.size || raw.size,
        };
        return { provider: name, ok: true, result, validation, ms: Date.now() - startedAt };
      } catch (error) {
        return { provider: name, ok: false, reason: error.message, ms: Date.now() - startedAt };
      }
    };

    if (race) {
      const settled = await Promise.allSettled(order.map((name) => tryProvider(name)));
      for (const item of settled) {
        if (item.status !== 'fulfilled') continue;
        attempts.push(item.value);
      }
      const winner = attempts.find((item) => item.ok);
      return { result: winner?.result || null, attempts };
    }

    for (const name of order) {
      const attempt = await tryProvider(name);
      attempts.push(attempt);
      if (attempt.ok) {
        console.log(`[MusicAPI] url resolved via ${name} (${(attempt.result.size / 1024).toFixed(0)}KB, ${attempt.result.codec})`);
        return { result: attempt.result, attempts };
      }
    }
    return { result: null, attempts };
  }

  _urlProviderOrder(song) {
    const nativeSource = String(song?.source || '').split('-via-')[0];
    return [
      nativeSource,
      ...this._priority.filter((name) => name !== nativeSource),
    ].filter((name, index, all) => name && this.providers[name]?.url && all.indexOf(name) === index);
  }
}

// ============================================================
// Standalone convenience functions
// ============================================================

/**
 * Quick search: create a temporary API instance and search.
 */
async function search(platform, keyword, count = 30) {
  const api = new MusicAPI();
  return api.search(platform, keyword, count);
}

/**
 * Quick URL: create a temporary API instance and resolve URL.
 */
async function url(song, quality = '320') {
  const api = new MusicAPI();
  return api.url(song, quality);
}

async function resolve(keyword, options = {}) {
  const api = new MusicAPI();
  return api.resolve(keyword, options);
}

function hasSong(list, song) {
  return list.some((item) => {
    if (item.source === song.source && String(item.id) === String(song.id)) return true;
    return normalizeCompare(item.name) === normalizeCompare(song.name)
      && normalizeCompare(item.artist) === normalizeCompare(song.artist)
      && item.source === song.source;
  });
}

function rankSongs(songs, keyword) {
  const normalizedKeyword = normalizeCompare(keyword);
  return [...songs].sort((a, b) => scoreSong(b, normalizedKeyword) - scoreSong(a, normalizedKeyword));
}

function scoreSong(song, normalizedKeyword) {
  const title = normalizeCompare(song.name || song.title || '');
  const artist = normalizeCompare(Array.isArray(song.artist) ? song.artist.join(' ') : song.artist || '');
  let score = 0;
  if (title && normalizedKeyword.includes(title)) score += 5;
  if (artist && normalizedKeyword.includes(artist)) score += 5;
  if (title && title === normalizedKeyword) score += 2;
  if (title && artist && normalizedKeyword.includes(title) && normalizedKeyword.includes(artist)) score += 5;
  if (artist && !normalizedKeyword.includes(artist) && normalizedKeyword.length > title.length) score -= 4;
  if (/[（(].+?[）)]/.test(String(song.name || song.title || ''))) score -= 1;
  if (song.duration) score += 1;
  return score;
}

function normalizeCompare(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function normalizeArtist(artist) {
  return Array.isArray(artist) ? artist.join(', ') : (artist || '');
}

function normalizeSongFields(song, platform) {
  return {
    ...song,
    id: String(song.id || song.url_id || ''),
    name: song.name || song.title || '',
    title: song.title || song.name || '',
    artist: normalizeArtist(song.artist),
    source: song.source || platform,
  };
}

MusicAPI.prototype._normalizeSong = normalizeSongFields;

module.exports = {
  MusicAPI,
  search,
  url,
  resolve,
  // Export providers for direct use
  KuwoProvider,
  KugouProvider,
  MiguProvider,
  NeteaseProvider,
  TencentProvider,
  GdstudioProvider,
  MetingProvider,
  UnmProvider,
};
