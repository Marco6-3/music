# music 后端 API

> 本后端代码通过逆向工程从前端代码还原实现，完全兼容 music 音乐播放器前端。

## 项目结构

```
backend/
├── config.php              # 数据库配置、公共函数、CORS设置
├── php/
│   ├── login.php           # 用户登录
│   ├── logout.php          # 用户登出
│   ├── register.php        # 用户注册
│   ├── register_verification.php  # 发送注册验证码
│   ├── verify_email.php    # 邮箱验证（登录后二次验证）
│   ├── verify_token.php    # Token 验证、自动登录
│   ├── forgot_password.php # 忘记密码（发送验证码/重置密码）
│   ├── change_password.php # 修改密码
│   ├── update_avatar.php   # 上传头像
│   ├── favorite.php        # 收藏操作（添加/删除/检查）
│   ├── get_favorites.php   # 获取用户收藏
│   ├── sync_favorites.php  # 同步收藏到云端
│   ├── playlist.php        # 歌单操作（创建/添加/删除/获取/导入）
│   ├── get_playlists.php   # 获取用户歌单列表
│   ├── get_playlist_id.php # 根据名称获取歌单ID
│   ├── rename_playlist.php # 重命名歌单
│   ├── sync_playlists.php  # 同步歌单到云端
│   ├── toplist.php         # 获取官方榜单
│   ├── get_netease_playlist.php  # 解析网易云歌单（支持链接/ID）
│   └── check_version.php   # 版本检查
├── api_check/
│   ├── check_api.php       # API 状态检测页面（前端iframe用）
│   └── api_doubtful.php    # API 状态数据接口
└── uploads/avatars/        # 头像上传目录
```

## 部署方式

### 环境要求
- PHP >= 7.4（推荐 8.0+）
- 启用 `sqlite3` 扩展（PHP 默认内置）
- 启用 `curl` 扩展（用于获取网易云榜单数据）
- 支持 `file_uploads`（用于头像上传）

### 快速部署

1. 将 `backend/` 目录内所有文件上传到你的 PHP 服务器根目录（或子目录）。
2. 确保 `data/` 和 `uploads/avatars/` 目录有写入权限（代码会自动创建）。
3. 修改 `config.php` 中的 `JWT_SECRET` 为一个随机字符串（生产环境必须修改）。
4. 如需邮件功能真实可用，请在 `config.php` 的 `sendVerificationEmail()` 中配置 SMTP。

### 目录权限
```bash
chmod 755 data uploads uploads/avatars
```

### 邮件配置（可选）
默认情况下，验证码会写入 `data/email_log.txt`，即使服务器无法发邮件也能测试注册流程。
生产环境建议配置真实 SMTP。

## API 说明

### 用户认证
| 接口 | 方法 | 参数 | 说明 |
|------|------|------|------|
| `php/login.php` | POST | username, password, remember | 登录 |
| `php/register.php` | POST | username, email, verification_code, password | 注册 |
| `php/register_verification.php` | POST | email | 发送注册验证码 |
| `php/verify_token.php` | POST | token / user_id | 验证登录态 |
| `php/verify_email.php` | POST | action=send_code/verify, user_id, code, email | 邮箱验证 |
| `php/forgot_password.php` | POST | action=send_code/reset_password, email, code, new_password | 找回密码 |
| `php/change_password.php` | POST | user_id, current_password, new_password | 修改密码 |
| `php/logout.php` | POST | token | 退出登录 |
| `php/update_avatar.php` | POST | user_id, avatar (file) | 上传头像 |

### 收藏管理
| 接口 | 方法 | 参数 | 说明 |
|------|------|------|------|
| `php/favorite.php` | POST | user_id, song_id, source, action=add/remove/check | 收藏操作 |
| `php/get_favorites.php` | POST | user_id | 获取收藏列表 |
| `php/sync_favorites.php` | POST | user_id, favorites (JSON) | 批量同步收藏 |

### 歌单管理
| 接口 | 方法 | 参数 | 说明 |
|------|------|------|------|
| `php/playlist.php` | POST | user_id, action, ... | 歌单CRUD |
| `php/get_playlists.php` | POST | user_id | 获取所有歌单 |
| `php/get_playlist_id.php` | POST | user_id, playlist_name | 获取/创建歌单ID |
| `php/rename_playlist.php` | POST | user_id, old_name, new_name | 重命名歌单 |
| `php/sync_playlists.php` | POST | user_id, playlists (JSON) | 批量同步歌单 |

**playlist.php 支持的 action:**
- `create` - 创建歌单 (name)
- `add_song` - 添加歌曲 (playlist_id, song_id, source, song_title, song_artist, song_cover, album, original_title, original_artist)
- `remove_song` - 移除歌曲 (playlist_id, song_id, source)
- `delete` - 删除歌单 (playlist_id)
- `get` - 获取歌单详情 (playlist_id)
- `update_songs` / `import_songs` - 批量导入/更新歌曲 (playlist_id, songs JSON)

### 音乐数据
| 接口 | 方法 | 参数 | 说明 |
|------|------|------|------|
| `php/toplist.php` | GET | type=soaring/new/original/hot/rap/electronic/euro_america/billboard/beatport/korean/uk | 获取榜单 |
| `php/get_netease_playlist.php` | GET | id=xxx 或 link=xxx | 解析网易云歌单 |
| `php/check_version.php` | GET | t=timestamp | 检查版本更新 |
| `api_check/api_doubtful.php` | GET | - | 获取API源状态 |

## 外部依赖

### 音乐数据接口（可选代理）

音乐搜索、播放链接、封面、歌词等核心音频数据默认直接调用第三方公开 API：
- `https://music-api.gdstudio.xyz/api.php`

如果你希望**所有请求都走自己的服务器**（防止第三方域名变动、可加缓存、可统一日志），后端已自带代理文件 `api.php`，与 GD-Studio 接口格式完全兼容：

```
GET /api.php?types=search&source=netease&name=歌曲名
GET /api.php?types=url&source=netease&id=歌曲ID&br=320
GET /api.php?types=lyric&source=netease&id=歌曲ID
GET /api.php?types=pic&source=netease&id=封面ID&size=300
```

**使用方法**：把前端代码里所有 `https://music-api.gdstudio.xyz/api.php` 替换为你的域名 `/api.php` 即可。

代理自带**缓存机制**：
- 播放链接缓存 1 分钟
- 搜索结果缓存 5 分钟
- 封面缓存 1 天
- 歌词缓存 7 天
- 上游故障时自动返回过期缓存（stale cache）

> 注意：如果你希望**完全不依赖任何第三方**，自建网易云/酷我音乐源，需要逆向各平台的私有加密协议（如网易云的 AES+RSA `weapi`），这超出了本后端项目的范围。

## 安全提示

1. 生产环境务必修改 `config.php` 中的 `JWT_SECRET`。
2. 建议在生产环境启用 HTTPS。
3. 限制 `uploads/` 目录只允许访问图片文件。
4. 如需真实邮件发送，请替换 `sendVerificationEmail()` 为 SMTP 实现。

## 数据库

使用 SQLite，数据库文件自动创建于 `data/music.db`，无需手动配置。
首次访问任意接口时会自动初始化表结构。
