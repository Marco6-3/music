'use strict';

// Dispatches music requests across providers with fallback or race strategy.
class Dispatcher {
  constructor(providers = [], { strategy = 'fallback' } = {}) {
    this.providers = providers.filter((provider) => provider.enabled);
    this.strategy = strategy;
  }

  addProvider(provider) {
    if (provider.enabled) {
      this.providers.push(provider);
    }
  }

  async _fallback(method, ...args) {
    for (const provider of this.providers) {
      try {
        const result = await provider[method](...args);
        if (hasProviderResult(method, result, args)) {
          console.log(`[Dispatcher] ${method} hit: ${provider.name}`);
          return attachProviderName(method, result, provider.name);
        }
      } catch (error) {
        console.warn(`[Dispatcher] ${method} failed on ${provider.name}:`, errorMessage(error));
      }
    }
    return emptyResult(method);
  }

  async _race(method, ...args) {
    const promises = this.providers.map((provider) =>
      provider[method](...args)
        .then((result) => {
          if (!hasProviderResult(method, result, args)) {
            throw new Error('empty');
          }
          return { provider: provider.name, result };
        })
        .catch((error) => {
          console.warn(`[Dispatcher] ${method} failed on ${provider.name}:`, errorMessage(error));
          throw error;
        })
    );

    try {
      const winner = await Promise.any(promises);
      console.log(`[Dispatcher] ${method} race winner: ${winner.provider}`);
      return attachProviderName(method, winner.result, winner.provider);
    } catch {
      return emptyResult(method);
    }
  }

  async _dispatch(method, ...args) {
    if (this.strategy === 'race') {
      return this._race(method, ...args);
    }
    return this._fallback(method, ...args);
  }

  async search(platform, keyword, count) {
    return this._dispatch('search', platform, keyword, count);
  }

  async url(song, quality) {
    return this._dispatch('url', song, quality);
  }

  async lyric(song) {
    return this._dispatch('lyric', song);
  }

  async pic(song, size) {
    return this._dispatch('pic', song, size);
  }

  async proxy(types, params) {
    return this._dispatch('proxy', types, params);
  }
}

function emptyResult(method) {
  return method === 'search' ? [] : null;
}

function attachProviderName(method, result, providerName) {
  if (method !== 'proxy' || !result || typeof result !== 'object' || Array.isArray(result)) {
    return result;
  }
  return { ...result, providerName };
}

function hasProviderResult(method, result, args = []) {
  if (Array.isArray(result)) return result.length > 0;
  if (result == null) return false;

  if (method === 'url' || method === 'pic') {
    return Boolean(result.url);
  }
  if (method === 'lyric') {
    return Boolean(result.lyric || result.tlyric);
  }
  if (method !== 'proxy') return true;

  const types = args[0];
  const body = typeof result === 'string' ? result : result.data;
  if (typeof body !== 'string') return body != null;

  const text = body.trim();
  if (!text) return false;

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.length > 0;
    if (!parsed || typeof parsed !== 'object') return true;
    if (types === 'url') return Boolean(parsed.url);
    if (types === 'lyric') return Boolean(parsed.lyric || parsed.tlyric);
    if (types === 'pic') return Boolean(parsed.url);
    if (types === 'search' && Array.isArray(parsed.data)) return parsed.data.length > 0;
  } catch {
    return true;
  }

  return true;
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error == null) return 'unknown error';
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

module.exports = { Dispatcher, hasProviderResult, errorMessage };
