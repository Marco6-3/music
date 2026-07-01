'use strict';

const { createClient, validateAudioUrl } = require('../http');

/**
 * Gdstudio aggregate provider.
 *
 * The direct Kuwo antiserver endpoint currently returns a tiny fixed MP3 for
 * many IDs, so this provider is used as the full-audio fallback. It keeps the
 * module usable while direct providers remain useful for search and metadata.
 */
class GdstudioProvider {
  constructor(options = {}) {
    this.name = 'gdstudio';
    this.timeout = options.timeout || 12000;
    this.baseUrl = options.baseUrl || 'https://music-api.gdstudio.xyz/api.php';
    this.client = createClient({
      timeout: this.timeout,
      headers: {
        'Referer': 'https://music.xcloudv.top/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    this.searchSources = options.searchSources || ['netease'];
  }

  supportsSearch(platform) {
    return this._mapSource(platform) !== null;
  }

  async search(platform, keyword, count = 30) {
    const source = this._mapSource(platform);
    if (!source) return [];

    try {
      const response = await this.client.get(this.baseUrl, {
        params: { types: 'search', source, name: keyword, count },
      });
      const list = Array.isArray(response.data) ? response.data : response.data?.data || [];
      return list.map((song) => this._normalizeSong(song, source)).filter((song) => song.id && song.name);
    } catch (error) {
      console.warn(`[GdstudioProvider] search failed (${platform}):`, error.message);
      return [];
    }
  }

  async url(song, quality = '320') {
    if (!song) return null;

    const direct = await this._directUrl(song, quality);
    if (direct?.url) return direct;

    const keyword = this._keyword(song);
    if (!keyword) return null;

    for (const source of this.searchSources) {
      const candidates = await this.search(source, keyword, 5);
      for (const candidate of candidates) {
        if (!this._matches(song, candidate)) continue;
        const result = await this._directUrl(candidate, quality);
        if (result?.url) {
          return {
            ...result,
            source: `${song.source || 'unknown'}-via-gdstudio-${candidate.source || source}`,
            matched: {
              id: candidate.id,
              name: candidate.name,
              artist: candidate.artist,
              source: candidate.source || source,
            },
          };
        }
      }
    }

    return null;
  }

  async lyric(song) {
    const source = this._mapSource(song?.source);
    const id = song?.lyric_id || song?.id;
    if (!source || !id) return null;

    try {
      const response = await this.client.get(this.baseUrl, {
        params: { types: 'lyric', source, id },
      });
      if (response.data?.lyric || response.data?.tlyric) return response.data;
    } catch {
      // fall through to cross-resolve
    }
    return null;
  }

  async pic(song, size = 300) {
    const source = this._mapSource(song?.source);
    const id = song?.pic_id || song?.id;
    if (!source || !id) return null;

    try {
      const response = await this.client.get(this.baseUrl, {
        params: { types: 'pic', source, id, size },
      });
      if (response.data?.url) return response.data;
    } catch {
      // ignore
    }
    return null;
  }

  async _directUrl(song, quality) {
    const source = this._mapSource(song?.source);
    const id = song?.url_id || song?.id;
    if (!source || !id) return null;

    try {
      const response = await this.client.get(this.baseUrl, {
        params: { types: 'url', source, id, br: quality },
      });
      const result = response.data;
      if (!result?.url) return null;

      const validation = await validateAudioUrl(result.url, {
        duration: song.duration,
        br: result.br || quality,
        quality,
      });
      if (!validation.valid) return null;

      return {
        ...result,
        source: `gdstudio-${source}`,
        verified_audio: true,
        codec: validation.codec,
        lossless: validation.lossless,
        size: validation.size || result.size,
      };
    } catch (error) {
      console.warn(`[GdstudioProvider] url failed (${source}):`, error.message);
      return null;
    }
  }

  _mapSource(source) {
    if (source === 'netease' || source === 'kuwo') return source;
    return null;
  }

  _normalizeSong(song, source) {
    const artist = Array.isArray(song.artist) ? song.artist.join(', ') : (song.artist || '');
    return {
      ...song,
      id: String(song.url_id || song.id || ''),
      name: song.name || song.title || '',
      title: song.title || song.name || '',
      artist,
      source: song.source || source,
      duration: Number(song.duration || 0),
    };
  }

  _keyword(song) {
    const title = song.name || song.title || '';
    const artist = Array.isArray(song.artist) ? song.artist.join(' ') : (song.artist || '');
    return [title, artist].filter(Boolean).join(' ').trim();
  }

  _matches(original, candidate) {
    const titleMatches = titlesCompatible(original.name || original.title || '', candidate.name || candidate.title || '');
    if (!titleMatches) return false;

    return artistsCompatible(original.artist, candidate.artist);
  }
}

function normalizeText(value) {
  return normalizeComparable(value, true);
}

function normalizeComparable(value, stripQualifiers) {
  let text = String(value).toLowerCase();
  if (stripQualifiers) text = text.replace(/[（(].*?[）)]/g, '');
  return text
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function hasQualifier(value) {
  return /[（(].+?[）)]/.test(String(value));
}

function titlesCompatible(original, candidate) {
  const originalRaw = normalizeComparable(original, false);
  const candidateRaw = normalizeComparable(candidate, false);
  if (!originalRaw || !candidateRaw) return false;
  if (originalRaw === candidateRaw) return true;

  if (hasQualifier(original) || hasQualifier(candidate)) return false;

  const originalBase = normalizeComparable(original, true);
  const candidateBase = normalizeComparable(candidate, true);
  return originalBase === candidateBase
    || originalBase.includes(candidateBase)
    || candidateBase.includes(originalBase);
}

function hasSharedToken(a, b) {
  const tokens = [a, b].sort((x, y) => x.length - y.length);
  return tokens[0].length >= 2 && tokens[1].includes(tokens[0]);
}

function artistTokens(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[,，、/&;；]+/);
  return raw
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function artistsCompatible(original, candidate) {
  const originalTokens = artistTokens(original);
  const candidateTokens = artistTokens(candidate);
  if (originalTokens.length === 0 || candidateTokens.length === 0) return true;

  const overlaps = (a, b) => a === b || a.includes(b) || b.includes(a) || hasSharedToken(a, b);
  const everyOriginalFound = originalTokens.every((ot) => candidateTokens.some((ct) => overlaps(ot, ct)));
  const noUnexpectedCandidate = candidateTokens.every((ct) => originalTokens.some((ot) => overlaps(ot, ct)));

  return everyOriginalFound && noUnexpectedCandidate;
}

module.exports = { GdstudioProvider };
