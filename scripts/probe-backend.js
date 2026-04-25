'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { startLocalBackend } = require('../src/server');
const { musicSources } = require('../src/config');

const rawArgs = process.argv.slice(2);
const disableGdstudio = rawArgs.includes('--disable-gdstudio') || process.env.XCLOUD_DISABLE_GDSTUDIO === '1';
const disableMeting = rawArgs.includes('--disable-meting') || process.env.XCLOUD_DISABLE_METING === '1';
const keyword = rawArgs.filter((arg) => !arg.startsWith('--')).join(' ') || '周杰伦 晴天';

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xcloud-backend-probe-'));
  const musicSourceConfig = {
    ...musicSources,
    gdstudio: {
      ...musicSources.gdstudio,
      enabled: disableGdstudio ? false : musicSources.gdstudio?.enabled
    },
    meting: {
      ...musicSources.meting,
      enabled: disableMeting ? false : musicSources.meting?.enabled
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
        musicSourceConfig.meting?.enabled ? 'meting' : null
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
    await new Promise((resolve) => {
      server.close();
      setTimeout(resolve, 250);
    });
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
