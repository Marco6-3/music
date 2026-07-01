'use strict';

const http = require('node:http');
const https = require('node:https');
const axios = require('axios');

// Shared HTTP agents with keep-alive for connection reuse
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 15 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 15 });

// Common User-Agents to rotate
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function withTimeout(promise, ms, message = 'operation timeout') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

/**
 * Create a configured axios instance for a specific platform.
 */
function createClient(options = {}) {
  const {
    timeout = 10000,
    baseURL,
    headers = {},
    useRandomUA = false,
  } = options;

  const instance = axios.create({
    timeout,
    httpAgent,
    httpsAgent,
    maxRedirects: 5,
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...(useRandomUA ? { 'User-Agent': randomUA() } : {}),
      ...headers,
    },
    ...(baseURL ? { baseURL } : {}),
  });

  return instance;
}

/**
 * HEAD request to check content-length (for filtering tiny ad files).
 */
async function headContentLength(url, timeout = 5000) {
  return new Promise((resolve) => {
    const transport = url.startsWith('https') ? https : http;
    const req = transport.request(url, { method: 'HEAD', timeout }, (res) => {
      const size = Number(res.headers['content-length']) || 0;
      res.resume();
      resolve(size);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.end();
  });
}

function normalizeBitrateKbps(value) {
  if (value == null || value === '') return 0;
  const text = String(value).toLowerCase();
  if (text.includes('flac') || text.includes('lossless')) return 999;
  const match = text.match(/\d+/);
  const n = match ? Number(match[0]) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 5000 ? Math.round(n / 1000) : n;
}

function expectedMinAudioBytes(context = {}) {
  const durationMs = Number(context.duration || context.durationMs || 0);
  const baseMin = context.minBytes || 512 * 1024;
  if (!Number.isFinite(durationMs) || durationMs < 30_000) return baseMin;

  const bitrate = normalizeBitrateKbps(context.br || context.quality) || 128;
  const conservativeBitrate = Math.max(64, Math.min(bitrate, 128));
  const expectedBytes = (durationMs / 1000) * conservativeBitrate * 1000 / 8;
  return Math.max(baseMin, Math.floor(expectedBytes * 0.35));
}

async function validateAudioUrl(url, context = {}) {
  if (!url || !String(url).startsWith('http')) {
    return { valid: false, codec: '', lossless: false, size: 0, reason: 'missing url' };
  }

  const size = await headContentLength(url, context.timeout || 5000);
  if (size > 0) {
    const minBytes = expectedMinAudioBytes(context);
    if (size < minBytes) {
      return {
        valid: false,
        codec: '',
        lossless: false,
        size,
        minBytes,
        reason: `file too small (${Math.round(size / 1024)}KB < ${Math.round(minBytes / 1024)}KB)`,
      };
    }
  }

  const format = await probeAudioFormat(url, context.timeout || 6000);
  if (!format.codec) {
    return { ...format, valid: false, size, reason: 'unrecognized audio format' };
  }

  return { ...format, valid: true, size };
}

/**
 * Probe first 8KB of audio to detect format via magic bytes.
 */
async function probeAudioFormat(url, timeout = 6000) {
  return new Promise((resolve) => {
    const transport = url.startsWith('https') ? https : http;
    const req = transport.get(url, {
      timeout,
      headers: { Range: 'bytes=0-8191', 'User-Agent': randomUA() }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => {
        chunks.push(chunk);
        if (Buffer.concat(chunks).length >= 8192) res.destroy();
      });
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve(audioFormatFromBytes(buf));
      });
      res.on('error', () => resolve({ codec: '', lossless: false }));
    });
    req.on('error', () => resolve({ codec: '', lossless: false }));
    req.on('timeout', () => { req.destroy(); resolve({ codec: '', lossless: false }); });
  });
}

function audioFormatFromBytes(buf) {
  if (buf.length >= 4) {
    const magic = buf.toString('ascii', 0, 4);
    if (magic === 'fLaC') return { codec: 'flac', lossless: true };
    if (magic.startsWith('RIFF') && buf.length >= 12 && buf.toString('ascii', 8, 12) === 'WAVE')
      return { codec: 'wav', lossless: true };
    if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
      const ascii = buf.toString('ascii').toLowerCase();
      if (ascii.includes('alac')) return { codec: 'alac', lossless: true };
      return { codec: 'm4a', lossless: false };
    }
    if (magic.startsWith('ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0))
      return { codec: 'mp3', lossless: false };
    if (magic.startsWith('OggS')) return { codec: 'ogg', lossless: false };
  }
  return { codec: '', lossless: false };
}

module.exports = {
  createClient,
  headContentLength,
  probeAudioFormat,
  validateAudioUrl,
  expectedMinAudioBytes,
  normalizeBitrateKbps,
  withTimeout,
  randomUA,
  httpAgent,
  httpsAgent,
};
