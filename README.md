# musiQ 音乐桌面端

这是一个基于 Electron + Express + `sql.js` WASM SQLite 的 musiQ 音乐桌面客户端项目。项目目标是把原本依赖远端页面和 PHP 后端的桌面应用，整理成一个可以本地运行、继续开发、打包发布的 Windows 桌面应用。

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
start-musiq.cmd
```

只启动内置后端：

```powershell
npm run server
```

`npm run server` 会直接使用普通 Node 启动 `src/server/index.js`。

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

该脚本会启动 `dist/win-unpacked/musiQ.exe` 并做基础渲染、搜索、性能和控制台错误检查，因此需要先完成 `npm run dist`。

## 工程结构

```text
musiq/
├─ package.json
├─ package-lock.json
├─ README.md
├─ start-musiq.cmd
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
%APPDATA%/musiQ/server-data/
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
| `npm test` | 运行 `node:test` 单元测试 |
| `npm run probe:sources` | 验证音源 Provider 层 |
| `npm run probe:backend` | 验证真实 Express 后端 `/api.php` |
| `npm run dist` | 构建 unpacked Windows 应用目录 |
| `npm run qa:electron` | 对已打包的 `dist/win-unpacked/musiQ.exe` 做基础 QA |
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
