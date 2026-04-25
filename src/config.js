'use strict';

module.exports = {
  appId: 'com.xcloud.music',
  appName: 'XCloud音乐',
  useLocalBackend: true,
  localBackendPort: 41731,
  remoteUrl: 'https://music.xcloudv.top/?from=xcloudapp',
  versionApiUrl: 'https://music.xcloudv.top/php/check_version.php',
  versionPollIntervalMs: 30_000,
  requestTimeoutMs: 10_000,
  allowedHosts: ['music.xcloudv.top', '127.0.0.1', 'localhost'],
  window: {
    width: 1200,
    height: 700,
    minWidth: 800,
    minHeight: 600
  }
};
