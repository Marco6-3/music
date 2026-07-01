'use strict';

const crypto = require('node:crypto');

// ============================================================
// NetEase Cloud Music API Encryption
// Based on reverse-engineering of the official web client
// ============================================================

const NETEASE_IV = Buffer.from('0102030405060708');
const NETEASE_PRESET_KEY = Buffer.from('0CoJUm6Qyw8W8jud');
// RSA modulus (hex) from NetEase's public key
const NETEASE_RSA_MODULUS = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';
const NETEASE_RSA_EXPONENT = '10001';

function neteaseAesEncrypt(buffer, key) {
  const cipher = crypto.createCipheriv('aes-128-cbc', key, NETEASE_IV);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(buffer), cipher.final()]);
}

/**
 * Raw RSA encryption (modpow) matching NetEase's web client.
 * The web client does: encSecKey = rsaEncrypt(secretKey) with no PKCS padding.
 */
function neteaseRsaEncrypt(buffer) {
  // Reverse the buffer
  const reversed = Buffer.from(buffer).reverse();
  // Convert to BigInt and do modpow: result = buffer^e mod n
  const base = BigInt('0x' + reversed.toString('hex'));
  const exponent = BigInt('0x' + NETEASE_RSA_EXPONENT);
  const modulus = BigInt('0x' + NETEASE_RSA_MODULUS);
  let result = 1n;
  let b = base;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  // Convert back to 128-byte hex string
  let hex = result.toString(16);
  while (hex.length < 256) hex = '0' + hex;
  return hex;
}

/**
 * Encrypt NetEase API request params using their weapi protocol.
 * @param {object|string} data - Request data
 * @returns {{ params: string, encSecKey: string }}
 */
function neteaseEncrypt(data) {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  // First AES pass with preset key
  const firstPass = neteaseAesEncrypt(Buffer.from(text, 'utf8'), NETEASE_PRESET_KEY);
  // Generate random 16-byte key for second pass
  const secretKey = crypto.randomBytes(16).toString('hex').slice(0, 16);
  // Second AES pass
  const params = neteaseAesEncrypt(firstPass.toString('base64'), Buffer.from(secretKey));
  // RSA encrypt the secret key (returns hex string directly)
  const encSecKey = neteaseRsaEncrypt(Buffer.from(secretKey, 'utf8'));
  return { params: params.toString('base64'), encSecKey };
}

// ============================================================
// QQ Music API Encryption
// Based on reverse-engineering of the official web client
// ============================================================

const QQ_SALT = Buffer.from('ec9c1c7dc2d5e99f'); // "ec9c1c7dc2d5e99f"

function qqMd5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * Generate QQ Music sign for API requests.
 * @param {object} data - Request data
 * @returns {string} - MD5 sign
 */
function qqSign(data) {
  const str = Object.keys(data).sort().map(k => `${k}=${data[k]}`).join('&');
  return qqMd5(str + qqMd5(QQ_SALT.toString()));
}

// ============================================================
// Kuwo DES Encryption (for lyric access)
// ============================================================

const KUWO_SECRET = 'ylzsxkwm';

function kuwoEncrypt(str) {
  const key = Buffer.from(KUWO_SECRET, 'utf8');
  const cipher = crypto.createCipheriv('des-ecb', key, null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]).toString('base64');
}

function kuwoDecrypt(str) {
  const key = Buffer.from(KUWO_SECRET, 'utf8');
  const decipher = crypto.createDecipheriv('des-ecb', key, null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(str, 'base64'), decipher.final()]).toString('utf8');
}

// ============================================================
// Kugou Encryption (for some API endpoints)
// ============================================================

function kugouMd5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

module.exports = {
  neteaseEncrypt,
  neteaseAesEncrypt,
  neteaseRsaEncrypt,
  qqSign,
  qqMd5,
  kuwoEncrypt,
  kuwoDecrypt,
  kugouMd5,
};
