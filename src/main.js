'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const https = require('node:https');
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
let lastWebVersion = null;
let versionTimer = null;
let localBackend = null;

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
}

ipcMain.on('window-control', (_event, action) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  switch (action) {
    case 'minimize':
      mainWindow.minimize();
      break;
    case 'maximize':
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
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
  reloadMainWindow();
});

async function createWindows() {
  if (useLocalBackend && !localBackend) {
    localBackend = await startLocalBackend({
      preferredPort: localBackendPort,
      dataDir: path.join(app.getPath('userData'), 'server-data')
    });
  }

  splashWindow = createSplashWindow();
  mainWindow = createMainWindow();

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
  const win = new BrowserWindow({
    width: windowConfig.width,
    height: windowConfig.height,
    minWidth: windowConfig.minWidth,
    minHeight: windowConfig.minHeight,
    frame: false,
    transparent: true,
    backgroundColor: '#00ffffff',
    show: false,
    title: appName,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
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

  return win;
}

function loadRemoteApp() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const appUrl = localBackend ? `${localBackend.url}/?from=xcloudapp` : remoteUrl;

  mainWindow.webContents.session.clearCache().finally(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.loadURL(appUrl);
  });
}

function reloadMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  mainWindow.webContents.session.clearCache().finally(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  });
}

function attachWindowStateEvents(win) {
  win.on('maximize', () => sendMaximizedState(win));
  win.on('unmaximize', () => sendMaximizedState(win));
  win.on('restore', () => sendMaximizedState(win));
}

function sendMaximizedState(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('window-maximized', win.isMaximized());
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
        reloadMainWindow();
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

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
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
