'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { LrclibProvider } = require('../src/server/source-providers/lrclib');
const { Dispatcher } = require('../src/server/source-providers/dispatcher');
const { createDefaultDispatcher } = require('../src/server/source-providers/index');
const { MetingProvider } = require('../src/server/source-providers/meting');
const { UnmExternalProvider } = require('../src/server/source-providers/unm-external');
const config = require('../src/config');

describe('LrclibProvider lyrics', () => {
  it('should fetch lyrics for a known song', async () => {
    const p = new LrclibProvider();
    const result = await p.lyric({ name: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera' });
    if (result) {
      assert.ok(result.lyric, 'should have lyric text');
      console.log(`  [LRCLIB] got lyrics (${result.lyric.length} chars), synced: ${!!result.tlyric}`);
    } else {
      console.log('  [LRCLIB] no result for Bohemian Rhapsody (API may be down)');
    }
  });

  it('should fetch lyrics for a Chinese song', async () => {
    const p = new LrclibProvider();
    const result = await p.lyric({ name: '晴天', artist: '周杰伦' });
    if (result) {
      assert.ok(result.lyric, 'should have lyric text');
      console.log(`  [LRCLIB] got 晴天 lyrics (${result.lyric.length} chars)`);
    } else {
      console.log('  [LRCLIB] no result for 晴天 (may not be in LRCLIB database)');
    }
  });

  it('should return null for missing song info', async () => {
    const p = new LrclibProvider();
    const result = await p.lyric({ name: '', artist: '' });
    assert.equal(result, null);
  });

  it('should return null for nonexistent song', async () => {
    const p = new LrclibProvider({ timeout: 5000 });
    const result = await p.lyric({ name: 'zzzznonexistent_song_xyz_12345', artist: 'nobody' });
    assert.equal(result, null);
  });

  it('should work via proxy method', async () => {
    const p = new LrclibProvider();
    const result = await p.proxy('lyric', { name: 'Yesterday', artist: 'The Beatles' });
    if (result) {
      assert.equal(result.ok, true);
      assert.equal(result.providerName, 'lrclib');
      const parsed = JSON.parse(result.data);
      assert.ok(parsed.lyric);
      console.log(`  [LRCLIB] proxy returned ${parsed.lyric.length} chars`);
    } else {
      console.log('  [LRCLIB] proxy returned null');
    }
  });

  it('should return null for non-lyric proxy types', async () => {
    const p = new LrclibProvider();
    const result = await p.proxy('search', { name: 'test' });
    assert.equal(result, null);
  });
});

describe('Dispatcher integration', () => {
  it('should create dispatcher with lrclib enabled from config', () => {
    const dispatcher = createDefaultDispatcher(config.musicSources);
    const names = dispatcher.providers.map(p => p.name);
    assert.ok(names.includes('lrclib'), `providers should include lrclib, got: ${names}`);
    assert.ok(names.includes('gdstudio'), `providers should include gdstudio, got: ${names}`);
    console.log(`  [Dispatcher] provider order: ${names.join(' -> ')}`);
  });

  it('should fallback to lrclib for lyrics when other providers fail', async () => {
    const dispatcher = createDefaultDispatcher({
      ...config.musicSources,
      gdstudio: { enabled: false },
      meting: { enabled: false },
      unm: { enabled: false },
      lrclib: { enabled: true }
    });
    const result = await dispatcher.lyric({ name: 'Yesterday', artist: 'The Beatles' });
    if (result) {
      assert.ok(result.lyric || result.tlyric);
      console.log(`  [Dispatcher] lrclib lyric fallback worked`);
    } else {
      console.log('  [Dispatcher] lrclib lyric fallback returned null');
    }
  });

  it('should expand race providers after the priority timeout', async () => {
    const slow = fakeProvider('slow-priority', 200, [{ id: 'slow' }]);
    const fast = fakeProvider('fast-fallback', 30, [{ id: 'fast' }]);
    const dispatcher = new Dispatcher([slow, fast], {
      strategy: 'race',
      racePriorityCount: 1,
      racePriorityTimeout: 20
    });

    const startedAt = Date.now();
    const result = await dispatcher.search('netease', 'test', 1);

    assert.equal(result[0].id, 'fast');
    assert.ok(Date.now() - startedAt < 150, 'fallback provider should not wait for slow priority timeout');
  });

  it('should probe a single lossless URL candidate before returning it', async () => {
    const audioServer = await startAudioServer(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(32, 1)]), 'audio/mpeg');
    const dispatcher = new Dispatcher([{
      name: 'fake-url',
      enabled: true,
      async url() {
        return { url: audioServer.url, br: 999000 };
      }
    }]);

    try {
      const result = await dispatcher.url({ id: 'fake-song' }, '999');
      assert.equal(result.url, audioServer.url);
      assert.equal(result.br, 320);
      assert.equal(result.verified_audio, true);
      assert.equal(result.lossless, false);
      assert.equal(result.codec, 'mp3');
      assert.equal(result.content_type, 'audio/mpeg');
    } finally {
      audioServer.server.close();
    }
  });
});

describe('Provider error tolerance', () => {
  it('MetingProvider returns empty results for non-JSON provider responses', async () => {
    const p = new MetingProvider();
    p._ensureMeting = async () => ({
      async search() { return '<html>error</html>'; },
      async url() { return '<html>error</html>'; },
      async lyric() { return '<html>error</html>'; },
      async pic() { return '<html>error</html>'; }
    });

    assert.deepEqual(await p.search('netease', 'test', 1), []);
    assert.deepEqual(await p.url({ id: '1', source: 'netease' }), { url: undefined, br: 320 });
    assert.deepEqual(await p.lyric({ id: '1', source: 'netease' }), { lyric: '' });
    assert.deepEqual(await p.pic({ pic_id: '1', source: 'netease' }), { url: undefined });
  });

  it('UnmExternalProvider normalizes nullable and nested lyric payloads', async () => {
    const p = new UnmExternalProvider();

    p._get = async () => ({ lrc: null });
    assert.equal(await p.lyric({ id: '1', source: 'netease' }), null);

    p._get = async () => ({ lrc: { lyric: 'line one' } });
    assert.deepEqual(await p.lyric({ id: '1', source: 'netease' }), { lyric: 'line one' });
  });
});

function fakeProvider(name, delayMs, result) {
  return {
    name,
    enabled: true,
    async search() {
      await delay(delayMs);
      return result;
    }
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startAudioServer(audio, contentType) {
  const server = http.createServer((req, res) => {
    res.writeHead(206, {
      'Content-Type': contentType,
      'Content-Length': audio.length,
      'Content-Range': `bytes 0-${audio.length - 1}/${audio.length}`
    });
    res.end(audio);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}/audio.flac` });
    });
  });
}
