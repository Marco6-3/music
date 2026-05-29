'use strict';

const axios = require('axios');
const { BaseProvider } = require('./base');
const { httpsAgent } = require('./gdstudio');

const LRCLIB_BASE = 'https://lrclib.net/api';

class LrclibProvider extends BaseProvider {
  constructor(options = {}) {
    super('lrclib', options);
    this.timeout = options.timeout || 8_000;
    this.userAgent = 'music/1.0';
    this.capabilities = {
      search: false,
      url: false,
      lyric: true,
      pic: false,
      proxy: true
    };
  }

  async lyric(song) {
    const trackName = song.name || song.song || song.title || '';
    const artistName = song.artist || song.singer || song.author || '';
    const albumName = song.album || song.album_name || '';

    if (!trackName || !artistName) {
      return null;
    }

    try {
      const response = await axios.get(`${LRCLIB_BASE}/get`, {
        timeout: this.timeout,
        params: {
          track_name: trackName,
          artist_name: artistName,
          album_name: albumName || undefined
        },
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json'
        },
        httpsAgent
      });

      const data = response.data;
      if (!data) return null;

      const lyric = data.syncedLyrics || data.plainLyrics || '';
      const tlyric = data.syncedLyrics && data.plainLyrics ? data.plainLyrics : '';

      if (!lyric) return null;

      return { lyric, tlyric };
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return null;
      }
      console.warn(`[LrclibProvider] lyric failed for "${trackName}" by "${artistName}":`, error.message);
      return null;
    }
  }

  async search() { return []; }
  async url() { return null; }
  async pic() { return null; }

  async proxy(types, params) {
    if (types !== 'lyric') return null;

    const song = {
      name: params.name || params.song || params.title || '',
      artist: params.artist || params.singer || '',
      album: params.album || ''
    };

    const result = await this.lyric(song);
    if (!result) return null;

    return {
      ok: true,
      data: JSON.stringify(result),
      contentType: 'application/json',
      providerName: this.name
    };
  }
}

module.exports = { LrclibProvider };
