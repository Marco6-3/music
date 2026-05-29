'use strict';

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 5 * 60 * 1000;
const SCORE_DECAY = 0.5;
const SCORE_RECOVER = 0.1;
const PRIORITY_RACE_TIMEOUT = 500;

// Tracks per-provider health for adaptive ordering.
class ProviderHealth {
  constructor() {
    this.score = 1.0;
    this.consecutiveFailures = 0;
    this.unhealthyUntil = 0;
  }

  isHealthy() {
    return Date.now() > this.unhealthyUntil;
  }

  recordSuccess() {
    this.consecutiveFailures = 0;
    this.unhealthyUntil = 0;
    this.score = Math.min(1.0, this.score + SCORE_RECOVER);
  }

  recordFailure() {
    this.consecutiveFailures += 1;
    this.score = Math.max(0, this.score * SCORE_DECAY);
    if (this.consecutiveFailures >= FAILURE_THRESHOLD) {
      this.unhealthyUntil = Date.now() + COOLDOWN_MS;
    }
  }

  // Effective score: unhealthy providers get a negative score to sort last.
  effectiveScore() {
    return this.isHealthy() ? this.score : -1;
  }
}

// Dispatches music requests across providers with fallback or race strategy.
class Dispatcher {
  constructor(providers = [], { strategy = 'fallback', racePriorityCount = 2, racePriorityTimeout = PRIORITY_RACE_TIMEOUT } = {}) {
    this.providers = providers.filter((provider) => provider.enabled);
    this.strategy = strategy;
    this.racePriorityCount = racePriorityCount;
    this.racePriorityTimeout = racePriorityTimeout;
    this._health = new Map();
    for (const provider of this.providers) {
      this._health.set(provider, new ProviderHealth());
    }
  }

  addProvider(provider) {
    if (provider.enabled) {
      this.providers.push(provider);
      this._health.set(provider, new ProviderHealth());
    }
  }

  _getHealth(provider) {
    let health = this._health.get(provider);
    if (!health) {
      health = new ProviderHealth();
      this._health.set(provider, health);
    }
    return health;
  }

  _sortedProviders() {
    return [...this.providers].sort(
      (a, b) => this._getHealth(b).effectiveScore() - this._getHealth(a).effectiveScore()
    );
  }

  _recordSuccess(provider) {
    this._getHealth(provider).recordSuccess();
  }

  _recordFailure(provider) {
    const health = this._getHealth(provider);
    health.recordFailure();
    if (!health.isHealthy()) {
      console.warn(`[Dispatcher] provider "${provider.name}" marked unhealthy for ${COOLDOWN_MS / 60000}min (${health.consecutiveFailures} failures)`);
    }
  }

  async _fallback(method, ...args) {
    const sorted = this._sortedProviders();
    for (const provider of sorted) {
      const health = this._getHealth(provider);
      if (!health.isHealthy()) {
        console.log(`[Dispatcher] ${method} skip unhealthy: ${provider.name}`);
        continue;
      }
      try {
        const result = await provider[method](...args);
        if (hasProviderResult(method, result, args)) {
          console.log(`[Dispatcher] ${method} hit: ${provider.name}`);
          this._recordSuccess(provider);
          return attachProviderName(method, result, provider.name);
        }
      } catch (error) {
        this._recordFailure(provider);
        console.warn(`[Dispatcher] ${method} failed on ${provider.name}:`, errorMessage(error));
      }
    }
    return emptyResult(method);
  }

  async _race(method, ...args) {
    const sorted = this._sortedProviders();
    const healthy = sorted.filter((p) => this._getHealth(p).isHealthy());

    if (healthy.length === 0) return emptyResult(method);

    const priority = healthy.slice(0, this.racePriorityCount);
    const rest = healthy.slice(this.racePriorityCount);
    const pending = new Set();

    const raceOne = (provider) => {
      const promise = provider[method](...args)
        .then((result) => {
          if (!hasProviderResult(method, result, args)) throw new Error('empty');
          return { provider: provider.name, result, ref: provider };
        })
        .catch((error) => {
          this._recordFailure(provider);
          console.warn(`[Dispatcher] ${method} failed on ${provider.name}:`, errorMessage(error));
          throw error;
        });
      pending.add(promise);
      promise.finally(() => pending.delete(promise)).catch(() => {});
      return promise;
    };

    for (const provider of priority) raceOne(provider);

    if (rest.length > 0) {
      const waitForPriority = Promise.any([...pending]);
      const priorityTimeout = delay(this.racePriorityTimeout)
        .then(() => Promise.reject(new Error('priority timeout')));
      try {
        const winner = await Promise.race([waitForPriority, priorityTimeout]);
        console.log(`[Dispatcher] ${method} race winner (priority): ${winner.provider}`);
        this._recordSuccess(winner.ref);
        return attachProviderName(method, winner.result, winner.provider);
      } catch {
        for (const provider of rest) raceOne(provider);
      }
    }

    try {
      const winner = await Promise.any([...pending]);
      console.log(`[Dispatcher] ${method} race winner: ${winner.provider}`);
      this._recordSuccess(winner.ref);
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

  // Expose health info for monitoring/debugging.
  getHealthStatus() {
    const status = {};
    for (const provider of this.providers) {
      const health = this._getHealth(provider);
      status[provider.name] = {
        score: Math.round(health.score * 100) / 100,
        healthy: health.isHealthy(),
        consecutiveFailures: health.consecutiveFailures
      };
    }
    return status;
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { Dispatcher, ProviderHealth, hasProviderResult, errorMessage };
