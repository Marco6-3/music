'use strict';

const axios = require('axios');

const AUDIO_PROBE_BYTES = 4096;
const AUDIO_PROBE_TIMEOUT_MS = 6000;

/**
 * Probe the first few bytes of an audio URL to detect actual codec/format.
 * Returns { codec, contentType, lossless, verified, probe_status }.
 */
async function probeAudioUrl(url) {
  try {
    const response = await axios.get(url, {
      timeout: AUDIO_PROBE_TIMEOUT_MS,
      responseType: 'arraybuffer',
      maxContentLength: AUDIO_PROBE_BYTES * 4,
      headers: {
        Range: `bytes=0-${AUDIO_PROBE_BYTES - 1}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'audio/*,*/*'
      },
      validateStatus: (status) => status >= 200 && status < 400,
      transformResponse: [(data) => data]
    });
    const finalUrl = response.request?.res?.responseUrl || url;
    const bytes = Buffer.from(response.data || []);
    return {
      ...audioMetadataFromBytes(bytes, response.headers['content-type'], finalUrl),
      verified: bytes.length > 0,
      probe_status: response.status
    };
  } catch (error) {
    const inferred = audioMetadataFromContentTypeAndPath('', url);
    return {
      ...inferred,
      verified: false,
      probe_error: error.message || 'audio probe failed'
    };
  }
}

/**
 * Detect audio format from raw bytes using magic byte signatures.
 */
function audioMetadataFromBytes(bytes, contentType = '', url = '') {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (buffer.length >= 4) {
    const magic = buffer.toString('ascii', 0, 4);
    if (magic === 'fLaC') return { codec: 'flac', contentType: 'audio/x-flac', lossless: true };
    if (magic.startsWith('ID3') || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
      return { codec: 'mp3', contentType: 'audio/mpeg', lossless: false };
    }
    if (magic.startsWith('OggS')) return { codec: 'ogg', contentType: 'audio/ogg', lossless: false };
    if (magic.startsWith('RIFF') && buffer.length >= 12 && buffer.toString('ascii', 8, 12) === 'WAVE') {
      return { codec: 'wav', contentType: 'audio/wav', lossless: true };
    }
    if (buffer.length >= 8 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
      const ascii = buffer.toString('ascii').toLowerCase();
      if (ascii.includes('alac')) return { codec: 'alac', contentType: 'audio/mp4', lossless: true };
      return { codec: 'm4a', contentType: 'audio/mp4', lossless: false };
    }
  }

  return audioMetadataFromContentTypeAndPath(contentType, url);
}

/**
 * Infer audio format from Content-Type header and URL path.
 */
function audioMetadataFromContentTypeAndPath(contentType = '', urlOrPath = '') {
  const type = stringValue(contentType).toLowerCase();
  const pathname = safeUrlPath(urlOrPath).toLowerCase() || stringValue(urlOrPath).toLowerCase();

  if (type.includes('flac') || pathname.endsWith('.flac')) {
    return { codec: 'flac', contentType: 'audio/x-flac', lossless: true };
  }
  if (type.includes('wav') || pathname.endsWith('.wav')) {
    return { codec: 'wav', contentType: 'audio/wav', lossless: true };
  }
  if (type.includes('alac') || pathname.includes('alac')) {
    return { codec: 'alac', contentType: 'audio/mp4', lossless: true };
  }
  if (type.includes('mpeg') || pathname.endsWith('.mp3')) {
    return { codec: 'mp3', contentType: 'audio/mpeg', lossless: false };
  }
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac') || pathname.endsWith('.m4a') || pathname.endsWith('.aac')) {
    return { codec: 'm4a', contentType: 'audio/mp4', lossless: false };
  }
  if (type.includes('ogg') || pathname.endsWith('.ogg')) {
    return { codec: 'ogg', contentType: 'audio/ogg', lossless: false };
  }
  return { codec: '', contentType: contentType || '', lossless: false };
}

function stringValue(v) {
  return v == null ? '' : String(v);
}

function safeUrlPath(urlOrPath) {
  try {
    return new URL(urlOrPath).pathname;
  } catch {
    return stringValue(urlOrPath);
  }
}

/**
 * Check if a bitrate value indicates a lossless request.
 */
function isLosslessRequest(br) {
  const value = String(br || '').toLowerCase();
  if (value === 'flac' || value === 'lossless' || value === 'sq') return true;
  return Number(value || 0) >= 900;
}

/**
 * Normalize bitrate from various API quirks (811, 1567, etc.)
 */
function normalizeAudioBitrate(br) {
  const n = Number(br);
  if (!n || n <= 0) return 0;
  if (n >= 900 && n <= 2000) return 999; // lossless range
  if (n >= 300 && n < 900) return 320;
  if (n >= 128 && n < 300) return 128;
  return n > 2000 ? Math.round(n / 1000) : n;
}

module.exports = {
  probeAudioUrl,
  audioMetadataFromBytes,
  audioMetadataFromContentTypeAndPath,
  isLosslessRequest,
  normalizeAudioBitrate,
  AUDIO_PROBE_BYTES,
  AUDIO_PROBE_TIMEOUT_MS
};
