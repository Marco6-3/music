'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { installDesktopShell, updateMaximizedState, showLoadError } = require('./renderer/desktop-shell');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-control', 'minimize'),
  maximize: () => ipcRenderer.send('window-control', 'maximize'),
  close: () => ipcRenderer.send('window-control', 'close'),
  reload: () => ipcRenderer.send('window-reload'),
  onWindowMaximized: (callback) => {
    ipcRenderer.on('window-maximized', (_event, maximized) => callback(maximized));
  }
});

window.addEventListener('DOMContentLoaded', () => {
  installDesktopShell({
    onMinimize: () => ipcRenderer.send('window-control', 'minimize'),
    onMaximize: () => ipcRenderer.send('window-control', 'maximize'),
    onClose: () => ipcRenderer.send('window-control', 'close'),
    onReload: () => ipcRenderer.send('window-reload')
  });
});

ipcRenderer.on('window-maximized', (_event, maximized) => {
  updateMaximizedState(maximized);
});

ipcRenderer.on('remote-load-failed', (_event, message) => {
  showLoadError(message);
});
