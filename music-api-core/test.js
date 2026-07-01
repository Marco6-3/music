'use strict';

/**
 * Integration tests for music-api-core
 * Tests actual API calls to verify providers work.
 */

const { MusicAPI, KuwoProvider, KugouProvider, MiguProvider, NeteaseProvider, TencentProvider } = require('./src/index');

const api = new MusicAPI();
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

function assertPlayable(result) {
  assert(result?.url, 'no url returned');
  assert(result.url.startsWith('http'), `invalid url: ${result.url}`);
  assert(result.verified_audio, 'url was not verified');
  assert(result.codec, 'missing codec');
  assert(result.size > 512 * 1024, `audio file too small: ${result.size}`);
}

async function main() {
  console.log('=== Music API Core Tests ===\n');

  // ---- Kuwo Tests ----
  console.log('Kuwo Provider:');
  await test('search returns results', async () => {
    const results = await api.search('kuwo', '周杰伦', 5);
    assert(results.length > 0, `expected results, got ${results.length}`);
    assert(results[0].id, 'missing id');
    assert(results[0].name, 'missing name');
    assert(results[0].source === 'kuwo', `wrong source: ${results[0].source}`);
  });

  await test('url resolves for kuwo song', async () => {
    const results = await api.search('kuwo', '薛之谦 演员', 1);
    assert(results.length > 0, 'no search results');
    const url = await api.url(results[0], '320');
    assertPlayable(url);
  });

  await test('invalid kuwo id is rejected', async () => {
    const invalid = await new KuwoProvider().url('0', '320');
    assert(invalid === null, 'invalid Kuwo id should not return placeholder audio');
  });

  await test('lyric returns lyrics', async () => {
    const results = await api.search('kuwo', '晴天 周杰伦', 1);
    assert(results.length > 0, 'no search results');
    const lyric = await api.lyric('kuwo', results[0]);
    assert(lyric?.lyric, 'no lyrics returned');
    assert(lyric.lyric.includes('['), 'invalid lrc format');
  });

  // ---- Kugou Tests ----
  console.log('\nKugou Provider:');
  await test('search returns results', async () => {
    const results = await api.search('kugou', '周杰伦', 5);
    assert(results.length > 0, `expected results, got ${results.length}`);
    assert(results[0].id, 'missing id');
    assert(results[0].source === 'kugou', `wrong source: ${results[0].source}`);
  });

  await test('url resolves for kugou song (via fallback)', async () => {
    const results = await api.search('kugou', '薛之谦 演员', 1);
    assert(results.length > 0, 'no search results');
    const url = await api.url(results[0], '320');
    assertPlayable(url);
  });

  // ---- Migu Tests ----
  console.log('\nMigu Provider:');
  await test('search returns results', async () => {
    const results = await api.search('migu', '周杰伦', 5);
    assert(results.length > 0, `expected results, got ${results.length}`);
    assert(results[0].id, 'missing id');
    assert(results[0].source === 'migu', `wrong source: ${results[0].source}`);
  });

  await test('url resolves for migu song', async () => {
    const results = await api.search('migu', '薛之谦 演员', 5);
    assert(results.length > 0, 'no search results');
    const song = results.find((item) => item.name === '演员') || results[0];
    const url = await api.url(song, '320');
    assertPlayable(url);
  });

  // ---- Netease Tests ----
  console.log('\nNetease Provider:');
  await test('search returns results', async () => {
    const results = await api.search('netease', '周杰伦', 5);
    assert(results.length > 0, `expected results, got ${results.length}`);
    assert(results[0].id, 'missing id');
    assert(results[0].source === 'netease', `wrong source: ${results[0].source}`);
  });

  await test('url resolves for netease song (via fallback)', async () => {
    const results = await api.search('netease', '薛之谦 演员', 1);
    assert(results.length > 0, 'no search results');
    const url = await api.url(results[0], '320');
    assertPlayable(url);
  });

  await test('lyric returns lyrics', async () => {
    const results = await api.search('netease', '晴天 周杰伦', 1);
    assert(results.length > 0, 'no search results');
    const lyric = await api.lyric('netease', results[0]);
    assert(lyric?.lyric, 'no lyrics returned');
  });

  // ---- Tencent Tests ----
  console.log('\nTencent Provider:');
  await test('search returns results', async () => {
    const results = await api.search('tencent', '周杰伦', 5);
    assert(results.length > 0, `expected results, got ${results.length}`);
    assert(results[0].id, 'missing id');
    assert(results[0].source === 'tencent', `wrong source: ${results[0].source}`);
  });

  await test('url resolves for tencent song (via fallback)', async () => {
    const results = await api.search('tencent', '薛之谦 演员', 1);
    assert(results.length > 0, 'no search results');
    const url = await api.url(results[0], '320');
    assertPlayable(url);
  });

  // ---- Cross-Platform Tests ----
  console.log('\nCross-Platform:');
  await test('fallback resolves netease song via other providers', async () => {
    const songs = await api.search('netease', '薛之谦 演员', 1);
    assert(songs.length > 0, 'no results');
    const url = await api.url(songs[0], '320');
    assertPlayable(url);
  });

  await test('verifyUrl validates audio', async () => {
    const songs = await api.search('netease', '薛之谦 演员', 1);
    assert(songs.length > 0, 'no results');
    const url = await api.url(songs[0], '320');
    assert(url?.url, 'no url');
    const verify = await api.verifyUrl(url.url);
    assert(verify.valid, `expected valid audio, got: ${verify.reason || verify.codec}`);
  });

  await test('searchAll ranks exact artist/title matches across platforms', async () => {
    const songs = await api.searchAll('周杰伦 晴天', 10, ['netease', 'tencent', 'kugou', 'kuwo', 'migu'], 5);
    assert(songs.length > 0, 'no searchAll results');
    assert(songs[0].name === '晴天', `expected exact title first, got ${songs[0].name}`);
    assert(String(songs[0].artist).includes('周杰伦'), `expected 周杰伦 artist first, got ${songs[0].artist}`);
  });

  await test('resolve finds a playable URL for a high-risk exact song', async () => {
    const resolved = await api.resolve('周杰伦 晴天', { searchCount: 5, diagnostics: true });
    assert(resolved?.song, 'no song resolved');
    assert(resolved.song.name === '晴天', `wrong song resolved: ${resolved.song.name}`);
    assert(String(resolved.song.artist).includes('周杰伦'), `wrong artist resolved: ${resolved.song.artist}`);
    assertPlayable(resolved.url);
    assert(resolved.attempts?.[0]?.attempts?.length >= 2, 'expected provider diagnostics');
  });

  // ---- Summary ----
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
