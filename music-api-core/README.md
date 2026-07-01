# music-api-core

独立的多平台音乐 API 模块，支持搜索、歌词、封面和播放 URL 解析。它会组合直连接口、Gdstudio、Meting 和 UNM 多层 fallback，并对返回音频做完整性校验。

说明：任何非官方音乐接口都不能保证“所有歌曲 100% 可播”。本模块的目标是尽可能提高覆盖率，并在无法精确解析时返回 `null` 和诊断信息，而不是播放错误版本、DJ 版、翻唱或短试听。

## 支持的平台

| 平台 | 搜索 | 播放 | 歌词 | 封面 | 备注 |
|------|------|------|------|------|------|
| **Gdstudio 聚合源** | ✅ (网易/酷我) | ✅ | ✅ | ✅ | 默认完整音频兜底，自动校验 |
| **Meting** | ✅ | ✅ | ✅ | ✅ | 多平台补充搜索和元数据能力 |
| **UNM** | ✅ (部分源) | ✅ | - | - | 最后一层播放 URL fallback，可解析部分高风险曲目 |
| **酷我音乐 (Kuwo)** | ✅ | ⚠️ 需校验 | ✅ | ✅ | 直连接口可能返回短音频，占位结果会被过滤 |
| **酷狗音乐 (Kugou)** | ✅ | ✅ (via fallback) | ✅ | ✅ | 搜索用酷狗，播放自动兜底 |
| **咪咕音乐 (Migu)** | ✅ | ✅ | - | ✅ | 支持部分移动端接口 |
| **网易云音乐 (Netease)** | ✅ | ✅ (via fallback) | ✅ | ✅ | 有 cookie 可提高直连成功率 |
| **QQ音乐 (Tencent)** | ✅ | ✅ (via fallback) | ✅ | ✅ | 有 cookie 可提高直连成功率 |

## 核心策略

### 1. 多层解析链

播放 URL 解析按顺序尝试：

1. 原平台 provider
2. `Gdstudio` 聚合源
3. `Meting`
4. `UNM`
5. 其他直连 provider

每个候选 URL 都必须通过文件大小、时长启发式和音频 magic bytes 校验。几十到几百 KB 的短音频、错误页、广告或占位 MP3 会被过滤。

### 2. 跨平台精确匹配

跨平台解析时，会用歌曲名和歌手做匹配。带括号版本、Live、DJ、翻唱、多歌手差异等情况会更保守处理。匹配不到完整音频时返回 `null`，不强行用错误版本冒充成功。

### 3. 可诊断失败

`api.diagnoseUrl()` 和 `api.resolve(..., { diagnostics: true })` 会返回每个 provider 的尝试记录，便于判断是平台没结果、URL 太小、格式不识别，还是外部接口超时。

## 安装

```bash
cd music-api-core
npm install
```

## 使用

### 基本用法

```javascript
const { MusicAPI } = require('./src/index');

const api = new MusicAPI();

const songs = await api.search('netease', '薛之谦 演员', 10);

const result = await api.url(songs[0], '320');
console.log(result.url);
console.log(result.codec, result.size);

const lyric = await api.lyric('netease', songs[0]);
console.log(lyric.lyric);

const pic = await api.pic('netease', songs[0]);
console.log(pic.url);
```

### 一键搜索并解析

```javascript
const resolved = await api.resolve('周杰伦 晴天', {
  quality: '320',
  diagnostics: true,
});

if (resolved?.url) {
  console.log(resolved.song);
  console.log(resolved.url.url);
  console.log(resolved.url.provider, resolved.url.source);
  console.log(resolved.url.codec, resolved.url.size);
} else {
  console.log(resolved.attempts);
}
```

### 使用 Cookie 提高直连成功率

```javascript
const api = new MusicAPI({
  netease: { cookie: 'MUSIC_U=xxx; __csrf=xxx' },
  tencent: { cookie: 'qqmusic_key=xxx' },
  meting: {
    cookies: {
      netease: 'MUSIC_U=xxx; __csrf=xxx',
      tencent: 'qqmusic_key=xxx',
    },
  },
});
```

### 禁用或调整 provider

