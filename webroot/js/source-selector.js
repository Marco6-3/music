(() => {
  'use strict';

  const PLATFORMS = [
    { value: 'netease', label: '网易云' },
    { value: 'tencent', label: 'QQ音乐' },
    { value: 'kuwo', label: '酷我' },
    { value: 'kugou', label: '酷狗' },
    { value: 'baidu', label: '百度' },
    { value: 'bilibili', label: 'B站' }
  ];

  const STORAGE_KEY = 'musiq_selected_source';

  function getSavedSource() {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'netease';
    } catch {
      return 'netease';
    }
  }

  function saveSource(source) {
    try {
      localStorage.setItem(STORAGE_KEY, source);
    } catch {}
  }

  function ensureNativeOptions(select) {
    const existing = new Set(Array.from(select.options).map((option) => option.value));
    for (const platform of PLATFORMS) {
      if (existing.has(platform.value)) continue;
      const option = document.createElement('option');
      option.value = platform.value;
      option.textContent = platform.label;
      select.appendChild(option);
    }
  }

  function createStyle() {
    if (document.getElementById('source-selector-style')) return;
    const style = document.createElement('style');
    style.id = 'source-selector-style';
    style.textContent = `
      .source-selector {
        position: relative;
        display: inline-flex;
        align-items: center;
        min-width: 112px;
      }
      .source-selector-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        height: 42px;
        padding: 0 13px;
        border: 1px solid var(--border, rgba(255, 255, 255, 0.13));
        border-radius: 15px;
        background: rgba(255, 255, 255, 0.07);
        color: var(--text, #f3fff9);
        font-size: 15px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
        white-space: nowrap;
        user-select: none;
      }
      .source-selector-btn:hover {
        border-color: rgba(var(--accent-rgb, 30, 215, 96), 0.58);
        background: rgba(255, 255, 255, 0.1);
        color: var(--text, #f3fff9);
      }
      .source-selector-btn .arrow {
        font-size: 10px;
        transition: transform 0.2s;
      }
      .source-selector.open .source-selector-btn .arrow {
        transform: rotate(180deg);
      }
      .source-dropdown {
        position: fixed;
        top: 0;
        left: 0;
        min-width: 120px;
        max-height: min(320px, calc(100vh - 24px));
        background: rgba(15, 28, 25, 0.96);
        border: 1px solid var(--border, rgba(255, 255, 255, 0.13));
        border-radius: 8px;
        box-shadow: 0 12px 28px rgba(0,0,0,0.32);
        z-index: 99999;
        overflow: auto;
        opacity: 0;
        transform: translateY(-4px);
        pointer-events: none;
        transition: opacity 0.15s, transform 0.15s;
      }
      .source-selector.open .source-dropdown,
      .source-dropdown.open {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }
      .source-option {
        display: flex;
        align-items: center;
        padding: 8px 14px;
        font-size: 13px;
        color: var(--text, #f3fff9);
        cursor: pointer;
        transition: background 0.1s;
      }
      .source-option:hover,
      .source-option.active {
        background: rgba(255, 255, 255, 0.1);
      }
      .source-option.active {
        color: var(--accent, #1ed760);
        font-weight: 600;
      }
      .source-option .check {
        margin-left: auto;
        opacity: 0;
        font-size: 12px;
      }
      .source-option.active .check {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  }

  function init() {
    createStyle();

    const existingSelect = document.getElementById('source-select');
    const searchForm = document.getElementById('search-form');
    const anchor = existingSelect || searchForm;

    if (!anchor) {
      console.warn('[source-selector] no anchor element found');
      return;
    }

    if (existingSelect) ensureNativeOptions(existingSelect);
    const currentSource = getSavedSource();
    const currentLabel = PLATFORMS.find((platform) => platform.value === currentSource)?.label || '网易云';

    const container = document.createElement('div');
    container.className = 'source-selector';
    container.innerHTML = `
      <button class="source-selector-btn" type="button" aria-label="选择音乐源">
        <span class="label">${currentLabel}</span>
        <span class="arrow">&#9662;</span>
      </button>
      <div class="source-dropdown">
        ${PLATFORMS.map((platform) => `
          <div class="source-option${platform.value === currentSource ? ' active' : ''}" data-source="${platform.value}">
            <span>${platform.label}</span>
            <span class="check">&#10003;</span>
          </div>
        `).join('')}
      </div>
    `;

    if (existingSelect) {
      existingSelect.style.display = 'none';
      existingSelect.parentNode.insertBefore(container, existingSelect.nextSibling);
      existingSelect.value = currentSource;
    } else if (searchForm) {
      const searchInput = document.getElementById('search-input');
      if (searchInput && searchInput.parentNode) {
        searchInput.parentNode.insertBefore(container, searchInput.nextSibling);
      } else {
        searchForm.appendChild(container);
      }
    }

    const btn = container.querySelector('.source-selector-btn');
    const dropdown = container.querySelector('.source-dropdown');
    let repositionFrame = 0;

    function positionDropdown() {
      if (dropdown.parentElement !== document.body) {
        document.body.appendChild(dropdown);
      }

      const rect = btn.getBoundingClientRect();
      const dropdownWidth = Math.max(120, Math.ceil(rect.width));
      const viewportPadding = 12;
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        window.innerWidth - dropdownWidth - viewportPadding
      );

      dropdown.style.width = `${dropdownWidth}px`;
      dropdown.style.left = `${left}px`;
      dropdown.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - viewportPadding)}px`;
    }

    function closeDropdown() {
      container.classList.remove('open');
      dropdown.classList.remove('open');
      cancelScheduledReposition();
      if (dropdown.parentElement !== container) {
        container.appendChild(dropdown);
      }
    }

    function scheduleDropdownPosition() {
      if (!container.classList.contains('open') || repositionFrame) return;
      repositionFrame = requestAnimationFrame(() => {
        repositionFrame = 0;
        if (container.classList.contains('open')) positionDropdown();
      });
    }

    function cancelScheduledReposition() {
      if (!repositionFrame) return;
      cancelAnimationFrame(repositionFrame);
      repositionFrame = 0;
    }

    function toggleDropdown() {
      if (container.classList.contains('open')) {
        closeDropdown();
        return;
      }

      positionDropdown();
      container.classList.add('open');
      dropdown.classList.add('open');
    }

    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleDropdown();
    });

    document.addEventListener('click', () => {
      closeDropdown();
    });

    window.addEventListener('resize', () => {
      scheduleDropdownPosition();
    });

    window.addEventListener('scroll', () => {
      scheduleDropdownPosition();
    }, true);

    window.addEventListener('source-selector:close', () => {
      closeDropdown();
    });

    container.querySelectorAll('.source-option').forEach((option) => {
      option.addEventListener('click', () => {
        const source = option.dataset.source;
        const label = PLATFORMS.find((platform) => platform.value === source)?.label || source;

        container.querySelector('.label').textContent = label;
        dropdown.querySelectorAll('.source-option').forEach((item) => item.classList.remove('active'));
        option.classList.add('active');
        closeDropdown();
        saveSource(source);

        if (existingSelect) {
          existingSelect.value = source;
          existingSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }

        window.dispatchEvent(new CustomEvent('sourcechange', { detail: { source, label } }));
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
