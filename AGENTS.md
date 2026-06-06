# AGENTS.md

## Writing Rules

- Write `README` and `README.md` in Simplified Chinese by default.
- Use English for README files only when the user explicitly asks for English in the current conversation.
- Do not fabricate progress, test results, runtime results, or capability boundaries. Say clearly when something is unverified.

## Current Project State

- Project name: `music`.
- Platform: Windows desktop music player.
- Stack: Electron + Express 5 + static frontend/PWA under `webroot/`.
- Local backend default port: `41731`.
- The backend can run with plain Node. It does not need the old Electron Node wrapper.
- Database: `sql.js` WASM SQLite. Do not restore `better-sqlite3`, native SQLite rebuilds, or Electron ABI workarounds.
- Web/PWA mode must use HTTPS deployment for iPhone; keep Electron APIs behind feature detection and out of browser-only paths.

## Cloud Server Notes

- Cloud-server details for this workstation are local-only and must not be pushed to GitHub.
- Put hostnames, usernames, SSH ports, deployment paths, sudo passwords, API tokens, and any other sensitive values in `AGENTS.local.md`.
- `AGENTS.local.md` is intentionally ignored by git. Read it only when a task explicitly requires deployment or server access.
- Do not paste secrets from `AGENTS.local.md` into commits, pull requests, issue comments, logs, screenshots, or chat summaries.
- If deployment instructions change but do not include secrets, document the reusable procedure here and keep the secret values in `AGENTS.local.md`.

## Common Commands

```powershell
npm start
npm run dev
npm run server
npm run web:start
npm test
npm run test:pwa
npm run probe:sources
npm run probe:backend
npm run qa:electron
npm run dist
```

Fallback testing flags:

```powershell
npm run probe:sources -- --disable-gdstudio
npm run probe:sources -- --disable-unm
npm run probe:sources -- --disable-meting
npm run probe:sources -- --disable-lrclib
```

## Architecture Notes

- `src/main.js`: Electron main process, window lifecycle, backend startup, window-state persistence, tray entry, cache-aware reload.
- `src/server/index.js`: Express backend, static frontend serving, PHP-compatible routes, music API proxy.
- `src/server/database.js`: persistent `sql.js` database wrapper with debounced non-transaction writes and immediate transaction/close flush.
- `src/server/offline-cache.js`: playlist-driven offline audio cache. Songs in any local playlist are downloaded in the background at the highest requested quality (`br=999`); removing them from all playlists deletes the local audio file.
- `src/server/source-providers/`: music provider implementations and dispatcher.
- `src/server/source-providers/lrclib.js`: lyrics-only LRCLIB fallback provider; it needs song name/artist metadata and is not a search or playback URL source.
- `src/server/api-monitor.js`: provider health checks, writes `api_status`.
- `src/server/play-history.js`: `/php/play_history.php` play-history routes.
- `webroot/js/source-selector.js`: source selector UI.
- `webroot/js/pwa.js`: PWA registration, standalone detection, install/update/network prompts.
- `webroot/sw.js`: Service Worker app shell cache; do not cache music audio URLs or third-party music API responses.
- `webroot/manifest.webmanifest`: iPhone/standalone PWA metadata.
- `tests/database-persistence.test.js`: `node:test` coverage for `sql.js` persist behavior.
- `start-music.cmd`: Windows one-click startup script with first-run dependency install.

## Change Rules

- Do not commit `.claude/`; it is Claude Code local worktree/cache state.
- If runtime architecture, startup commands, database technology, or provider structure changes, update both `AGENTS.md` and `CLAUDE.md` in the same change.
- Before merging Claude worktree changes, run:

```powershell
npm run probe:backend
npm run probe:sources
```

- If a worktree is based on older architecture and mentions `better-sqlite3` or `scripts/electron-node.js`, migrate the feature into the current `sql.js` architecture instead of accepting the old runtime path directly.
