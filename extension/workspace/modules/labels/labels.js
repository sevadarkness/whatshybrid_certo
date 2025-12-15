// workspace/modules/labels/labels.js
const LabelsModule = (function () {
  'use strict';

  const state = {
    container: null,
    defaultTags: [],
    waLabels: [],
    loadingWa: false,
  };

  function toast(msg, type = 'info') {
    try { window.Workspace?.showToast?.(msg, type); } catch (_) {}
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function storageSyncGet(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(keys, (res) => resolve(res || {}));
      } catch (_) {
        resolve({});
      }
    });
  }

  function storageSyncSet(obj) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.sync.set(obj, () => {
          const err = chrome.runtime?.lastError;
          if (err) reject(new Error(err.message));
          else resolve(true);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function normalizeDefaultTags(raw) {
    if (!raw) return [];

    // options pode salvar como string JSON
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return normalizeDefaultTags(parsed);
      } catch (_) {
        return [];
      }
    }

    if (!Array.isArray(raw)) return [];

    return raw
      .map((t) => {
        if (!t) return null;
        if (typeof t === 'string') return { label: t, color: '#667781' };
        if (typeof t === 'object') {
          const label = t.label || t.name || '';
          const color = t.color || '#667781';
          return label ? { label, color } : null;
        }
        return null;
      })
      .filter(Boolean);
  }

  function renderDefaultTags() {
    const editor = state.container?.querySelector('#whs-tags-editor');
    if (!editor) return;

    if (!state.defaultTags.length) {
      editor.innerHTML = '<div class="whs-empty">Nenhuma tag configurada.</div>';
      return;
    }

    editor.innerHTML = state.defaultTags
      .map((t, idx) => {
        const color = t.color || '#667781';
        return `
          <div class="whs-tag-row" data-idx="${idx}">
            <input class="whs-input" data-role="label" value="${escapeHtml(t.label)}" placeholder="Nome da tag" />
            <div class="whs-color">
              <span class="whs-color-dot" style="background:${escapeHtml(color)}"></span>
              <input class="whs-input" data-role="color" value="${escapeHtml(color)}" placeholder="#00A884" />
            </div>
            <button class="btn danger" data-role="remove" title="Remover">✕</button>
          </div>
        `;
      })
      .join('');

    editor.querySelectorAll('.whs-tag-row').forEach((row) => {
      const idx = Number(row.getAttribute('data-idx'));
      row.querySelector('[data-role="label"]')?.addEventListener('input', (e) => {
        state.defaultTags[idx].label = e.target.value;
      });
      row.querySelector('[data-role="color"]')?.addEventListener('input', (e) => {
        state.defaultTags[idx].color = e.target.value;
        const dot = row.querySelector('.whs-color-dot');
        if (dot) dot.style.background = e.target.value;
      });
      row.querySelector('[data-role="remove"]')?.addEventListener('click', () => {
        state.defaultTags.splice(idx, 1);
        renderDefaultTags();
      });
    });
  }

  async function loadDefaultTags() {
    const res = await storageSyncGet(['defaultTags']);
    state.defaultTags = normalizeDefaultTags(res.defaultTags);
    renderDefaultTags();
  }

  async function saveDefaultTags() {
    const cleaned = state.defaultTags
      .map((t) => ({
        label: String(t.label || '').trim(),
        color: String(t.color || '#667781').trim() || '#667781',
      }))
      .filter((t) => t.label);

    state.defaultTags = cleaned;

    try {
      await storageSyncSet({ defaultTags: cleaned });
      toast('Tags salvas com sucesso!', 'success');
      renderDefaultTags();
    } catch (e) {
      console.error('[LabelsModule] saveDefaultTags error', e);
      toast('Erro ao salvar tags: ' + (e?.message || String(e)), 'error');
    }
  }

  function addTag() {
    state.defaultTags.push({ label: 'Nova tag', color: '#00A884' });
    renderDefaultTags();
  }

  function renderWhatsAppLabels() {
    const el = state.container?.querySelector('#whs-wa-labels');
    if (!el) return;

    if (state.loadingWa) {
      el.innerHTML = '<div class="whs-empty">Carregando labels…</div>';
      return;
    }

    if (!state.waLabels.length) {
      el.innerHTML = '<div class="whs-empty">Nenhum label encontrado (ou sem conexão).</div>';
      return;
    }

    el.innerHTML = state.waLabels
      .map((l) => {
        const color = l.color || '#667781';
        const count = Number(l.count || 0);
        return `
          <div class="whs-wa-label-item">
            <div>
              <div class="whs-wa-label-name"><span class="whs-color-dot" style="background:${escapeHtml(color)}"></span> ${escapeHtml(l.name || l.id)}</div>
              <div class="whs-hint">ID: <code>${escapeHtml(l.id)}</code></div>
            </div>
            <div class="whs-pill">${count} chats</div>
          </div>
        `;
      })
      .join('');
  }

  async function loadWhatsAppLabels() {
    state.loadingWa = true;
    renderWhatsAppLabels();

    try {
      if (!window.WhatsHybridBridge?.getLabels) {
        state.waLabels = [];
        return;
      }

      const labels = await window.WhatsHybridBridge.getLabels();
      state.waLabels = Array.isArray(labels) ? labels : [];
    } catch (e) {
      console.error('[LabelsModule] loadWhatsAppLabels error', e);
      state.waLabels = [];
      toast('Erro ao carregar labels: ' + (e?.message || String(e)), 'error');
    } finally {
      state.loadingWa = false;
      renderWhatsAppLabels();
    }
  }

  async function reloadAll() {
    await loadDefaultTags();
    await loadWhatsAppLabels();
  }

  async function init(container) {
    state.container = container;

    container.querySelector('#whs-labels-save')?.addEventListener('click', saveDefaultTags);
    container.querySelector('#whs-tag-add')?.addEventListener('click', addTag);
    container.querySelector('#whs-wa-labels-refresh')?.addEventListener('click', loadWhatsAppLabels);
    container.querySelector('#whs-labels-reload')?.addEventListener('click', reloadAll);

    await reloadAll();
  }

  return { init };
})();

window.LabelsModule = LabelsModule;
