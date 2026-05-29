'use strict';

const CONTAINER_CLASS = 'electron-app-container';
const STYLE_ID = 'music-desktop-shell-style';
const CONTROLS_ID = 'window-controls';
const DRAG_REGION_ID = 'titlebar-drag-region';
const ERROR_ID = 'music-load-error';

function installDesktopShell(handlers) {
  ensureTheme();
  injectStyle();
  wrapBodyContent();
  addDragRegion();
  addWindowControls(handlers);
  observeThemeChanges();
  syncThemeVariables();
}

function ensureTheme() {
  if (!document.documentElement.hasAttribute('data-theme')) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    :root[data-theme="light"] {
      --app-bg-color: #ffffff;
      --app-border-color: #cccccc;
      --app-control-hover-bg: rgba(0, 0, 0, 0.08);
      --app-text-color: #151515;
    }

    :root[data-theme="dark"] {
      --app-bg-color: #121212;
      --app-border-color: #444444;
      --app-control-hover-bg: rgba(255, 255, 255, 0.12);
      --app-text-color: #f5f5f5;
    }

    html,
    body {
      background: var(--app-bg-color) !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 100%;
      min-height: 100%;
      overflow: hidden;
    }

    .${CONTAINER_CLASS} {
      position: fixed;
      inset: 0;
      border-radius: 18px;
      overflow: hidden;
      background: var(--app-bg-color);
      border: 3px solid var(--app-border-color);
      box-shadow: 0 0 24px rgba(0, 0, 0, 0.12);
      z-index: 1;
      color: var(--app-text-color);
    }

    #${DRAG_REGION_ID} {
      position: fixed;
      top: 0;
      left: 0;
      right: 144px;
      height: 40px;
      -webkit-app-region: drag;
      z-index: 99998;
    }

    #${CONTROLS_ID} {
      position: fixed;
      top: 0;
      right: 0;
      height: 40px;
      display: flex;
      z-index: 99999;
      background: transparent;
      -webkit-app-region: no-drag;
    }

    .window-control-button {
      width: 48px;
      height: 30px;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer !important;
      opacity: 0.82;
      transition: opacity 0.2s, background-color 0.2s;
      user-select: none;
      background: transparent;
      border: 0;
      outline: 0;
      color: inherit;
      font-family: "Segoe UI Symbol", "Segoe UI", Arial, sans-serif;
      font-size: 20px;
      line-height: 1;
      -webkit-app-region: no-drag;
    }

    .window-control-button:hover {
      opacity: 1;
      background-color: var(--app-control-hover-bg);
    }

    #close-button:hover {
      background-color: #e81123;
      border-top-right-radius: 18px;
      color: #ffffff;
    }

    #${ERROR_ID} {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(420px, calc(100vw - 48px));
      padding: 24px;
      border: 1px solid var(--app-border-color);
      border-radius: 8px;
      background: var(--app-bg-color);
      color: var(--app-text-color);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
      z-index: 100000;
      font-family: "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
      box-sizing: border-box;
    }

    #${ERROR_ID} h1 {
      margin: 0 0 10px;
      font-size: 18px;
      font-weight: 600;
    }

    #${ERROR_ID} p {
      margin: 0 0 18px;
      color: #666666;
      font-size: 14px;
      line-height: 1.6;
    }

    #${ERROR_ID} button {
      height: 34px;
      padding: 0 14px;
      border: 0;
      border-radius: 6px;
      background: #1db954;
      color: #ffffff;
      cursor: pointer;
      font-size: 14px;
    }
  `;

  document.head.appendChild(style);
}

function wrapBodyContent() {
  if (document.querySelector(`.${CONTAINER_CLASS}`)) return;

  const container = document.createElement('div');
  container.className = CONTAINER_CLASS;

  while (document.body.firstChild) {
    container.appendChild(document.body.firstChild);
  }

  document.body.appendChild(container);
}

function addDragRegion() {
  if (document.getElementById(DRAG_REGION_ID)) return;

  const dragRegion = document.createElement('div');
  dragRegion.id = DRAG_REGION_ID;
  document.body.appendChild(dragRegion);
}

function addWindowControls(handlers) {
  if (document.getElementById(CONTROLS_ID)) return;
  if (document.getElementById('app-window-controls')) {
    bindAppWindowControls(handlers);
    return;
  }

  const controls = document.createElement('div');
  controls.id = CONTROLS_ID;
  controls.innerHTML = `
    <button class="window-control-button" id="minimize-button" title="最小化" aria-label="最小化">&minus;</button>
    <button class="window-control-button" id="maximize-button" title="最大化" aria-label="最大化">&#x25A1;</button>
    <button class="window-control-button" id="close-button" title="关闭" aria-label="关闭">&#x2715;</button>
  `;
  document.body.appendChild(controls);

  document.getElementById('minimize-button').addEventListener('click', handlers.onMinimize);
  document.getElementById('maximize-button').addEventListener('click', handlers.onMaximize);
  document.getElementById('close-button').addEventListener('click', handlers.onClose);
}

function bindAppWindowControls(handlers) {
  const minimizeButton = document.getElementById('app-minimize-btn');
  const maximizeButton = document.getElementById('app-maximize-btn');
  const closeButton = document.getElementById('app-close-btn');

  if (minimizeButton && !minimizeButton.dataset.electronBound) {
    minimizeButton.dataset.electronBound = 'true';
    minimizeButton.addEventListener('click', (event) => {
      event.stopImmediatePropagation();
      handlers.onMinimize();
    });
  }

  if (maximizeButton && !maximizeButton.dataset.electronBound) {
    maximizeButton.dataset.electronBound = 'true';
    maximizeButton.addEventListener('click', (event) => {
      event.stopImmediatePropagation();
      handlers.onMaximize();
    });
  }

  if (closeButton && !closeButton.dataset.electronBound) {
    closeButton.dataset.electronBound = 'true';
    closeButton.addEventListener('click', (event) => {
      event.stopImmediatePropagation();
      handlers.onClose();
    });
  }
}

function observeThemeChanges() {
  if (window.__musicThemeObserver) return;

  window.__musicThemeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
        syncThemeVariables();
      }
    }
  });

  window.__musicThemeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });
}

function syncThemeVariables() {
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  document.body.style.setProperty('--app-bg-color', theme === 'dark' ? '#121212' : '#ffffff');
  document.body.style.setProperty('--app-border-color', theme === 'dark' ? '#444444' : '#cccccc');
}

function updateMaximizedState(maximized) {
  const button = document.getElementById('maximize-button') || document.getElementById('app-maximize-btn');
  if (!button) return;

  button.title = maximized ? '还原' : '最大化';
  button.setAttribute('aria-label', button.title);
  button.innerHTML = maximized ? '&#x2750;' : '&#x25A1;';
}

function showLoadError(message) {
  injectStyle();

  let errorBox = document.getElementById(ERROR_ID);
  if (!errorBox) {
    errorBox = document.createElement('div');
    errorBox.id = ERROR_ID;
    document.body.appendChild(errorBox);
  }

  errorBox.innerHTML = `
    <h1>页面加载失败</h1>
    <p>${escapeHtml(message || '无法连接到 music 服务，请检查网络后重试。')}</p>
    <button id="retry-load-button" type="button">重新加载</button>
  `;

  const retryButton = document.getElementById('retry-load-button');
  retryButton.addEventListener('click', () => {
    if (window.electronAPI) {
      window.electronAPI.reload();
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

module.exports = {
  installDesktopShell,
  updateMaximizedState,
  showLoadError
};
