'use strict';

/**
 * Demo script for music-api-core
 * Tests all providers: search, url, lyric, pic
 */

const { MusicAPI } = require('./src/index');

async function main() {
  const api = new MusicAPI({
    strategy: 'fallback',
    // Uncomment to enable VIP cookie-based direct access:
    // netease: { cookie: 'YOUR_NETEASE_COOKIE' },
    // tencent: { cookie: 'YOUR_TENCENT_COOKIE' },
  });

  console.log('=== Music API Core Demo ===\n');
  console.log('Available platforms:', api.platforms().join(', '));
  console.log('');

  // ---- Test each platform ----
  const platforms = ['kuwo', 'kugou', 'migu', 'netease', 'tencent'];
  const testKeyword = '薛之谦 演员';

  for (const platform of platforms) {
    console.log(`\n--- ${platform.toUpperCase()} ---`);

    // Search
    console.log(`Searching: "${testKeyword}" ...`);
    const songs = await api.search(platform, testKeyword, 5);
    if (songs.length === 0) {
      console.log('  No results found.');
      continue;
    }

    console.log(`  Found ${songs.length} songs:`);
    for (const song of songs) {
      console.log(`    - ${song.name} - ${song.artist} (id: ${song.id})`);
    }

    // Prefer the exact studio track when the search provider ranks live/remix
    // variants first.
    const firstSong = songs.find((song) => song.name === '演员' && String(song.artist || '').includes('薛之谦')) || songs[0];
    console.log(`\n  Resolving URL for: ${firstSong.name} ...`);
    const urlResult = await api.url(firstSong, '320');
    if (urlResult?.url) {
      console.log(`  URL: ${urlResult.url.substring(0, 80)}...`);
      console.log(`  Bitrate: ${urlResult.br}, Format: ${urlResult.format}, Source: ${urlResult.source}`);

      // Verify URL
      const verify = await api.verifyUrl(urlResult.url);
      console.log(`  Verify: codec=${verify.codec}, lossless=${verify.lossless}, valid=${verify.valid}`);
    } else {
      console.log('  No URL available.');
    }

    // Get lyrics
    console.log(`\n  Fetching lyrics ...`);
    const lyricResult = await api.lyric(platform, firstSong);
    if (lyricResult?.lyric) {
      const lines = lyricResult.lyric.split('\n').slice(0, 3);
      console.log(`  Lyrics preview:`);
      for (const line of lines) {
        console.log(`    ${line}`);
      }
    } else {
      console.log('  No lyrics available.');
    }

    // Get pic
    console.log(`\n  Fetching album art ...`);
    const picResult = await api.pic(platform, firstSong);
    if (picResult?.url) {
      console.log(`  Pic URL: ${picResult.url.substring(0, 80)}...`);
    } else {
      console.log('  No album art available.');
    }
  }

  // ---- Cross-platform fallback demo ----
  console.log('\n\n=== Cross-Platform Fallback Demo ===');
  console.log('Resolving a NetEase song via fallback strategy...\n');

  const neteaseSongs = await api.search('netease', '薛之谦 演员', 3);
  if (neteaseSongs.length > 0) {
    const song = neteaseSongs[0];
    console.log(`Song: ${song.name} - ${song.artist} (source: ${song.source})`);
    const result = await api.url(song, '320');
    if (result) {
      console.log(`Resolved via: ${result.source}`);
      console.log(`URL: ${result.url.substring(0, 80)}...`);
    }
  }

  console.log('\n=== Keyword Resolve Demo ===');
  const keyword = '周杰伦 晴天';
  const resolved = await api.resolve(keyword, { diagnostics: true, searchCount: 5 });
  if (resolved?.url) {
    console.log(`Keyword: ${keyword}`);
    console.log(`Song: ${resolved.song.name} - ${resolved.song.artist} (source: ${resolved.song.source})`);
    console.log(`Resolved via: ${resolved.url.provider}/${resolved.url.source}`);
    console.log(`Codec: ${resolved.url.codec}, size=${Math.round((resolved.url.size || 0) / 1024)}KB`);
    console.log(`URL: ${resolved.url.url.substring(0, 80)}...`);
  } else {
    console.log(`No playable URL resolved for: ${keyword}`);
  }

  console.log('\n=== Demo Complete ===');
}

main().catch(console.error);
