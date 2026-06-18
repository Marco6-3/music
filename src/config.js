'use strict';

module.exports = {
  appId: 'com.music.music',
  appName: 'music',
  useLocalBackend: true,
  localBackendPort: 41731,
  remoteUrl: 'https://music.xcloudv.top/?from=musicapp',
  versionApiUrl: 'https://music.xcloudv.top/php/check_version.php',
  versionPollIntervalMs: 30_000,
  requestTimeoutMs: 10_000,
  allowedHosts: ['music.xcloudv.top', '127.0.0.1', 'localhost'],
  window: {
    width: 1200,
    height: 700,
    minWidth: 800,
    minHeight: 600
  },
  musicSources: {
    strategy: 'fallback',
    gdstudio: {
      enabled: true,
      baseUrl: 'https://music-api.gdstudio.xyz/api.php',
      timeout: 12000
    },
    unm: {
      enabled: true,
      sources: ['kuwo', 'kugou', 'bodian', 'bilibili', 'migu'],
      timeout: 10000
    },
    meting: {
      enabled: true,
      defaultPlatform: 'netease',
      supportedPlatforms: ['netease', 'tencent', 'kugou', 'kuwo', 'baidu'],
      cookies: {
        // Set VIP cookies here to unlock lossless quality for each platform.
        // These can also be set via METING_COOKIE_NETEASE / METING_COOKIE_TENCENT env vars.
        netease: process.env.METING_COOKIE_NETEASE || '',
        tencent: process.env.METING_COOKIE_TENCENT || '',
        kugou: process.env.METING_COOKIE_KUGOU || '',
        kuwo: process.env.METING_COOKIE_KUWO || ''
      }
    },
    unmExternal: {
      enabled: false,
      baseUrl: 'http://127.0.0.1:8080',
      timeout: 10000
    },
    lrclib: {
      enabled: true,
      timeout: 8000
    },
    migu: {
      // The standalone Migu web endpoints are unstable without additional auth.
      // Keep disabled by default; UNM can still try its internal migu source.
      enabled: false,
      timeout: 10000
    }
  }
};
