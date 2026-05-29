# music 音乐桌面端

这是一个基于 Electron + Express + `sql.js` WASM SQLite 的 music 音乐桌面客户端项目。项目目标是把原本依赖远端页面和 PHP 后端的桌面应用，整理成一个可以本地运行、继续开发、打包发布的 Windows 桌面应用。

当前版本已经包含：

- Electron 桌面壳和无边框窗口控制。
- 本地 Express 后端，兼容原前端使用的 `php/*.php` 风格接口。
- 本地 SQLite 数据库，用于用户、收藏、歌单和接口状态数据，数据库运行时基于 `sql.js`，不依赖 Node/Electron 原生 ABI。
- 多音源 Provider 架构，支持 `gdstudio`、`unm` 与 `@meting/core` fallback。
- 音源诊断面板，可查看 provider 健康状态、最近一次 `X-Music-Source` 和 `X-Cache`。
- 登录后的播放历史首页模块，包含最近播放和本周常听。
- Windows 窗口状态恢复、托盘入口和 resize 期间的轻量视觉降级。
- 后端和音源探测脚本，用于快速验证搜索、播放 URL、歌词和封面链路。

## 环境要求

- Windows 10/11
- Node.js
- npm

数据库层不再依赖 `.node` 原生扩展，普通 Node 和 Electron 可以共用同一套后端代码。
普通单条写入会先进入短 debounce 写盘队列；事务 `COMMIT` 和应用关闭会立即 flush，降低 `sql.js` 每次写入都导出整库的开销。

## 安装依赖

```powershell
npm install
```

当前依赖不需要 Electron 原生模块重建。

## 启动应用

桌面端启动：

```powershell
npm start
```

也可以双击项目根目录下的：

```text
start-music.cmd
```

只启动内置后端：

```powershell
npm run server
```

`npm run server` 会直接使用普通 Node 启动 `src/server/index.js`。

## iPhone Web / PWA 使用说明

music 现在可以作为 iPhone Safari / 主屏幕 PWA 使用。Web 版仍然复用同一套 Express 后端和 `webroot/` 前端，搜索、播放、换源、歌词、收藏、歌单、播放历史、离线音频缓存策略和音源健康检测都通过后端接口保留，不把 `sql.js` 数据库放进浏览器。

本地预览：

```powershell
npm run web:start
```

默认仍监听：

```text
http://127.0.0.1:41731/
```

iPhone 真机不能访问你电脑里的 Electron `127.0.0.1`。要在 iPhone 上使用，请把 Express 服务部署到 HTTPS 域名，推荐同源部署：同一个 HTTPS origin 同时提供 `webroot/`、`/api.php`、`/php/*`、`/api_check/*`、`/offline/audio/*` 和 `/uploads/*`。

当前 PWA manifest 和 Service Worker 按站点根路径 `/` 设计，生产部署优先使用独立域名或根路径；子路径部署需要额外调整 `start_url`、`scope` 和静态资源路径。

如果需要让后端在局域网或反向代理后监听非默认地址，可以设置：

```powershell
$env:MUSIC_HOST="0.0.0.0"
$env:MUSIC_PORT="41731"
$env:MUSIC_DATA_DIR="D:\music-data"
npm run web:start
```

跨域前后端分离不是默认推荐路径。如果必须跨域，前端可以在 `webroot/index.html` 的 `window.__MUSIC_CONFIG__` 或 `music-api-base-url` meta 中配置 HTTPS API base URL；后端需要显式配置 CORS，例如：

```powershell
$env:MUSIC_CORS_ORIGIN="https://你的前端域名"
```

浏览器端只保存 token、用户 ID、播放队列、音量和轻量 UI 状态。不要在浏览器配置里暴露服务端密钥。

### 添加到 iPhone 主屏幕

1. 用 HTTPS URL 在 iPhone Safari 打开 music。
2. 点击分享按钮，选择“添加到主屏幕”。
3. 从主屏幕图标打开，确认没有 Safari 地址栏或底部工具栏。
4. 检查顶部状态栏、刘海区域和 Home Indicator 没有遮挡 UI。
5. 搜索歌曲、播放歌曲、切换音源，打开歌词、队列、登录、歌单和源状态面板。
6. 播放后切后台或锁屏，观察系统是否显示歌曲信息和播放/暂停/上一首/下一首控制；这些能力由 iOS Safari 的 Media Session 支持情况决定。
7. 打开弹窗和播放器面板，确认 bottom sheet 可以滚动，页面背景不滚动穿透。
8. 断网后重新打开，确认能看到已缓存应用壳或友好离线提示。
9. 网络恢复后刷新或继续使用。
10. 至少确认竖屏稳定；横屏不是当前 PWA 的主要布局目标。

### Web/PWA 能力边界

- Service Worker 只缓存应用外壳、静态 CSS/JS、manifest 和默认图片，不缓存音乐直链、第三方音源 API 或带临时 token 的响应。
- 搜索、播放、换源、歌词、收藏、歌单、播放历史和源状态都需要可访问的后端和网络。
- iOS 自动播放受浏览器限制，首次播放必须来自用户点按；如果 Safari 丢失用户手势，界面会提示再次点按播放。
- 后台播放、锁屏信息和控制中心按钮受 iOS / Safari 版本和系统策略限制，代码只做 feature detection，不承诺所有设备一致可用。
- 主屏幕 PWA 和 Service Worker 需要 HTTPS；`localhost` 仅适合桌面开发。

## 验证音源

运行确定性的单元测试：

```powershell
npm test
```

当前测试覆盖 `sql.js` debounce 写盘、关闭强制 flush 和事务提交立即落盘。

验证音源 Provider 层：

```powershell
npm run probe:sources -- "周杰伦 晴天"
```

