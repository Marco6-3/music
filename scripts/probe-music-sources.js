'use strict';

const { createDefaultDispatcher } = require('../src/server/source-providers');
const { musicSources } = require('../src/config');

const rawArgs = process.argv.slice(2);
const disableGdstudio = rawArgs.includes('--disable-gdstudio') || process.env.XCLOUD_DISABLE_GDSTUDIO === '1';
const disableUnm = rawArgs.includes('--disable-unm') || process.env.XCLOUD_DISABLE_UNM === '1';
const disableMeting = rawArgs.includes('--disable-meting') || process.env.XCLOUD_DISABLE_METING === '1';
const keyword = rawArgs.filter((arg) => !arg.startsWith('--')).join(' ') || '周杰伦 晴天';
const platform = process.env.XCLOUD_PROBE_PLATFORM || 'netease';

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
  }
};

function short(value, max = 140) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function step(name, fn) {
  process.stdout.write(`- ${name}: `);
  try {
    const result = await fn();
    if (Array.isArray(result)) {
      console.log(`ok (${result.length})`);
    } else {
      console.log(`ok ${short(result)}`);
    }
    return result;
  } catch (error) {
    console.log(`failed (${error.message})`);
    return null;
  }
}

async function main() {
  const dispatcher = createDefaultDispatcher(musicSourceConfig);
  console.log(`Probe keyword: ${keyword}`);
  console.log(`Probe platform: ${platform}`);
  console.log(`Enabled providers: ${dispatcher.providers.map((provider) => provider.name).join(', ') || 'none'}`);

  const results = await step('search', () => dispatcher.search(platform, keyword, 5));
  const song = Array.isArray(results) ? results[0] : null;
  if (!song) {
    process.exitCode = 1;
    return;
  }

  console.log(`Selected song: ${song.name || song.title || song.id} / ${short(song.artist || song.author || '')}`);
  await step('url', () => dispatcher.url(song, '320'));
  await step('lyric', () => dispatcher.lyric(song));
  await step('pic', () => dispatcher.pic(song, 300));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
