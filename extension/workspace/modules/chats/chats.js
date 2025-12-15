// workspace/modules/chats/chats.js
const ChatsModule = (function () {
  'use strict';

  const state = {
    container: null,
    chats: [],
    filtered: [],
    selectedChatId: null,
    messages: [],
    loadingChats: false,
    loadingMessages: false,
  };

  function formatTs(ts) {
    if (!ts) return '';
    try {
      let ms = ts;
      if (typeof ts === 'string') {
        const n = Number(ts);
        ms = Number.isFinite(n) ? n : ts;
      }
      if (typeof ms === 'number') {
        if (ms < 1e12) ms *= 1000; // seconds -> ms
        const d = new Date(ms);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString();
      }
      // ISO string
      const d = new Date(ms);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString();
    } catch (_) {
      return '';
    }
  }

  function shortTs(ts) {
    if (!ts) return '';
    try {
      let ms = ts;
      if (typeof ts === 'number' && ts < 1e12) ms = ts * 1000;
      const d = new Date(ms);
      if (isNaN(d.getTime())) return '';
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      return sameDay
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString();
    } catch (_) {
      return '';
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }


  // -------- Internal Notes (shared with Workspace command palette) --------
  const INTERNAL_NOTES_KEY = 'whs_internal_notes';

  function storageLocalGet(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (res) => resolve(res || {}));
      } catch (_) {
        resolve({});
      }
    });
  }

  function storageLocalSet(obj) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set(obj, () => {
          const err = chrome.runtime?.lastError;
          if (err) reject(new Error(err.message));
          else resolve(true);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function getInternalNotes(chatId) {
    if (!chatId) return [];
    const res = await storageLocalGet([INTERNAL_NOTES_KEY]);
    const map = (res && res[INTERNAL_NOTES_KEY] && typeof res[INTERNAL_NOTES_KEY] === 'object') ? res[INTERNAL_NOTES_KEY] : {};
    const arr = Array.isArray(map[chatId]) ? map[chatId] : [];
    return arr;
  }

  async function addInternalNote(chatId, text) {
    if (!chatId) return;
    const clean = String(text || '').trim();
    if (!clean) return;

    const res = await storageLocalGet([INTERNAL_NOTES_KEY]);
    const map = (res && res[INTERNAL_NOTES_KEY] && typeof res[INTERNAL_NOTES_KEY] === 'object') ? res[INTERNAL_NOTES_KEY] : {};
    const existing = Array.isArray(map[chatId]) ? map[chatId] : [];

    existing.unshift({
      id: `note_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      ts: Date.now(),
      text: clean
    });

    map[chatId] = existing.slice(0, 200);
    await storageLocalSet({ [INTERNAL_NOTES_KEY]: map });
  }

  function fmtTime(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleString('pt-BR');
    } catch (_) {
      return String(ts);
    }
  }

  function openChatInWhatsApp(chatIdOrPhone) {
    const chatId = (chatIdOrPhone || '').toString();
    if (!chatId) return;
    try {
      chrome.runtime.sendMessage({ type: 'OPEN_WHATSAPP_CHAT', chatId });
    } catch (e) {
      console.warn('[ChatsModule] open chat failed', e);
    }
  }

  function buildTimelineHTML(messages) {
    const list = Array.isArray(messages) ? messages.slice(0, 30) : [];
    if (!list.length) {
      return `
        <div class="state state-empty" style="padding:12px;">
          <div class="state-icon">🕒</div>
          <div class="state-title">Sem timeline ainda</div>
          <div class="state-text">Abra uma conversa no WhatsApp para carregar mensagens.</div>
        </div>
      `;
    }

    return `
      <div class="timeline-list">
        ${list.map((m) => {
          const dir = m.direction === 'out' ? 'out' : 'in';
          const body = escapeHtml(m.content || '');
          const t = fmtTime(m.timestamp);
          return `
            <div class="timeline-item ${dir}">
              <div class="meta">${dir === 'out' ? 'Você' : 'Contato'} • ${escapeHtml(t)}</div>
              <div class="body">${body}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  async function renderContactContextPanel({ forceTab } = {}) {
    const chatId = state.selectedChatId;
    if (!chatId) return;

    const chat = state.chats.find((c) => c.id === chatId) || {};
    const name = chat.name || chat.title || chat.phone || chat.id || 'Contato';
    const phone = chat.phone || chat.id || '';

    // expose selection for command palette etc
    try {
      window.StateManager?.setState?.('context.selectedChatId', chatId);
      window.StateManager?.setState?.('context.selectedChatName', name);
    } catch (_) {}

    const summaryHTML = `
      <div class="contact-summary">
        <div class="summary-title">${escapeHtml(name)}</div>
        <div class="summary-meta">
          <span class="badge badge--muted">${chat.isGroup ? 'Grupo' : 'Contato'}</span>
          ${chat.unreadCount ? `<span class="badge badge--info">${chat.unreadCount} não lidas</span>` : ''}
        </div>

        <div class="summary-grid" style="margin-top:10px;">
          <div class="row"><span class="k">ID/Telefone</span><span class="v">${escapeHtml(phone)}</span></div>
          <div class="row"><span class="k">Última atividade</span><span class="v">${escapeHtml(fmtTime(chat.timestamp || state.messages?.[0]?.timestamp || ''))}</span></div>
        </div>

        <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn secondary" id="ctx-open-wa" type="button">Abrir no WhatsApp</button>
          <button class="btn ghost" id="ctx-copy-phone" type="button">Copiar</button>
          <button class="btn ghost" id="ctx-new-note" type="button">Nova nota</button>
        </div>

        <div class="help-text" style="margin-top:10px;">Dica: use notas internas para contexto e próximos passos (SLA).</div>
      </div>
    `;

    const timelineHTML = buildTimelineHTML(state.messages);

    const notes = await getInternalNotes(chatId);
    const notesHTML = `
      <div class="notes-panel">
        <div class="field">
          <label>Nota interna</label>
          <textarea id="ctx-note-input" class="input" rows="4" placeholder="Escreva uma nota interna..."></textarea>
          <div style="margin-top:8px; display:flex; gap:8px;">
            <button class="btn primary" id="ctx-add-note" type="button">Adicionar</button>
            <button class="btn ghost" id="ctx-clear-note" type="button">Limpar</button>
          </div>
        </div>

        <div class="section-title" style="margin-top:12px; font-size:12px;">Histórico</div>
        <div id="ctx-notes-list" class="notes-list" style="margin-top:8px;">
          ${renderNotesList(notes)}
        </div>
      </div>
    `;

    const content = `
      <div id="whs-contact-context">
        <div class="tabs" style="margin-bottom:10px;">
          <button class="tab ${forceTab === 'summary' || !forceTab ? 'active' : ''}" data-tab="summary">Resumo</button>
          <button class="tab ${forceTab === 'timeline' ? 'active' : ''}" data-tab="timeline">Timeline</button>
          <button class="tab ${forceTab === 'notes' ? 'active' : ''}" data-tab="notes">Notas</button>
        </div>

        <div class="tab-panels">
          <div class="tab-panel ${forceTab === 'summary' || !forceTab ? 'active' : ''}" data-panel="summary">${summaryHTML}</div>
          <div class="tab-panel ${forceTab === 'timeline' ? 'active' : ''}" data-panel="timeline">${timelineHTML}</div>
          <div class="tab-panel ${forceTab === 'notes' ? 'active' : ''}" data-panel="notes">${notesHTML}</div>
        </div>
      </div>
    `;

    try {
      window.Workspace?.openContextPanel?.(name, content);
    } catch (e) {
      console.warn('[ChatsModule] openContextPanel failed', e);
      return;
    }

    bindContactContextHandlers(chatId, phone);
  }

  function renderNotesList(notes) {
    const arr = Array.isArray(notes) ? notes : [];
    if (!arr.length) {
      return `
        <div class="state state-empty" style="padding:12px;">
          <div class="state-icon">📝</div>
          <div class="state-title">Sem notas ainda</div>
          <div class="state-text">Crie sua primeira nota interna para este contato.</div>
        </div>
      `;
    }

    return `
      <div class="notes-items">
        ${arr.map((n) => {
          const t = fmtTime(n.ts);
          const txt = escapeHtml(n.text || '');
          return `
            <div class="note-item">
              <div class="meta">${escapeHtml(t)}</div>
              <div class="text">${txt}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function bindContactContextHandlers(chatId, phone) {
    const root = document.getElementById('context-panel');
    if (!root) return;

    // Tabs
    const ctx = root.querySelector('#whs-contact-context');
    if (ctx) {
      const tabs = $$('.tab', ctx);
      tabs.forEach((t) => {
        t.addEventListener('click', () => {
          tabs.forEach((x) => x.classList.remove('active'));
          t.classList.add('active');
          const key = t.dataset.tab;
          $$('.tab-panel', ctx).forEach((p) => {
            if (p.dataset.panel === key) p.classList.add('active');
            else p.classList.remove('active');
          });
        });
      });
    }

    // Buttons
    root.querySelector('#ctx-open-wa')?.addEventListener('click', () => openChatInWhatsApp(phone || chatId));
    root.querySelector('#ctx-copy-phone')?.addEventListener('click', async () => {
      const value = String(phone || chatId || '');
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        toast('Copiado!', 'success');
      } catch (_) {
        toast('Não foi possível copiar automaticamente.', 'warning');
      }
    });
    root.querySelector('#ctx-new-note')?.addEventListener('click', () => {
      try { root.querySelector('[data-tab="notes"]')?.click(); } catch (_) {}
      try { root.querySelector('#ctx-note-input')?.focus(); } catch (_) {}
    });

    // Notes actions
    root.querySelector('#ctx-clear-note')?.addEventListener('click', () => {
      const el = root.querySelector('#ctx-note-input');
      if (el) el.value = '';
    });

    root.querySelector('#ctx-add-note')?.addEventListener('click', async () => {
      const el = root.querySelector('#ctx-note-input');
      const val = (el?.value || '').trim();
      if (!val) {
        toast('Escreva uma nota antes de adicionar.', 'warning');
        return;
      }
      try {
        await addInternalNote(chatId, val);
        if (el) el.value = '';
        toast('Nota adicionada.', 'success');
        const notes = await getInternalNotes(chatId);
        const listEl = root.querySelector('#ctx-notes-list');
        if (listEl) listEl.innerHTML = renderNotesList(notes);
      } catch (e) {
        toast('Falha ao salvar nota: ' + (e?.message || String(e)), 'error');
      }
    });
  }

  // Keep notes in sync with Workspace modal saves
  try {
    window.addEventListener('whs:internalNoteUpdated', async (ev) => {
      const cid = ev?.detail?.chatId;
      if (!cid || cid !== state.selectedChatId) return;
      await renderContactContextPanel({ forceTab: 'notes' });
    });
  } catch (_) {}

  function setStatus(text, tone = 'info') {
    const el = state.container?.querySelector('#whs-chats-status');
    if (!el) return;
    el.textContent = text || '';
    el.dataset.tone = tone;
  }

  function getSearchQuery() {
    const q = state.container?.querySelector('#whs-chats-search')?.value || '';
    return q.trim().toLowerCase();
  }

  function applyFilter() {
    const q = getSearchQuery();
    if (!q) {
      state.filtered = [...state.chats];
      return;
    }
    state.filtered = state.chats.filter((c) => {
      const name = (c.name || '').toLowerCase();
      const id = (c.id || '').toLowerCase();
      const last = (c.lastMessage?.body || '').toLowerCase();
      return name.includes(q) || id.includes(q) || last.includes(q);
    });
  }

  function renderChatList() {
    const listEl = state.container?.querySelector('#whs-chats-list');
    if (!listEl) return;

    if (state.loadingChats) {
      listEl.innerHTML = '<div class="whs-empty">Carregando conversas…</div>';
      return;
    }

    if (!state.filtered.length) {
      listEl.innerHTML = '<div class="whs-empty">Nenhuma conversa encontrada.</div>';
      return;
    }

    listEl.innerHTML = state.filtered
      .map((chat) => {
        const isActive = chat.id === state.selectedChatId;
        const isGroup = !!chat.isGroup;
        const avatar = isGroup ? '👥' : '👤';
        const lastBody = chat.lastMessage?.body || '';
        const unread = Number(chat.unreadCount || 0);
        const ts = chat.lastMessage?.timestamp || chat.timestamp;
        const badge = unread > 0 ? `<span class="whs-unread">${unread}</span>` : '';

        return `
          <div class="whs-chat-item ${isActive ? 'active' : ''}" data-chat-id="${escapeHtml(chat.id)}">
            <div class="whs-chat-avatar">${avatar}</div>
            <div class="whs-chat-item-main">
              <div class="whs-chat-item-top">
                <div class="whs-chat-item-name" title="${escapeHtml(chat.name || chat.id)}">${escapeHtml(chat.name || chat.id)}</div>
                <div class="whs-chat-item-time">${escapeHtml(shortTs(ts))}</div>
              </div>
              <div class="whs-chat-item-preview">${escapeHtml(lastBody || (isGroup ? 'Grupo' : ''))}</div>
              <div class="whs-chat-item-badge">
                ${badge}
                <span>${isGroup ? 'Grupo' : 'Chat'}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    // Bind click events
    listEl.querySelectorAll('.whs-chat-item').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-chat-id');
        if (!id) return;
        selectChat(id);
      });
    });
  }

  function renderMessages() {
    const headerName = state.container?.querySelector('#whs-chat-name');
    const headerMeta = state.container?.querySelector('#whs-chat-meta');
    const msgEl = state.container?.querySelector('#whs-chat-messages');
    const sendBtn = state.container?.querySelector('#whs-chat-send');

    const selected = state.chats.find((c) => c.id === state.selectedChatId);

    if (headerName) headerName.textContent = selected ? (selected.name || selected.id) : 'Selecione uma conversa';
    if (headerMeta) {
      headerMeta.textContent = selected
        ? `${selected.isGroup ? 'Grupo' : 'Chat'} • ${selected.id}`
        : '';
    }

    if (sendBtn) sendBtn.disabled = !state.selectedChatId || state.loadingMessages;

    if (!msgEl) return;

    if (!state.selectedChatId) {
      msgEl.innerHTML = '<div class="whs-empty">Nenhuma conversa selecionada.</div>';
      return;
    }

    if (state.loadingMessages) {
      msgEl.innerHTML = '<div class="whs-empty">Carregando mensagens…</div>';
      return;
    }

    if (!state.messages.length) {
      msgEl.innerHTML = '<div class="whs-empty">Sem mensagens para exibir.</div>';
      return;
    }

    msgEl.innerHTML = state.messages
      .map((m) => {
        const direction = m.fromMe ? 'out' : 'in';
        const body = m.body || '';
        const ts = m.timestamp || m.t || m.time || m.date;
        return `
          <div class="whs-msg ${direction}">
            <div class="whs-msg-body">${escapeHtml(body)}</div>
            <div class="whs-msg-meta">${escapeHtml(formatTs(ts))}</div>
          </div>
        `;
      })
      .join('');

    // Scroll to bottom
    try {
      msgEl.scrollTop = msgEl.scrollHeight;
    } catch (_) {}
  }

  async function loadChats() {
    if (!window.WhatsHybridBridge) {
      setStatus('Bridge indisponível. Abra o WhatsApp Web e recarregue.', 'error');
      state.chats = [];
      state.filtered = [];
      renderChatList();
      return;
    }

    state.loadingChats = true;
    setStatus('Carregando conversas…');
    renderChatList();

    try {
      const chats = await window.WhatsHybridBridge.getChats({ includeMessages: false });
      const arr = Array.isArray(chats) ? chats : [];
      // Sort: lastMessage timestamp desc
      arr.sort((a, b) => {
        const ta = a?.lastMessage?.timestamp || a?.timestamp || 0;
        const tb = b?.lastMessage?.timestamp || b?.timestamp || 0;
        return (tb || 0) - (ta || 0);
      });
      state.chats = arr;
      applyFilter();
      setStatus(`${arr.length} conversas carregadas.`);
    } catch (e) {
      console.error('[ChatsModule] Erro ao carregar chats:', e);
      setStatus('Erro ao carregar conversas: ' + (e?.message || String(e)), 'error');
      state.chats = [];
      state.filtered = [];
    } finally {
      state.loadingChats = false;
      renderChatList();
      renderMessages();
    }
  }

  async function loadMessages(chatId) {
    if (!window.WhatsHybridBridge) return;

    state.loadingMessages = true;
    renderMessages();

    try {
      const msgs = await window.WhatsHybridBridge.getChatMessages(chatId, 60);
      const arr = Array.isArray(msgs) ? msgs : [];
      // Sort asc
      arr.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      state.messages = arr;
    } catch (e) {
      console.error('[ChatsModule] Erro ao carregar mensagens:', e);
      state.messages = [];
      if (window.Workspace?.showToast) {
        window.Workspace.showToast('Erro ao carregar mensagens: ' + (e?.message || String(e)), 'error');
      }
    } finally {
      state.loadingMessages = false;
      renderMessages();
      // Sync context panel timeline/snippets
      try { await renderContactContextPanel(); } catch (_) {}
    }
  }

  async function selectChat(chatId) {
    state.selectedChatId = chatId;

        // Expose selection globally (for Command Palette / notes)
        try {
          window.StateManager?.setState?.('context.selectedChatId', chatId);
          const c = state.chats.find((x) => x.id === chatId) || {};
          window.StateManager?.setState?.('context.selectedChatName', c.name || c.title || c.phone || c.id || chatId);
        } catch (_) {}
    // Re-render list selection
    applyFilter();
    renderChatList();
    await loadMessages(chatId);
        // Ensure context panel is visible (it will be refreshed once messages load)
        try { await renderContactContextPanel(); } catch (_) {}
  }

  async function sendMessage() {
    const input = state.container?.querySelector('#whs-chat-text');
    const text = input?.value || '';
    if (!state.selectedChatId) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    if (!window.WhatsHybridBridge?.sendMessage) {
      window.Workspace?.showToast?.('Bridge indisponível para enviar.', 'error');
      return;
    }

    try {
      const btn = state.container?.querySelector('#whs-chat-send');
      if (btn) btn.disabled = true;

      await window.WhatsHybridBridge.sendMessage(state.selectedChatId, trimmed);
      if (input) input.value = '';

      window.Workspace?.showToast?.('Mensagem enviada!', 'success');
      await loadMessages(state.selectedChatId);
    } catch (e) {
      console.error('[ChatsModule] Erro ao enviar:', e);
      window.Workspace?.showToast?.('Erro ao enviar: ' + (e?.message || String(e)), 'error');
    } finally {
      const btn = state.container?.querySelector('#whs-chat-send');
      if (btn) btn.disabled = false;
    }
  }

  function openSelectedChat() {
    if (!state.selectedChatId) return;
    try {
      chrome.runtime.sendMessage({ type: 'OPEN_WHATSAPP_CHAT', chatId: state.selectedChatId });
    } catch (e) {
      console.warn('[ChatsModule] open chat failed', e);
    }
  }

  async function init(container) {
    state.container = container;

    const searchEl = container.querySelector('#whs-chats-search');
    const refreshBtn = container.querySelector('#whs-chats-refresh');
    const openBtn = container.querySelector('#whs-chat-open');
    const reloadBtn = container.querySelector('#whs-chat-reload');
    const sendBtn = container.querySelector('#whs-chat-send');

    if (searchEl) {
      searchEl.addEventListener('input', () => {
        applyFilter();
        renderChatList();
      });
    }

    if (refreshBtn) refreshBtn.addEventListener('click', loadChats);
    if (openBtn) openBtn.addEventListener('click', openSelectedChat);
    if (reloadBtn) reloadBtn.addEventListener('click', () => {
      if (state.selectedChatId) loadMessages(state.selectedChatId);
    });

    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    const textArea = container.querySelector('#whs-chat-text');
    if (textArea) {
      textArea.addEventListener('keydown', (e) => {
        // Ctrl+Enter to send
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          sendMessage();
        }
      });
    }

    // Load initial chats
    await loadChats();
  }

  return {
    init,
    onShow() {
      // Re-render selection when coming back
      try {
        applyFilter();
        renderChatList();
        renderMessages();
      } catch (_) {}
    },
  };
})();

window.ChatsModule = ChatsModule;
