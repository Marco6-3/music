# musiQ 音乐桌面端

这是一个基于 Electron + Express + SQLite 的 musiQ 音乐桌面客户端项目。项目目标是把原本依赖远端页面和 PHP 后端的桌面应用，整理成一个可以本地运行、继续开发、打包发布的 Windows 桌面应用。

当前版本已经包含：

- Electron 桌面壳和无边框窗口控制。
- 本地 Express 后端，兼容原前端使用的 `php/*.php` 风格接口。
- 本地 SQLite 数据库，用于用户、收藏、歌单和接口状态数据，数据库运行时基于 `sql.js`，不依赖 Node/Electron 原生 ABI。
- 多音源 Provider 架构，支持 `gdstudio`、`unm` 与 `@meting/core` fallback。
- 后端和音源探测脚本，用于快速验证搜索、播放 URL、歌词和封面链路。

## 环境要求

- Windows 10/11
- Node.js
- npm

数据库层不再依赖 `.node` 原生扩展，普通 Node 和 Electron 可以共用同一套后端代码。

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

`src/server/database.js` 是 SQLite 数据层，启动时会自动创建需要的表。

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
| `npm run probe:sources` | 验证音源 Provider 层 |
| `npm run probe:backend` | 验证真实 Express 后端 `/api.php` |
| `npm run dist` | 构建 unpacked Windows 应用目录 |
| `npm run installer` | 构建安装包 |

## 注意事项

- 音乐搜索、播放链接、歌词和封面仍依赖第三方音乐接口或公开平台接口，可用性会受上游影响。
- 数据库层使用 `sql.js`，避免 Node/Electron ABI 不一致导致的原生模块加载失败。
- 当前邮件验证码没有接入 SMTP，会写入本地日志用于开发验证。
- 生产发布前建议替换 token secret，并补充自动化测试。
