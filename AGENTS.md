# AGENTS.md

## Writing Rules

- Write `README` and `README.md` in Simplified Chinese by default.
- Use English for README files only when the user explicitly asks for English in the current conversation.
- Do not fabricate progress, test results, runtime results, or capability boundaries. Say clearly when something is unverified.

## Current Project State

- Project name: `musiQ`.
- Platform: Windows desktop music player.
- Stack: Electron + Express 5 + static frontend under `webroot/`.
- Local backend default port: `41731`.
- The backend can run with plain Node. It does not need the old Electron Node wrapper.
- Database: `sql.js` WASM SQLite. Do not restore `better-sqlite3`, native SQLite rebuilds, or Electron ABI workarounds.

## Common Commands

```powershell
npm start
npm run dev
npm run server
npm test
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
```

## Architecture Notes

- `src/main.js`: Electron main process, window lifecycle, backend startup, window-state persistence, tray entry, cache-aware reload.
- `src/server/index.js`: Express backend, static frontend serving, PHP-compatible routes, music API proxy.
- `src/server/database.js`: persistent `sql.js` database wrapper with debounced non-transaction writes and immediate transaction/close flush.
- `src/server/source-providers/`: music provider implementations and dispatcher.
- `src/server/api-monitor.js`: provider health checks, writes `api_status`.
- `src/server/play-history.js`: `/php/play_history.php` play-history routes.
- `webroot/js/source-selector.js`: source selector UI.
- `tests/database-persistence.test.js`: `node:test` coverage for `sql.js` persist behavior.
- `start-musiq.cmd`: Windows one-click startup script with first-run dependency install.

## Change Rules

- Do not commit `.claude/`; it is Claude Code local worktree/cache state.
- If runtime architecture, startup commands, database technology, or provider structure changes, update both `AGENTS.md` and `CLAUDE.md` in the same change.
- Before merging Claude worktree changes, run:

```powershell
npm run probe:backend
npm run probe:sources
```

- If a worktree is based on older architecture and mentions `better-sqlite3` or `scripts/electron-node.js`, migrate the feature into the current `sql.js` architecture instead of accepting the old runtime path directly.