验证真实 Express 后端 `/api.php`：

```powershell
npm run probe:backend -- "周杰伦 晴天"
```

强制关闭 `gdstudio`，验证是否可以 fallback 到 UNM / Meting：

```powershell
npm run probe:backend -- --disable-gdstudio "周杰伦 晴天"
npm run probe:sources -- --disable-gdstudio "周杰伦 晴天"
```

## 打包

生成 unpacked Windows 目录：

```powershell
npm run dist
```

输出目录：

```text
dist/win-unpacked/
```

发布时不要只发送单独的 `.exe`。Electron 应用依赖同目录下的运行时文件，稳定发布边界是整个 `dist/win-unpacked/` 目录。

生成安装包：

```powershell
npm run installer
```

安装包构建可能需要从 GitHub 下载 NSIS 等资源，网络不稳定时建议优先使用 `dist/win-unpacked/`。

打包后可以运行 Electron QA：

```powershell
npm run qa:electron
```

该脚本会启动 `dist/win-unpacked/music.exe` 并做基础渲染、搜索、性能和控制台错误检查，因此需要先完成 `npm run dist`。

## 工程结构

```text
music/
├─ package.json
├─ package-lock.json
├─ README.md
├─ start-music.cmd
├─ scripts/
│  ├─ probe-backend.js
│  ├─ probe-music-sources.js
│  ├─ qa-electron.js
│  └─ run-server.js
├─ src/
│  ├─ main.js
│  ├─ preload.js
│  ├─ config.js
│  ├─ splash.html
│  ├─ renderer/
│  └─ server/
│     ├─ index.js
│     ├─ database.js
│     └─ source-providers/
├─ webroot/
├─ tests/
├─ php-backend-source/
└─ forensics/
```

## 后端说明

`src/server/index.js` 是内置 Express 后端，主要负责：

- 托管 `webroot/` 前端资源。
- 提供账号、收藏、歌单、榜单、版本检查等接口。
- 代理 `/api.php` 音乐接口。
- 缓存音乐 API 返回结果。
- 对 QQ 音乐榜单做可播放歌曲解析。

`src/server/database.js` 是 SQLite 数据层，启动时会自动创建需要的表。普通非事务写入会 debounce 后写盘；事务提交和 `close()` 会立即写盘，避免播放历史、接口状态等高频写入反复导出整个 `sql.js` 数据库。

## 前端功能

- 窗口 resize 时会临时关闭重型玻璃模糊、封面光晕、歌词 mask 和大阴影，resize 停止后恢复原视觉效果。
- “源状态”按钮会打开音源诊断面板，展示 provider 搜索/播放状态、`last_check`、最近一次 `X-Music-Source` 和 `X-Cache`。
- 登录后首页会显示“最近播放”和“本周常听”；播放成功后会异步记录历史，记录失败不会影响播放。
- 桌面端默认保留 Chromium cache 以改善冷启动，手动重载或版本变化时仍会 hard reload。
- Windows 桌面端会保存并恢复窗口位置、大小和最大化状态，并提供托盘菜单用于显示、重载和退出。

## 音源架构

音源实现位于：

```text
src/server/source-providers/
```

当前包含：

- `gdstudio`：第三方聚合音乐 API。
- `unm`：基于 `@unblockneteasemusic/server` 的多音源 URL fallback。
- `meting`：基于 `@meting/core` 的本地多平台解析 Provider。
- `dispatcher`：按配置进行 fallback 或 race 调度。

配置位于 `src/config.js` 的 `musicSources` 字段。

`/api.php` 响应头会返回实际命中的音源：

```text
X-Music-Source: gdstudio
X-Music-Source: unm
X-Music-Source: meting
```

## 数据位置

Electron 桌面端运行时，用户数据保存在：

```text
%APPDATA%/music/server-data/
```

单独运行后端时，默认使用项目内的：

```text
data/
```

`data/` 已在 `.gitignore` 中忽略，不会提交到仓库。

## 主要脚本

| 命令 | 说明 |
|---|---|
| `npm start` | 启动 Electron 桌面应用 |
| `npm run server` | 使用普通 Node 启动本地后端 |
| `npm run web:start` | 使用普通 Node 托管 Web/PWA 版和后端接口 |
| `npm run test:pwa` | 静态检查 manifest、Apple meta、Service Worker 和 PWA hooks |
| `npm test` | 运行 `node:test` 单元测试 |
| `npm run probe:sources` | 验证音源 Provider 层 |
| `npm run probe:backend` | 验证真实 Express 后端 `/api.php` |
| `npm run dist` | 构建 unpacked Windows 应用目录 |
| `npm run qa:electron` | 对已打包的 `dist/win-unpacked/music.exe` 做基础 QA |
| `npm run installer` | 构建安装包 |

## 完整验证流程

```powershell
npm test
node -c src/main.js
node -c src/preload.js
node -c src/renderer/desktop-shell.js
node -c src/server/index.js
node -c src/server/database.js
node -c webroot/js/main.js
node -c webroot/js/source-selector.js
node -c webroot/sw.js
npm run test:pwa
npm run probe:backend -- "周杰伦 晴天"
npm run probe:sources -- "周杰伦 晴天"
npm run dist
npm run qa:electron
```

`probe:sources` 目前主要以搜索是否成功作为失败边界，播放 URL、歌词和封面异常会在输出里标记，需要人工一起查看。

## 注意事项

- 音乐搜索、播放链接、歌词和封面仍依赖第三方音乐接口或公开平台接口，可用性会受上游影响。
- 数据库层使用 `sql.js`，避免 Node/Electron ABI 不一致导致的原生模块加载失败。
- 当前邮件验证码没有接入 SMTP，会写入本地日志用于开发验证。
- 生产发布前建议替换 token secret，并补充自动化测试。
