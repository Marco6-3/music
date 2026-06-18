'use strict';

const { formatDateTime } = require('./database');
const { errorMessage } = require('./source-providers/dispatcher');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

async function checkSourceHealth(provider) {
  const results = { search: false, play: false };

  if (provider.capabilities?.search === false) {
    results.search = null;
    if (provider.capabilities?.lyric) {
      try {
        const lyric = await provider.lyric({ name: '晴天', artist: '周杰伦' });
        results.play = Boolean(lyric && (lyric.lyric || lyric.tlyric));
      } catch {
        results.play = false;
      }
    }
    return results;
  }

  try {
    const probe = healthProbeForProvider(provider);
    const songs = await provider.search(probe.platform, probe.keyword, 1);
    results.search = Array.isArray(songs) && songs.length > 0;
    results.play = results.search;
  } catch {
    results.search = false;
    results.play = false;
  }

  return results;
}

function healthProbeForProvider(provider) {
  if (provider.name === 'kuwo-direct') return { platform: 'kuwo', keyword: '周杰伦 晴天' };
  if (provider.name === 'kugou-direct') return { platform: 'kugou', keyword: '周杰伦 晴天' };
  return {
    platform: provider.options?.defaultPlatform || 'netease',
    keyword: 'test'
  };
}

function writeStatus(db, source, name, searchOk, playOk) {
  const now = formatDateTime(new Date());
  const searchStatus = searchOk == null ? 'n/a' : searchOk ? 'true' : 'false';
  const playStatus = playOk == null ? 'n/a' : playOk ? 'true' : 'false';
  db.prepare(`
    INSERT INTO api_status (source, name, search, play, last_check)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source) DO UPDATE SET
      name = excluded.name,
      search = excluded.search,
      play = excluded.play,
      last_check = excluded.last_check
  `).run(source, name, searchStatus, playStatus, now);
}

async function runHealthCheck(db, dispatcher, shouldContinue = () => true) {
  if (!dispatcher || !Array.isArray(dispatcher.providers)) return;

  for (const provider of dispatcher.providers) {
    if (!shouldContinue()) return;
    const sourceName = provider.name;
    try {
      const health = await checkSourceHealth(provider);
      if (!shouldContinue()) return;
      writeStatus(db, sourceName, provider.name, health.search, health.play);
      console.log(`[api-monitor] ${sourceName}: search=${health.search} play=${health.play}`);
    } catch (error) {
      if (!shouldContinue()) return;
      writeStatus(db, sourceName, provider.name, false, false);
      console.warn(`[api-monitor] ${sourceName} check failed:`, errorMessage(error));
    }
  }
}

function startMonitoring(db, dispatcher, { intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  let stopped = false;
  const shouldContinue = () => !stopped;

  runHealthCheck(db, dispatcher, shouldContinue).catch((error) => {
    if (stopped) return;
    console.warn('[api-monitor] initial check failed:', errorMessage(error));
  });

  const timer = setInterval(() => {
    runHealthCheck(db, dispatcher, shouldContinue).catch((error) => {
      if (stopped) return;
      console.warn('[api-monitor] check failed:', errorMessage(error));
    });
  }, intervalMs);

  if (timer.unref) timer.unref();
  console.log(`[api-monitor] started (interval: ${intervalMs / 1000}s)`);

  return () => {
    stopped = true;
    clearInterval(timer);
    console.log('[api-monitor] stopped');
  };
}

function getStatus(db) {
  const rows = db.prepare('SELECT source, name, search, play, last_check FROM api_status').all();
  const result = {};
  for (const row of rows) {
    result[row.source] = {
      name: row.name,
      search: row.search === 'true',
      play: row.play === 'true',
      last_check: row.last_check
    };
  }
  return result;
}

module.exports = {
  startMonitoring,
  runHealthCheck,
  getStatus,
  checkSourceHealth,
  healthProbeForProvider
};
