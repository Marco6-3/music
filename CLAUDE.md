# CLAUDE.md

This file gives Claude Code repository-specific guidance for this project.

## Project Overview

`musiQ` is a Windows desktop music player rebuilt with Electron, an Express 5 local backend, and a static frontend under `webroot/`.

The current backend runs locally and can be started with plain Node. Do not reintroduce the old Electron Node wrapper or native SQLite dependency path.

## Commands

```powershell
npm start
npm run dev
npm run server
npm test
npm run probe:sources
npm run probe:backend
npm run qa:electron
npm run dist
npm run build
npm run pack
npm run installer
```

Fallback testing flags:

```powershell
npm run probe:sources -- --disable-gdstudio
npm run probe:sources -- --disable-unm
npm run probe:sources -- --disable-meting
```

## Architecture

### Electron

- `src/main.js`: Electron main process, window lifecycle, splash screen, backend startup, version polling, window-state persistence, tray entry, cache-aware reload.
- `src/preload.js`: exposes safe renderer APIs through `contextBridge`.
- `src/renderer/desktop-shell.js`: frameless window controls and desktop-specific UI behavior.

### Backend

- `src/server/index.js`: Express backend. It serves `webroot/`, implements PHP-compatible routes, and proxies music API requests.
- `src/server/database.js`: persistent SQLite-like storage using `sql.js` WASM. Non-transaction writes are debounced, while transaction commits and close flush immediately. This avoids native module and Electron ABI problems.
- `src/server/api-monitor.js`: periodic music source health checks, writing to `api_status`.
- `src/server/play-history.js`: `/php/play_history.php` route for record, recent, top, and clear actions.

### Music Providers

Provider code lives in `src/server/source-providers/`.

- `base.js`: provider interface.
- `dispatcher.js`: fallback or race dispatch strategy.
- `gdstudio.js`: `music-api.gdstudio.xyz` provider.
- `meting.js`: `@meting/core` multi-platform provider.
- `unm.js`: local UNM resolver using `@unblockneteasemusic/server`.
- `lyric-fallback.js`: wraps UNM with Meting lyric and cover fallback.
- `unm-external.js`: optional external UNM service provider, disabled by default.
- `index.js`: `createDefaultDispatcher()` factory from `src/config.js`.

### Frontend

- `webroot/index.html`: app shell.
- `webroot/js/main.js`: main player UI and API client.
- `webroot/js/source-selector.js`: source selector UI layered over the native source select.
- `tests/database-persistence.test.js`: `node:test` coverage for `sql.js` persist behavior.

## Database

The project uses `sql.js`, not `better-sqlite3`.

Data locations:

- Desktop mode: `%APPDATA%/musiQ/server-data/`
- Standalone backend: `data/` in the repo, ignored by git

Tables are created automatically. Core tables include `users`, `favorites`, `playlists`, `playlist_songs`, `api_status`, and `play_history`.

## Important Notes

- `npm run server` uses plain Node and should work without Electron.
- `scripts/electron-node.js` was removed and should not be restored.
- `start-musiq.cmd` is the Windows one-click startup script and installs dependencies on first launch.
- Verification codes are written to `<dataDir>/email_log.txt`; SMTP is not implemented.
- `.claude/` is a local Claude Code worktree/cache directory and must not be committed.
- If architecture, commands, database technology, or provider behavior changes, update both `CLAUDE.md` and `AGENTS.md`.

## Review Checklist

Before merging Claude worktree changes:

```powershell
npm run probe:backend
npm run probe:sources
```

If a worktree is based on older code that mentions `better-sqlite3`, Electron ABI rebuilds, or `scripts/electron-node.js`, migrate the feature into the current `sql.js` architecture instead of directly accepting the old runtime path.
