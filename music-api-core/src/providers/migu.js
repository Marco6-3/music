'use strict';

const { createClient } = require('../http');

/**
 * Migu Music Provider
 * Uses Migu's mobile API endpoints which provide free lossless audio.
 * Supports: search, url (up to Hi-Res 24bit), pic
 */
class MiguProvider {
  constructor(options = {}) {
    this.name = 'migu';
    this.timeout = options.timeout || 10000;
    // Migu's mobile API requires a mobile User-Agent
    this.client = createClient({
      timeout: this.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Referer': 'https://music.migu.cn/',
        'channel': '0146951',
      },
    });
  }

  // Quality tiers from highest to lowest
  static QUALITY_TIERS = [
    { fmtType: 'ZQ24', br: 999, label: 'Hi-Res' },
    { fmtType: 'SQ', br: 999, label: 'FLAC' },
    { fmtType: 'HQ', br: 320, label: '320k' },
    { fmtType: 'PQ', br: 128, label: '128k' },
  ];

  /**
   * Search songs on Migu.
   * Tries multiple endpoints for reliability.
   */
  async search(keyword, count = 30) {
    // Try the newer search endpoint first
    try {
      const response = await this.client.get('https://pd.musicapp.migu.cn/MIGUM3.0/v1.0/content/search_all.do', {
        params: {
          ua: 'Android_migu',
          version: '5.0.1',
          text: keyword,
          pageNo: 1,
          pageSize: Math.min(count, 30),
          searchSwitch: JSON.stringify({ song: 1, album: 0, singer: 0, tagSong: 0, mvSong: 0, songlist: 0, bestShow: 0 }),
        },
        timeout: this.timeout,
      });

      const records = response.data?.songResultData?.result || [];
      if (records.length > 0) {
        return records.slice(0, count).map((item) => ({
          id: item.copyrightId || item.songId || item.id,
          name: item.name || item.songName || keyword,
          artist: (item.singers || []).map((s) => s.name || s).join(', '),
          album: item.albums?.[0]?.name || item.albumName || '',
          source: 'migu',
          pic_id: item.copyrightId || item.songId || item.id,
        }));
      }
    } catch {
      // fall through to legacy endpoint
    }

    // Fallback: legacy search endpoint
    try {
      const response = await this.client.get('https://m.music.cn.com/migu/remoting/scr_search_tag', {
        params: {
          keyword,
          type: 2,
          pgc: 1,
          rows: Math.min(count, 30),
          pageNo: 1,
        },
      });

      const records = response.data?.musics || response.data?.songResultData?.result || [];
      return records.slice(0, count).map((item) => ({
        id: item.copyrightId || item.songId || item.id,
        name: item.songName || item.name || keyword,
        artist: (item.singers || item.singer || []).map((s) => s.singerName || s.name || s).join(', '),
        album: item.albumName || item.album || '',
        source: 'migu',
        pic_id: item.copyrightId || item.songId || item.id,
      }));
    } catch (error) {
      console.warn('[MiguProvider] search failed:', error.message);
      return [];
    }
  }

  /**
   * Get playback URL. Tries quality tiers from highest to lowest.
   * @param {string} songId - Migu copyrightId
   * @param {string} quality - '128' | '320' | 'flac'
   */
  async url(songOrId, quality = '320') {
    const songId = this._songId(songOrId);
    if (!songId) return null;

    const targetBr = Number(quality) || 320;
    const isLossless = targetBr >= 900 || String(quality).toLowerCase() === 'flac';

    // Filter tiers based on requested quality
    const tiers = isLossless
      ? MiguProvider.QUALITY_TIERS
      : MiguProvider.QUALITY_TIERS.filter((t) => t.br <= targetBr && t.br < 900);

    for (const tier of tiers) {
      try {
        const result = await this._fetchSongUrl(songId, tier.fmtType);
        if (result?.url) {
          console.log(`[MiguProvider] resolved ${tier.label} (${tier.fmtType}) for ${songId}`);
          return { url: result.url, br: tier.br, format: tier.label, source: 'migu' };
        }
      } catch {
        // try next tier
      }
    }
    return null;
  }

  /**
   * Get album art URL.
   */
  async pic(songOrId) {
    const songId = this._songId(songOrId, true);
    if (!songId) return null;

    try {
      const response = await this.client.get('https://music.migu.cn/v3/api/music/audioPlayer/songs', {
        params: { copyrightId: songId },
      });

      const picUrl = response.data?.data?.[0]?.picL || response.data?.data?.[0]?.picM || response.data?.data?.[0]?.picS;
      if (picUrl) return { url: picUrl };
    } catch {
      // ignore
    }
    return null;
  }

  // ---- internal ----

  _songId(songOrId, preferPic = false) {
    if (typeof songOrId === 'string' || typeof songOrId === 'number') return String(songOrId);
    if (!songOrId || typeof songOrId !== 'object') return '';
    return String(
      (preferPic ? songOrId.pic_id : '') ||
      songOrId.url_id ||
      songOrId.copyrightId ||
      songOrId.id ||
      songOrId.songId ||
      ''
    );
  }

  async _fetchSongUrl(songId, fmtType) {
    const endpoints = [
      'https://app.c.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.4',
      'https://app.c.nf.migu.cn/MIGUM2.0/v2.0/content/listen-url',
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await this.client.get(endpoint, {
          params: {
            copyrightId: songId,
            contentId: songId,
            resourceType: 'E',
            toneFlag: fmtType,
            netType: '01',
          },
          validateStatus: (status) => status >= 200 && status < 400,
        });

        const data = response.data?.data || response.data;
        if (!data) continue;

        const returnedFormat = data.fmtType || data.formatId || '';
        const url = data.url || data.newUrl || data.hqUrl || data.sqUrl;

        if (!url) continue;

        // Check if returned format matches request (Migu silently downgrades)
        if (returnedFormat && returnedFormat !== fmtType) {
          if (fmtType === 'SQ' || fmtType === 'ZQ24') {
            const losslessFormats = ['SQ', 'ZQ24', 'FLAC', 'HIRES'];
            if (!losslessFormats.includes(returnedFormat.toUpperCase())) {
              console.log(`[MiguProvider] requested ${fmtType} but got ${returnedFormat}, trying next`);
              continue;
            }
          }
        }

        return { url, fmtType: returnedFormat };
      } catch {
        // try next endpoint
      }
    }
    return null;
  }
}

module.exports = { MiguProvider };
