'use strict';

const { app, BrowserWindow, ipcMain, shell, Tray, Menu, screen, nativeImage, powerMonitor } = require('electron');

if (process.env.MUSIC_DISABLE_GPU || process.env.MUSIQ_DISABLE_GPU) {
  app.disableHardwareAcceleration();
}
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { startLocalBackend } = require('./server');
const {
  appId,
  appName,
  useLocalBackend,
  localBackendPort,
  remoteUrl,
  versionApiUrl,
  versionPollIntervalMs,
  requestTimeoutMs,
  allowedHosts,
  window: windowConfig
} = require('./config');

let mainWindow = null;
let splashWindow = null;
let tray = null;
let lastWebVersion = null;
let versionTimer = null;
let localBackend = null;
let pageLoadStartedAt = 0;
let windowStateTimer = null;
const appStartedAt = Date.now();
const authStateFileName = 'auth-state.json';
const windowStateFileName = 'window-state.json';

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.setAppUserModelId(appId);
  app.setName(appName);

  app.on('second-instance', focusMainWindow);
  app.whenReady().then(createWindows);
  app.on('window-all-closed', handleAllWindowsClosed);
  app.on('activate', handleActivate);

  // Refresh version check and health status after sleep/wake on Windows.
  app.whenReady().then(() => {
    powerMonitor.on('resume', () => {
      checkWebVersion();
    });
  });
}

ipcMain.on('window-control', (_event, action) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  switch (action) {
    case 'minimize':
      mainWindow.minimize();
      break;
    case 'maximize':
      if (mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(false);
      } else if (mainWindow.isMaximized()) {
        mainWindow.restore();
      } else {
        mainWindow.maximize();
      }
      break;
    case 'close':
      mainWindow.close();
      break;
    default:
      break;
  }
});

ipcMain.on('window-reload', () => {
  reloadMainWindow({ clearCache: true });
});

ipcMain.handle('auth-state:get', () => readAuthState());
ipcMain.handle('auth-state:set', (_event, authState) => {
  writeAuthState(authState);
  return true;
});
ipcMain.handle('auth-state:clear', () => {
  clearAuthState();
  return true;
});

async function createWindows() {
  splashWindow = createSplashWindow();

  if (useLocalBackend && !localBackend) {
    localBackend = await startLocalBackend({
      preferredPort: localBackendPort,
      dataDir: path.join(app.getPath('userData'), 'server-data')
    });
    console.log(`[desktop] backend ready in ${elapsedMs(appStartedAt)}ms at ${localBackend.url}`);
  }

  mainWindow = createMainWindow();
  createTray();
  console.log(`[desktop] main window created in ${elapsedMs(appStartedAt)}ms`);

  attachWindowStateEvents(mainWindow);
  attachNavigationGuards(mainWindow);
  loadRemoteApp();
  startVersionPolling();
}

function createSplashWindow() {
  const win = new BrowserWindow({
    width: windowConfig.width,
    height: windowConfig.height,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    show: true
  });

  win.loadFile(path.join(__dirname, 'splash.html'));
  return win;
}

function createMainWindow() {
  const savedState = readWindowState();
  const initialBounds = resolveInitialWindowBounds(savedState);
  const win = new BrowserWindow({
    ...initialBounds,
    minWidth: windowConfig.minWidth,
    minHeight: windowConfig.minHeight,
    frame: false,
    transparent: false,
    backgroundColor: '#06100d',
    show: false,
    title: appName,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.on('closed', () => {
    mainWindow = null;
    stopVersionPolling();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  win.webContents.on('did-finish-load', () => {
    console.log(`[desktop] page did-finish-load in ${elapsedMs(pageLoadStartedAt || appStartedAt)}ms`);
    closeSplashWindow();
    if (!win.isDestroyed()) {
      win.show();
      sendMaximizedState(win);
    }
  });

  win.webContents.on('did-fail-load', (_event, _code, description) => {
    closeSplashWindow();
    if (!win.isDestroyed()) {
      win.show();
      win.webContents.send('remote-load-failed', description || '页面加载失败');
    }
  });

  if (savedState?.maximized) {
    win.maximize();
  }

  return win;
}

function loadRemoteApp() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const appUrl = localBackend ? `${localBackend.url}/?from=musicapp` : remoteUrl;
  pageLoadStartedAt = Date.now();
  mainWindow.loadURL(appUrl);
}

function reloadMainWindow({ clearCache = true } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const reload = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      pageLoadStartedAt = Date.now();
      mainWindow.reload();
    }
  };

  if (!clearCache) {
    reload();
    return;
  }

  mainWindow.webContents.session.clearCache().finally(reload);
}

function authStatePath() {
  return path.join(app.getPath('userData'), authStateFileName);
}

function readAuthState() {
  try {
    const file = authStatePath();
    if (!fs.existsSync(file)) return {};
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      token: typeof value.token === 'string' ? value.token : '',
      userId: value.userId ? String(value.userId) : ''
    };
  } catch {
    return {};
  }
}

