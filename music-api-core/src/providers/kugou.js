'use strict';

const { createClient, validateAudioUrl } = require('../http');

/**
 * Kugou Music Provider
 * Search uses Kugou's catalog, playback cross-resolves via Kuwo (free MP3).
 * Lyrics use Kugou's own lyric API.
 */
class KugouProvider {
  constructor(options = {}) {
    this.name = 'kugou';
    this.timeout = options.timeout || 10000;
    this.client = createClient({
      timeout: this.timeout,
      headers: {
        'Referer': 'https://www.kugou.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    // Kuwo client for cross-platform URL resolution
    this._kuwoClient = createClient({
      timeout: this.timeout,
      headers: {
        'Referer': 'https://www.kuwo.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
  }

  /**
   * Search songs on Kugou.
   */
  async search(keyword, count = 30) {
    try {
      const response = await this.client.get('https://songsearch.kugou.com/song_search_v2', {
        params: {
          keyword,
          page: 1,
          pagesize: count,
          platform: 'WebFilter',
        },
      });

      const list = response.data?.data?.lists || [];
      return list
        .filter((item) => item.FileHash || item.Hash)
        .map((item) => {
          const id = item.FileHash || item.Hash;
          const name = (item.SongName || '').replace(/<\/?em>/g, '');
          return {
            id,
            name,
            artist: (item.SingerName || '').replace(/<\/?em>/g, ''),
            album: item.AlbumName || '',
            source: 'kugou',
            duration: (Number(item.Duration || 0)) * 1000,
            _hash: item.Hash || item.FileHash,
            _sqHash: item.SQHash || '',
            _hqHash: item.HQHash || '',
            _albumId: item.AlbumID || '',
          };
        })
        .filter((s) => s.id && s.name);
    } catch (error) {
      console.warn('[KugouProvider] search failed:', error.message);
      return [];
    }
  }

  /**
   * Get playback URL. Cross-resolves via Kuwo since Kugou requires VIP.
   * @param {object} song - Song object from search
   * @param {string} quality - '128' | '320' | 'flac'
   */
  async url(song, quality = '320') {
    const title = song.name || song.title || '';
    const artist = song.artist || '';
    if (!title) return null;

    const keyword = artist ? `${artist} ${title}` : title;

    try {
      // Search on Kuwo using the same keyword
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

      // Get playback URL from Kuwo antiserver
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
          source: 'kugou-via-kuwo',
          verified_audio: true,
          codec: validation.codec,
          lossless: validation.lossless,
          size: validation.size,
        };
      }
      return null;
    } catch (error) {
      console.warn('[KugouProvider] url failed:', error.message);
      return null;
    }
  }

  /**
   * Get lyrics from Kugou.
   */
  async lyric(song) {
    const hash = song._hash || song.id;
    if (!hash) return null;

    try {
      // Get lyrics ID from song detail
      const detailResp = await this.client.get('https://wwwapi.kugou.com/play/songinfo', {
        params: { srcappid: 2919, clientver: 20000, hash },
      });

      const lyricsId = detailResp.data?.data?.lyrics_id || detailResp.data?.data?.lyric;
      if (!lyricsId) return null;

      // Search for lyrics candidates
      const lrcResp = await this.client.get('https://lyrics.kugou.com/search', {
        params: {
          ver: 1,
          man: 'yes',
          client: 'mobi',
          hash,
          timelength: song.duration || 0,
        },
      });

      const candidates = lrcResp.data?.candidates || [];
      if (candidates.length === 0) return null;

      // Download the best match
      const best = candidates[0];
      const lrcContent = await this.client.get('https://lyrics.kugou.com/download', {
        params: {
          ver: 1,
          client: 'pc',
          id: best.id,
          accesskey: best.accesskey,
          fmt: 'lrc',
          charset: 'utf8',
        },
      });

      const content = lrcContent.data?.content || '';
      if (content) {
        const decoded = Buffer.from(content, 'base64').toString('utf8');
        return { lyric: decoded };
      }
      return null;
    } catch (error) {
      console.warn('[KugouProvider] lyric failed:', error.message);
      return null;
    }
  }

  /**
   * Get album art URL.
   */
  async pic(song) {
    const albumId = song._albumId || song.albumId;
    if (!albumId) return null;

    try {
      const response = await this.client.get(`https://imge.kugou.com/v2/album_portrait/${albumId}.jpg`, {
        params: { size: 300 },
        maxRedirects: 5,
        validateStatus: (status) => status < 400,
      });

      if (response.status === 200) {
        return { url: response.config.url };
      }
    } catch {
      // ignore
    }
    return null;
  }

  // ---- internal ----

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

module.exports = { KugouProvider };
