(() => {
    'use strict';

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const audio = $('#audio');
    const root = document.documentElement;
    const fallbackCover = 'public/musiq-default.png';
    const storage = {
        token: 'musiq_token',
        userId: 'musiq_user_id',
        volume: 'musiq_volume',
        queue: 'musiq_queue'
    };
    const legacyStorage = {
        token: 'xcloud_token',
        userId: 'xcloud_user_id',
        volume: 'xcloud_volume',
        queue: 'xcloud_queue'
    };

    const state = {
        view: 'home',
        currentUser: null,
        token: readLocalValue(storage.token, legacyStorage.token) || '',
        queue: readJson(storage.queue, [], legacyStorage.queue),
        currentIndex: -1,
        currentSong: null,
        searchResults: [],
        homeSongs: [],
        favorites: [],
        playlists: [],
        activePlaylistName: null,
        lyrics: [],
        activeLyricIndex: -1,
        lastLyricScrollAt: 0,
        playMode: 'order',
        isLoading: false,
        pendingPlaylistSong: null,
        stallTimer: 0,
        qualityRetryLevel: 0,
        currentQuality: '999',
        recentPlays: [],
        weeklyFavorites: [],
        historyLoading: false,
        historyLoadedForUser: '',
        sourceDiagnostics: {
            musicSource: '',
            cache: '',
            requestAt: '',
            providers: {},
            error: ''
        }
    };
    const coverCache = new Map();
    const coverInflight = new Map();
    const coverResolveQueue = [];
    const maxConcurrentCoverResolves = 4;
    let activeCoverResolves = 0;
    let songCoverObserver = null;

    const toplists = [
        ['soaring', '飙升榜', '正在被更多人听见'],
        ['new', '新歌榜', '新鲜发布'],
        ['original', '原创榜', '独立表达'],
        ['hot', '热歌榜', '高频循环'],
        ['douyin', '抖音排行榜', '短视频热播歌曲'],
        ['qq_music', 'QQ音乐热歌榜', 'QQ巅峰榜热歌'],
        ['rap', '说唱榜', '节奏和态度'],
        ['electronic', '电音榜', '夜间能量']
    ];

    const els = {
        viewTitle: $('#view-title'),
        viewRoot: $('#view-root'),
        searchForm: $('#search-form'),
        searchInput: $('#search-input'),
        sourceSelect: $('#source-select'),
        qualitySelect: $('#quality-select'),
        loginOpen: $('#login-open-btn'),
        logout: $('#logout-btn'),
        userChip: $('#user-chip'),
        userName: $('#user-name'),
        userAvatar: $('#user-avatar'),
        queueList: $('#queue-list'),
        clearQueue: $('#clear-queue-btn'),
        sideCover: $('#side-cover'),
        sideTitle: $('#side-title'),
        sideArtist: $('#side-artist'),
        dockCover: $('#dock-cover'),
        dockTitle: $('#dock-title'),
        dockArtist: $('#dock-artist'),
        play: $('#play-btn'),
        prev: $('#prev-btn'),
        next: $('#next-btn'),
        mode: $('#mode-btn'),
        favorite: $('#favorite-btn'),
        addPlaylist: $('#add-playlist-btn'),
        queueOpen: $('#queue-open-btn'),
        expand: $('#expand-btn'),
        progress: $('#progress-slider'),
        currentTime: $('#current-time'),
        durationTime: $('#duration-time'),
        volume: $('#volume-slider'),
        playerModal: $('#player-modal'),
        expandedCover: $('#expanded-cover'),
        expandedTitle: $('#expanded-title'),
        expandedArtist: $('#expanded-artist'),
        expandedPlay: $('#expanded-play-btn'),
        expandedPrev: $('#expanded-prev-btn'),
        expandedNext: $('#expanded-next-btn'),
        expandedQuality: $('#expanded-quality'),
        lyricBox: $('#lyric-box'),
        authModal: $('#auth-modal'),
        loginForm: $('#login-form'),
        registerForm: $('#register-form'),
        sendRegisterCode: $('#send-register-code'),
        playlistModal: $('#playlist-modal'),
        playlistChoiceList: $('#playlist-choice-list'),
        createPlaylistForm: $('#create-playlist-form'),
        toast: $('#toast'),
        sourceStatus: $('#source-status-btn'),
        sourceDiagnosticsRefresh: $('#source-diagnostics-refresh'),
        diagMusicSource: $('#diag-music-source'),
        diagCache: $('#diag-cache'),
        diagRequestAt: $('#diag-request-at'),
        providerStatusList: $('#provider-status-list')
    };

    init();

    function init() {
        audio.volume = Number(readLocalValue(storage.volume, legacyStorage.volume) || 70) / 100;
        els.volume.value = String(Math.round(audio.volume * 100));
        bindEvents();
        verifySession();
        renderShell();
        renderView('home');
        loadToplist('soaring', true);
    }

    function bindEvents() {
        $$('.nav-item').forEach((button) => {
            button.addEventListener('click', () => {
                if (button.dataset.view === 'playlists') state.activePlaylistName = null;
                renderView(button.dataset.view);
            });
        });

        els.searchForm.addEventListener('submit', (event) => {
            event.preventDefault();
            searchSongs(els.searchInput.value.trim());
        });

        els.play.addEventListener('click', togglePlay);
        els.expandedPlay.addEventListener('click', togglePlay);
        els.prev.addEventListener('click', playPrevious);
        els.expandedPrev.addEventListener('click', playPrevious);
        els.next.addEventListener('click', playNext);
        els.expandedNext.addEventListener('click', playNext);
        els.mode.addEventListener('click', cyclePlayMode);
        els.favorite.addEventListener('click', toggleFavorite);
        els.addPlaylist.addEventListener('click', () => openPlaylistDialog(state.currentSong));
        els.queueOpen.addEventListener('click', () => openModal('queue-modal'));
        els.expand.addEventListener('click', () => openModal('player-modal'));
        els.clearQueue.addEventListener('click', clearQueue);
        bindQueueActions();
        els.loginOpen.addEventListener('click', () => openModal('auth-modal'));
        els.logout.addEventListener('click', logout);
        els.sourceStatus.addEventListener('click', showSourceStatus);
        els.sourceDiagnosticsRefresh?.addEventListener('click', () => refreshSourceDiagnostics({ force: true }));
        bindWindowControls();
        bindWheelForwarding();
        bindResizePerformanceMode();

        els.progress.addEventListener('input', () => {
            if (!Number.isFinite(audio.duration)) return;
            audio.currentTime = (Number(els.progress.value) / 1000) * audio.duration;
        });

        els.volume.addEventListener('input', () => {
            audio.volume = Number(els.volume.value) / 100;
            localStorage.setItem(storage.volume, els.volume.value);
        });
        els.qualitySelect.addEventListener('change', () => {
            if (state.currentSong) showToast(`下一首将使用${qualityLabel(els.qualitySelect.value)}`);
        });

        audio.addEventListener('play', updatePlayButtons);
        audio.addEventListener('pause', updatePlayButtons);
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('loadedmetadata', updateProgress);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('waiting', handleBuffering);
        audio.addEventListener('stalled', handleBuffering);
        audio.addEventListener('canplay', clearBuffering);
        audio.addEventListener('playing', clearBuffering);
        audio.addEventListener('error', () => showToast('播放失败，音乐源暂时不可用', 'error'));

        $$('.close-btn').forEach((button) => {
            button.addEventListener('click', () => closeModal(button.dataset.closeModal));
        });
        $$('.modal').forEach((modal) => {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) closeModal(modal.id);
            });
        });

        $$('.tab-btn').forEach((button) => {
            button.addEventListener('click', () => switchAuthTab(button.dataset.authTab));
        });
        els.loginForm.addEventListener('submit', handleLogin);
        els.registerForm.addEventListener('submit', handleRegister);
        els.sendRegisterCode.addEventListener('click', sendRegisterCode);
        els.createPlaylistForm.addEventListener('submit', createPlaylistAndAdd);

        document.addEventListener('keydown', (event) => {
            if (event.code === 'Space' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
                event.preventDefault();
                togglePlay();
            }
            if (event.key === 'Escape') $$('.modal.open').forEach((modal) => closeModal(modal.id));
        });
    }

    function bindWindowControls() {
        $('#app-minimize-btn')?.addEventListener('click', (event) => {
            if (event.currentTarget.dataset.electronBound) return;
            if (window.electronAPI?.minimize) window.electronAPI.minimize();
            else showToast('浏览器预览不支持最小化，请在 exe 中使用');
        });
        $('#app-maximize-btn')?.addEventListener('click', (event) => {
            if (event.currentTarget.dataset.electronBound) return;
            if (window.electronAPI?.maximize) window.electronAPI.maximize();
            else showToast('浏览器预览不支持最大化，请在 exe 中使用');
        });
        $('#app-close-btn')?.addEventListener('click', (event) => {
            if (event.currentTarget.dataset.electronBound) return;
            if (window.electronAPI?.close) window.electronAPI.close();
            else showToast('浏览器预览不支持关闭窗口，请在 exe 中使用');
        });
        if (window.electronAPI?.onWindowMaximized) {
            window.electronAPI.onWindowMaximized((maximized) => {
                const button = $('#app-maximize-btn');
                if (!button) return;
                button.textContent = maximized ? '❐' : '□';
                button.title = maximized ? '还原' : '最大化';
                button.setAttribute('aria-label', button.title);
            });
        }
    }

    function bindWheelForwarding() {
        document.addEventListener('wheel', (event) => {
            const scrollable = event.target.closest('#view-root, .queue-list, .lyric-box, .app-shell, .modal.open');
            if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) return;
            if (!els.viewRoot || els.viewRoot.scrollHeight <= els.viewRoot.clientHeight) return;
            els.viewRoot.scrollTop += event.deltaY;
        }, { passive: true });
    }

    function bindResizePerformanceMode() {
        let resizeTimer = 0;

        window.addEventListener('resize', () => {
            document.body.classList.add('is-window-resizing');
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                document.body.classList.remove('is-window-resizing');
            }, 180);
        }, { passive: true });
    }

    async function verifySession() {
        const persistedAuth = await readPersistedAuthState();
        if (!state.token && persistedAuth.token) state.token = persistedAuth.token;
        const userId = readLocalValue(storage.userId, legacyStorage.userId) || persistedAuth.userId || '';
        if (!state.token && !userId) {
            updateUserUI();
            return;
        }

        try {
            const data = await apiPost('php/verify_token.php', { token: state.token, user_id: userId || '' });
            if (data.success && data.user) {
                setUser(data.user, state.token);
            } else {
                clearUser();
            }
        } catch {
            clearUser();
        }
    }

    function setUser(user, token) {
        const previousUserId = state.currentUser?.id ? String(state.currentUser.id) : '';
        state.currentUser = user;
        state.token = token || state.token;
        state.favorites = normalizeSongList(user.favorites || []);
        state.playlists = playlistsFromUser(user);
        if (String(user.id) !== previousUserId) {
            state.recentPlays = [];
            state.weeklyFavorites = [];
            state.historyLoadedForUser = '';
        }
        localStorage.setItem(storage.userId, String(user.id));
        if (state.token) localStorage.setItem(storage.token, state.token);
        persistAuthState({ userId: String(user.id), token: state.token });
        updateUserUI();
        renderShell();
        renderView(state.view);
        loadUserHistory({ silent: true });
    }

    function clearUser() {
        state.currentUser = null;
        state.token = '';
        state.favorites = [];
        state.playlists = [];
        state.recentPlays = [];
        state.weeklyFavorites = [];
        state.historyLoadedForUser = '';
        localStorage.removeItem(storage.token);
        localStorage.removeItem(storage.userId);
        localStorage.removeItem(legacyStorage.token);
        localStorage.removeItem(legacyStorage.userId);
        clearPersistedAuthState();
        updateUserUI();
    }

    function updateUserUI() {
        const loggedIn = Boolean(state.currentUser);
        els.loginOpen.hidden = loggedIn;
        els.userChip.hidden = !loggedIn;
        if (!loggedIn) return;
        els.userName.textContent = state.currentUser.username || 'musiQ用户';
        els.userAvatar.src = state.currentUser.avatar || 'public/avatars/default1.png';
    }

    function renderShell() {
        renderQueue();
        renderPlayer();
    }

    function renderView(view) {
        state.view = view;
        if (view !== 'playlists') state.activePlaylistName = null;
        $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
        const titles = {
            home: '为今晚找一首歌',
            search: '搜索音乐',
            favorites: '我的收藏',
            playlists: '我的歌单'
        };
        els.viewTitle.textContent = titles[view] || titles.home;

        if (view === 'home') renderHome();
        if (view === 'search') renderSearch();
        if (view === 'favorites') renderFavorites();
        if (view === 'playlists') {
            const activePlaylist = state.playlists.find((item) => item.name === state.activePlaylistName);
            if (activePlaylist) openPlaylistView(activePlaylist.name);
            else renderPlaylists();
        }
    }

    function renderHome() {
        els.viewRoot.innerHTML = `
            <div class="hero-strip">
                <div class="feature-card">
                    <h2>深色玻璃播放器，连接网易云与酷我音乐。</h2>
                    <p>搜索、播放、收藏、歌单和歌词都保留在本地桌面体验里。当前播放器颜色会跟随封面自动变化。</p>
                </div>
                <div class="stat-card">
                    <span class="eyebrow">Library</span>
                    <strong>${state.queue.length}</strong>
                    <span class="meta">队列中的歌曲</span>
                </div>
            </div>
            ${renderHomeHistory()}
            <div class="section-head">
                <div>
                    <h2>推荐榜单</h2>
                    <p class="meta">点击榜单即可拉取网易云实时歌曲</p>
                </div>
            </div>
            <div class="toplist-grid">
                ${toplists.map(([type, title, desc]) => `
                    <button class="toplist-card" data-toplist="${escapeHtml(type)}">
                        <p class="eyebrow">${escapeHtml(type)}</p>
                        <h3>${escapeHtml(title)}</h3>
                        <p class="meta">${escapeHtml(desc)}</p>
                    </button>
                `).join('')}
            </div>
            <div class="section-head" style="margin-top:18px">
                <div>
                    <h2>榜单歌曲</h2>
                    <p class="meta" id="home-list-subtitle">${state.homeSongs.length ? '点击播放或加入队列' : '正在等待加载'}</p>
                </div>
            </div>
            <div id="home-song-list">${renderSongList(state.homeSongs, 'home')}</div>
        `;

        $$('[data-toplist]', els.viewRoot).forEach((button) => {
            button.addEventListener('click', () => loadToplist(button.dataset.toplist));
        });
        $('#refresh-history-btn')?.addEventListener('click', () => loadUserHistory({ force: true }));
        bindSongActions(els.viewRoot);
        hydrateSongCardCovers(els.viewRoot);
        ensureHomeHistoryLoaded();
    }

    function renderHomeHistory() {
        if (!state.currentUser) return '';

        const loadingText = state.historyLoading ? '<p class="meta">正在同步播放历史...</p>' : '';
        return `
            <div class="section-head" style="margin-top:18px">
                <div>
                    <h2>播放历史</h2>
                    <p class="meta">最近播放和本周常听仅在登录后同步</p>
                </div>
                <button class="ghost-btn" id="refresh-history-btn">刷新历史</button>
            </div>
            ${loadingText}
            <div class="home-history-grid">
                <section class="home-history-section">
                    <div class="section-head">
                        <div>
                            <h3>最近播放</h3>
                            <p class="meta">${state.recentPlays.length ? `${state.recentPlays.length} 首` : '暂无记录'}</p>
                        </div>
                    </div>
                    ${renderSongList(state.recentPlays, 'recent')}
                </section>
                <section class="home-history-section">
                    <div class="section-head">
                        <div>
                            <h3>本周常听</h3>
                            <p class="meta">${state.weeklyFavorites.length ? '按播放次数排序' : '暂无记录'}</p>
                        </div>
                    </div>
                    ${renderSongList(state.weeklyFavorites, 'weekly')}
                </section>
            </div>
        `;
    }

    function renderSearch() {
        els.viewRoot.innerHTML = `
            <div class="section-head">
                <div>
                    <h2>搜索结果</h2>
                    <p class="meta">${state.searchResults.length ? `共 ${state.searchResults.length} 首` : '输入关键词后回车搜索'}</p>
                </div>
            </div>
            ${state.isLoading ? loadingState('正在搜索音乐') : renderSongList(state.searchResults, 'search')}
        `;
        bindSongActions(els.viewRoot);
        hydrateSongCardCovers(els.viewRoot);
    }

    function renderFavorites() {
        if (!state.currentUser) {
            els.viewRoot.innerHTML = emptyState('登录后可以同步收藏', '收藏会保存在本地 SQLite 数据库里。');
            return;
        }
        els.viewRoot.innerHTML = `
            <div class="section-head">
                <div>
                    <h2>我的收藏</h2>
                    <p class="meta">${state.favorites.length ? `${state.favorites.length} 首收藏歌曲` : '还没有收藏歌曲'}</p>
                </div>
            </div>
            ${renderSongList(state.favorites, 'favorites')}
        `;
        bindSongActions(els.viewRoot);
        hydrateSongCardCovers(els.viewRoot);
    }

    function renderPlaylists() {
        state.activePlaylistName = null;
        if (!state.currentUser) {
            els.viewRoot.innerHTML = emptyState('登录后可以管理歌单', '创建、重命名、删除和添加歌曲都会走现有接口。');
            return;
        }
        els.viewRoot.innerHTML = `
            <div class="section-head">
                <div>
                    <h2>我的歌单</h2>
                    <p class="meta">${state.playlists.length ? `${state.playlists.length} 个歌单` : '还没有歌单'}</p>
                </div>
                <button class="primary-btn" id="new-playlist-view-btn">新建歌单</button>
            </div>
            <div class="playlist-grid">
                ${state.playlists.map((playlist) => `
                    <button class="playlist-card" data-playlist-name="${escapeAttr(playlist.name)}">
                        <p class="eyebrow">${playlist.songs.length} songs</p>
                        <h3>${escapeHtml(playlist.name)}</h3>
                        <p class="meta">点击查看歌曲，右键可重命名</p>
                    </button>
                `).join('') || emptyState('暂无歌单', '从播放器或歌曲列表添加第一首歌。')}
            </div>
        `;

        $('#new-playlist-view-btn')?.addEventListener('click', async () => {
            const name = prompt('请输入歌单名称');
            if (!name) return;
            await createPlaylist(name.trim());
            renderPlaylists();
        });
        $$('.playlist-card', els.viewRoot).forEach((card) => {
            card.addEventListener('click', () => openPlaylistView(card.dataset.playlistName));
            card.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                renamePlaylist(card.dataset.playlistName);
            });
        });
    }

    async function openPlaylistView(name) {
        const playlist = state.playlists.find((item) => item.name === name);
        if (!playlist) return;
        state.activePlaylistName = name;
        const songs = normalizeSongList(playlist.songs);
        els.viewRoot.innerHTML = `
            <div class="section-head">
                <div>
                    <button class="text-btn" id="back-playlists">← 返回歌单</button>
                    <h2>${escapeHtml(name)}</h2>
                    <p class="meta">${songs.length} 首歌曲</p>
                </div>
                <button class="ghost-btn" id="delete-playlist-btn">删除歌单</button>
            </div>
            ${renderSongList(songs, 'playlist')}
        `;
        $('#back-playlists').addEventListener('click', () => {
            state.activePlaylistName = null;
            renderPlaylists();
        });
        $('#delete-playlist-btn').addEventListener('click', () => deletePlaylist(name));
        bindSongActions(els.viewRoot);
        hydrateSongCardCovers(els.viewRoot);
    }

    function renderSongList(songs, context) {
        if (!songs.length) return emptyState('暂无歌曲', '可以从搜索或榜单添加歌曲。');
        return `
            <div class="song-list">
                ${songs.map((song, index) => renderSongCard(song, index, context)).join('')}
            </div>
        `;
    }

    function renderSongCard(song, index, context) {
        const isPlaying = state.currentSong && sameSong(state.currentSong, song);
        const cover = getCoverUrl(song, 120);
        return `
            <article class="song-card ${isPlaying ? 'playing' : ''}" data-song="${encodeSong(song)}" data-context="${escapeAttr(context)}">
                ${cover ? `<img class="song-cover" src="${escapeAttr(cover)}" alt="">` : `<div class="song-index">${index + 1}</div>`}
                <div>
                    <div class="song-title">${escapeHtml(song.name || '未知歌曲')}</div>
                    <div class="song-subtitle">${escapeHtml(formatArtists(song.artist))} · ${escapeHtml(song.album || song.source || '')}</div>
                </div>
                <div class="song-actions">
                    <button class="icon-btn" data-action="play" title="播放">▶</button>
                    <button class="icon-btn" data-action="queue" title="加入队列">＋</button>
                    <button class="icon-btn" data-action="favorite" title="收藏">${isFavorite(song) ? '♥' : '♡'}</button>
                    <button class="icon-btn" data-action="playlist" title="添加到歌单">≡</button>
                </div>
            </article>
        `;
    }

    function hydrateSongCardCovers(scope) {
        resetSongCoverObserver();
        const observer = getSongCoverObserver();
        $$('.song-card', scope).forEach((card) => {
            const img = $('.song-cover', card);
            if (!img || img.dataset.coverHydrated === '1') return;

            const song = decodeSong(card.dataset.song);
            if (!song?.pic_id || song.cover_url || /^https?:\/\//.test(song.pic_id) || song.pic_id.startsWith('uploads/')) {
                img.dataset.coverHydrated = '1';
                return;
            }

            if (observer) observer.observe(card);
            else hydrateVisibleSongCardCover(card);
        });
    }

    function getSongCoverObserver() {
        if (!('IntersectionObserver' in window)) return null;
        if (songCoverObserver) return songCoverObserver;
        songCoverObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                songCoverObserver.unobserve(entry.target);
                hydrateVisibleSongCardCover(entry.target);
            });
        }, {
            root: els.viewRoot,
            rootMargin: '180px 0px',
            threshold: 0.01
        });
        return songCoverObserver;
    }

    function resetSongCoverObserver() {
        if (!songCoverObserver) return;
        songCoverObserver.disconnect();
        songCoverObserver = null;
    }

    function hydrateVisibleSongCardCover(card) {
        const img = $('.song-cover', card);
        if (!img || img.dataset.coverHydrated === '1') return;

        const song = decodeSong(card.dataset.song);
        if (!song?.pic_id || song.cover_url || /^https?:\/\//.test(song.pic_id) || song.pic_id.startsWith('uploads/')) {
            img.dataset.coverHydrated = '1';
            return;
        }

        img.dataset.coverHydrated = '1';
        resolveCachedCoverUrl(song, 120).then((coverUrl) => {
            if (!coverUrl || coverUrl === fallbackCover || !card.isConnected) return;
            const latestSong = decodeSong(card.dataset.song);
            if (!sameSong(latestSong, song)) return;

            latestSong.cover_url = coverUrl;
            card.dataset.song = encodeSong(latestSong);
            swapImageWhenLoaded(img, coverUrl);
        });
    }

    function swapImageWhenLoaded(img, src) {
        const probe = new Image();
        probe.onload = () => {
            if (img.isConnected) img.src = src;
        };
        probe.src = src;
    }

    async function resolveCachedCoverUrl(song, size = 300) {
        const key = coverCacheKey(song, size);
        if (coverCache.has(key)) return coverCache.get(key);
        if (coverInflight.has(key)) return coverInflight.get(key);

        const request = enqueueCoverResolve(() => resolveCoverUrl(song, size))
            .then((coverUrl) => {
                coverCache.set(key, coverUrl);
                return coverUrl;
            })
            .finally(() => {
                coverInflight.delete(key);
            });
        coverInflight.set(key, request);
        return request;
    }

    function coverCacheKey(song, size) {
        return `${song.source || 'netease'}:${song.pic_id}:${size}`;
    }

    function enqueueCoverResolve(task) {
        return new Promise((resolve, reject) => {
            coverResolveQueue.push({ task, resolve, reject });
            pumpCoverResolveQueue();
        });
    }

    function pumpCoverResolveQueue() {
        while (activeCoverResolves < maxConcurrentCoverResolves && coverResolveQueue.length) {
            const item = coverResolveQueue.shift();
            activeCoverResolves += 1;
            Promise.resolve()
                .then(item.task)
                .then(item.resolve, item.reject)
                .finally(() => {
                    activeCoverResolves -= 1;
                    pumpCoverResolveQueue();
                });
        }
    }

    function bindSongActions(scope) {
        if (scope.dataset.songActionsBound === '1') return;
        scope.dataset.songActionsBound = '1';

        scope.addEventListener('dblclick', (event) => {
            const card = event.target.closest?.('.song-card');
            if (!card || !scope.contains(card)) return;
            const song = decodeSong(card.dataset.song);
            playSong(song, { list: songsForCard(card) });
        });

        scope.addEventListener('click', (event) => {
            const button = event.target.closest?.('[data-action]');
            if (!button || !scope.contains(button)) return;
            const card = button.closest('.song-card');
            if (!card || !scope.contains(card)) return;

            event.stopPropagation();
            const song = decodeSong(card.dataset.song);
            const action = button.dataset.action;
            if (action === 'play') playSong(song, { list: songsForCard(card) });
            if (action === 'queue') enqueue(song);
            if (action === 'favorite') toggleFavorite(song);
            if (action === 'playlist') openPlaylistDialog(song);
        });
    }

    function songsForCard(card) {
        const list = card.closest('.song-list');
        const songs = list ? normalizeSongList($$('.song-card', list).map((item) => decodeSong(item.dataset.song))) : [];
        return songs.length ? songs : songsForContext(card.dataset.context);
    }

    function songsForContext(context) {
        if (context === 'search') return state.searchResults;
        if (context === 'favorites') return state.favorites;
        if (context === 'home') return state.homeSongs;
        if (context === 'recent') return state.recentPlays;
        if (context === 'weekly') return state.weeklyFavorites;
        if (context === 'playlist') return currentPlaylistSongs();
        return state.queue.length ? state.queue : [state.currentSong].filter(Boolean);
    }

    function currentPlaylistSongs() {
        if (state.view !== 'playlists') return [];
        const heading = $('.section-head h2', els.viewRoot);
        const playlist = state.playlists.find((item) => item.name === heading?.textContent);
        return playlist ? playlist.songs : [];
    }

    async function searchSongs(keyword) {
        if (!keyword) {
            renderView('search');
            return;
        }
        state.view = 'search';
        state.isLoading = true;
        renderView('search');
        try {
            const params = {
                types: 'search',
                source: els.sourceSelect.value,
                name: keyword,
                count: 30
            };
            const data = await apiGet('api.php', params);
            state.searchResults = normalizeSongList(Array.isArray(data) ? data : data.data || []);
        } catch (error) {
            showToast(error.message || '搜索失败', 'error');
            state.searchResults = [];
        } finally {
            state.isLoading = false;
            renderView('search');
        }
    }

    async function loadToplist(type, silent = false) {
        if (!silent) showToast('正在加载榜单...');
        try {
            const data = await apiGet('php/toplist.php', { type });
            state.homeSongs = normalizeSongList(data.data || []);
            if (state.view === 'home') renderHome();
        } catch (error) {
            if (!silent) showToast(error.message || '榜单加载失败', 'error');
        }
    }

    function ensureHomeHistoryLoaded() {
        if (!state.currentUser || state.historyLoading) return;
        if (state.historyLoadedForUser === String(state.currentUser.id)) return;
        loadUserHistory({ silent: true });
    }

    async function loadUserHistory({ force = false, silent = false } = {}) {
        if (!state.currentUser || state.historyLoading) return;
        const userId = String(state.currentUser.id);
        if (!force && state.historyLoadedForUser === userId) return;

        state.historyLoading = true;
        if (state.view === 'home' && !silent) renderHome();

        try {
            const [recent, top] = await Promise.all([
                apiPost('php/play_history.php', {
                    action: 'recent',
                    user_id: userId,
                    limit: 8
                }),
                apiPost('php/play_history.php', {
                    action: 'top',
                    user_id: userId,
                    days: 7,
                    limit: 8
                })
            ]);
            state.recentPlays = normalizeSongList(recent.history || []);
            state.weeklyFavorites = normalizeSongList(top.songs || []);
            state.historyLoadedForUser = userId;
        } catch (error) {
            state.historyLoadedForUser = userId;
            if (!silent) showToast(error.message || '播放历史加载失败', 'error');
        } finally {
            state.historyLoading = false;
            if (state.view === 'home') renderHome();
        }
    }

    async function playSong(song, options = {}) {
        if (!song || !song.id) return;
        const previousSong = state.currentSong;
        const list = normalizeSongList(options.list || []);
        if (list.length) {
            state.queue = uniqueSongs(list);
            state.currentIndex = Math.max(0, state.queue.findIndex((item) => sameSong(item, song)));
        } else if (!state.queue.some((item) => sameSong(item, song))) {
            state.queue.push(song);
            state.currentIndex = state.queue.length - 1;
        } else {
            state.currentIndex = state.queue.findIndex((item) => sameSong(item, song));
        }
        state.currentSong = normalizeSong(song);
        state.qualityRetryLevel = 0;
        state.currentQuality = normalizeRequestedQuality(els.qualitySelect.value);
        state.activeLyricIndex = -1;
        saveQueue();
        renderShell();
        updatePlayingSongCards(previousSong, state.currentSong);

        try {
            let [coverUrl, lyricData] = await Promise.all([
                resolveCoverUrl(state.currentSong),
                apiGet('api.php', {
                    types: 'lyric',
                    source: state.currentSong.source || 'netease',
                    id: state.currentSong.lyric_id || state.currentSong.id
                }).catch(() => ({ lyric: '' }))
            ]);
            let urlData;
            try {
                urlData = await fetchPreferredAudioUrl(state.currentSong, state.currentQuality);
            } catch (error) {
                const fallbackSong = await resolvePlaybackFallbackSong(state.currentSong);
                if (!fallbackSong) throw error;

                showToast(`当前音乐源不可用，已切换到酷我：${fallbackSong.name}`);
                const originalSong = state.currentSong;
                const beforeFallbackSong = state.currentSong;
                state.currentSong = {
                    ...fallbackSong,
                    original_title: originalSong.original_title || originalSong.name,
                    original_artist: originalSong.original_artist || formatArtists(originalSong.artist)
                };
                if (state.currentIndex >= 0) state.queue[state.currentIndex] = state.currentSong;
                saveQueue();
                renderShell();
                updatePlayingSongCards(beforeFallbackSong, state.currentSong);

                const [fallbackCoverUrl, fallbackLyricData] = await Promise.all([
                    resolveCoverUrl(state.currentSong).catch(() => coverUrl),
                    apiGet('api.php', {
                        types: 'lyric',
                        source: state.currentSong.source || 'kuwo',
                        id: state.currentSong.lyric_id || state.currentSong.id
                    }).catch(() => lyricData)
                ]);
                coverUrl = fallbackCoverUrl;
                lyricData = fallbackLyricData;
                urlData = await fetchPreferredAudioUrl(state.currentSong, '320');
            }
            state.currentSong.cover_url = coverUrl;
            const queueSong = state.queue[state.currentIndex];
            if (queueSong && sameSong(queueSong, state.currentSong)) queueSong.cover_url = coverUrl;
            renderShell();
            updateRenderedSongCardCover(state.currentSong, coverUrl);
            const url = urlData.url || urlData.data?.url;
            if (!url) throw new Error('没有可用播放地址');
            state.currentQuality = String(urlData.br || state.currentQuality);
            updateQualityBadge(urlData);
            state.lyrics = parseLyrics(lyricData.lyric || lyricData.lrc?.lyric || '');
            renderLyrics();
            audio.preload = 'auto';
            audio.src = url;
            audio.load();
            await audio.play();
            recordSuccessfulPlay(state.currentSong);
        } catch (error) {
            showToast(error.message || '播放失败', 'error');
        }
    }

    function recordSuccessfulPlay(song) {
        if (!state.currentUser || !song?.id) return;
        apiPost('php/play_history.php', {
            action: 'record',
            user_id: state.currentUser.id,
            ...songPayload(song)
        }).then(() => {
            state.historyLoadedForUser = '';
            loadUserHistory({ silent: true });
        }).catch((error) => {
            console.warn('[play-history] record failed:', error.message || error);
        });
    }

    function updatePlayingSongCards(previousSong, currentSong) {
        const cards = new Set([
            ...findRenderedSongCards(previousSong),
            ...findRenderedSongCards(currentSong),
            ...$$('.song-card.playing', els.viewRoot)
        ]);
        cards.forEach((card) => {
            const cardSong = decodeSong(card.dataset.song);
            card.classList.toggle('playing', Boolean(currentSong && sameSong(cardSong, currentSong)));
        });
    }

    function updateRenderedSongCardCover(song, coverUrl) {
        if (!song || !coverUrl || coverUrl === fallbackCover) return;
        findRenderedSongCards(song).forEach((card) => {
            const cardSong = decodeSong(card.dataset.song);
            if (!cardSong) return;
            cardSong.cover_url = coverUrl;
            card.dataset.song = encodeSong(cardSong);
            const img = $('.song-cover', card);
            if (img) {
                img.dataset.coverHydrated = '1';
                swapImageWhenLoaded(img, coverUrl);
            }
        });
    }

    function findRenderedSongCards(song) {
        if (!song) return [];
        return $$('.song-card', els.viewRoot).filter((card) => sameSong(decodeSong(card.dataset.song), song));
    }

    function togglePlay() {
        if (!state.currentSong) {
            const first = state.queue[0] || state.homeSongs[0] || state.searchResults[0];
            if (first) playSong(first, { list: state.queue.length ? state.queue : state.homeSongs });
            return;
        }
        if (audio.paused) audio.play().catch(() => showToast('播放失败', 'error'));
        else audio.pause();
    }

    function playPrevious() {
        if (!state.queue.length) return;
        if (state.playMode === 'random') state.currentIndex = Math.floor(Math.random() * state.queue.length);
        else state.currentIndex = Math.max(0, state.currentIndex - 1);
        playSong(state.queue[state.currentIndex], { list: state.queue });
    }

    function playNext() {
        if (!state.queue.length) return;
        if (state.playMode === 'random') {
            state.currentIndex = Math.floor(Math.random() * state.queue.length);
        } else {
            state.currentIndex = state.currentIndex + 1;
            if (state.currentIndex >= state.queue.length) state.currentIndex = 0;
        }
        playSong(state.queue[state.currentIndex], { list: state.queue });
    }

    function handleEnded() {
        if (state.playMode === 'single') {
            audio.currentTime = 0;
            audio.play().catch(() => {});
            return;
        }
        if (state.queue.length > 1 || state.playMode === 'loop' || state.playMode === 'random') {
            playNext();
        }
    }

    function handleBuffering() {
        if (!state.currentSong || audio.paused) return;
        showToast('正在缓冲当前音乐源...');
        clearTimeout(state.stallTimer);
        state.stallTimer = setTimeout(() => {
            recoverHighQualityStream();
        }, 6500);
    }

    function clearBuffering() {
        clearTimeout(state.stallTimer);
        state.stallTimer = 0;
    }

    async function recoverHighQualityStream() {
        if (!state.currentSong || audio.paused) return;
        const requested = normalizeRequestedQuality(els.qualitySelect.value);
        const retryQuality = requested === '999' && state.qualityRetryLevel === 0 ? '320' : requested;
        state.qualityRetryLevel += 1;
        const resumeAt = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        showToast(retryQuality === '320' && requested === '999'
            ? 'SQ 源不稳定，已切换到极高 HQ 继续播放'
            : '正在刷新高音质播放直链');

        try {
            const data = await apiGet('api.php', {
                types: 'url',
                source: state.currentSong.source || 'netease',
                id: state.currentSong.url_id || state.currentSong.id,
                br: retryQuality,
                name: state.currentSong.name || '',
                artist: formatArtists(state.currentSong.artist),
                album: state.currentSong.album || ''
            });
            const url = data.url || data.data?.url;
            if (!url) return;
            if (Number(data.br || retryQuality) < 320) {
                showToast('当前音乐源没有 HQ/SQ 音质，请换源或换版本', 'error');
                return;
            }
            state.currentQuality = String(data.br || retryQuality);
            updateQualityBadge(data);
            audio.src = url;
            audio.load();
            audio.addEventListener('loadedmetadata', () => {
                if (resumeAt > 0 && Number.isFinite(audio.duration)) {
                    audio.currentTime = Math.min(resumeAt, Math.max(0, audio.duration - 0.5));
                }
                audio.play().catch(() => showToast('高音质重试播放失败', 'error'));
            }, { once: true });
        } catch {
            showToast('高音质重试失败，请手动切换到 HQ 或换源', 'error');
        }
    }

    async function fetchPreferredAudioUrl(song, quality) {
        const requested = normalizeRequestedQuality(quality);
        try {
            const data = await fetchAudioUrl(song, requested);
            if ((data.url || data.data?.url) && Number(data.br || requested) >= 320) return data;
        } catch (error) {
            if (requested !== '999') throw error;
        }

        if (requested === '999') {
            showToast('SQ 源不可用，已切换到极高 HQ');
            const data = await fetchAudioUrl(song, '320');
            if (Number(data.br || 0) < 320) throw new Error('当前音乐源没有 HQ/SQ 音质');
            state.currentQuality = String(data.br || '320');
            return data;
        }

        throw new Error('没有可用播放地址');
    }

    function fetchAudioUrl(song, quality) {
        return apiGet('api.php', {
            types: 'url',
            source: song.source || 'netease',
            id: song.url_id || song.id,
            br: quality,
            name: song.name || '',
            artist: formatArtists(song.artist),
            album: song.album || ''
        });
    }

    async function resolvePlaybackFallbackSong(song) {
        if (!song || (song.source || 'netease') === 'kuwo') return null;
        const keyword = [song.original_title || song.name, firstArtist(song)].filter(Boolean).join(' ');
        if (!keyword.trim()) return null;

        try {
            const data = await apiGet('api.php', {
                types: 'search',
                source: 'kuwo',
                name: keyword,
                count: 8
            });
            const candidates = normalizeSongList(Array.isArray(data) ? data : data.data || []);
            return chooseBestFallbackSong(candidates, song);
        } catch {
            return null;
        }
    }

    function chooseBestFallbackSong(candidates, originalSong) {
        if (!Array.isArray(candidates) || !candidates.length) return null;
        const targetTitle = normalizeSearchText(originalSong.original_title || originalSong.name);
        const targetArtists = artistList(originalSong.artist).map(normalizeSearchText).filter(Boolean);

        return candidates.find((candidate) => {
            const candidateTitle = normalizeSearchText(candidate.name);
            const candidateArtists = artistList(candidate.artist).map(normalizeSearchText);
            const titleMatches = candidateTitle === targetTitle || candidateTitle.includes(targetTitle) || targetTitle.includes(candidateTitle);
            const artistMatches = !targetArtists.length || targetArtists.some((artist) =>
                candidateArtists.some((candidateArtist) => candidateArtist.includes(artist) || artist.includes(candidateArtist))
            );
            return titleMatches && artistMatches;
        }) || candidates[0];
    }

    function firstArtist(song) {
        return artistList(song.artist)[0] || '';
    }

    function artistList(artist) {
        if (Array.isArray(artist)) return artist.map((item) => String(item || '').trim()).filter(Boolean);
        return String(artist || '').split(/[\/,，、&＆]+/).map((item) => item.trim()).filter(Boolean);
    }

    function normalizeSearchText(value) {
        return String(value || '').toLowerCase().replace(/\s+/g, '').replace(/[·・,，/／&＆()（）\[\]【】《》<>「」『』-]/g, '');
    }

    function cyclePlayMode() {
        const order = ['order', 'loop', 'single', 'random'];
        state.playMode = order[(order.indexOf(state.playMode) + 1) % order.length];
        const labels = { order: '顺序', loop: '循环', single: '单曲', random: '随机' };
        els.mode.textContent = labels[state.playMode];
        showToast(`播放模式：${labels[state.playMode]}`);
    }

    function enqueue(song) {
        if (!song) return;
        if (!state.queue.some((item) => sameSong(item, song))) {
            state.queue.push(normalizeSong(song));
            saveQueue();
            renderQueue();
        }
        showToast('已加入播放队列', 'success');
    }

    function clearQueue() {
        state.queue = state.currentSong ? [state.currentSong] : [];
        state.currentIndex = state.currentSong ? 0 : -1;
        saveQueue();
        renderQueue();
    }

    function renderQueue() {
        els.queueList.innerHTML = state.queue.map((song, index) => `
            <div class="queue-song ${state.currentSong && sameSong(state.currentSong, song) ? 'active' : ''}" data-index="${index}">
                <span class="queue-song-number">${index + 1}</span>
                <div>
                    <div class="song-title">${escapeHtml(song.name || '未知歌曲')}</div>
                    <div class="song-subtitle">${escapeHtml(formatArtists(song.artist))}</div>
                </div>
                <button class="queue-remove-btn" data-action="remove-queue" title="从播放队列移除">×</button>
            </div>
        `).join('') || `<div class="empty-state">播放队列为空</div>`;
    }

    function bindQueueActions() {
        if (els.queueList.dataset.queueActionsBound === '1') return;
        els.queueList.dataset.queueActionsBound = '1';
        els.queueList.addEventListener('click', (event) => {
            const removeButton = event.target.closest?.('[data-action="remove-queue"]');
            if (removeButton && els.queueList.contains(removeButton)) {
                event.stopPropagation();
                const item = removeButton.closest('.queue-song');
                removeQueueSong(Number(item?.dataset.index));
                return;
            }

            const item = event.target.closest?.('.queue-song');
            if (!item || !els.queueList.contains(item)) return;
            const index = Number(item.dataset.index);
            playSong(state.queue[index], { list: state.queue });
        });
    }

    function removeQueueSong(index) {
        if (!Number.isInteger(index) || index < 0 || index >= state.queue.length) return;
        const removedCurrent = state.currentIndex === index;
        state.queue.splice(index, 1);

        if (!state.queue.length) {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            state.currentSong = null;
            state.currentIndex = -1;
            saveQueue();
            renderShell();
            renderView(state.view);
            return;
        }

        if (removedCurrent) {
            const nextIndex = Math.min(index, state.queue.length - 1);
            playSong(state.queue[nextIndex], { list: state.queue });
            return;
        }

        if (index < state.currentIndex) state.currentIndex -= 1;
        saveQueue();
        renderQueue();
    }

    function renderPlayer() {
        const song = state.currentSong;
        const cover = song ? getCoverUrl(song, 300) : fallbackCover;
        const title = song?.name || '未选择歌曲';
        const artist = song ? formatArtists(song.artist) : '未知艺术家';
        [els.dockCover, els.sideCover, els.expandedCover].forEach((img) => {
            img.src = cover || fallbackCover;
        });
        [els.dockTitle, els.sideTitle, els.expandedTitle].forEach((el) => {
            el.textContent = title;
        });
        [els.dockArtist, els.sideArtist, els.expandedArtist].forEach((el) => {
            el.textContent = artist;
        });
        els.favorite.textContent = song && isFavorite(song) ? '♥' : '♡';
        updateQualityBadge();
        updatePlayButtons();
        updateCoverTheme(cover);
    }

    function updatePlayButtons() {
        const label = audio.paused ? '▶' : '⏸';
        els.play.textContent = label;
        els.expandedPlay.textContent = label;
    }

    function updateProgress() {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        els.currentTime.textContent = formatTime(current);
        els.durationTime.textContent = formatTime(duration);
        els.progress.value = duration ? String(Math.round((current / duration) * 1000)) : '0';
        updateActiveLyric(current);
    }

    async function toggleFavorite(song = state.currentSong) {
        if (!song) return;
        if (!state.currentUser) {
            openModal('auth-modal');
            showToast('请先登录后再收藏', 'error');
            return;
        }
        const favorite = isFavorite(song);
        try {
            await apiPost('php/favorite.php', {
                action: favorite ? 'remove' : 'add',
                user_id: state.currentUser.id,
                ...songPayload(song)
            });
            if (favorite) state.favorites = state.favorites.filter((item) => !sameSong(item, song));
            else state.favorites.unshift(normalizeSong(song));
            updateUserCollections();
            showToast(favorite ? '已取消收藏' : '已收藏', 'success');
            renderShell();
            renderView(state.view);
        } catch (error) {
            showToast(error.message || '收藏失败', 'error');
        }
    }

    function openPlaylistDialog(song) {
        if (!song) return;
        if (!state.currentUser) {
            openModal('auth-modal');
            showToast('请先登录后再添加歌单', 'error');
            return;
        }
        state.pendingPlaylistSong = song;
        els.playlistChoiceList.innerHTML = state.playlists.map((playlist) => `
            <button class="playlist-choice" data-name="${escapeAttr(playlist.name)}">
                ${escapeHtml(playlist.name)} · ${playlist.songs.length} 首
            </button>
        `).join('') || `<div class="empty-state">还没有歌单，可以直接新建。</div>`;
        $$('.playlist-choice', els.playlistChoiceList).forEach((button) => {
            button.addEventListener('click', () => addSongToPlaylist(button.dataset.name, state.pendingPlaylistSong));
        });
        openModal('playlist-modal');
    }

    async function createPlaylistAndAdd(event) {
        event.preventDefault();
        const name = new FormData(els.createPlaylistForm).get('name').trim();
        if (!name) return;
        try {
            await createPlaylist(name);
            if (state.pendingPlaylistSong) await addSongToPlaylist(name, state.pendingPlaylistSong);
            els.createPlaylistForm.reset();
        } catch (error) {
            showToast(error.message || '创建歌单失败', 'error');
        }
    }

    async function createPlaylist(name) {
        const data = await apiPost('php/playlist.php', {
            action: 'create',
            user_id: state.currentUser.id,
            name
        });
        if (!data.success) throw new Error(data.message || '创建歌单失败');
        if (!state.playlists.some((item) => item.name === name)) {
            state.playlists.unshift({ name, songs: [] });
        }
        updateUserCollections();
        showToast('歌单已创建', 'success');
        return data;
    }

    async function addSongToPlaylist(name, song) {
        const idData = await apiPost('php/get_playlist_id.php', {
            user_id: state.currentUser.id,
            playlist_name: name
        });
        if (!idData.success) throw new Error(idData.message || '歌单不存在');
        const data = await apiPost('php/playlist.php', {
            action: 'add_song',
            user_id: state.currentUser.id,
            playlist_id: idData.playlist_id,
            ...songPayload(song)
        });
        if (!data.success) throw new Error(data.message || '添加失败');
        const playlist = state.playlists.find((item) => item.name === name);
        if (playlist && !playlist.songs.some((item) => sameSong(item, song))) playlist.songs.unshift(normalizeSong(song));
        updateUserCollections();
        closeModal('playlist-modal');
        showToast('已添加到歌单', 'success');
        if (state.view === 'playlists') renderPlaylists();
    }

    async function renamePlaylist(oldName) {
        const newName = prompt('请输入新的歌单名称', oldName);
        if (!newName || newName === oldName) return;
        const data = await apiPost('php/rename_playlist.php', {
            user_id: state.currentUser.id,
            old_name: oldName,
            new_name: newName.trim()
        });
        if (!data.success) {
            showToast(data.message || '重命名失败', 'error');
            return;
        }
        const playlist = state.playlists.find((item) => item.name === oldName);
        if (playlist) playlist.name = newName.trim();
        updateUserCollections();
        renderPlaylists();
    }

    async function deletePlaylist(name) {
        if (!confirm(`确定删除歌单“${name}”？`)) return;
        const idData = await apiPost('php/get_playlist_id.php', {
            user_id: state.currentUser.id,
            playlist_name: name
        });
        if (!idData.success) return showToast(idData.message || '歌单不存在', 'error');
        const data = await apiPost('php/playlist.php', {
            action: 'delete',
            user_id: state.currentUser.id,
            playlist_id: idData.playlist_id
        });
        if (!data.success) return showToast(data.message || '删除失败', 'error');
        state.playlists = state.playlists.filter((item) => item.name !== name);
        updateUserCollections();
        renderPlaylists();
    }

    function updateUserCollections() {
        if (!state.currentUser) return;
        state.currentUser.favorites = state.favorites;
        state.currentUser.playlists = Object.fromEntries(state.playlists.map((item) => [item.name, item.songs]));
    }

    async function handleLogin(event) {
        event.preventDefault();
        const form = Object.fromEntries(new FormData(els.loginForm));
        try {
            const data = await apiPost('php/login.php', form);
            if (!data.success || data.need_email_verification) {
                showToast(data.message || '登录失败', 'error');
                return;
            }
            setUser(data.user, data.token);
            closeModal('auth-modal');
            showToast('登录成功', 'success');
        } catch (error) {
            showToast(error.message || '登录失败', 'error');
        }
    }

    async function sendRegisterCode() {
        const email = new FormData(els.registerForm).get('email');
        if (!email) return showToast('请先填写邮箱', 'error');
        els.sendRegisterCode.disabled = true;
        try {
            const data = await apiPost('php/register_verification.php', { email });
            showToast(data.message || (data.success ? '验证码已发送' : '发送失败'), data.success ? 'success' : 'error');
        } catch (error) {
            showToast(error.message || '发送失败', 'error');
        } finally {
            setTimeout(() => {
                els.sendRegisterCode.disabled = false;
            }, 1200);
        }
    }

    async function handleRegister(event) {
        event.preventDefault();
        const form = Object.fromEntries(new FormData(els.registerForm));
        try {
            const data = await apiPost('php/register.php', form);
            if (!data.success) {
                showToast(data.message || '注册失败', 'error');
                return;
            }
            setUser(data.user, data.token);
            closeModal('auth-modal');
            showToast('注册成功', 'success');
        } catch (error) {
            showToast(error.message || '注册失败', 'error');
        }
    }

    function logout() {
        clearUser();
        showToast('已退出登录');
        renderView(state.view);
    }

    function switchAuthTab(tab) {
        $$('.tab-btn').forEach((button) => button.classList.toggle('active', button.dataset.authTab === tab));
        els.loginForm.classList.toggle('hidden', tab !== 'login');
        els.registerForm.classList.toggle('hidden', tab !== 'register');
    }

    async function showSourceStatus() {
        openModal('source-diagnostics-modal');
        renderSourceDiagnostics();
        await refreshSourceDiagnostics({ silent: true });
    }

    async function refreshSourceDiagnostics({ force = false, silent = false } = {}) {
        if (!force && state.sourceDiagnostics.loading) return;
        state.sourceDiagnostics.loading = true;
        state.sourceDiagnostics.error = '';
        renderSourceDiagnostics();

        try {
            const data = await apiGet('api_check/api_doubtful.php');
            state.sourceDiagnostics.providers = data && typeof data === 'object' ? data : {};
        } catch (error) {
            state.sourceDiagnostics.providers = {};
            state.sourceDiagnostics.error = error.message || '无法获取源状态';
            if (!silent) showToast(state.sourceDiagnostics.error, 'error');
        } finally {
            state.sourceDiagnostics.loading = false;
            renderSourceDiagnostics();
        }
    }

    function renderSourceDiagnostics() {
        if (!els.diagMusicSource || !els.providerStatusList) return;

        els.diagMusicSource.textContent = state.sourceDiagnostics.musicSource || '暂无';
        els.diagCache.textContent = state.sourceDiagnostics.cache || '暂无';
        els.diagRequestAt.textContent = state.sourceDiagnostics.requestAt || '暂无';

        if (state.sourceDiagnostics.loading) {
            els.providerStatusList.innerHTML = loadingState('正在刷新音源状态');
            return;
        }

        if (state.sourceDiagnostics.error) {
            els.providerStatusList.innerHTML = emptyState('无法获取源状态', state.sourceDiagnostics.error);
            return;
        }

        const providers = Object.entries(state.sourceDiagnostics.providers || {});
        els.providerStatusList.innerHTML = providers.map(([source, item]) => {
            const searchOk = item?.search === true || item?.search === 'true';
            const playOk = item?.play === true || item?.play === 'true';
            return `
                <div class="provider-row">
                    <div>
                        <strong>${escapeHtml(item?.name || source)}</strong>
                        <span class="provider-meta">last_check: ${escapeHtml(item?.last_check || '暂无')}</span>
                    </div>
                    <div class="provider-pills">
                        <span class="status-pill ${searchOk ? 'ok' : 'bad'}">搜索 ${searchOk ? 'OK' : 'FAIL'}</span>
                        <span class="status-pill ${playOk ? 'ok' : 'bad'}">播放 ${playOk ? 'OK' : 'FAIL'}</span>
                    </div>
                </div>
            `;
        }).join('') || emptyState('暂无音源检测记录', '后台监控完成后会显示每个 provider 的状态。');
    }

    function recordSourceHeaders(headers = {}) {
        const musicSource = headers.musicSource || '';
        const cache = headers.cache || '';
        if (!musicSource && !cache) return;

        state.sourceDiagnostics.musicSource = musicSource || '未返回';
        state.sourceDiagnostics.cache = cache || '未返回';
        state.sourceDiagnostics.requestAt = new Date().toLocaleString('zh-CN');
        renderSourceDiagnostics();
    }

    function renderLyrics() {
        state.activeLyricIndex = -1;
        els.lyricBox.innerHTML = state.lyrics.length
            ? state.lyrics.map((line, index) => `
                <div class="lyric-line" data-lyric-index="${index}">
                    <span>${escapeHtml(line.text)}</span>
                </div>
            `).join('')
            : `<div class="empty-state">暂无歌词</div>`;
    }

    function updateActiveLyric(current) {
        if (!state.lyrics.length || !els.playerModal.classList.contains('open')) return;
        let active = 0;
        for (let i = 0; i < state.lyrics.length; i += 1) {
            if (state.lyrics[i].time <= current) active = i;
            else break;
        }
        if (active === state.activeLyricIndex) return;
        state.activeLyricIndex = active;
        $$('.lyric-line', els.lyricBox).forEach((line, index) => line.classList.toggle('active', index === active));
        const activeLine = $(`.lyric-line[data-lyric-index="${active}"]`, els.lyricBox);
        if (!activeLine) return;
        const now = performance.now();
        const shouldSmooth = now - state.lastLyricScrollAt > 420;
        state.lastLyricScrollAt = now;
        const targetTop = activeLine.offsetTop - (els.lyricBox.clientHeight / 2) + (activeLine.clientHeight / 2);
        els.lyricBox.scrollTo({
            top: Math.max(0, targetTop),
            behavior: shouldSmooth ? 'smooth' : 'auto'
        });
    }

    function updateQualityBadge(data) {
        if (!els.expandedQuality) return;
        const quality = String(data?.br || state.currentQuality || els.qualitySelect.value || '999');
        const size = Number(data?.size || 0);
        const sizeText = size ? ` · ${formatBytes(size)}` : '';
        els.expandedQuality.textContent = `${qualityLabel(quality)}${sizeText}`;
    }

    function normalizeRequestedQuality(value) {
        return value === '999' ? '999' : '320';
    }

    function qualityLabel(value) {
        const numeric = Number(value || 0);
        if (numeric >= 900) return '无损 SQ';
        if (numeric >= 800) return `无损 SQ ${numeric}K`;
        if (numeric >= 320) return '极高 HQ';
        if (numeric >= 192) return '标准音质';
        return '省流音质';
    }

    function formatBytes(value) {
        if (!value) return '';
        if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
        return `${Math.round(value / 1024)} KB`;
    }

    function updateCoverTheme(src) {
        if (!src) return setAccent(30, 215, 96);
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.decoding = 'async';
        image.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const size = 24;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(image, 0, 0, size, size);
                const data = ctx.getImageData(0, 0, size, size).data;
                let r = 0;
                let g = 0;
                let b = 0;
                let count = 0;
                for (let i = 0; i < data.length; i += 16) {
                    const alpha = data[i + 3];
                    if (alpha < 120) continue;
                    const brightness = data[i] + data[i + 1] + data[i + 2];
                    if (brightness < 48 || brightness > 720) continue;
                    r += data[i];
                    g += data[i + 1];
                    b += data[i + 2];
                    count += 1;
                }
                if (!count) return setAccent(30, 215, 96);
                setAccent(Math.round(r / count), Math.round(g / count), Math.round(b / count));
            } catch {
                setAccent(30, 215, 96);
            }
        };
        image.onerror = () => setAccent(30, 215, 96);
        image.src = src;
    }

    function setAccent(r, g, b) {
        const [nr, ng, nb] = boostColor(r, g, b);
        root.style.setProperty('--accent-rgb', `${nr}, ${ng}, ${nb}`);
        root.style.setProperty('--accent', `rgb(${nr}, ${ng}, ${nb})`);
        root.style.setProperty('--cover-glow', `rgba(${nr}, ${ng}, ${nb}, 0.34)`);
        const luminance = (0.299 * nr + 0.587 * ng + 0.114 * nb) / 255;
        root.style.setProperty('--accent-contrast', luminance > 0.62 ? '#07110d' : '#f5fff9');
    }

    function boostColor(r, g, b) {
        const max = Math.max(r, g, b);
        const factor = max < 120 ? 1.45 : 1.12;
        return [r, g, b].map((value) => Math.max(44, Math.min(235, Math.round(value * factor))));
    }

    async function apiGet(path, params = {}) {
        const result = await apiGetWithMeta(path, params);
        if (path === 'api.php' || path === 'php/toplist.php') recordSourceHeaders(result.headers);
        return result.data;
    }

    async function apiGetWithMeta(path, params = {}) {
        const query = new URLSearchParams(params).toString();
        const response = await fetch(query ? `${path}?${query}` : path);
        const data = await parseResponse(response);
        return {
            data,
            headers: {
                musicSource: response.headers.get('X-Music-Source') || '',
                cache: response.headers.get('X-Cache') || response.headers.get('X-Toplist-Cache') || ''
            }
        };
    }

    async function apiPost(path, body = {}) {
        const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: new URLSearchParams(body)
        });
        return parseResponse(response);
    }

    async function parseResponse(response) {
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error(text || `HTTP ${response.status}`);
        }
        if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
        return data;
    }

    function normalizeSongList(list) {
        return (Array.isArray(list) ? list : []).map(normalizeSong).filter((song) => song.id);
    }

    function normalizeSong(song) {
        const source = song.source || els.sourceSelect?.value || 'netease';
        return {
            id: String(song.id || song.song_id || ''),
            name: song.name || song.song_name || song.song_title || song.title || '未知歌曲',
            artist: song.artist || song.song_artist || [],
            album: song.album || '',
            pic_id: String(song.pic_id || song.pic || song.song_cover || ''),
            cover_url: song.cover_url || song.cover || '',
            source,
            url_id: String(song.url_id || song.id || ''),
            lyric_id: String(song.lyric_id || song.id || ''),
            original_title: song.original_title || '',
            original_artist: song.original_artist || ''
        };
    }

    function songPayload(song) {
        const normalized = normalizeSong(song);
        return {
            song_id: normalized.id,
            id: normalized.id,
            source: normalized.source,
            song_title: normalized.name,
            song_name: normalized.name,
            name: normalized.name,
            song_artist: formatArtists(normalized.artist),
            artist: formatArtists(normalized.artist),
            album: normalized.album,
            song_cover: normalized.pic_id,
            pic_id: normalized.pic_id,
            original_title: normalized.original_title || normalized.name,
            original_artist: normalized.original_artist || formatArtists(normalized.artist)
        };
    }

    function playlistsFromUser(user) {
        if (Array.isArray(user.playlists)) {
            return user.playlists.map((item) => ({
                name: item.name,
                songs: normalizeSongList(item.songs || [])
            }));
        }
        return Object.entries(user.playlists || {}).map(([name, songs]) => ({
            name,
            songs: normalizeSongList(songs)
        }));
    }

    function sameSong(a, b) {
        return a && b && String(a.id) === String(b.id) && (a.source || 'netease') === (b.source || 'netease');
    }

    function uniqueSongs(list) {
        const seen = new Set();
        return normalizeSongList(list).filter((song) => {
            const key = `${song.source}:${song.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function isFavorite(song) {
        return state.favorites.some((item) => sameSong(item, song));
    }

    function getCoverUrl(song, size = 300) {
        if (!song?.pic_id) return fallbackCover;
        if (song.cover_url) return song.cover_url;
        if (/^https?:\/\//.test(song.pic_id) || song.pic_id.startsWith('uploads/')) return song.pic_id;
        return fallbackCover;
    }

    async function resolveCoverUrl(song, size = 300) {
        if (!song) return fallbackCover;
        if (song.cover_url) return song.cover_url;
        if (!song.pic_id) return fallbackCover;
        if (/^https?:\/\//.test(song.pic_id) || song.pic_id.startsWith('uploads/')) return song.pic_id;
        try {
            const data = await apiGet('api.php', {
                types: 'pic',
                source: song.source || 'netease',
                id: song.pic_id,
                size
            });
            return data.url || fallbackCover;
        } catch {
            return fallbackCover;
        }
    }

    function formatArtists(artist) {
        if (Array.isArray(artist)) return artist.join(' / ');
        return String(artist || '未知艺术家');
    }

    function parseLyrics(raw) {
        return String(raw || '').split(/\r?\n/).map((line) => {
            const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?]\s*(.*)$/);
            if (!match) return null;
            const minutes = Number(match[1]);
            const seconds = Number(match[2]);
            const ms = Number((match[3] || '0').padEnd(3, '0'));
            const text = match[4].trim();
            if (!text) return null;
            return { time: minutes * 60 + seconds + ms / 1000, text };
        }).filter(Boolean);
    }

    function formatTime(value) {
        const total = Math.max(0, Math.floor(value || 0));
        const minutes = String(Math.floor(total / 60)).padStart(2, '0');
        const seconds = String(total % 60).padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    function encodeSong(song) {
        return encodeURIComponent(JSON.stringify(normalizeSong(song)));
    }

    function decodeSong(value) {
        if (!value) return null;
        try {
            return normalizeSong(JSON.parse(decodeURIComponent(value)));
        } catch {
            try {
                const textarea = document.createElement('textarea');
                textarea.innerHTML = value;
                return normalizeSong(JSON.parse(textarea.value));
            } catch {
                return null;
            }
        }
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/`/g, '&#96;');
    }

    function emptyState(title, detail = '') {
        return `<div class="empty-state"><div><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ''}</div></div>`;
    }

    function loadingState(text) {
        return `<div class="empty-state">${escapeHtml(text)}...</div>`;
    }

    function openModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        if (id === 'player-modal') renderLyrics();
        if (id === 'queue-modal') renderQueue();
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }

    let toastTimer = 0;
    function showToast(message, type = 'info') {
        clearTimeout(toastTimer);
        els.toast.textContent = message;
        els.toast.className = `toast show ${type}`;
        toastTimer = setTimeout(() => {
            els.toast.className = 'toast';
        }, 2600);
    }

    function saveQueue() {
        localStorage.setItem(storage.queue, JSON.stringify(state.queue.slice(0, 80)));
    }

    function readLocalValue(key, legacyKey) {
        const value = localStorage.getItem(key);
        if (value !== null) return value;
        const legacyValue = legacyKey ? localStorage.getItem(legacyKey) : null;
        if (legacyValue !== null) localStorage.setItem(key, legacyValue);
        return legacyValue;
    }

    async function readPersistedAuthState() {
        try {
            if (!window.electronAPI?.getAuthState) return {};
            const value = await window.electronAPI.getAuthState();
            if (!value || typeof value !== 'object') return {};
            return {
                token: typeof value.token === 'string' ? value.token : '',
                userId: value.userId ? String(value.userId) : ''
            };
        } catch {
            return {};
        }
    }

    function persistAuthState(authState) {
        try {
            if (window.electronAPI?.setAuthState) window.electronAPI.setAuthState(authState);
        } catch {
            // 浏览器调试环境没有 Electron 存储时继续使用 localStorage。
        }
    }

    function clearPersistedAuthState() {
        try {
            if (window.electronAPI?.clearAuthState) window.electronAPI.clearAuthState();
        } catch {
            // 浏览器调试环境没有 Electron 存储时无需处理。
        }
    }

    function readJson(key, fallback, legacyKey) {
        try {
            const value = JSON.parse(readLocalValue(key, legacyKey) || '');
            return value ?? fallback;
        } catch {
            return fallback;
        }
    }
})();
