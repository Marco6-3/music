# XCloud音乐桌面客户端

这是一个双击即可运行的 XCloud 音乐桌面应用。它把公开前端页面、用户后端、SQLite 数据库和音乐 API 代理一起打包进 Electron，不需要额外部署 PHP 服务器。

## 一键启动

双击本目录下的 `start-xcloud-music.cmd`。

首次启动会自动安装依赖。`better-sqlite3` 是 Electron 原生模块，安装后会通过 `electron-builder install-app-deps` 自动按当前 Electron 版本重编译。

也可以在终端运行：

```bash
npm install
npm start
```

只启动内置后端：

```bash
npm run server
```

打包 Windows 应用：

```bash
npm run dist
```

构建结果会输出到：

```text
dist/win-unpacked/XCloud音乐.exe
```

这个 `.exe` 可以直接双击运行，但要和 `dist/win-unpacked/` 目录内的运行时文件保持在一起。

如果需要生成 NSIS 安装包或单文件便携包，可以运行：

```bash
npm run installer
```

注意：安装包/单文件便携包需要 electron-builder 下载 NSIS 资源；当前网络环境曾出现 GitHub 下载 EOF，默认 `dist` 因此使用更稳定的 unpacked 输出。

## 技术选型

| 层级 | 技术 | 说明 |
|---|---|---|
| 桌面壳 | Electron | 用 Chromium 渲染前端，Node.js 负责本地后端和系统能力 |
| 后端 | Node.js + Express | 将 PHP 后端逻辑重写为 JavaScript，随桌面应用内置启动 |
| 数据库 | better-sqlite3 | 嵌入式 SQLite，数据保存在用户本地目录 |
| 文件上传 | multer | 处理头像上传 |
| HTTP 请求 | axios | 请求网易云榜单、网易云歌单和第三方音乐 API |
| 打包 | electron-builder | 打包为 Windows `.exe` 便携版或安装包 |

## 工程结构

```text
xcloud-music-rebuild/
├─ package.json
├─ start-xcloud-music.cmd
├─ README.md
├─ ALL_SOURCE.md
├─ webroot/
│  ├─ index.html
│  ├─ css/
│  ├─ js/
│  └─ public/
├─ php-backend-source/
│  └─ ... 原 PHP 后端源码备份
├─ forensics/
│  └─ public-snapshot/
├─ scripts/
│  └─ export-source.js
└─ src/
   ├─ main.js
   ├─ preload.js
   ├─ config.js
   ├─ splash.html
   ├─ renderer/
   │  └─ desktop-shell.js
   └─ server/
      ├─ index.js
      └─ database.js
```

## 运行方式

`src/main.js` 是 Electron 主进程：

- 启动单实例锁。
- 启动内置 Express 后端。
- 创建启动页和主窗口。
- 加载 `http://127.0.0.1:41731/?from=xcloudapp`。
- 注入无边框窗口控制能力。

`src/server/index.js` 是内置后端：

- 服务 `webroot/index.html`、`css/`、`js/`、`public/`。
- 不暴露 PHP 源码文件。
- 提供原前端使用的 `php/*.php` 风格接口。
- 代理 `/api.php` 到 `https://music-api.gdstudio.xyz/api.php`，并缓存结果。
- 通过 axios 获取网易云榜单和歌单。

`src/server/database.js` 是 SQLite 数据层：

- 自动创建 `users`、`favorites`、`playlists`、`playlist_songs`、`api_status` 表。
- 使用 `better-sqlite3` 同步读写本地数据库。
- 使用 scrypt 哈希保存密码。
- 使用 HMAC token 保存登录态。
- 生成随机 6 位验证码，10 分钟过期。

## 数据位置

通过 Electron 启动时，数据库和上传文件保存在：

```text
%APPDATA%/XCloud音乐/server-data/
```

其中：

- `xcloud_music.db`：SQLite 数据库
- `uploads/avatars/`：头像上传文件
- `cache/`：音乐 API 缓存
- `email_log.txt`：本地验证码日志

通过 `npm run server` 单独启动时，默认使用项目内 `data/` 目录。

## 已实现接口

账号：

- `POST /php/register_verification.php`
- `POST /php/register.php`
- `POST /php/login.php`
- `POST /php/logout.php`
- `POST /php/verify_token.php`
- `POST /php/verify_email.php`
- `POST /php/forgot_password.php`
- `POST /php/change_password.php`
- `POST /php/update_avatar.php`

收藏：

- `POST /php/favorite.php`
- `POST /php/get_favorites.php`
- `POST /php/sync_favorites.php`

歌单：

- `POST /php/playlist.php`
- `POST /php/get_playlists.php`
- `POST /php/get_playlist_id.php`
- `POST /php/rename_playlist.php`
- `POST /php/sync_playlists.php`

内容和状态：

- `GET /php/check_version.php`
- `GET /php/toplist.php`
- `GET /php/get_netease_playlist.php`
- `GET /api.php`
- `GET /api_check/check_api.php`
- `GET /api_check/api_doubtful.php`

## PHP 源码

你提供的 PHP 后端源码保留在 `php-backend-source/`，用于对照和后续迁移参考。当前运行时不再依赖 PHP，也不会启动 PHP 内置服务器。

## 注意事项

- 当前音乐搜索、播放 URL、歌词和封面仍依赖第三方音乐 API，上游不可用时会返回缓存或错误。
- 邮件没有接入 SMTP，验证码会写入本地 `email_log.txt`。
- `better-sqlite3` 是原生模块，换 Electron 版本后需要重新执行 `npm install` 或 `npx electron-builder install-app-deps`。
- 生产发布前建议替换 token secret，并补充自动化测试。

## 源码汇总

运行：

```bash
npm run export-source
```

会重新生成 `ALL_SOURCE.md`。
