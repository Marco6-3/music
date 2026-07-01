'use strict';

const { createClient, validateAudioUrl } = require('../http');
const { neteaseEncrypt } = require('../crypto');

/**
 * NetEase Cloud Music Provider
 * Uses the weapi protocol to access NetEase's API.
 * Supports: search, url (via cross-platform resolution), lyric, pic
 *
 * Note: NetEase's own playback API requires VIP for most songs.
 * For playback, we cross-resolve via Kuwo (free MP3) as a reliable fallback.
 * With a valid cookie, the NetEase API can return direct URLs.
 */
class NeteaseProvider {
  constructor(options = {}) {
    this.name = 'netease';
    this.timeout = options.timeout || 10000;
    this.cookie = options.cookie || '';
    this.client = createClient({
      timeout: this.timeout,
      headers: {
        'Referer': 'https://music.163.com/',
        'Origin': 'https://music.163.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    // Kuwo client for cross-platform playback
    this._kuwoClient = createClient({
      timeout: this.timeout,
      headers: {
        'Referer': 'https://www.kuwo.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
  }

  /**
   * Search songs on NetEase Cloud Music.
   */
  async search(keyword, count = 30) {
    try {
      const data = neteaseEncrypt({
        s: keyword,
        type: 1, // 1=song, 10=album, 100=artist, 1000=playlist
        limit: count,
        offset: 0,
      });

      const response = await this.client.post(
        'https://music.163.com/weapi/search/get',
        new URLSearchParams({ params: data.params, encSecKey: data.encSecKey }).toString(),
      );

      const songs = response.data?.result?.songs || [];
      return songs.map((song) => ({
        id: String(song.id),
        name: song.name,
        artist: (song.artists || []).map((a) => a.name).join(', '),
        album: song.album?.name || '',
        source: 'netease',
        duration: song.duration || 0,
        pic_id: song.album?.id || song.id,
      }));
    } catch (error) {
      console.warn('[NeteaseProvider] search failed:', error.message);
      return [];
    }
  }

  /**
   * Get playback URL. Cross-resolves via Kuwo for free MP3.
   * @param {object} song - Song object with name, artist, id
   * @param {string} quality - '128' | '320' | 'flac'
   */
  async url(song, quality = '320') {
    // Strategy 1: Try direct NetEase API (requires cookie/VIP)
    if (this.cookie) {
      try {
        const direct = await this._directUrl(song.id, quality);
        if (direct?.url) return direct;
      } catch {
        // fall through to cross-resolve
      }
    }

    // Strategy 2: Cross-resolve via Kuwo (free, reliable)
    const title = song.name || song.title || '';
    const artist = song.artist || '';
    if (!title) return null;

    const keyword = artist ? `${artist} ${title}` : title;

    try {
      const response = await this._kuwoClient.get('https://search.kuwo.cn/r.s', {
        params: {
          all: keyword,
          ft: 'music',
          rn: 3,
          pn: 0,
          vipver: 'MUSIC_9.1.1.2_BCS2',
          newsearch: 1,
          alflac: 1,
          encoding: 'utf8',
        },
      });

      const body = typeof response.data === 'string' ? response.data : '';
      const rid = this._extractKuwoRid(body);
      if (!rid) return null;

      const format = String(quality) === 'flac' ? 'flac' : 'mp3';
      const br = String(quality) === 'flac' ? '2000k' : '320k';

      const urlResp = await this._kuwoClient.get('https://antiserver.kuwo.cn/anti.s', {
        params: { type: 'convert_url3', rid, format, br, response: 'url' },
        maxRedirects: 0,
        validateStatus: (status) => status < 400,
      });

      const data = urlResp.data;
      const url = typeof data === 'string' ? data.trim() : data?.url || data?.data?.url || '';

      if (url && url.startsWith('http')) {
        const validation = await validateAudioUrl(url, {
          duration: song.duration,
          br: quality,
        });
        if (!validation.valid) return null;

        return {
          url,
          br: parseInt(quality) || 320,
          format,
          source: 'netease-via-kuwo',
          verified_audio: true,
          codec: validation.codec,
          lossless: validation.lossless,
          size: validation.size,
        };
      }
    } catch (error) {
      console.warn('[NeteaseProvider] cross-resolve failed:', error.message);
    }
    return null;
  }

  /**
   * Get lyrics from NetEase.
   * @param {string|object} songOrId - Song ID string or song object with .id
   */
  async lyric(songOrId) {
    const songId = typeof songOrId === 'string' ? songOrId : (songOrId?.id || '');
    if (!songId) return null;
    try {
      const data = neteaseEncrypt({
        id: String(songId),
        lv: -1,
        tv: -1,
      });

      const response = await this.client.post(
        'https://music.163.com/weapi/song/lyric',
        new URLSearchParams({ params: data.params, encSecKey: data.encSecKey }).toString(),
      );

      const lrc = response.data?.lrc?.lyric || '';
      const tlyric = response.data?.tlyric?.lyric || '';

      if (lrc) {
        return { lyric: lrc, tlyric };
      }
      return null;
    } catch (error) {
      console.warn('[NeteaseProvider] lyric failed:', error.message);
      return null;
    }
  }

  /**
   * Get album art URL.
   * @param {string|object} songOrId - Song ID string, pic_id, or song object
   */
  async pic(songOrId, size = 300) {
    const picId = typeof songOrId === 'string'
      ? songOrId
      : (songOrId?.pic_id || songOrId?.albumId || songOrId?.id || '');
    if (!picId) return null;
    return {
      url: `https://p1.music.126.net/${this._encryptedPicId(picId)}/${picId}.jpg?param=${size}y${size}`,
    };
  }

  // ---- internal ----

  async _directUrl(songId, quality) {
    const brMap = { '128': 128000, '320': 320000, 'flac': 999000 };
    const br = brMap[String(quality)] || 320000;

    const data = neteaseEncrypt({
      ids: [String(songId)],
      br,
      encodeType: 'flac',
    });

    const response = await this.client.post(
      'https://music.163.com/weapi/song/enhance/player/url',
      new URLSearchParams({ params: data.params, encSecKey: data.encSecKey }).toString(),
      { headers: this.cookie ? { Cookie: this.cookie } : {} },
    );

    const songData = response.data?.data?.[0];
    if (songData?.url) {
      return {
        url: songData.url,
        br: songData.br || br,
        format: songData.type || 'mp3',
        source: 'netease',
      };
    }
    return null;
  }

  _extractKuwoRid(body) {
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('MUSICRID=')) {
        const rid = trimmed.replace('MUSICRID=MUSIC_', '').replace(/\D/g, '');
        if (rid) return rid;
      }
    }
    return null;
  }

  _encryptedPicId(picId) {
    // NetEase uses a hash-based CDN path for album art
    const crypto = require('node:crypto');
    const md5 = crypto.createHash('md5').update(String(picId)).digest('hex');
    return md5;
  }
}

module.exports = { NeteaseProvider };
