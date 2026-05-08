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
        margin-left: 8px;
      }
      .source-selector-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        border: 1px solid var(--border, #e0e0e0);
        border-radius: 6px;
        background: var(--surface, #fff);
        color: var(--text, #333);
        font-size: 13px;
        cursor: pointer;
        transition: all 0.15s;
        white-space: nowrap;
        user-select: none;
      }
      .source-selector-btn:hover {
        border-color: var(--primary, #ec4141);
        color: var(--primary, #ec4141);
      }
      .source-selector-btn .arrow {
        font-size: 10px;
        transition: transform 0.2s;
      }
      .source-selector.open .source-selector-btn .arrow {
        transform: rotate(180deg);
      }
      .source-dropdown {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        min-width: 120px;
        background: var(--surface, #fff);
        border: 1px solid var(--border, #e0e0e0);
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        z-index: 100;
        overflow: hidden;
        opacity: 0;
        transform: translateY(-4px);
        pointer-events: none;
        transition: all 0.15s;
      }
      .source-selector.open .source-dropdown {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }
      .source-option {
        display: flex;
        align-items: center;
        padding: 8px 14px;
        font-size: 13px;
        color: var(--text, #333);
        cursor: pointer;
        transition: background 0.1s;
      }
      .source-option:hover,
      .source-option.active {
        background: var(--hover, #f5f5f5);
      }
      .source-option.active {
        color: var(--primary, #ec4141);
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
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      container.classList.toggle('open');
    });

    document.addEventListener('click', () => {
      container.classList.remove('open');
    });

    container.querySelectorAll('.source-option').forEach((option) => {
      option.addEventListener('click', () => {
        const source = option.dataset.source;
        const label = PLATFORMS.find((platform) => platform.value === source)?.label || source;

        container.querySelector('.label').textContent = label;
        container.querySelectorAll('.source-option').forEach((item) => item.classList.remove('active'));
        option.classList.add('active');
        container.classList.remove('open');
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
