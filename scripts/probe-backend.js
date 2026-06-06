'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { startLocalBackend } = require('../src/server');
const { musicSources } = require('../src/config');

const rawArgs = process.argv.slice(2);
const disableGdstudio = rawArgs.includes('--disable-gdstudio') || envFlag('MUSIC_DISABLE_GDSTUDIO', 'MUSIQ_DISABLE_GDSTUDIO', 'XCLOUD_DISABLE_GDSTUDIO');
const disableUnm = rawArgs.includes('--disable-unm') || envFlag('MUSIC_DISABLE_UNM', 'MUSIQ_DISABLE_UNM', 'XCLOUD_DISABLE_UNM');
const disableMeting = rawArgs.includes('--disable-meting') || envFlag('MUSIC_DISABLE_METING', 'MUSIQ_DISABLE_METING', 'XCLOUD_DISABLE_METING');
const disableLrclib = rawArgs.includes('--disable-lrclib') || envFlag('MUSIC_DISABLE_LRCLIB', 'MUSIQ_DISABLE_LRCLIB', 'XCLOUD_DISABLE_LRCLIB');
const keyword = rawArgs.filter((arg) => !arg.startsWith('--')).join(' ') || '周杰伦 晴天';

function envFlag(...names) {
  return names.some((name) => process.env[name] === '1');
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'music-backend-probe-'));
  const musicSourceConfig = {
    ...musicSources,
    gdstudio: {
      ...musicSources.gdstudio,
      enabled: disableGdstudio ? false : musicSources.gdstudio?.enabled
    },
    unm: {
      ...musicSources.unm,
      enabled: disableUnm ? false : musicSources.unm?.enabled
    },
    meting: {
      ...musicSources.meting,
      enabled: disableMeting ? false : musicSources.meting?.enabled
    },
    lrclib: {
      ...musicSources.lrclib,
      enabled: disableLrclib ? false : musicSources.lrclib?.enabled
    }
  };
  const server = await startLocalBackend({ preferredPort: 41931, dataDir, musicSourceConfig });

  try {
    const url = new URL('/api.php', server.url);
    url.searchParams.set('types', 'search');
    url.searchParams.set('source', 'netease');
    url.searchParams.set('name', keyword);
    url.searchParams.set('count', '2');

    const response = await fetch(url);
    const body = await response.text();
    const parsed = JSON.parse(body);

    console.log(JSON.stringify({
      status: response.status,
      cache: response.headers.get('x-cache'),
      provider: response.headers.get('x-music-source'),
      enabledProviders: [
        musicSourceConfig.gdstudio?.enabled !== false ? 'gdstudio' : null,
        musicSourceConfig.unm?.enabled ? 'unm' : null,
        musicSourceConfig.meting?.enabled ? 'meting' : null,
        musicSourceConfig.lrclib?.enabled ? 'lrclib' : null
      ].filter(Boolean),
      resultCount: Array.isArray(parsed) ? parsed.length : 0,
      first: Array.isArray(parsed) && parsed[0] ? {
        id: parsed[0].id,
        name: parsed[0].name,
        source: parsed[0].source
      } : null
    }, null, 2));

    if (!response.ok || !Array.isArray(parsed) || parsed.length === 0) {
      process.exitCode = 1;
    }
  } finally {
    await server.close();
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[probe-backend] temp cleanup skipped: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
