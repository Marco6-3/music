'use strict';

const axios = require('axios');
const { BaseProvider } = require('./base');

// Gdstudio aggregate API provider.
class GdstudioProvider extends BaseProvider {
  constructor(options = {}) {
    super('gdstudio', options);
    this.baseUrl = options.baseUrl || 'https://music-api.gdstudio.xyz/api.php';
    this.timeout = options.timeout || 12_000;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  }

  async search(platform, keyword, count = 30) {
    const response = await axios.get(this.baseUrl, {
      timeout: this.timeout,
      params: { types: 'search', source: platform, name: keyword, count },
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://music.xcloudv.top/'
      }
    });
    return Array.isArray(response.data) ? response.data : response.data?.data || [];
  }

  async url(song, quality = '320') {
    const response = await axios.get(this.baseUrl, {
      timeout: this.timeout,
      params: { types: 'url', source: song.source || 'netease', id: song.id, br: quality },
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://music.xcloudv.top/'
      }
    });
    return response.data;
  }

  async lyric(song) {
    const response = await axios.get(this.baseUrl, {
      timeout: this.timeout,
      params: { types: 'lyric', source: song.source || 'netease', id: song.lyric_id || song.id },
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://music.xcloudv.top/'
      }
    });
    return response.data;
  }

  async pic(song, size = 300) {
    const response = await axios.get(this.baseUrl, {
      timeout: this.timeout,
      params: { types: 'pic', source: song.source || 'netease', id: song.pic_id, size },
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://music.xcloudv.top/'
      }
    });
    return response.data;
  }

  async proxy(types, params) {
    const response = await axios.get(this.baseUrl, {
      timeout: this.timeout,
      params: { types, ...params },
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://music.xcloudv.top/'
      },
      responseType: 'text',
      transformResponse: [(data) => data]
    });
    return { ok: true, data: response.data, contentType: response.headers['content-type'] };
  }
}

module.exports = { GdstudioProvider };