```javascript
const api = new MusicAPI({
  gdstudio: false,
  meting: false,
  unm: {
    sources: ['kuwo', 'kugou', 'bodian', 'bilibili', 'migu'],
    timeout: 10000,
  },
});
```

默认 UNM 源为 `kuwo/kugou/bodian/bilibili`。`migu` 在部分网络下容易超时，所以默认不启用；需要时可以手动加入。

## API

### `new MusicAPI(options)`

创建 API 实例。

常用 options：

- `strategy`: `'fallback'` 默认，或 `'race'`
- `platforms`: `resolve()` 默认搜索的平台列表
- `netease`: `{ cookie?: string }` 或 `false`
- `tencent`: `{ cookie?: string }` 或 `false`
- `gdstudio`: `{ baseUrl?: string, timeout?: number }` 或 `false`
- `meting`: `{ cookies?: object, supportedPlatforms?: string[] }` 或 `false`
- `unm`: `{ sources?: string[], timeout?: number }` 或 `false`
- `kuwo` / `kugou` / `migu`: `{ timeout?: number }` 或 `false`

### `api.search(platform, keyword, count)`

搜索指定平台。会先查原平台 provider，再用可支持该平台的通用 provider 补充结果。

返回：

```javascript
Array<{ id, name, artist, album, source, duration }>
```

### `api.searchAll(keyword, count, platforms, perPlatformCount)`

跨多个平台搜索并统一排序，优先返回标题和歌手都匹配的结果。

### `api.url(song, quality)`

获取播放链接。`quality`: `'128'` | `'320'` | `'flac'`。

成功返回：

```javascript
{ url, br, source, provider, codec, lossless, size, verified_audio }
```

失败返回 `null`。

### `api.resolve(keyword, options)`

先跨平台搜索，再逐个候选解析播放地址。

`options`：

- `quality`: `'128'` | `'320'` | `'flac'`
- `platforms`: 搜索平台列表
- `searchCount`: 每个平台候选数量
- `diagnostics`: 是否返回尝试记录

返回 `{ song, url }`；当 `diagnostics: true` 时还会包含 `attempts`。

### `api.diagnoseUrl(song, quality)`

只对一首歌做播放 URL 解析诊断。返回：

```javascript
{ result, attempts }
```

### `api.lyric(platform, song)`

获取歌词。返回 `{ lyric, tlyric? }` 或 `null`。

### `api.pic(platform, song)`

获取封面。返回 `{ url }` 或 `null`。

### `api.verifyUrl(url)`

验证音频 URL。返回 `{ codec, lossless, valid, size }`。

## 测试

```bash
npm test
npm run demo
```

当前测试会访问真实外部接口，因此结果受网络、接口风控和平台状态影响。

## 架构

```text
music-api-core/
├── src/
│   ├── index.js          # 统一 API 入口
│   ├── http.js           # HTTP 客户端、超时、音频探测
│   ├── crypto.js         # NetEase/QQ/Kuwo 加密工具
│   └── providers/
│       ├── gdstudio.js   # 完整音频兜底源
│       ├── meting.js     # @meting/core 多平台补充
│       ├── unm.js        # @unblockneteasemusic/server 播放兜底
│       ├── kuwo.js       # 酷我音乐
│       ├── kugou.js      # 酷狗音乐
│       ├── migu.js       # 咪咕音乐
│       ├── netease.js    # 网易云音乐
│       └── tencent.js    # QQ音乐
├── demo.js
├── test.js
└── README.md
```

## 注意事项

1. 不承诺 100% 曲库：版权、地区、VIP、接口风控和下线歌曲都会影响结果。
2. 优先正确，不强行成功：无法精确匹配完整音频时返回 `null`。
3. Cookie 可选：提供平台 cookie 可以提高原平台直连成功率。
4. 默认多层兜底：默认启用 `Gdstudio`、`Meting` 和 `UNM`。
5. 音频验证：自动过滤广告、短音频和无效链接。
6. 仅供学习：请遵守各平台的使用条款。

## 与现有项目的集成

本模块设计为独立可用，也可以集成到 xcloud-music-rebuild 项目中：

```javascript
const { MusicAPI } = require('../../../music-api-core/src/index');
```
