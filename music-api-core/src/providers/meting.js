'use strict';

let Meting;
let metingImportPromise;

async function loadMeting() {
  if (Meting) return Meting;
  if (!metingImportPromise) {
    metingImportPromise = import('@meting/core')
      .then((module) => {
        Meting = module.default || module;
        return Meting;
      })
      .catch((error) => {
        console.warn('[MetingProvider] @meting/core load failed:', error.message);
        return null;
      });
  }
  return metingImportPromise;
}

class MetingProvider {
  constructor(options = {}) {
    this.name = 'meting';
    this.defaultPlatform = options.defaultPlatform || 'netease';
    this.supportedPlatforms = options.supportedPlatforms || ['netease', 'tencent', 'kugou', 'kuwo', 'baidu'];
    this.cookies = Object.fromEntries(
      Object.entries(options.cookies || {}).filter(([, value]) => value && String(value).trim())
    );
    this.metingByPlatform = new Map();
  }

  supportsSearch(platform) {
    return this.supportedPlatforms.includes(platform || this.defaultPlatform);
  }

  async _ensureMeting(platform) {
    const site = this.supportedPlatforms.includes(platform) ? platform : this.defaultPlatform;
    let meting = this.metingByPlatform.get(site);
    if (!meting) {
      const MetingClass = await loadMeting();
      if (!MetingClass) return null;
      meting = new MetingClass(site);
      meting.format(true);
      const cookie = this.cookies[site];
      if (cookie && typeof meting.cookie === 'function') {
        meting.cookie(cookie);
      }
      this.metingByPlatform.set(site, meting);
    }
    return meting;
  }

  async search(platform, keyword, count = 30) {
    if (!this.supportsSearch(platform)) return [];
    const meting = await this._ensureMeting(platform);
    if (!meting) return [];

    try {
      const result = await meting.search(keyword, { limit: count });
      const data = parseMetingJson(result, 'search');
      if (!Array.isArray(data)) return [];
      return data.slice(0, count).map((song) => normalizeSong(song, platform));
    } catch (error) {
      console.warn(`[MetingProvider] search failed (${platform}):`, error.message);
      return [];
    }
  }

  async url(song, quality = '320') {
    const platform = this._platform(song?.source);
    if (!platform) return null;
    const meting = await this._ensureMeting(platform);
    if (!meting) return null;

    try {
      const result = await meting.url(song.url_id || song.id, normalizeQuality(quality));
      const data = parseMetingJson(result, 'url');
      if (!data?.url) return null;
      return {
        url: data.url,
        br: Number(data.br || normalizeQuality(quality)),
        format: data.type || data.format,
        source: `meting-${platform}`,
      };
    } catch (error) {
      console.warn(`[MetingProvider] url failed (${platform}):`, error.message);
      return null;
    }
  }

  async lyric(song) {
    const platform = this._platform(song?.source);
    if (!platform) return null;
    const meting = await this._ensureMeting(platform);
    if (!meting) return null;

    try {
      const result = await meting.lyric(song.lyric_id || song.id);
      const data = parseMetingJson(result, 'lyric');
      const lyric = data?.lyric || data?.lrc?.lyric || '';
      const tlyric = data?.tlyric || data?.tlyric?.lyric || '';
      return lyric || tlyric ? { lyric, tlyric } : null;
    } catch {
      return null;
    }
  }

  async pic(song, size = 300) {
    const platform = this._platform(song?.source);
    if (!platform) return null;
    const meting = await this._ensureMeting(platform);
    if (!meting) return null;

    try {
      const result = await meting.pic(song.pic_id || song.id, size);
      const data = parseMetingJson(result, 'pic');
      return data?.url ? { url: data.url } : null;
    } catch {
      return null;
    }
  }

  _platform(source) {
    if (!source) return this.defaultPlatform;
    const platform = String(source).replace(/^meting-/, '').split('-via-')[0];
    return this.supportedPlatforms.includes(platform) ? platform : null;
  }
}

function normalizeQuality(quality) {
  if (String(quality).toLowerCase() === 'flac') return 999;
  const n = Number(quality);
  return Number.isFinite(n) && n > 0 ? n : 320;
}

function normalizeSong(song, platform) {
  const artist = Array.isArray(song.artist) ? song.artist.join(', ') : (song.artist || song.author || '');
  return {
    ...song,
    id: String(song.url_id || song.id || ''),
    name: song.name || song.title || '',
    title: song.title || song.name || '',
    artist,
    album: song.album || '',
    source: song.source || platform,
    url_id: song.url_id || song.id,
    lyric_id: song.lyric_id || song.id,
    pic_id: song.pic_id || song.pic || song.id,
    duration: Number(song.duration || song.interval || 0),
  };
}

function parseMetingJson(value, label) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (error) {
    console.warn(`[MetingProvider] invalid JSON (${label}):`, error.message);
    return null;
  }
}

module.exports = { MetingProvider };
