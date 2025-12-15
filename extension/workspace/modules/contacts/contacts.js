// workspace/modules/contacts/contacts.js
const ContactsModule = (function () {
  'use strict';

  const state = {
    container: null,
    source: 'backend',
    items: [], // normalized list (either deals or local contacts)
    filtered: [],
    selectedKey: null, // deal.id for backend, externalId for local
    loading: false,
    config: {
      backendUrl: '',
      extensionKey: '',
      pipelineStages: [],
    }
  };

  // ---------- small helpers ----------
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

  function setStatus(text, tone = 'info') {
    const el = state.container?.querySelector('#whs-contacts-status');
    if (!el) return;
    el.textContent = text || '';
    el.dataset.tone = tone;
  }

  function normalizePhone(input) {
    const digits = String(input || '').replace(/\D/g, '');
    return digits;
  }

  function normalizeTags(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw
        .map((t) => {
          if (!t) return null;
          if (typeof t === 'string') return { name: t, color: null };
          if (typeof t === 'object') {
            const name = t.name || t.label || t.tagName || '';
            const color = t.color || t.hexColor || null;
            return name ? { name, color } : null;
          }
          return null;
        })
        .filter(Boolean);
    }
    if (typeof raw === 'string') return [{ name: raw, color: null }];
    return [];
  }

  function tagsToInput(tagsArr) {
    const names = normalizeTags(tagsArr).map((t) => t.name).filter(Boolean);
    return names.join(', ');
  }

  function inputToTags(str) {
    const names = String(str || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // backend accepts array of strings
    return names;
  }

  function getSearchQuery() {
    const q = state.container?.querySelector('#whs-contacts-search')?.value || '';
    return q.trim().toLowerCase();
  }

  function applyFilter() {
    const q = getSearchQuery();
    if (!q) {
      state.filtered = [...state.items];
      return;
    }

    state.filtered = state.items.filter((it) => {
      const name = (it.name || '').toLowerCase();
      const phone = (it.phone || '').toLowerCase();
      const externalId = (it.externalId || '').toLowerCase();
      const stage = (it.stage || '').toLowerCase();
      const notes = (it.notes || '').toLowerCase();
      const tags = (it.tags || []).map((t) => (t.name || t).toString().toLowerCase()).join(' ');
      return (
        name.includes(q) ||
        phone.includes(q) ||
        externalId.includes(q) ||
        stage.includes(q) ||
        notes.includes(q) ||
        tags.includes(q)
      );
    });
  }

  async function loadConfig() {
    const res = await storageSyncGet(['backendUrl', 'extensionKey', 'pipelineStages']);
    state.config.backendUrl = (res.backendUrl || '').toString().trim().replace(/\/$/, '');
    state.config.extensionKey = (res.extensionKey || '').toString().trim();

    const stagesRaw = res.pipelineStages;
    if (Array.isArray(stagesRaw)) {
      state.config.pipelineStages = stagesRaw.map(String);
    } else if (typeof stagesRaw === 'string') {
      // options salva como JSON string
      try {
        const parsed = JSON.parse(stagesRaw);
        state.config.pipelineStages = Array.isArray(parsed) ? parsed.map(String) : [];
      } catch (_) {
        state.config.pipelineStages = [];
      }
    } else {
      state.config.pipelineStages = [];
    }

    const subtitle = state.container?.querySelector('#whs-contacts-subtitle');
    if (subtitle) {
      subtitle.textContent = state.source === 'backend'
        ? `Fonte: Backend (${state.config.backendUrl || 'não configurado'})`
        : 'Fonte: Local (crmContacts no chrome.storage.sync)';
    }
  }

  function apiHeaders(extra = {}) {
    const h = {
      'Content-Type': 'application/json',
      ...extra,
    };

    if (state.config.extensionKey) {
      h['x-extension-key'] = state.config.extensionKey;
    }

    return h;
  }

  async function apiFetch(path, options = {}) {
    if (!state.config.backendUrl) throw new Error('Backend não configurado. Vá em Configurações.');

    const url = `${state.config.backendUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        ...apiHeaders(options.headers || {}),
      }
    });

    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const payload = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => '');

    if (!res.ok) {
      const msg = (payload && payload.error) ? payload.error : (typeof payload === 'string' ? payload : `HTTP ${res.status}`);
      throw new Error(msg);
    }

    return payload;
  }

  // ---------- load lists ----------
  async function loadBackendDeals() {
    await loadConfig();

    if (!state.config.backendUrl || !state.config.extensionKey) {
      setStatus('Configure backendUrl e extensionKey em Configurações para listar deals.', 'warning');
      state.items = [];
      state.filtered = [];
      renderList();
      renderDetails();
      return;
    }

    state.loading = true;
    setStatus('Carregando deals do backend…');
    renderList();

    try {
      const deals = await apiFetch('/crm/deals', { method: 'GET' });
      const arr = Array.isArray(deals) ? deals : [];

      state.items = arr.map((d) => ({
        _type: 'deal',
        key: d.id,
        id: d.id,
        externalId: d.externalId,
        name: d.name,
        phone: d.phone,
        stage: d.stage,
        notes: d.notes,
        status: d.status,
        tags: normalizeTags(d.tags).map((t) => ({ name: t.name, color: t.color })),
        updatedAt: d.updatedAt,
        createdAt: d.createdAt,
      }));

      applyFilter();
      setStatus(`${state.items.length} deals carregados.`);
    } catch (e) {
      console.error('[ContactsModule] loadBackendDeals error', e);
      setStatus('Erro ao carregar deals: ' + (e?.message || String(e)), 'error');
      state.items = [];
      state.filtered = [];
    } finally {
      state.loading = false;
      renderList();
      renderDetails();
    }
  }

  async function loadLocalContacts() {
    await loadConfig();

    state.loading = true;
    setStatus('Carregando contatos locais…');
    renderList();

    try {
      const res = await storageSyncGet(['crmContacts']);
      const map = res.crmContacts && typeof res.crmContacts === 'object' ? res.crmContacts : {};

      const arr = Object.entries(map)
        .map(([externalId, c]) => {
          if (!c || typeof c !== 'object') return null;
          return {
            _type: 'local',
            key: externalId,
            externalId,
            name: c.name || '',
            phone: c.phone || '',
            stage: c.stage || '',
            notes: c.notes || '',
            tags: normalizeTags(c.tags).map((t) => ({ name: t.name, color: t.color })),
            updatedAt: c.updatedAt || c.updated_at || null,
            createdAt: c.createdAt || c.created_at || null,
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const ta = new Date(a.updatedAt || a.createdAt || 0).getTime() || 0;
          const tb = new Date(b.updatedAt || b.createdAt || 0).getTime() || 0;
          return tb - ta;
        });

      state.items = arr;
      applyFilter();
      setStatus(`${state.items.length} contatos locais carregados.`);
    } catch (e) {
      console.error('[ContactsModule] loadLocalContacts error', e);
      setStatus('Erro ao carregar contatos locais: ' + (e?.message || String(e)), 'error');
      state.items = [];
      state.filtered = [];
    } finally {
      state.loading = false;
      renderList();
      renderDetails();
    }
  }

  async function refresh() {
    state.selectedKey = null;
    if (state.source === 'backend') {
      await loadBackendDeals();
    } else {
      await loadLocalContacts();
    }
  }

  // ---------- render ----------
  function renderList() {
    const listEl = state.container?.querySelector('#whs-contacts-list');
    if (!listEl) return;

    if (state.loading) {
      listEl.innerHTML = '<div class="whs-empty">Carregando…</div>';
      return;
    }

    if (!state.filtered.length) {
      listEl.innerHTML = '<div class="whs-empty">Nenhum contato encontrado.</div>';
      return;
    }

    listEl.innerHTML = state.filtered
      .map((it) => {
        const isActive = it.key === state.selectedKey;
        const stage = it.stage || '—';
        const meta = it.phone || it.externalId || '';
        const tags = (it.tags || []).slice(0, 6);
        const tagsHtml = tags.length
          ? `<div class="whs-tags">${tags
              .map((t) => {
                const color = t.color || '#667781';
                return `<span class="whs-tag"><span class="whs-tag-color" style="background:${escapeHtml(color)}"></span>${escapeHtml(t.name)}</span>`;
              })
              .join('')}</div>`
          : '';

        return `
          <div class="whs-contact-item ${isActive ? 'active' : ''}" data-key="${escapeHtml(it.key)}">
            <div class="whs-contact-top">
              <div class="whs-contact-name" title="${escapeHtml(it.name || it.externalId)}">${escapeHtml(it.name || it.externalId)}</div>
              <div class="whs-contact-stage">${escapeHtml(stage)}</div>
            </div>
            <div class="whs-contact-meta">${escapeHtml(meta)}</div>
            ${tagsHtml}
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('.whs-contact-item').forEach((el) => {
      el.addEventListener('click', () => {
        const key = el.getAttribute('data-key');
        if (!key) return;
        state.selectedKey = key;
        renderList();
        renderDetails();
      });
    });
  }

  function stageSelectHtml(value) {
    const stages = state.config.pipelineStages || [];
    if (!stages.length) {
      return `<input class="whs-input" id="whs-detail-stage" value="${escapeHtml(value || '')}" placeholder="Ex.: Em negociação" />`;
    }

    return `
      <select class="whs-input" id="whs-detail-stage">
        <option value="">—</option>
        ${stages
          .map((s) => `<option value="${escapeHtml(s)}" ${String(s) === String(value || '') ? 'selected' : ''}>${escapeHtml(s)}</option>`)
          .join('')}
      </select>
    `;
  }

  function renderDetails() {
    const detailsEl = state.container?.querySelector('#whs-contacts-details');
    if (!detailsEl) return;

    const item = state.items.find((it) => it.key === state.selectedKey);

    if (!item) {
      detailsEl.innerHTML = '<div class="whs-empty">Selecione um contato para ver detalhes.</div>';
      return;
    }

    const isBackend = item._type === 'deal';

    detailsEl.innerHTML = `
      <div class="whs-form">
        <div class="whs-field">
          <label>Nome</label>
          <input class="whs-input" id="whs-detail-name" value="${escapeHtml(item.name || '')}" placeholder="Nome" />
        </div>

        <div class="whs-field">
          <label>Telefone</label>
          <input class="whs-input" id="whs-detail-phone" value="${escapeHtml(item.phone || '')}" placeholder="5511999999999" />
        </div>

        <div class="whs-field">
          <label>Etapa</label>
          ${stageSelectHtml(item.stage || '')}
        </div>

        <div class="whs-field">
          <label>Tags (separadas por vírgula)</label>
          <input class="whs-input" id="whs-detail-tags" value="${escapeHtml(tagsToInput(item.tags))}" placeholder="Ex.: Lead, VIP" />
        </div>

        <div class="whs-field full">
          <label>Notas</label>
          <textarea class="whs-input" id="whs-detail-notes" placeholder="Anotações...">${escapeHtml(item.notes || '')}</textarea>
        </div>

        <div class="whs-field full">
          <div class="whs-detail-actions">
            <button class="btn primary" id="whs-detail-save">Salvar</button>
            <button class="btn secondary" id="whs-detail-open">Abrir chat</button>
            ${isBackend ? '' : '<button class="btn danger" id="whs-detail-delete">Excluir (local)</button>'}
          </div>
          <div class="whs-hint">
            Fonte atual: <strong>${isBackend ? 'Backend' : 'Local'}</strong>
            ${isBackend ? `• Deal ID: <code>${escapeHtml(item.id)}</code>` : `• ExternalId: <code>${escapeHtml(item.externalId)}</code>`}
          </div>
        </div>
      </div>
    `;

    const btnSave = detailsEl.querySelector('#whs-detail-save');
    const btnOpen = detailsEl.querySelector('#whs-detail-open');
    const btnDelete = detailsEl.querySelector('#whs-detail-delete');

    if (btnSave) btnSave.addEventListener('click', () => saveCurrent());
    if (btnOpen) btnOpen.addEventListener('click', () => openChat(item.externalId || item.phone || ''));
    if (btnDelete) btnDelete.addEventListener('click', () => deleteLocal(item.externalId));
  }

  // ---------- actions ----------
  function openChat(chatIdOrPhone) {
    const chatId = (chatIdOrPhone || '').toString();
    if (!chatId) return;

    try {
      chrome.runtime.sendMessage({ type: 'OPEN_WHATSAPP_CHAT', chatId });
    } catch (e) {
      console.warn('[ContactsModule] open chat failed', e);
    }
  }

  async function saveCurrent() {
    const item = state.items.find((it) => it.key === state.selectedKey);
    if (!item) return;

    const name = state.container?.querySelector('#whs-detail-name')?.value || '';
    const phone = state.container?.querySelector('#whs-detail-phone')?.value || '';
    const stage = state.container?.querySelector('#whs-detail-stage')?.value || '';
    const notes = state.container?.querySelector('#whs-detail-notes')?.value || '';
    const tagsStr = state.container?.querySelector('#whs-detail-tags')?.value || '';

    const tags = inputToTags(tagsStr);

    if (item._type === 'deal') {
      // backend
      try {
        await loadConfig();
        await apiFetch(`/crm/deals/${encodeURIComponent(item.id)}`, {
          method: 'PUT',
          body: JSON.stringify({
            name,
            phone,
            stage,
            notes,
            tags,
          })
        });
        toast('Deal atualizado!', 'success');
        await refresh();
      } catch (e) {
        console.error('[ContactsModule] save deal error', e);
        toast('Erro ao salvar no backend: ' + (e?.message || String(e)), 'error');
      }
    } else {
      // local
      try {
        const res = await storageSyncGet(['crmContacts']);
        const map = res.crmContacts && typeof res.crmContacts === 'object' ? res.crmContacts : {};

        const externalId = item.externalId;
        map[externalId] = {
          ...(map[externalId] || {}),
          name,
          phone,
          stage,
          notes,
          tags,
          updatedAt: new Date().toISOString(),
        };

        await storageSyncSet({ crmContacts: map });
        toast('Contato local salvo!', 'success');

        // tenta sincronizar com backend (se configurado)
        try {
          await loadConfig();
          if (state.config.backendUrl && state.config.extensionKey) {
            await apiFetch('/crm/deals', {
              method: 'POST',
              body: JSON.stringify({
                externalId,
                name,
                phone,
                stage,
                notes,
                tags,
              })
            });
          }
        } catch (_) {
          // ignora sync
        }

        await refresh();
        state.selectedKey = externalId;
        renderList();
        renderDetails();
      } catch (e) {
        console.error('[ContactsModule] save local error', e);
        toast('Erro ao salvar localmente: ' + (e?.message || String(e)), 'error');
      }
    }
  }

  async function deleteLocal(externalId) {
    if (!externalId) return;
    const ok = confirm('Remover este contato local? (isso não apaga no backend)');
    if (!ok) return;

    try {
      const res = await storageSyncGet(['crmContacts']);
      const map = res.crmContacts && typeof res.crmContacts === 'object' ? res.crmContacts : {};
      delete map[externalId];
      await storageSyncSet({ crmContacts: map });
      toast('Contato removido.', 'success');
      await refresh();
    } catch (e) {
      console.error('[ContactsModule] delete local error', e);
      toast('Erro ao remover: ' + (e?.message || String(e)), 'error');
    }
  }

  function openNewModal() {
    const isBackend = state.source === 'backend';
    const title = isBackend ? 'Novo Deal (Backend)' : 'Novo Contato (Local)';

    const stages = state.config.pipelineStages || [];
    const stageField = stages.length
      ? `
        <select id="whs-new-stage" class="whs-input">
          <option value="">—</option>
          ${stages.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
        </select>
      `
      : `<input id="whs-new-stage" class="whs-input" placeholder="Etapa" />`;

    const content = `
      <div class="whs-modal-field">
        <label>Nome</label>
        <input id="whs-new-name" class="whs-input" placeholder="Nome" />
      </div>
      <div class="whs-modal-field">
        <label>Telefone ou ChatId</label>
        <input id="whs-new-phone" class="whs-input" placeholder="5511999999999 ou 5511999999999@c.us" />
        <div class="whs-hint">Se você informar apenas o telefone, o ExternalId será gerado como <code>telefone@c.us</code>.</div>
      </div>
      <div class="whs-modal-field">
        <label>Etapa</label>
        ${stageField}
      </div>
      <div class="whs-modal-field">
        <label>Tags</label>
        <input id="whs-new-tags" class="whs-input" placeholder="Lead, VIP" />
      </div>
      <div class="whs-modal-field">
        <label>Notas</label>
        <textarea id="whs-new-notes" class="whs-input" rows="4" placeholder="Anotações..."></textarea>
      </div>
    `;

    window.Workspace?.openModal?.(
      title,
      content,
      `
        <button class="btn secondary" id="whs-new-cancel">Cancelar</button>
        <button class="btn primary" id="whs-new-create">Criar</button>
      `
    );

    // Bind buttons after modal is in DOM
    setTimeout(() => {
      document.getElementById('whs-new-cancel')?.addEventListener('click', () => window.Workspace?.closeModal?.());
      document.getElementById('whs-new-create')?.addEventListener('click', () => createNew(isBackend));
    }, 0);
  }

  async function createNew(isBackend) {
    const name = document.getElementById('whs-new-name')?.value || '';
    const phoneOrId = document.getElementById('whs-new-phone')?.value || '';
    const stage = document.getElementById('whs-new-stage')?.value || '';
    const tagsStr = document.getElementById('whs-new-tags')?.value || '';
    const notes = document.getElementById('whs-new-notes')?.value || '';

    if (!name.trim() || !phoneOrId.trim()) {
      toast('Preencha nome e telefone/chatId.', 'warning');
      return;
    }

    const tags = inputToTags(tagsStr);

    let externalId = phoneOrId.trim();
    let phone = phoneOrId.trim();

    if (!externalId.includes('@')) {
      const digits = normalizePhone(externalId);
      phone = digits;
      externalId = digits ? `${digits}@c.us` : externalId;
    } else {
      phone = normalizePhone(externalId);
    }

    try {
      if (isBackend) {
        await loadConfig();
        await apiFetch('/crm/deals', {
          method: 'POST',
          body: JSON.stringify({
            externalId,
            name,
            phone,
            stage,
            notes,
            tags,
          })
        });
        toast('Deal criado!', 'success');
      } else {
        const res = await storageSyncGet(['crmContacts']);
        const map = res.crmContacts && typeof res.crmContacts === 'object' ? res.crmContacts : {};
        map[externalId] = {
          name,
          phone,
          stage,
          notes,
          tags,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await storageSyncSet({ crmContacts: map });
        toast('Contato local criado!', 'success');

        // tenta sync
        try {
          await loadConfig();
          if (state.config.backendUrl && state.config.extensionKey) {
            await apiFetch('/crm/deals', {
              method: 'POST',
              body: JSON.stringify({ externalId, name, phone, stage, notes, tags })
            });
          }
        } catch (_) {}
      }

      window.Workspace?.closeModal?.();
      await refresh();

      // selecionar recém criado
      state.selectedKey = isBackend
        ? (state.items.find((it) => it.externalId === externalId)?.key || null)
        : externalId;

      renderList();
      renderDetails();
    } catch (e) {
      console.error('[ContactsModule] createNew error', e);
      toast('Erro ao criar: ' + (e?.message || String(e)), 'error');
    }
  }

  // ---------- init ----------
  async function init(container) {
    state.container = container;

    const sourceSel = container.querySelector('#whs-contacts-source');
    const searchEl = container.querySelector('#whs-contacts-search');
    const btnRefresh = container.querySelector('#whs-contacts-refresh');
    const btnNew = container.querySelector('#whs-contacts-new');

    if (sourceSel) {
      sourceSel.value = state.source;
      sourceSel.addEventListener('change', async () => {
        state.source = sourceSel.value;
        state.selectedKey = null;
        await loadConfig();
        await refresh();
      });
    }

    if (searchEl) {
      searchEl.addEventListener('input', () => {
        applyFilter();
        renderList();
      });
    }

    if (btnRefresh) btnRefresh.addEventListener('click', refresh);
    if (btnNew) btnNew.addEventListener('click', openNewModal);

    await refresh();
  }

  return {
    init,
    onShow() {
      try {
        applyFilter();
        renderList();
        renderDetails();
      } catch (_) {}
    }
  };
})();

window.ContactsModule = ContactsModule;
