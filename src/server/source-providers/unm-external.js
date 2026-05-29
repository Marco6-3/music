'use strict';

const axios = require('axios');
const { BaseProvider } = require('./base');
const { httpAgent } = require('./gdstudio');

class UnmExternalProvider extends BaseProvider {
  constructor(options = {}) {
    super('unm-external', options);
    this.baseUrl = (options.baseUrl || 'http://127.0.0.1:8080').replace(/\/+$/, '');
    this.timeout = options.timeout || 10_000;
  }

  async _get(endpoint, params = {}) {
    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        timeout: this.timeout,
        params,
        headers: { Accept: 'application/json' },
        httpAgent
      });
      return response.data;
    } catch {
      return null;
    }
  }

  async search(platform, keyword, count = 30) {
    const data = await this._get('/search', { source: platform, keyword, count });
    if (!data) return [];
    if (Array.isArray(data)) return data.slice(0, count);
    if (Array.isArray(data.songs)) return data.songs.slice(0, count);
    return [];
  }

  async url(song, quality = '320') {
    const keyword = [song.name, song.artist].filter(Boolean).join(' ');
    const data = await this._get('/song/url', {
      source: song.source || 'netease',
      id: song.id,
      name: keyword,
      br: quality
    });
    if (!data) return null;
    const url = typeof data === 'string' ? data : data.url;
    if (!url || !url.startsWith('http')) return null;
    return { url, br: Number(quality) * 1000 || 320000 };
  }

  async lyric(song) {
    const data = await this._get('/lyric', {
      source: song.source || 'netease',
      id: song.lyric_id || song.id
    });
    if (!data) return null;
    const lyric = typeof data === 'string' ? data : data.lyric || data.lrc;
    if (!lyric) return null;
    return { lyric: typeof lyric === 'string' ? lyric : lyric.lyric || '' };
  }

  async pic() {
    return null;
  }

  async proxy(types, params) {
    const source = params.source || 'netease';

    if (types === 'url') {
      const result = await this.url({
        id: params.id,
        name: params.name,
        artist: params.artist,
        source
      }, params.br);
      if (!result) return null;
      return {
        ok: true,
        data: JSON.stringify(result),
        contentType: 'application/json',
        providerName: this.name
      };
    }

    if (types === 'lyric') {
      const result = await this.lyric({ id: params.id, source });
      if (!result) return null;
      return {
        ok: true,
        data: JSON.stringify(result),
        contentType: 'application/json',
        providerName: this.name
      };
    }

    return null;
  }
}

module.exports = { UnmExternalProvider };