function writeAuthState(authState = {}) {
  const payload = {
    token: typeof authState.token === 'string' ? authState.token : '',
    userId: authState.userId ? String(authState.userId) : '',
    updatedAt: new Date().toISOString()
  };
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(authStatePath(), JSON.stringify(payload, null, 2), 'utf8');
}

function clearAuthState() {
  try {
    const file = authStatePath();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    // 清理失败不影响退出登录流程。
  }
}

function attachWindowStateEvents(win) {
  win.on('maximize', () => sendMaximizedState(win));
  win.on('unmaximize', () => sendMaximizedState(win));
  win.on('restore', () => sendMaximizedState(win));
  win.on('enter-full-screen', () => sendMaximizedState(win));
  win.on('leave-full-screen', () => sendMaximizedState(win));
  win.on('resize', () => scheduleWindowStateSave(win));
  win.on('move', () => scheduleWindowStateSave(win));
  win.on('maximize', () => saveWindowState(win));
  win.on('unmaximize', () => saveWindowState(win));
  win.on('close', () => saveWindowState(win));
}

function sendMaximizedState(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('window-maximized', win.isMaximized() || win.isFullScreen());
}

function attachNavigationGuards(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedAppUrl(url)) {
      return { action: 'allow' };
    }

    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppUrl(url)) return;

    event.preventDefault();
    shell.openExternal(url);
  });
}

function isAllowedAppUrl(value) {
  try {
    const url = new URL(value);
    return allowedHosts.includes(url.hostname);
  } catch {
    return false;
  }
}

function startVersionPolling() {
  stopVersionPolling();
  checkWebVersion();
  versionTimer = setInterval(checkWebVersion, versionPollIntervalMs);
  if (versionTimer.unref) versionTimer.unref();
}

function stopVersionPolling() {
  if (versionTimer) {
    clearInterval(versionTimer);
    versionTimer = null;
  }
}

function checkWebVersion() {
  const url = localBackend ? `${localBackend.url}/php/check_version.php` : versionApiUrl;

  fetchJson(url)
    .then((payload) => {
      if (!payload || !payload.version) return;

      if (lastWebVersion === null) {
        lastWebVersion = payload.version;
        return;
      }

      if (payload.version !== lastWebVersion) {
        lastWebVersion = payload.version;
        reloadMainWindow({ clearCache: true });
      }
    })
    .catch(() => {
      // 版本检查失败不影响主应用使用，下一轮轮询会继续尝试。
    });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : require('node:http');
    const request = client.get(url, { timeout: requestTimeoutMs }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Unexpected status code: ${response.statusCode}`));
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('Request timeout'));
    });
    request.on('error', reject);
  });
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

function createTray() {
  if (tray || process.platform !== 'win32') return;

  const iconPath = resolveTrayIconPath();
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (icon.isEmpty()) return;

  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip(appName);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `显示 ${appName}`, click: focusMainWindow },
    { label: '重新加载', click: () => reloadMainWindow({ clearCache: true }) },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]));
  tray.on('click', focusMainWindow);
  tray.on('double-click', focusMainWindow);
}

function resolveTrayIconPath() {
  const candidates = [
    path.join(process.resourcesPath || '', 'webroot', 'public', 'music-default.png'),
    path.join(projectRoot(), 'webroot', 'public', 'music-default.png')
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || '';
}

function projectRoot() {
  return path.resolve(__dirname, '..');
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function windowStatePath() {
  return path.join(app.getPath('userData'), windowStateFileName);
}

function readWindowState() {
  try {
    const file = windowStatePath();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function resolveInitialWindowBounds(savedState) {
  const defaults = {
    width: windowConfig.width,
    height: windowConfig.height
  };
  const bounds = savedState?.bounds;
  if (!isUsableBounds(bounds)) return defaults;
  return bounds;
}

function isUsableBounds(bounds) {
  if (!bounds) return false;
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  const x = Number(bounds.x);
  const y = Number(bounds.y);
  if (![width, height, x, y].every(Number.isFinite)) return false;
  if (width < windowConfig.minWidth || height < windowConfig.minHeight) return false;

  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return x < area.x + area.width
      && x + width > area.x
      && y < area.y + area.height
      && y + height > area.y;
  });
}

function scheduleWindowStateSave(win) {
  if (windowStateTimer) clearTimeout(windowStateTimer);
  windowStateTimer = setTimeout(() => {
    windowStateTimer = null;
    saveWindowState(win);
  }, 400);
  if (windowStateTimer.unref) windowStateTimer.unref();
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    const payload = {
      bounds,
      maximized: win.isMaximized(),
      updatedAt: new Date().toISOString()
    };
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(windowStatePath(), JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // 保存窗口状态失败不应影响应用退出或播放。
  }
}

function elapsedMs(startedAt) {
  return Math.max(0, Date.now() - startedAt);
}

function handleAllWindowsClosed() {
  if (localBackend) {
    localBackend.close();
    localBackend = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
}

function handleActivate() {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindows();
  }
}
