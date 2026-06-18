'use strict';

const axios = require('axios');
const { BaseProvider } = require('./base');

const MIGU_SEARCH_URL = 'https://m.music.cn.com/migu/remoting/scr_search_tag';
const MIGU_SONG_URL = 'https://app.c.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.4';
const MIGU_PIC_URL = 'https://music.migu.cn/v3/api/music/audioPlayer/songs';

// Quality tiers: try from highest to lowest
const QUALITY_TIERS = [
  { fmtType: 'ZQ24', br: 24, label: 'Hi-Res' },
  { fmtType: 'SQ', br: 999, label: 'FLAC' },
  { fmtType: 'HQ', br: 320, label: '320k' },
  { fmtType: 'PQ', br: 128, label: '128k' }
];

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

class MiguProvider extends BaseProvider {
  constructor(options = {}) {
    super('migu', options);
    this.timeout = options.timeout || 10000;
  }

  async search(platform, keyword, count = 30) {
    try {
      const response = await axios.get(MIGU_SEARCH_URL, {
        params: {
          keyword,
          type: 2,
          pgc: 1,
          rows: Math.min(count, 30),
          pageNo: 1
        },
        timeout: this.timeout,
        headers: { 'User-Agent': UA, Referer: 'https://m.music.cn.com/' }
      });

      const records = response.data?.musics || response.data?.songResultData?.result || [];
      return records.slice(0, count).map((item) => ({
        id: item.copyrightId || item.songId || item.id,
        name: item.songName || item.name || keyword,
        artist: (item.singers || item.singer || []).map((s) => s.singerName || s.name || s).join(', '),
        album: item.albumName || item.album || '',
        source: 'migu',
        pic_id: item.copyrightId || item.songId || item.id
      }));
    } catch (error) {
      console.warn('[MiguProvider] search failed:', error.message);
      return [];
    }
  }

  async url(song, quality = '320') {
    const songId = song.id;
    if (!songId) return null;

    const targetBr = Number(quality) || 320;
    const isLossless = targetBr >= 900;

    // Try quality tiers from highest to lowest (or start from 320k if not lossless)
    const tiers = isLossless
      ? QUALITY_TIERS
      : QUALITY_TIERS.filter((t) => t.br <= targetBr || t.br <= 320);

    for (const tier of tiers) {
      try {
        const result = await this._fetchSongUrl(songId, tier.fmtType);
        if (result?.url) {
          console.log(`[MiguProvider] resolved ${tier.label} (${tier.fmtType}) for ${songId}`);
          return { url: result.url, br: tier.br * 1000 };
        }
      } catch {
        // try next tier
      }
    }

    return null;
  }

  async lyric(song) {
    // Migu lyrics require a separate API; delegate to other providers
    return null;
  }

  async pic(song, size = 300) {
    const songId = song.pic_id || song.id;
    if (!songId) return null;

    try {
      const response = await axios.get(MIGU_PIC_URL, {
        params: { copyrightId: songId },
        timeout: this.timeout,
        headers: { 'User-Agent': UA, Referer: 'https://music.migu.cn/' }
      });

      const picUrl = response.data?.data?.[0]?.picL || response.data?.data?.[0]?.picM || response.data?.data?.[0]?.picS;
      if (picUrl) return { url: picUrl };
    } catch {
      // fall through
    }
    return null;
  }

  async proxy(types, params) {
    try {
      if (types === 'search') {
        const results = await this.search(params.source || 'migu', params.name || params.keyword, Number(params.count) || 30);
        if (!results.length) return null;
        return { data: JSON.stringify(results), contentType: 'application/json' };
      }
      if (types === 'url') {
        const result = await this.url({ id: params.id }, params.br || '320');
        if (!result) return null;
        return { data: JSON.stringify({ url: result.url, br: result.br }), contentType: 'application/json' };
      }
      if (types === 'pic') {
        const result = await this.pic({ id: params.id, pic_id: params.id }, Number(params.size) || 300);
        if (!result) return null;
        return { data: JSON.stringify({ url: result.url }), contentType: 'application/json' };
      }
    } catch (error) {
      console.warn(`[MiguProvider] proxy failed (${types}):`, error.message);
    }
    return null;
  }

  async _fetchSongUrl(songId, fmtType) {
    const response = await axios.get(MIGU_SONG_URL, {
      params: {
        copyrightId: songId,
        contentId: songId,
        resourceType: 'E',
        toneFlag: fmtType,
        netType: '01'
      },
      timeout: this.timeout,
      headers: {
        'User-Agent': UA,
        Referer: 'https://music.migu.cn/',
        channel: '0146951'
      },
      validateStatus: (status) => status >= 200 && status < 400
    });

    const data = response.data?.data || response.data;
    if (!data) return null;

    // Validate that returned format matches request
    const returnedFormat = data.fmtType || data.formatId || '';
    const url = data.url || data.newUrl || data.hqUrl || data.sqUrl;

    if (!url) return null;

    // Check if the returned format is what we requested (or better)
    if (returnedFormat && returnedFormat !== fmtType) {
      // Migu silently downgraded — check if it's still lossless when we asked for lossless
      if (fmtType === 'SQ' || fmtType === 'ZQ24') {
        const losslessFormats = ['SQ', 'ZQ24', 'FLAC', 'HIRES'];
        if (!losslessFormats.includes(returnedFormat.toUpperCase())) {
          console.log(`[MiguProvider] requested ${fmtType} but got ${returnedFormat}, trying next tier`);
          return null;
        }
      }
    }

    return { url, fmtType: returnedFormat };
  }
}

module.exports = { MiguProvider };
