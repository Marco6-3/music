(() => {
    'use strict';

    const storageKeys = {
        iosInstallDismissed: ['music_ios_install_dismissed', 'musiq_ios_install_dismissed'],
        updateDismissed: ['music_pwa_update_dismissed', 'musiq_pwa_update_dismissed']
    };
    const isStandalone = window.navigator.standalone === true
        || window.matchMedia('(display-mode: standalone)').matches;
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isBrowserClient = !window.electronAPI;

    document.documentElement.classList.toggle('is-standalone-pwa', isStandalone);
    document.documentElement.classList.toggle('is-ios-webkit', isIos);
    document.documentElement.classList.toggle('is-browser-client', isBrowserClient);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        document.body.classList.toggle('is-standalone-pwa', isStandalone);
        document.body.classList.toggle('is-ios-webkit', isIos);
        document.body.classList.toggle('is-browser-client', isBrowserClient);

        registerServiceWorker();
        bindNetworkStatus();
        showIosInstallHint();
        bindChromiumInstallPrompt();
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        if (!window.isSecureContext && !isLocalhost()) return;

        navigator.serviceWorker.register('sw.js', { scope: './' })
            .then((registration) => {
                watchForUpdates(registration);
                if (registration.waiting) showUpdateNotice(registration.waiting);
            })
            .catch(() => {
                // PWA registration failure must not block the music app.
            });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    }

    function watchForUpdates(registration) {
        registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
                if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                    showUpdateNotice(worker);
                }
            });
        });
    }

    function showUpdateNotice(worker) {
        if (readLocal(storageKeys.updateDismissed) === CACHE_BUST_KEY()) return;
        showNotice({
            id: 'pwa-update-notice',
            message: 'music 有新版本可用',
            actionText: '刷新',
            onAction: () => {
                worker?.postMessage({ type: 'SKIP_WAITING' });
                setTimeout(() => window.location.reload(), 500);
            },
            onClose: () => writeLocal(storageKeys.updateDismissed, CACHE_BUST_KEY())
        });
    }

    function bindNetworkStatus() {
        window.addEventListener('offline', () => {
            showNotice({
                id: 'pwa-network-notice',
                message: '当前离线：只能浏览已缓存界面，搜索和播放需要网络',
                actionText: '知道了'
            });
        });
        window.addEventListener('online', () => {
            showNotice({
                id: 'pwa-network-notice',
                message: '网络已恢复，可以继续搜索和播放',
                actionText: '好的',
                timeoutMs: 3800
            });
        });
    }

    function showIosInstallHint() {
        if (!isIos || isStandalone || !isBrowserClient) return;
        if (readLocal(storageKeys.iosInstallDismissed) === '1') return;

        showNotice({
            id: 'pwa-ios-install-notice',
            message: '在 iPhone Safari 中添加到主屏幕可获得 App 体验',
            actionText: '知道了',
            onAction: () => writeLocal(storageKeys.iosInstallDismissed, '1'),
            onClose: () => writeLocal(storageKeys.iosInstallDismissed, '1'),
            timeoutMs: 0
        });
    }

    function bindChromiumInstallPrompt() {
        let promptEvent = null;
        window.addEventListener('beforeinstallprompt', (event) => {
            if (isIos || isStandalone) return;
            event.preventDefault();
            promptEvent = event;
            showNotice({
                id: 'pwa-install-notice',
                message: '可以将 music 安装到桌面',
                actionText: '安装',
                onAction: () => {
                    promptEvent?.prompt();
                    promptEvent = null;
                }
            });
        });
    }

    function showNotice({ id, message, actionText = '关闭', onAction, onClose, timeoutMs = 6000 }) {
        let notice = document.getElementById(id);
        if (!notice) {
            notice = document.createElement('div');
            notice.id = id;
            notice.className = 'pwa-notice';
            notice.innerHTML = `
                <span class="pwa-notice-text"></span>
                <button type="button" class="pwa-notice-action"></button>
                <button type="button" class="pwa-notice-close" aria-label="关闭">×</button>
            `;
            document.body.appendChild(notice);
        }

        notice.querySelector('.pwa-notice-text').textContent = message;
        notice.querySelector('.pwa-notice-action').textContent = actionText;
        notice.classList.add('show');

        const close = () => {
            notice.classList.remove('show');
            onClose?.();
        };
        notice.querySelector('.pwa-notice-action').onclick = () => {
            onAction?.();
            close();
        };
        notice.querySelector('.pwa-notice-close').onclick = close;

        if (timeoutMs > 0) {
            clearTimeout(notice._hideTimer);
            notice._hideTimer = setTimeout(close, timeoutMs);
        }
    }

    function isLocalhost() {
        return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    }

    function readLocal(key) {
        try {
            const keys = Array.isArray(key) ? key : [key];
            for (const candidate of keys) {
                const value = localStorage.getItem(candidate);
                if (value !== null) {
                    if (candidate !== keys[0]) localStorage.setItem(keys[0], value);
                    return value;
                }
            }
            return '';
        } catch {
            return '';
        }
    }

    function writeLocal(key, value) {
        try {
            localStorage.setItem(Array.isArray(key) ? key[0] : key, value);
        } catch {}
    }

    function CACHE_BUST_KEY() {
        return 'v1';
    }
})();
