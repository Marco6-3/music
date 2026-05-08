# 后端重写说明

当前后端已经按目标架构重写为 Node.js + Express + better-sqlite3，不再依赖 PHP 运行环境。

## 当前运行链路

```text
Electron 主进程
  -> src/server/index.js
  -> Express 本地服务 http://127.0.0.1:41731
  -> better-sqlite3 本地数据库
  -> webroot 前端页面
```

## PHP 对照源码

用户提供的 PHP 后端源码保留在：

```text
php-backend-source/
```

它只作为行为对照和备份，不参与运行。

## Node 后端文件

```text
src/server/index.js      Express 路由、上传、代理、榜单和歌单解析
src/server/database.js   SQLite 初始化、用户/收藏/歌单数据访问、token 和密码处理
```

## 对齐 PHP 的能力

- 账号注册、登录、退出、token 校验
- 注册验证码、邮箱验证、找回密码
- 修改密码
- 头像上传
- 收藏添加、删除、检查、同步
- 歌单创建、添加歌曲、移除歌曲、删除、详情、同步、重命名
- 版本检查
- API 状态检查
- 网易云榜单
- 网易云歌单 ID/链接解析
- 第三方音乐 API 代理和缓存

## 与 PHP 版本的实现差异

- PHP 使用 `password_hash()`，Node 版本使用 `crypto.scryptSync()`。
- PHP 使用自定义 HMAC token，Node 版本也使用 HMAC token，但 secret 独立。
- PHP 邮件函数失败后写日志；Node 版本直接写 `email_log.txt`。
- PHP 依赖服务器扩展 `sqlite3/curl/file_uploads`；Node 版本依赖 npm 包和 Electron 原生模块 rebuild。
- Node 版本不暴露 PHP 源码文件，只把 `webroot` 的前端静态资源和明确 API 路由开放给本地浏览器。

## 数据位置

Electron 中运行时：

```text
%APPDATA%/musiQ/server-data/musiq.db
```

单独运行 `npm run server` 时：

```text
data/musiq.db
```

## 打包说明

`electron-builder` 配置在 `package.json` 的 `build` 字段中。`better-sqlite3` 是原生模块，已通过 `postinstall` 自动执行：

```bash
electron-builder install-app-deps
```

打包命令：

```bash
npm run dist
```
