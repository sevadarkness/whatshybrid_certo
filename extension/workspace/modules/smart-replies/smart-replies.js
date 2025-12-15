// workspace/modules/smart-replies/smart-replies.js
const SmartRepliesModule = (function () {
  'use strict';

  const state = {
    container: null,
    config: {
      backendUrl: '',
      extensionKey: '',
      licenseKey: '',
      licenseStatus: '',
      licenseExpiresAt: '',
      licenseAiCredits: null,
      aiEnabled: true,
      insightsEnabled: true,
      aiTone: 'profissional',
      userName: '',
      // smart replies prefs (module-only)
      smartReplyLanguage: 'Portuguese',
      smartReplyForceLanguage: false,
      smartReplyTransliterate: false,
      smartReplyEmojiEnabled: true,
    },
    generating: false,
    replies: [],
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
      .replace(/'/g, '&#039;');
  }

  function storageSyncGet(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(keys, resolve);
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
          if (err) reject(err);
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function loadConfig() {
    const data = await storageSyncGet([
      'backendUrl',
      'extensionKey',
      'licenseKey',
      'licenseStatus',
      'licenseExpiresAt',
      'licenseAiCredits',
      'aiEnabled',
      'insightsEnabled',
      'aiTone',
      'userName',
      'smartReplyLanguage',
      'smartReplyForceLanguage',
      'smartReplyTransliterate',
      'smartReplyEmojiEnabled',
    ]);

    state.config.backendUrl = (data.backendUrl || '').trim();
    state.config.extensionKey = (data.extensionKey || '').trim();
    state.config.licenseKey = (data.licenseKey || '').trim();
    state.config.licenseStatus = data.licenseStatus || '';
    state.config.licenseExpiresAt = data.licenseExpiresAt || '';
    state.config.licenseAiCredits = typeof data.licenseAiCredits === 'number' ? data.licenseAiCredits : null;

    state.config.aiEnabled = typeof data.aiEnabled === 'boolean' ? data.aiEnabled : true;
    state.config.insightsEnabled = typeof data.insightsEnabled === 'boolean' ? data.insightsEnabled : true;
    state.config.aiTone = data.aiTone || 'profissional';
    state.config.userName = data.userName || '';

    state.config.smartReplyLanguage = data.smartReplyLanguage || 'Portuguese';
    state.config.smartReplyForceLanguage = !!data.smartReplyForceLanguage;
    state.config.smartReplyTransliterate = !!data.smartReplyTransliterate;
    state.config.smartReplyEmojiEnabled = data.smartReplyEmojiEnabled !== false;
  }

  function canUseBackend() {
    return !!(state.config.backendUrl && state.config.extensionKey && state.config.licenseKey);
  }

  async function apiSmartReplies(message) {
    const backendUrl = state.config.backendUrl.replace(/\/+$/, '');
    const url = `${backendUrl}/ai/smart-replies`;

    const body = {
      message,
      language: state.config.smartReplyLanguage,
      transliterate: state.config.smartReplyTransliterate,
      emojiEnabled: state.config.smartReplyEmojiEnabled,
      forceSelectedLanguage: state.config.smartReplyForceLanguage,
      userName: state.config.userName || undefined,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-extension-key': state.config.extensionKey,
        'x-license-key': state.config.licenseKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Falha ${res.status}: ${txt || res.statusText}`);
    }

    const json = await res.json();
    return Array.isArray(json.replies) ? json.replies : [];
  }

  // ---------- render ----------
  function renderStatus() {
    const el = state.container.querySelector('#whs-ai-status');
    if (!el) return;

    const rows = [
      {
        label: 'Backend',
        value: state.config.backendUrl || '(não configurado)',
        ok: !!state.config.backendUrl,
      },
      {
        label: 'Extension Key',
        value: state.config.extensionKey ? 'OK' : '(não configurado)',
        ok: !!state.config.extensionKey,
      },
      {
        label: 'License',
        value: state.config.licenseStatus ? `${state.config.licenseStatus}${state.config.licenseExpiresAt ? ' (expira ' + state.config.licenseExpiresAt + ')' : ''}` : (state.config.licenseKey ? 'Configurada (status indisponível)' : '(não configurada)'),
        ok: !!state.config.licenseKey,
      },
      {
        label: 'Créditos IA',
        value: state.config.licenseAiCredits == null ? '—' : String(state.config.licenseAiCredits),
        ok: state.config.licenseAiCredits == null ? null : state.config.licenseAiCredits > 0,
      },
    ];

    el.innerHTML = rows
      .map((r) => {
        const pill = r.ok === null ? '<span class="whs-pill">N/D</span>' : r.ok ? '<span class="whs-pill">OK</span>' : '<span class="whs-pill">Falta</span>';
        return `
          <div class="whs-status-row">
            <div>
              <div class="whs-strong">${escapeHtml(r.label)}</div>
              <div class="whs-hint">${escapeHtml(r.value)}</div>
            </div>
            ${pill}
          </div>
        `;
      })
      .join('');
  }

  function renderPrefs() {
    const enabled = state.container.querySelector('#whs-ai-enabled');
    const insights = state.container.querySelector('#whs-ai-insights');
    const tone = state.container.querySelector('#whs-ai-tone');
    const user = state.container.querySelector('#whs-ai-user-name');

    const emoji = state.container.querySelector('#whs-ai-emoji');
    const lang = state.container.querySelector('#whs-ai-language');
    const forceLang = state.container.querySelector('#whs-ai-force-language');
    const translit = state.container.querySelector('#whs-ai-transliterate');

    if (enabled) enabled.checked = !!state.config.aiEnabled;
    if (insights) insights.checked = !!state.config.insightsEnabled;
    if (tone) tone.value = state.config.aiTone || 'profissional';
    if (user) user.value = state.config.userName || '';

    if (emoji) emoji.checked = state.config.smartReplyEmojiEnabled !== false;
    if (lang) lang.value = state.config.smartReplyLanguage || 'Portuguese';
    if (forceLang) forceLang.checked = !!state.config.smartReplyForceLanguage;
    if (translit) translit.checked = !!state.config.smartReplyTransliterate;
  }

  function renderReplies() {
    const el = state.container.querySelector('#whs-ai-results');
    if (!el) return;

    if (state.generating) {
      el.innerHTML = '<div class="whs-hint">Gerando sugestões…</div>';
      return;
    }

    if (!state.replies.length) {
      el.innerHTML = '<div class="whs-hint">As 3 sugestões aparecerão aqui.</div>';
      return;
    }

    el.innerHTML = state.replies
      .map((r, idx) => {
        return `
          <div class="whs-reply" data-idx="${idx}">
            <div class="whs-reply-text">${escapeHtml(r)}</div>
            <div class="whs-reply-actions">
              <button class="btn secondary" data-action="copy" data-idx="${idx}">Copiar</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderAll() {
    renderStatus();
    renderPrefs();
    renderReplies();
  }

  // ---------- actions ----------
  async function savePrefs() {
    const enabled = state.container.querySelector('#whs-ai-enabled');
    const insights = state.container.querySelector('#whs-ai-insights');
    const tone = state.container.querySelector('#whs-ai-tone');
    const user = state.container.querySelector('#whs-ai-user-name');

    const emoji = state.container.querySelector('#whs-ai-emoji');
    const lang = state.container.querySelector('#whs-ai-language');
    const forceLang = state.container.querySelector('#whs-ai-force-language');
    const translit = state.container.querySelector('#whs-ai-transliterate');

    state.config.aiEnabled = !!enabled?.checked;
    state.config.insightsEnabled = !!insights?.checked;
    state.config.aiTone = tone?.value || 'profissional';
    state.config.userName = user?.value || '';

    state.config.smartReplyEmojiEnabled = !!emoji?.checked;
    state.config.smartReplyLanguage = lang?.value || 'Portuguese';
    state.config.smartReplyForceLanguage = !!forceLang?.checked;
    state.config.smartReplyTransliterate = !!translit?.checked;

    await storageSyncSet({
      aiEnabled: state.config.aiEnabled,
      insightsEnabled: state.config.insightsEnabled,
      aiTone: state.config.aiTone,
      userName: state.config.userName,
      smartReplyEmojiEnabled: state.config.smartReplyEmojiEnabled,
      smartReplyLanguage: state.config.smartReplyLanguage,
      smartReplyForceLanguage: state.config.smartReplyForceLanguage,
      smartReplyTransliterate: state.config.smartReplyTransliterate,
    });

    toast('Preferências salvas.', 'success');
    renderStatus();
  }

  async function generate() {
    const messageEl = state.container.querySelector('#whs-ai-message');
    const message = (messageEl?.value || '').trim();

    if (!message) {
      toast('Digite uma mensagem para gerar sugestões.', 'error');
      return;
    }

    if (!canUseBackend()) {
      toast('Configure backendUrl, extensionKey e licenseKey em Configurações.', 'error');
      return;
    }

    state.generating = true;
    state.replies = [];
    renderReplies();

    try {
      const replies = await apiSmartReplies(message);
      state.replies = replies.length ? replies.slice(0, 3) : [];
      if (!state.replies.length) {
        toast('Nenhuma sugestão retornada pela IA.', 'error');
      }
    } catch (e) {
      toast(e?.message || 'Erro ao gerar sugestões.', 'error');
    } finally {
      state.generating = false;
      renderReplies();
    }
  }

  async function copyReply(idx) {
    const reply = state.replies[idx];
    if (!reply) return;
    try {
      await navigator.clipboard.writeText(reply);
      toast('Copiado!', 'success');
    } catch (_) {
      toast('Não foi possível copiar automaticamente. Selecione e copie manualmente.', 'error');
    }
  }

  // ---------- lifecycle ----------
  async function init(containerEl) {
    state.container = containerEl;

    const saveBtn = containerEl.querySelector('#whs-ai-save');
    const genBtn = containerEl.querySelector('#whs-ai-generate');

    saveBtn?.addEventListener('click', () => savePrefs().catch(() => toast('Falha ao salvar.', 'error')));
    genBtn?.addEventListener('click', () => generate());

    containerEl.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('button[data-action="copy"]');
      if (!btn) return;
      const idx = Number(btn.getAttribute('data-idx') || '0');
      copyReply(idx);
    });

    await loadConfig();
    renderAll();
  }

  return { init };
})();

// Expose controller for module-loader
window.SmartRepliesModule = SmartRepliesModule;

