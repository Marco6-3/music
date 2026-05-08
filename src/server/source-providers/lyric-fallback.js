'use strict';

const { BaseProvider } = require('./base');

class LyricFallbackProvider extends BaseProvider {
  constructor(primary, fallback, options = {}) {
    super('lyric-fallback', options);
    this.primary = primary;
    this.fallback = fallback;
  }

  async search(platform, keyword, count = 30) {
    return this.primary.search(platform, keyword, count);
  }

  async url(song, quality = '320') {
    return this.primary.url(song, quality);
  }

  async lyric(song) {
    const result = await this.primary.lyric(song);
    if (result && (result.lyric || result.tlyric)) return result;
    try {
      return await this.fallback.lyric(song);
    } catch {
      return result;
    }
  }

  async pic(song, size = 300) {
    const result = await this.primary.pic(song, size);
    if (result && result.url) return result;
    try {
      return await this.fallback.pic(song, size);
    } catch {
      return result;
    }
  }

  async proxy(types, params) {
    const result = await this.primary.proxy(types, params);
    if (result) return result;

    if (types === 'lyric' || types === 'pic') {
      try {
        return await this.fallback.proxy(types, params);
      } catch {
        return null;
      }
    }
    return null;
  }
}

module.exports = { LyricFallbackProvider };
