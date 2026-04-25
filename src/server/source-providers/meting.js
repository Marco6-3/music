'use strict';

const { BaseProvider } = require('./base');

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

// Local multi-platform provider backed by @meting/core.
class MetingProvider extends BaseProvider {
  constructor(options = {}) {
    super('meting', options);
    this.defaultPlatform = options.defaultPlatform || 'netease';
    this.meting = null;
  }

  async _ensureMeting(platform) {
    if (!this.meting) {
      const MetingClass = await loadMeting();
      if (!MetingClass) return null;
      this.meting = new MetingClass(this.defaultPlatform);
      this.meting.format(true);
    }
    if (this.meting && platform) {
      this.meting.site(platform);
    }
    return this.meting;
  }

  async search(platform, keyword, count = 30) {
    const meting = await this._ensureMeting(platform);
    if (!meting) return [];
    const result = await meting.search(keyword, { limit: count });
    const data = JSON.parse(result);
    return Array.isArray(data) ? data : [];
  }

  async url(song, quality = '320') {
    const meting = await this._ensureMeting(song.source);
    if (!meting) return null;
    const result = await meting.url(song.id, Number(quality));
    const data = JSON.parse(result);
    return { url: data?.url, br: Number(quality) };
  }

  async lyric(song) {
    const meting = await this._ensureMeting(song.source);
    if (!meting) return null;
    const result = await meting.lyric(song.lyric_id || song.id);
    const data = JSON.parse(result);
    return { lyric: data?.lyric || data?.lrc?.lyric || '' };
  }

  async pic(song, size = 300) {
    const meting = await this._ensureMeting(song.source);
    if (!meting) return null;
    const result = await meting.pic(song.pic_id, size);
    const data = JSON.parse(result);
    return { url: data?.url };
  }

  async proxy(types, params) {
    const platform = params.source || this.defaultPlatform;
    const meting = await this._ensureMeting(platform);
    if (!meting) return null;

    try {
      if (types === 'search') {
        const list = await this.search(platform, params.name || params.keyword, Number(params.count) || 30);
        return { data: JSON.stringify(list), contentType: 'application/json' };
      }
      if (types === 'url') {
        const result = await meting.url(params.id, Number(params.br) || 320);
        const data = JSON.parse(result);
        return { data: JSON.stringify({ url: data?.url, br: Number(params.br) || 320 }), contentType: 'application/json' };
      }
      if (types === 'lyric') {
        const result = await meting.lyric(params.id);
        const data = JSON.parse(result);
        return { data: JSON.stringify({ lyric: data?.lyric || data?.lrc?.lyric || '' }), contentType: 'application/json' };
      }
      if (types === 'pic') {
        const result = await meting.pic(params.id, Number(params.size) || 300);
        const data = JSON.parse(result);
        return { data: JSON.stringify({ url: data?.url }), contentType: 'application/json' };
      }
    } catch (error) {
      console.warn(`[MetingProvider] proxy failed (${types}):`, error.message);
    }
    return null;
  }
}

module.exports = { MetingProvider };
