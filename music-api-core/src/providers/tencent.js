'use strict';

const { createClient, validateAudioUrl } = require('../http');
const { qqSign, qqMd5 } = require('../crypto');

/**
 * Tencent/QQ Music Provider
 * Uses QQ Music's web API with sign-based authentication.
 * Supports: search, url (via cross-platform resolution), lyric, pic
 *
 * Note: QQ Music's playback API requires VIP for most songs.
 * For playback, we cross-resolve via Kuwo (free MP3) as a reliable fallback.
 * With a valid cookie (qqmusic_key), the API can return direct URLs.
 */
class TencentProvider {
  constructor(options = {}) {
    this.name = 'tencent';
    this.timeout = options.timeout || 10000;
    this.cookie = options.cookie || '';
    this.client = createClient({
      timeout: this.timeout,
      headers: {
        'Referer': 'https://y.qq.com/',
        'Origin': 'https://y.qq.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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
   * Search songs on QQ Music.
   */
  async search(keyword, count = 30) {
    try {
      const data = {
        w: keyword,
        p: 1,
        n: count,
        cr: 1,
        format: 'json',
        ct: 24,
        qqmusic_ver: 1298,
        remoteplace: 'txt.yqq.song',
        searchid: Date.now(),
        t: 0,
        aggr: 1,
        catZhida: 1,
        lossless: 0,
        flag_qc: 0,
        g_tk: 5381,
        loginUin: 0,
        hostUin: 0,
        inCharset: 'utf8',
        outCharset: 'utf-8',
        notice: 0,
        platform: 'yqq.json',
        needNewCode: 0,
      };

      const response = await this.client.get('https://c.y.qq.com/soso/fcgi-bin/client_search_cp', {
        params: data,
      });

      const songs = response.data?.data?.song?.list || [];
      return songs.map((song) => ({
        id: song.songmid || song.mid || '',
        name: song.songname || song.name || '',
        artist: (song.singer || []).map((s) => s.name).join(', '),
        album: song.albumname || song.album?.name || '',
        source: 'tencent',
        duration: (song.interval || 0) * 1000,
        pic_id: song.albummid || song.album?.mid || '',
        _mediaMid: song.media_mid || song.mid || '',
      }));
    } catch (error) {
      console.warn('[TencentProvider] search failed:', error.message);
      return [];
    }
  }

  /**
   * Get playback URL. Cross-resolves via Kuwo for free MP3.
   * @param {object} song - Song object with name, artist, id
   * @param {string} quality - '128' | '320' | 'flac'
   */
  async url(song, quality = '320') {
    // Strategy 1: Try direct QQ Music API (requires cookie/VIP)
    if (this.cookie) {
      try {
        const direct = await this._directUrl(song, quality);
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
          source: 'tencent-via-kuwo',
          verified_audio: true,
          codec: validation.codec,
          lossless: validation.lossless,
          size: validation.size,
        };
      }
    } catch (error) {
      console.warn('[TencentProvider] cross-resolve failed:', error.message);
    }
    return null;
  }

  /**
   * Get lyrics from QQ Music.
   * @param {string|object} songOrId - Song ID string or song object
   */
  async lyric(songOrId) {
    const song = typeof songOrId === 'string' ? { id: songOrId } : songOrId;
    const songmid = song?.id || song?.mid || song?.songmid;
    if (!songmid) return null;

    try {
      // Try the JSON API first
      const response = await this.client.get('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg', {
        params: {
          songmid,
          format: 'json',
          g_tk: 5381,
        },
        headers: {
          Referer: 'https://y.qq.com/',
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
      });

      if (response.data?.lyric) {
        const lyric = Buffer.from(response.data.lyric, 'base64').toString('utf8');
        const tlyric = response.data.trans
          ? Buffer.from(response.data.trans, 'base64').toString('utf8')
          : '';
        return { lyric, tlyric };
      }
    } catch (error) {
      console.warn('[TencentProvider] lyric failed:', error.message);
    }
    return null;
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
      url: `https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${picId}.jpg`,
    };
  }

  // ---- internal ----

  async _directUrl(song, quality) {
    const songmid = song.id || song.mid || song.songmid;
    if (!songmid) return null;

    // Quality mapping for QQ Music
    const qualityMap = {
      '128': { filename: `M500${songmid}${songmid}.mp3`, prefix: 'M500', type: 128 },
      '320': { filename: `M800${songmid}${songmid}.mp3`, prefix: 'M800', type: 320 },
      'flac': { filename: `F000${songmid}${songmid}.flac`, prefix: 'F000', type: 999 },
    };
    const q = qualityMap[String(quality)] || qualityMap['320'];

    try {
      // Use the vkey/getUrl method
      const guid = qqMd5(String(Math.random())).substring(0, 10);
      const response = await this.client.get('https://u.y.qq.com/cgi-bin/musicu.fcg', {
        params: {
          format: 'json',
          data: JSON.stringify({
            req_0: {
              module: 'vkey.GetVkeyServer',
              method: 'CgiGetVkey',
              param: {
                guid,
                songmid: [songmid],
                filename: [q.filename],
                songtype: [0],
                uin: '0',
                loginflag: 0,
                platform: '20',
              },
            },
          }),
        },
        headers: {
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
      });

      const midurlinfo = response.data?.req_0?.data?.midurlinfo?.[0];
      const purl = midurlinfo?.purl;

      if (purl) {
        const sip = response.data?.req_0?.data?.sip || [];
        const baseUrl = sip[0] || '';
        return {
          url: baseUrl + purl,
          br: q.type * 1000,
          format: q.type >= 999 ? 'flac' : 'mp3',
          source: 'tencent',
        };
      }
    } catch {
      // ignore
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
}

module.exports = { TencentProvider };
