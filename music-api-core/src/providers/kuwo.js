'use strict';

const { createClient, validateAudioUrl } = require('../http');
const { kuwoEncrypt } = require('../crypto');

/**
 * Kuwo Music Provider
 * Uses free public endpoints for search, playback, and lyrics.
 * Supports: search, url (MP3/FLAC), lyric, pic
 */
class KuwoProvider {
  constructor(options = {}) {
    this.name = 'kuwo';
    this.timeout = options.timeout || 10000;
    this.client = createClient({
      timeout: this.timeout,
      headers: {
        'Referer': 'https://www.kuwo.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
  }

  /**
   * Search songs on Kuwo.
   */
  async search(keyword, count = 30) {
    try {
      const response = await this.client.get('https://search.kuwo.cn/r.s', {
        params: {
          all: keyword,
          ft: 'music',
          rn: count,
          pn: 0,
          vipver: 'MUSIC_9.1.1.2_BCS2',
          newsearch: 1,
          alflac: 1,
          encoding: 'utf8',
        },
      });

      const body = typeof response.data === 'string' ? response.data : '';
      return this._parseSearchResult(body).slice(0, count);
    } catch (error) {
      console.warn('[KuwoProvider] search failed:', error.message);
      return [];
    }
  }

  /**
   * Get playback URL for a Kuwo song.
   * @param {string} rid - Kuwo song ID
   * @param {string} quality - '128' | '320' | 'flac'
   */
  async url(songOrId, quality = '320') {
    const target = await this._resolveTarget(songOrId);
    if (!target?.rid) return null;

    const formatMap = {
      '128': { format: 'mp3', br: '128k' },
      '320': { format: 'mp3', br: '320k' },
      'flac': { format: 'flac', br: '2000k' },
    };
    const q = formatMap[String(quality)] || formatMap['320'];

    // Try requested format first, then fallback to MP3 320k
    const attempts = [q];
    if (q.format === 'flac') attempts.push(formatMap['320']);

    for (const attempt of attempts) {
      try {
        const result = await this._fetchUrl(target.rid, attempt.format, attempt.br, target);
        if (result) {
          return target.source ? { ...result, source: target.source } : result;
        }
      } catch {
        // try next
      }
    }
    return null;
  }

  /**
   * Get lyrics for a Kuwo song.
   * @param {string|object} songOrId - Song ID string or song object with .id
   */
  async lyric(songOrId) {
    const rid = typeof songOrId === 'string' ? songOrId : (songOrId?.id || songOrId?.rid || '');
    if (!rid) return null;
    try {
      const response = await this.client.get('https://m.kuwo.cn/newh5/singles/songinfoandlrc', {
        params: { musicId: rid },
      });

      const data = response.data;
      if (!data?.status || !data?.data?.lrclist) return null;

      const lrc = data.data.lrclist
        .filter((line) => line.lineLyric)
        .map((line) => {
          const time = Number(line.time || 0);
          const min = Math.floor(time / 60);
          const sec = (time % 60).toFixed(2).padStart(5, '0');
          return `[${min}:${sec}]${line.lineLyric}`;
        })
        .join('\n');

      return { lyric: lrc };
    } catch (error) {
      console.warn('[KuwoProvider] lyric failed:', error.message);
      return null;
    }
  }

  /**
   * Get album art URL for a Kuwo song.
   * @param {string|object} songOrId - Song ID string or song object
   */
  async pic(songOrId) {
    const rid = typeof songOrId === 'string' ? songOrId : (songOrId?.id || songOrId?.pic_id || '');
    if (!rid) return null;
    try {
      // Try the web API for song info which includes pic
      const response = await this.client.get('https://www.kuwo.cn/api/www/music/musicInfo', {
        params: { mid: rid, httpsStatus: 1 },
        headers: { Referer: 'https://www.kuwo.cn/', csrf: '' },
      });
      const pic = response.data?.data?.pic;
      if (pic) return { url: pic };

      // Fallback: try mobile API
      const mobileResp = await this.client.get('https://m.kuwo.cn/newh5/singles/songinfoandlrc', {
        params: { musicId: rid },
      });
      const mobilePic = mobileResp.data?.data?.songinfo?.pic;
      if (mobilePic) return { url: mobilePic };
    } catch {
      // ignore
    }
    return null;
  }

  // ---- internal ----

  async _fetchUrl(rid, format, br, context = {}) {
    try {
      const response = await this.client.get('https://antiserver.kuwo.cn/anti.s', {
        params: {
          type: 'convert_url3',
          rid,
          format,
          br,
          response: 'url',
        },
        maxRedirects: 0,
        validateStatus: (status) => status < 400,
      });

      const data = response.data;
      const url = typeof data === 'string' ? data.trim() : data?.url || data?.data?.url || '';

      if (url && url.startsWith('http')) {
        const validation = await validateAudioUrl(url, {
          duration: context.duration,
          br,
        });
        if (!validation.valid) return null;

        return {
          url,
          br: parseInt(br) || 320,
          format,
          source: 'kuwo',
          verified_audio: true,
          codec: validation.codec,
          lossless: validation.lossless,
          size: validation.size,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async _resolveTarget(songOrId) {
    if (typeof songOrId === 'string' || typeof songOrId === 'number') {
      const rid = String(songOrId).replace('MUSIC_', '').replace(/\D/g, '');
      return rid ? { rid } : null;
    }

    if (!songOrId || typeof songOrId !== 'object') return null;

    if (!songOrId.source || songOrId.source === 'kuwo') {
      const rid = String(songOrId.url_id || songOrId.id || songOrId.rid || '')
        .replace('MUSIC_', '')
        .replace(/\D/g, '');
      return rid ? { rid, duration: songOrId.duration } : null;
    }

    const keyword = [songOrId.name || songOrId.title, songOrId.artist]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (!keyword) return null;

    const candidates = await this.search(keyword, 5);
    const match = candidates.find((candidate) => this._matches(songOrId, candidate));
    if (!match?.id) return null;

    return {
      rid: match.id,
      duration: match.duration || songOrId.duration,
      source: `${songOrId.source}-via-kuwo`,
    };
  }

  _matches(original, candidate) {
    const originalTitle = normalizeText(original.name || original.title || '');
    const candidateTitle = normalizeText(candidate.name || candidate.title || '');
    if (!originalTitle || !candidateTitle) return false;

    const titleMatches = originalTitle === candidateTitle
      || originalTitle.includes(candidateTitle)
      || candidateTitle.includes(originalTitle);
    if (!titleMatches) return false;

    const originalArtist = normalizeText(Array.isArray(original.artist) ? original.artist.join('') : original.artist || '');
    const candidateArtist = normalizeText(Array.isArray(candidate.artist) ? candidate.artist.join('') : candidate.artist || '');
    if (!originalArtist || !candidateArtist) return true;

    return originalArtist.includes(candidateArtist) || candidateArtist.includes(originalArtist);
  }

  _parseSearchResult(body) {
    const songs = [];
    let current = {};

    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;

      const key = trimmed.substring(0, eqIdx);
      const val = trimmed.substring(eqIdx + 1);

      if (key === 'SONGNAME' && current.SONGNAME !== undefined) {
        if (current.MUSICRID) songs.push(this._buildSong(current));
        current = {};
      }
      current[key] = val;
    }
    if (current.SONGNAME !== undefined && current.MUSICRID) {
      songs.push(this._buildSong(current));
    }

    return songs.filter((s) => s.id && s.name);
  }

  _buildSong(item) {
    const rid = (item.MUSICRID || '').replace('MUSIC_', '').replace(/\D/g, '');
    const name = this._decodeEntities(item.SONGNAME || '');
    return {
      id: rid,
      name,
      artist: this._decodeEntities(item.ARTIST || ''),
      album: this._decodeEntities(item.ALBUM || ''),
      source: 'kuwo',
      duration: Number(item.DURATION || 0) * 1000,
    };
  }

  _decodeEntities(str) {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
  }
}

function normalizeText(value) {
  return String(value)
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

module.exports = { KuwoProvider };
