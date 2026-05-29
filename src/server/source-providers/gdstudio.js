'use strict';

const http = require('node:http');
const https = require('node:https');
const axios = require('axios');
const { BaseProvider } = require('./base');

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 5 * 60 * 1000;
const HEALTH_MAX_ENTRIES = 100;

// Shared HTTP agents with keep-alive to avoid TCP handshake per request
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });

// Gdstudio aggregate API provider with per-source health tracking.
class GdstudioProvider extends BaseProvider {
  constructor(options = {}) {
    super('gdstudio', options);
    this.baseUrl = options.baseUrl || 'https://music-api.gdstudio.xyz/api.php';
    this.timeout = options.timeout || 12_000;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    this.sourceHealth = {};
  }

  _healthKey(source, types) {
    return `${source || 'netease'}:${types || 'unknown'}`;
  }

  _evictOldHealthEntries() {
    const keys = Object.keys(this.sourceHealth);
    if (keys.length <= HEALTH_MAX_ENTRIES) return;
    // Remove entries that are healthy (not in cooldown) starting from oldest
    const now = Date.now();
    for (const key of keys) {
      if (Object.keys(this.sourceHealth).length <= HEALTH_MAX_ENTRIES) break;
      if (now > this.sourceHealth[key].unhealthyUntil) {
        delete this.sourceHealth[key];
      }
    }
  }

  _getHealth(source, types) {
    const key = this._healthKey(source, types);
    if (!this.sourceHealth[key]) {
      this._evictOldHealthEntries();
      this.sourceHealth[key] = { failures: 0, unhealthyUntil: 0 };
    }
    return this.sourceHealth[key];
  }

  isSourceHealthy(source, types) {
    const health = this._getHealth(source, types);
    return Date.now() > health.unhealthyUntil;
  }

  recordFailure(source, types) {
    const health = this._getHealth(source, types);
    health.failures += 1;
    if (health.failures >= FAILURE_THRESHOLD) {
      health.unhealthyUntil = Date.now() + COOLDOWN_MS;
      console.warn(`[GdstudioProvider] source "${source}" ${types} marked unhealthy for ${COOLDOWN_MS / 60000}min (${health.failures} failures)`);
    }
  }

  recordSuccess(source, types) {
    const health = this._getHealth(source, types);
    health.failures = 0;
    health.unhealthyUntil = 0;
  }

  async search(platform, keyword, count = 30) {
    const response = await axios.get(this.baseUrl, {
      timeout: this.timeout,
      params: { types: 'search', source: platform, name: keyword, count },
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://music.xcloudv.top/'
      },
      httpAgent,
      httpsAgent
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
      },
      httpAgent,
      httpsAgent
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
      },
      httpAgent,
      httpsAgent
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
      },
      httpAgent,
      httpsAgent
    });
    return response.data;
  }

  async proxy(types, params) {
    const source = params.source || 'netease';

    if (!this.isSourceHealthy(source, types)) {
      return null;
    }

    try {
      const response = await axios.get(this.baseUrl, {
        timeout: this.timeout,
        params: { types, ...params },
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json, text/plain, */*',
          Referer: 'https://music.xcloudv.top/'
        },
        responseType: 'text',
        transformResponse: [(data) => data],
        httpAgent,
        httpsAgent
      });

      const body = response.data;
      const isEmpty = this._isEmptyResult(types, body);

      if (isEmpty) {
        this.recordFailure(source, types);
        return null;
      }

      this.recordSuccess(source, types);
      return { ok: true, data: body, contentType: response.headers['content-type'], providerName: this.name };
    } catch (error) {
      this.recordFailure(source, types);
      console.warn(`[GdstudioProvider] proxy failed (${types}, source=${source}):`, error.message);
      return null;
    }
  }

  _isEmptyResult(types, body) {
    if (!body || typeof body !== 'string') return true;
    const trimmed = body.trim();
    if (!trimmed) return true;

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.length === 0;
      if (types === 'url') return !parsed.url;
      if (types === 'lyric') return !parsed.lyric && !parsed.tlyric;
      if (types === 'pic') return !parsed.url;
      if (types === 'search' && parsed.data) return Array.isArray(parsed.data) && parsed.data.length === 0;
      return false;
    } catch {
      return false;
    }
  }
}

module.exports = { GdstudioProvider, httpAgent, httpsAgent };
