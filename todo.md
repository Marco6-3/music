# music 音源稳定性增强 TODO

> 基于 2026-05 社区 & GitHub 调研，针对 `src/server/source-providers/` 架构的扩展计划。

---

## 现有 Provider 状态总览

| Provider | 类型 | 默认启用 | 已知风险 |
|----------|------|---------|---------|
| GdstudioProvider | 远程聚合 API | Yes | 依赖第三方服务，国内可访问但有速率限制 |
| MetingProvider | 本地 `@meting/core` | Yes | ESM 动态导入失败时静默降级 |
| UnmProvider | 本地 UNM 模块 | Yes | 无 lyric/pic 能力，广告过滤粗糙 |
| UnmExternalProvider | 远程 UNM HTTP | No (禁用) | 需要外部 UNM 服务运行 |
| LrclibProvider | 远程歌词 API | Yes | 仅提供歌词，无搜索/url/封面 |

---

## 已完成项

### [DONE] LRCLIB 歌词 Provider
- **项目**: [lrclib.net](https://lrclib.net/docs)
- **实现**: `src/server/source-providers/lrclib.js`，仅实现 `lyric()` 和 `proxy('lyric')`
- **集成**: 通过 `index.js` + `config.js` 接入 dispatcher，位于链路末尾作为最终歌词兜底
- **测试结果**:
  - 英文歌（Bohemian Rhapsody）✓ synced lyrics 有
  - 中文歌 8/8 全部命中（晴天、七里香、光年之外、起风了、稻香、夜曲、告白气球、平凡之路）✓
  - 无效输入正确返回 null ✓
  - proxy 方法正常工作 ✓
  - Dispatcher fallback 链路正确：`gdstudio -> meting -> lyric-fallback -> lrclib` ✓
- **文件**: `src/server/source-providers/lrclib.js`, `src/server/source-providers/index.js`, `src/config.js`

### [REJECTED] GD Studio 双域名容灾
- **结论**: `.org` 域名的 API 端点（`music.gdstudio.org/api.php`）需要认证，前端实际指向 `.xyz`。`.org` 没有可用的公开 API，双域名 fallback 无效。
- **发现**: `.xyz` 在国内网络可正常访问（GFW 未封），但存在速率限制和部分源（tencent/kugou）返回 400 的问题。

---

## 待实施项

### 1. 启用 Migu 音源
- **现状**: UnmProvider 已加载 migu 模块，但 `config.js` 默认 sources 数组未包含它
- **改动**: 在 `src/config.js` 的 `unm.sources` 中加入 `'migu'`
- **收益**: 咪咕有大量免费高清音源，且版权覆盖较全（中国移动旗下）
- **风险**: 低

### 2. 请求结果缓存层
- **现状**: 每次请求都直接打上游 API，重复查询同一首歌会重复请求
- **改动**: 在 Dispatcher 层添加 LRU 缓存（TTL 5-10 分钟），key = `method:platform:songId`
- **收益**: 减少上游压力、提升响应速度、降低被限流概率
- **风险**: 低，需注意 URL 类结果的缓存时效

### 3. Listen1 API Provider
- **项目**: [listen1/listen1-api](https://github.com/listen1/listen1-api) (203 stars, JS, 维护至 2026-05)
- **类型**: Node.js 统一 API，覆盖网易/QQ/酷狗/酷我/B站/咪咕
- **改动**: 新建 `src/server/source-providers/listen1.js`，引入 listen1-api 的平台模块
- **收益**: 一个 provider 覆盖多个平台，且 API 实现经过 11k star 项目验证
- **风险**: 中，需评估 listen1-api 的模块化程度，可能需要提取部分代码而非直接 npm 引入

### 4. sunzongzheng/musicApi Provider
- **项目**: [sunzongzheng/musicApi](https://github.com/sunzongzheng/musicApi) (424 stars, JS, 维护至 2026-05)
- **类型**: Node.js 聚合 API，支持网易/QQ/酷狗/酷我/虾米/B站
- **改动**: 新建 `src/server/source-providers/musicapi.js`
- **收益**: 独立于 Meting/UNM 的第三条聚合链路，支持 Electron 环境
- **风险**: 中，需检查模块导出方式是否兼容 CJS require

### 5. 咪咕音乐专用 Provider
- **项目**: [jsososo/MiguMusicApi](https://github.com/jsososo/MiguMusicApi) (271 stars, TS, 维护至 2026-05)
- **类型**: Node.js/TypeScript 咪咕音乐 API
- **改动**: 新建 `src/server/source-providers/migu.js`
- **收益**: 咪咕音质好（支持无损/Hi-Res），版权覆盖与三大平台互补
- **风险**: 中

### 6. 酷狗音乐专用 Provider
- **项目**: [KuGouMusicApi](https://github.com/KuGouMusicApi) (690 stars, JS, 维护至 2026-05)
- **类型**: Node.js 酷狗音乐 API
- **改动**: 新建 `src/server/source-providers/kugou-direct.js`
- **收益**: 酷狗曲库量最大（腾讯音乐旗下），直接 API 比通过 UNM 中转更稳定
- **风险**: 中

### 7. QQ 音乐专用 Provider
- **项目**: [Rain120/qq-music-api](https://github.com/Rain120/qq-music-api) (979 stars, TS, 维护至 2026-05)
- **类型**: Koa2 + TypeScript QQ 音乐 API
- **改动**: 提取核心 API 调用逻辑，新建 `src/server/source-providers/qqmusic.js`
- **收益**: QQ 音乐是国内第二大平台，直接 API 比通过 Meting 中转更稳定
- **风险**: 中，需从 Koa2 框架中提取纯函数

### 8. 酷我音乐专用 Provider
- **项目**: [kuwoMusicApi](https://github.com/kuwoMusicApi) (235 stars, TS, 维护至 2026-05)
- **类型**: Node.js/TypeScript 酷我音乐 API
- **改动**: 新建 `src/server/source-providers/kuwo-direct.js`
- **收益**: 酷我有部分独家版权，且 UnmProvider 对 kuwo 有排除逻辑导致 kuwo 来源歌曲需绕道
- **风险**: 中

---

## 架构增强

### [DONE] 9. 自适应 Provider 排序
- **现状**: Dispatcher 按固定顺序 fallback，不感知各 provider 实时健康状态
- **改动**: 参考 GdstudioProvider 的健康追踪机制，在 Dispatcher 层实现全局 provider 健康评分，动态调整 fallback 顺序
- **收益**: 某个 provider 挂掉时自动降到队尾，恢复后自动回升
- **实现**: `dispatcher.js` 添加 `ProviderHealth` 类，score 从 1.0 开始，失败 ×0.5 衰减，成功 +0.1 恢复，连续 3 次失败标记 unhealthy 5 分钟

### [DONE] 10. Race 模式优化
- **现状**: `race` 策略用 `Promise.any`，所有 provider 同时打请求
- **改动**: 添加「优先级 race」——先 race 高优先级 provider（前 2 个），无结果再 race 剩余
- **收益**: 兼顾速度和上游压力控制
- **实现**: `dispatcher.js` 的 `_race()` 分两阶段：先 race `racePriorityCount`(默认2) 个健康 provider，全部失败后再 race 剩余；同时集成健康评分，unhealthy provider 自动跳过

### 11. Meting-API 自部署模式
- **项目**: [metowolf/Meting-API](https://github.com/metowolf/Meting-API) (114 stars, JS)
- **类型**: Docker 化的 Meting API 服务，带 LRU 缓存 + HMAC 认证
- **改动**: 新建 `src/server/source-providers/meting-api.js`，支持连接自部署 Meting-API 实例
- **收益**: 本地部署的 Meting-API 比 `@meting/core` 直接调用更稳定（有缓存、有认证）
- **风险**: 低，需用户自行部署 Docker 容器

### 12. UnmExternalProvider 优化
- **现状**: 默认禁用，硬编码 `127.0.0.1:8080`，无 pic 支持
- **改动**: 支持配置多个外部 UNM 节点，添加健康检查和自动发现
- **收益**: 用户可部署多个 UNM 实例做高可用
- **风险**: 低

---

## 参考项目（不直接集成，用于学习 API 模式）

| 项目 | Stars | 语言 | 参考价值 |
|------|-------|------|---------|
| [MusicFreePlugins](https://github.com/maotoumao/MusicFreePlugins) | 1,705 | TS | 各平台 API 实现参考（AGPL，仅参考） |
| [lx-music-source](https://github.com/pdone/lx-music-source) | 6,382 | JS | 社区维护的多平台音源，API endpoint 参考 |
| [Meting-Agent](https://github.com/ELDment/Meting-Agent) | 85 | JS | MCP server 模式，AI Agent 集成参考 |
| [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) | 30,295 | JS | 网易云 API 最全参考（已 archived） |

---

## 不推荐集成的项目

| 项目 | 原因 |
|------|------|
| Binaryify/NeteaseCloudMusicApi | 2024-04 已 archived，明确声明不再维护 |
| ihmily/music-api | 2025-09 已 archived，PHP only |
| api.uomg.com 等公共 API | 不可靠，随时可能下线 |
| ELDment/Meting-Fixed | PHP only，无法从 Node.js 直接调用 |

---

## 建议实施顺序

```
Phase 1 (已完成):
  [DONE] LRCLIB 歌词 Provider     → lrclib.js, index.js, config.js

Phase 2 (Quick Wins, 1-2 天):
  启用 Migu 音源          → config.js 一行改动
  请求结果缓存层           → dispatcher.js 添加 LRU

Phase 3 (新 Provider, 1-2 周):
  Listen1 API Provider     → 一次覆盖多平台
  咪咕/酷狗/QQ/酷我 专用   → 逐个添加直连 provider

Phase 4 (架构增强, 2-3 周):
  [DONE] 自适应 Provider 排序     → dispatcher.js ProviderHealth
  [DONE] Race 模式优化            → dispatcher.js 优先级 race
  Meting-API 自部署支持
```

---

## 授权兼容性速查

| 项目 | License | 能否直接用代码 | 能否 npm 引入 |
|------|---------|-------------|-------------|
| listen1-api | MIT | Yes | 需评估模块化 |
| musicApi | MIT | Yes | 需评估模块化 |
| KuGouMusicApi | 未确认 | 需确认 | 需确认 |
| kuwoMusicApi | 未确认 | 需确认 | 需确认 |
| MiguMusicApi | 未确认 | 需确认 | 需确认 |
| qq-music-api | 未确认 | 需确认 | 需确认 |
| MusicFreePlugins | AGPL-3.0 | **No** (仅参考) | **No** |
| LRCLIB | 开源 | Yes | 直接 REST 调用 ✓ 已集成 |
| Meting-API | MIT | Yes | 可作为服务调用 |

---

# Windows 11 平台适配审查 & 性能优化

> 审查日期: 2026-05-23
> 审查范围: Electron 主进程、Express 后端、sql.js 数据库、前端渲染、构建打包

---

## 一、Windows 11 平台适配问题

### [中风险] 1. 进程异常退出时数据库可能丢数据

- **文件**: `src/server/database.js`
- **现状**: 没有任何 `process.on('exit')` 或 `process.on('beforeExit')` 处理。如果用户通过任务管理器杀进程、Windows 关机、或应用崩溃，最多丢失 500ms 的未写入数据（`PERSIST_DEBOUNCE_MS = 500`）。
- **修复**: 在 `createDataStore` 中添加:
  ```js
  process.on('exit', () => { this.close(); });
  ```
  `close()` 调用 `flushPersist()` 是同步写盘，可以在 `exit` 事件中执行。

### [中风险] 2. OneDrive 同步导致文件锁定

- **现状**: 项目位于 `C:\Users\mingzhe Liu\OneDrive\Desktop\xcloud-music-rebuild`，`data/`、`node_modules/`、`dist/` 全部在 OneDrive 同步范围内。`.gitignore` 只影响 git，不影响 OneDrive。
- **风险**: OneDrive 同步时锁定 `music.db`，导致 `fs.renameSync` 失败；`npm install` 大量小文件同步导致严重性能下降。
- **修复**: 将项目文件夹添加到 OneDrive 排除列表，或在 README 中明确建议用户将项目克隆到 OneDrive 外的路径（如 `C:\dev\music`）。

### [低风险] 3. `fs.renameSync` 缺少 EBUSY 重试

- **文件**: `src/server/database.js` 第 145-148 行
- **现状**: 原子写入使用 `writeFileSync` + `renameSync`，但没有重试逻辑。Windows Defender 实时扫描可能短暂锁定文件。
- **修复**: 添加 Windows 平台的重试逻辑:
  ```js
  function renameWithRetry(src, dst, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try { fs.renameSync(src, dst); return; }
      catch (e) { if (e.code === 'EBUSY' && i < retries - 1) { /* sleep 50ms */ } else throw; }
    }
  }
  ```

### [低风险] 4. 长路径支持

- **现状**: 项目路径 63 字符 + `node_modules\` 深层依赖容易超过 Windows 260 字符限制。
- **修复**: 在 `.npmrc` 中设置 `cache=C:\dev\.npm-cache` 缩短缓存路径，或建议用户克隆到短路径。

### [低风险] 5. GPU 硬件加速无降级开关

- **文件**: `src/main.js`
- **现状**: 没有 `app.disableHardwareAcceleration()` 或环境变量开关。旧 GPU 驱动可能导致崩溃。
- **修复**: 添加环境变量检测:
  ```js
  if (process.env.MUSIC_DISABLE_GPU) app.disableHardwareAcceleration();
  ```

### [低风险] 6. 睡眠/唤醒无处理

- **文件**: `src/main.js`
- **现状**: 没有使用 Electron `powerMonitor` 检测唤醒事件。唤醒后 HTTP 连接已超时，但版本轮询和健康检查不会立即刷新。
- **修复**: 添加 `powerMonitor.on('resume', ...)` 在唤醒时立即刷新版本检查和 API 健康状态。

### [信息] 7. POSIX 文件权限在 Windows 无效

- **文件**: `src/server/database.js` 第 280 行
- **现状**: `mode: 0o600` 在 Windows 上被忽略，token secret 文件继承父目录 ACL。
- **影响**: 对桌面音乐播放器风险极低，无需修复。

### [信息] 8. 未代码签名

- **文件**: `package.json` 第 38 行 `signAndEditExecutable: false`
- **影响**: 首次运行时 SmartScreen 会弹出 "Windows 已保护你的电脑" 警告。开源项目常见，但降低用户信任度。

### [信息] 9. Windows Defender 性能影响

- **现状**: Express 本地服务器 `127.0.0.1:41731` 的网络请求、sql.js WASM 文件加载可能触发 Defender 实时扫描。
- **建议**: 在安装说明中建议用户将项目目录和 `%APPDATA%\music` 添加到 Defender 排除列表。

---

## 二、性能优化建议

### 启动性能

#### [P0] 10. 启动顺序阻塞 — 先启动后端再显示启动画面

- **文件**: `src/main.js` 第 85-103 行
- **现状**: `createWindows()` 先 `await startLocalBackend()` 完成（含数据库创建、WASM 加载、Express 初始化、HTTP 监听），然后才创建 splash 窗口。
- **优化**: 先显示 splash，再并行启动后端。感知启动时间可减少数百毫秒。

#### [P1] 11. `pruneCacheDir` 同步阻塞启动

- **文件**: `src/server/index.js` 第 54 行
- **现状**: 启动时同步执行 `readdirSync` + `statSync` + `unlinkSync`（最多 800 个文件），阻塞事件循环。
- **优化**: 改用 `fs.promises` 异步执行，或延迟到 server listen 之后再执行。

### 数据库性能

#### [P0] 12. 日志模式使用 DELETE 而非 WAL

- **文件**: `src/server/database.js` 第 22 行
- **现状**: `db.pragma('journal_mode = DELETE')` — 最慢的日志模式。
- **优化**: 改为 `db.pragma('journal_mode = WAL')`，写入性能显著提升。

#### [P2] 13. `flushPersist` 每次导出整个数据库

- **文件**: `src/server/database.js` 第 137-149 行
- **现状**: 每次持久化都 `raw.export()` 导出整个内存数据库为 Buffer，写入临时文件再重命名。
- **优化**: 将 debounce 从 500ms 提升到 2000-3000ms，减少频繁同步场景下的全量导出次数。

#### [P3] 14. `lastInsertRowid()` 额外查询

- **文件**: `src/server/database.js` 第 200-203 行
- **现状**: 每次 `run()` 后执行额外的 `SELECT last_insert_rowid()` 查询。
- **优化**: 合并到 INSERT 语句的返回值中。

#### [P3] 15. 缺少索引

- **文件**: `src/server/database.js` 第 289-347 行
- **现状**: `favorites(user_id)` 没有显式索引用于 `ORDER BY created_at DESC` 查询。`playlist_songs` 的 `ORDER BY` 查询缺少覆盖索引。
- **优化**: 添加 `CREATE INDEX idx_favorites_user ON favorites(user_id, created_at DESC)`。

### API / 网络

#### [P1] 16. 缓存清理频率过高

- **文件**: `src/server/index.js` 第 925 行
- **现状**: 每次缓存写入后都调用 `pruneCacheDir`，对 800+ 文件执行 `readdirSync` + `statSync`。O(n) I/O 在每个 API 响应后触发。
- **优化**: 改为每 50 次写入清理一次，或使用定时器（如每 10 分钟）。

#### [P1] 17. axios 无 HTTP keep-alive

- **文件**: `gdstudio.js`、`meting.js`、`unm-external.js`、`lrclib.js`
- **现状**: 所有 provider 使用 `axios.get()` 无自定义 HTTP agent，每次请求都建立新 TCP 连接。一首歌播放需要 4 次 TCP 握手。
- **优化**: 创建共享 `https.Agent({ keepAlive: true })` 传入 axios 实例。

#### [P2] 18. 文件缓存无内存层

- **文件**: `src/server/index.js` 第 910-914 行
- **现状**: 每次缓存命中检查执行 `existsSync` + `statSync` + `readFileSync` — 三次同步文件系统操作。
- **优化**: 在文件缓存前加一层内存 LRU 缓存（如 200 条），消除热点路径的磁盘 I/O。

#### [P2] 19. 无请求去重

- **文件**: `src/server/index.js` 第 904-964 行
- **现状**: 快速双击播放同一首歌，两个请求都会向上游 API 发起调用。
- **优化**: 添加 in-flight 请求 Map，相同请求复用同一个 Promise。

#### [P3] 20. 限速器 Map 不清理

- **文件**: `src/server/index.js` 第 189-211 行
- **现状**: `createRateLimiter` 的 Map 只增不减，过期条目永不清理。
- **优化**: 访问时检查并删除过期条目，或定期清理。

### 前端渲染

#### [P1] 21. `isFavorite` 线性扫描

- **文件**: `webroot/js/main.js` 第 1729 行
- **现状**: 每首歌卡片渲染时调用 `state.favorites.some()` 线性查找。30 首搜索结果 x 100 收藏 = 3000 次字符串比较。
- **优化**: 维护一个 `Set<string>` 存储 `source:id` 键，O(1) 查找。

#### [P2] 22. DOM 全量 innerHTML 替换

- **文件**: `webroot/js/main.js` — `renderHome`(368)、`renderSearch`(451)、`renderFavorites`(465)、`renderPlaylists`(488)、`renderQueue`(1145)
- **现状**: 每次视图切换都用 `innerHTML` 替换整个内容，销毁所有 DOM 节点和事件监听器。
- **优化**: 对频繁切换的视图（如队列、播放状态）考虑局部 DOM 更新。

#### [P2] 23. 歌曲数据存入 DOM 属性

- **文件**: `webroot/js/main.js` 第 560、1782-1798 行
- **现状**: 每张歌曲卡片用 `data-song` 存储完整 JSON 编码数据。30 首歌 = 30 个 URL 编码 JSON 字符串在 DOM 中。
- **优化**: 使用 `Map<element, songData>` 或索引引用，避免反复 `encodeURIComponent` / `JSON.parse`。

#### [P2] 24. `updateCoverTheme` 每次创建新 Canvas

- **文件**: `webroot/js/main.js` 第 1568-1604 行
- **现状**: 每次切歌都创建新的 `Image` + `<canvas>`，绘制、读取像素、计算颜色后丢弃。
- **优化**: 复用单个离屏 canvas 和 image 元素。

#### [P2] 25. `timeupdate` 事件过频

- **文件**: `webroot/js/main.js` 第 191、1230-1237 行
- **现状**: `timeupdate` 每秒触发约 4 次，每次更新 3 个 DOM 元素 + 遍历歌词行切换 CSS 类。
- **优化**: 节流到每秒 2 次；缓存当前活跃歌词行引用，避免每次全量遍历。

### 内存泄漏

#### [P2] 26. `syntheticSongs` Map 无上限

- **文件**: `src/server/source-providers/unm.js` 第 65 行
- **现状**: 搜索结果带直链的歌曲存入 Map，永不清理。长会话下持续增长。
- **优化**: 添加 LRU 淘汰（最大 500 条）或 TTL 过期。

#### [P2] 27. `coverCache` Map 无上限

- **文件**: `webroot/js/main.js` 第 55 行
- **现状**: 浏览数百首歌曲后可能积累数千条缓存。
- **优化**: LRU 淘汰（最大 200 条）。

#### [P3] 28. `sourceHealth` Map 无上限

- **文件**: `src/server/source-providers/gdstudio.js` 第 17 行
- **现状**: 每个 `source:type` 组合永久存储。
- **优化**: 使用固定大小 Map 或定期清理。

#### [P3] 29. `versionTimer` 未 unref

- **文件**: `src/main.js` 第 280-284 行
- **现状**: 版本轮询 `setInterval` 没有 `.unref()`，通过托盘退出时可能阻止进程退出。
- **优化**: 添加 `versionTimer.unref()` 或在 `will-quit` 事件中清理。

### 构建打包

#### [P2] 30. webroot 重复打包

- **文件**: `package.json` 第 26-36 行
- **现状**: `webroot` 同时出现在 `files`（ASAR 内）和 `extraResources`（ASAR 外），磁盘占用翻倍。
- **优化**: 移除 `files` 中的 `webroot/**/*`，只保留 `extraResources`。

#### [P3] 31. PHP 文件打入生产包

- **现状**: `webroot/php/` 和 `webroot/api_check/` 中的 PHP 文件从未被 Express 后端使用。
- **优化**: 从构建配置中排除。

#### [P3] 32. CommonJS 无法 tree-shake

- **现状**: 所有模块使用 `require()` / `module.exports`，`axios` 单独约 400KB。
- **优化**: 对热点模块考虑 ESM 迁移或按需加载。

---

## 三、已确认无问题的部分

以下方面在 Windows 11 上适配良好，无需修改:

- 所有路径构造使用 `path.join()` / `path.resolve()`，无硬编码路径
- `app.getPath('userData')` 正确解析为 `%APPDATA%\music`
- sql.js WASM 跨平台兼容，不依赖原生编译
- 单实例锁通过 Windows mutex 正确工作
- 托盘图标仅 Windows 创建，16x16 尺寸正确
- 窗口控件使用 Segoe UI Symbol 和原生关闭按钮颜色 `#e81123`
- Express 仅绑定 `127.0.0.1`，不会触发防火墙弹窗
- `start-music.cmd` 编写规范，正确处理路径空格和错误码
- electron-builder 配置了 portable + nsis x64 双格式
- 数据目录创建使用 `{ recursive: true }`
- 文件锁使用 `wx` 标志，Windows 兼容
- `windowStateTimer` 和 `api-monitor` 定时器正确 `.unref()`

---

## 四、优先级汇总

| 优先级 | 编号 | 类别 | 简述 |
|--------|------|------|------|
| **P0** | #1 | 系统 | 进程退出时数据库 flush 保护 |
| **P0** | #10 | 启动 | splash 先显示再启动后端 |
| **P0** | #12 | 数据库 | journal_mode 改 WAL |
| **P1** | #11 | 启动 | pruneCacheDir 异步化 |
| **P1** | #16 | API | 缓存清理降频 |
| **P1** | #17 | API | axios keep-alive |
| **P1** | #21 | 前端 | isFavorite 用 Set 替代线性扫描 |
| **P1** | #2 | 系统 | OneDrive 同步风险 |
| **P2** | #3 | 系统 | renameSync EBUSY 重试 |
| **P2** | #13 | 数据库 | flushPersist debounce 加长 |
| **P2** | #18 | API | 文件缓存加内存层 |
| **P2** | #19 | API | 请求去重 |
| **P2** | #22-25 | 前端 | DOM/Canvas/事件优化 |
| **P2** | #26-28 | 内存 | Map 无上限问题 |
| **P2** | #30 | 构建 | webroot 去重打包 |
| **P3** | #4-6,14-15,20,29,31-32 | 其他 | 低优先改进项 |
