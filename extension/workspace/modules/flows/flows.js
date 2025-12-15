// workspace/modules/flows/flows.js
const FlowsModule = (function () {
  'use strict';

  const state = {
    container: null,
    flows: [],
    filtered: [],
    selectedId: null,
    loading: false,
    dirty: false,
    config: {
      backendUrl: '',
      extensionKey: '',
      pipelineStages: [],
    },
  };

  // ---------- helpers ----------
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

  function setStatus(text, tone = 'info') {
    const el = state.container?.querySelector('#whs-flows-status');
    if (!el) return;
    el.textContent = text || '';
    el.dataset.tone = tone;
  }

  function getSearchQuery() {
    const q = state.container?.querySelector('#whs-flows-search')?.value || '';
    return q.trim().toLowerCase();
  }

  function applyFilter() {
    const q = getSearchQuery();
    if (!q) {
      state.filtered = [...state.flows];
      return;
    }

    state.filtered = state.flows.filter((f) => {
      const name = (f.name || '').toLowerCase();
      const trig = (f.trigger?.text || '').toLowerCase();
      const id = (f.id || '').toLowerCase();
      return name.includes(q) || trig.includes(q) || id.includes(q);
    });
  }

  function ensureFlow(flow) {
    const f = flow && typeof flow === 'object' ? { ...flow } : {};
    if (!f.id) f.id = `flow_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    if (typeof f.active !== 'boolean') f.active = true;
    if (!f.name) f.name = 'Novo flow';
    if (!f.trigger || typeof f.trigger !== 'object') f.trigger = { type: 'message_contains', text: '' };
    if (!f.trigger.type) f.trigger.type = 'message_contains';
    if (!Array.isArray(f.actions)) f.actions = [];
    // normalize actions fields
    f.actions = f.actions.map((a) => {
      const act = a && typeof a === 'object' ? { ...a } : {};
      if (!act.type) act.type = 'move_stage';
      if (act.type === 'move_stage') {
        // support both "to" and "stage" for backward compatibility
        if (!act.stage && act.to) act.stage = act.to;
        if (!act.to && act.stage) act.to = act.stage;
      }
      if (act.type === 'create_task') {
        if (!act.title) act.title = 'Follow-up';
        if (typeof act.dueInMinutes !== 'number') {
          const n = Number(act.dueInMinutes);
          act.dueInMinutes = Number.isFinite(n) ? n : 60;
        }
      }
      return act;
    });
    return f;
  }

  async function loadConfig() {
    const res = await storageSyncGet(['backendUrl', 'extensionKey', 'pipelineStages']);
    state.config.backendUrl = (res.backendUrl || '').toString().trim().replace(/\/$/, '');
    state.config.extensionKey = (res.extensionKey || '').toString().trim();

    const stagesRaw = res.pipelineStages;
    if (Array.isArray(stagesRaw)) {
      state.config.pipelineStages = stagesRaw.map(String);
    } else if (typeof stagesRaw === 'string') {
      try {
        const parsed = JSON.parse(stagesRaw);
        state.config.pipelineStages = Array.isArray(parsed) ? parsed.map(String) : [];
      } catch (_) {
        state.config.pipelineStages = [];
      }
    } else {
      state.config.pipelineStages = [];
    }

    const subtitle = state.container?.querySelector('#whs-flows-subtitle');
    if (subtitle) {
      subtitle.textContent = state.config.backendUrl
        ? `Backend: ${state.config.backendUrl}`
        : 'Backend não configurado (defina em Configurações)';
    }
  }

  function apiHeaders(extra = {}) {
    const headers = { 'Content-Type': 'application/json', ...extra };
    if (state.config.extensionKey) headers['x-extension-key'] = state.config.extensionKey;
    return headers;
  }

  async function apiFetch(path, options = {}) {
    if (!state.config.backendUrl) throw new Error('Backend não configurado. Vá em Configurações.');

    const url = `${state.config.backendUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        ...apiHeaders(options.headers || {}),
      },
    });

    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const payload = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => '');

    if (!res.ok) {
      const msg = payload && payload.error ? payload.error : (typeof payload === 'string' ? payload : `HTTP ${res.status}`);
      throw new Error(msg);
    }

    return payload;
  }

  // ---------- rendering ----------
  function renderList() {
    const listEl = state.container?.querySelector('#whs-flow-list');
    if (!listEl) return;

    if (state.loading) {
      listEl.innerHTML = '<div class="whs-empty">Carregando…</div>';
      return;
    }

    if (!state.filtered.length) {
      listEl.innerHTML = '<div class="whs-empty">Nenhum flow encontrado.</div>';
      return;
    }

    listEl.innerHTML = state.filtered
      .map((f) => {
        const active = !!f.active;
        const isSel = f.id === state.selectedId;
        const triggerTxt = f.trigger?.text ? `contém: "${f.trigger.text}"` : 'sem trigger';
        const actionsCount = Array.isArray(f.actions) ? f.actions.length : 0;

        return `
          <div class="whs-flow-item ${isSel ? 'active' : ''}" data-id="${escapeHtml(f.id)}">
            <div class="whs-flow-title">
              <div class="whs-flow-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
              <div class="whs-flow-pill">${active ? 'Ativo' : 'Pausado'}</div>
            </div>
            <div class="whs-flow-sub">${escapeHtml(triggerTxt)} • ${actionsCount} ação(ões)</div>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('.whs-flow-item').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        if (!id) return;
        state.selectedId = id;
        renderList();
        renderEditor();
      });
    });
  }

  function stageFieldHtml(value, elId) {
    const stages = state.config.pipelineStages || [];
    if (!stages.length) {
      return `<input class="whs-input" id="${elId}" value="${escapeHtml(value || '')}" placeholder="Ex.: Em negociação" />`;
    }

    return `
      <select class="whs-input" id="${elId}">
        <option value="">—</option>
        ${stages
          .map((s) => `<option value="${escapeHtml(s)}" ${String(s) === String(value || '') ? 'selected' : ''}>${escapeHtml(s)}</option>`)
          .join('')}
      </select>
    `;
  }

  function renderEditor() {
    const editorEl = state.container?.querySelector('#whs-flow-editor');
    if (!editorEl) return;

    const flow = state.flows.find((f) => f.id === state.selectedId);
    if (!flow) {
      editorEl.innerHTML = '<div class="whs-empty">Selecione um flow ou crie um novo.</div>';
      return;
    }

    const triggerText = flow.trigger?.text || '';

    const actionsHtml = (flow.actions || [])
      .map((a, idx) => {
        const type = a.type || 'move_stage';

        const header = type === 'move_stage'
          ? 'Mover etapa'
          : type === 'create_task'
            ? 'Criar tarefa'
            : 'Ação';

        let body = '';
        if (type === 'move_stage') {
          const stageVal = a.stage || a.to || '';
          body = `
            <div class="whs-form">
              <div class="whs-field whs-full">
                <label>Etapa de destino</label>
                ${stageFieldHtml(stageVal, `whs-action-stage-${idx}`)}
              </div>
            </div>
          `;
        } else if (type === 'create_task') {
          body = `
            <div class="whs-form">
              <div class="whs-field whs-full">
                <label>Título</label>
                <input class="whs-input" id="whs-action-title-${idx}" value="${escapeHtml(a.title || '')}" placeholder="Ex.: Retornar para o cliente" />
              </div>
              <div class="whs-field">
                <label>Prazo (min)</label>
                <input class="whs-input" id="whs-action-due-${idx}" type="number" min="0" step="5" value="${escapeHtml(a.dueInMinutes ?? 60)}" />
              </div>
            </div>
          `;
        } else {
          body = `<div class="whs-hint">Tipo de ação não suportado: <code>${escapeHtml(type)}</code></div>`;
        }

        return `
          <div class="whs-action-card" data-idx="${idx}">
            <div class="whs-action-card-header">
              <div class="whs-action-card-title">${escapeHtml(header)}</div>
              <div class="whs-action-card-controls">
                <select class="whs-input" id="whs-action-type-${idx}">
                  <option value="move_stage" ${type === 'move_stage' ? 'selected' : ''}>move_stage</option>
                  <option value="create_task" ${type === 'create_task' ? 'selected' : ''}>create_task</option>
                </select>
                <button class="btn danger" id="whs-action-remove-${idx}" title="Remover">Remover</button>
              </div>
            </div>
            ${body}
          </div>
        `;
      })
      .join('');

    editorEl.innerHTML = `
      <div class="whs-form">
        <div class="whs-field">
          <label>Nome</label>
          <input class="whs-input" id="whs-flow-name" value="${escapeHtml(flow.name || '')}" placeholder="Nome do flow" />
        </div>

        <div class="whs-field">
          <label>Status</label>
          <select class="whs-input" id="whs-flow-active">
            <option value="true" ${flow.active ? 'selected' : ''}>Ativo</option>
            <option value="false" ${!flow.active ? 'selected' : ''}>Pausado</option>
          </select>
        </div>

        <div class="whs-field whs-full">
          <label>Trigger</label>
          <div class="whs-hint">Atualmente suportado: <code>message_contains</code> (quando a mensagem contém um texto).</div>
        </div>

        <div class="whs-field whs-full">
          <label>Texto que deve estar na mensagem</label>
          <input class="whs-input" id="whs-flow-trigger-text" value="${escapeHtml(triggerText)}" placeholder="Ex.: orçamento" />
        </div>

        <div class="whs-field whs-full">
          <label>Ações</label>
          ${actionsHtml || '<div class="whs-empty whs-empty-compact">Nenhuma ação. Adicione abaixo.</div>'}
          <div class="whs-actions-row">
            <button class="btn secondary" id="whs-add-action">+ Adicionar ação</button>
            <button class="btn secondary" id="whs-duplicate-flow">Duplicar flow</button>
            <button class="btn danger" id="whs-delete-flow">Excluir flow</button>
          </div>
          <div class="whs-hint">ID: <code>${escapeHtml(flow.id)}</code>${state.dirty ? ' • <strong>Alterações pendentes</strong>' : ''}</div>
        </div>
      </div>
    `;

    // bind fields
    editorEl.querySelector('#whs-flow-name')?.addEventListener('input', (e) => {
      flow.name = e.target.value;
      state.dirty = true;
      applyFilter();
      renderList();
    });

    editorEl.querySelector('#whs-flow-active')?.addEventListener('change', (e) => {
      flow.active = e.target.value === 'true';
      state.dirty = true;
      applyFilter();
      renderList();
    });

    editorEl.querySelector('#whs-flow-trigger-text')?.addEventListener('input', (e) => {
      flow.trigger = flow.trigger || { type: 'message_contains', text: '' };
      flow.trigger.type = 'message_contains';
      flow.trigger.text = e.target.value;
      state.dirty = true;
      applyFilter();
      renderList();
    });

    editorEl.querySelector('#whs-add-action')?.addEventListener('click', () => {
      flow.actions = flow.actions || [];
      flow.actions.push({ type: 'move_stage', stage: state.config.pipelineStages?.[0] || '', to: state.config.pipelineStages?.[0] || '' });
      state.dirty = true;
      renderEditor();
    });

    editorEl.querySelector('#whs-duplicate-flow')?.addEventListener('click', () => {
      const copy = JSON.parse(JSON.stringify(flow));
      copy.id = `flow_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      copy.name = `${copy.name || 'Flow'} (cópia)`;
      state.flows.unshift(ensureFlow(copy));
      state.selectedId = copy.id;
      state.dirty = true;
      applyFilter();
      renderList();
      renderEditor();
      toast('Flow duplicado (não esqueça de salvar).', 'success');
    });

    editorEl.querySelector('#whs-delete-flow')?.addEventListener('click', () => {
      const ok = confirm('Excluir este flow?');
      if (!ok) return;
      state.flows = state.flows.filter((f) => f.id !== flow.id);
      state.selectedId = state.flows[0]?.id || null;
      state.dirty = true;
      applyFilter();
      renderList();
      renderEditor();
    });

    // bind each action
    (flow.actions || []).forEach((a, idx) => {
      editorEl.querySelector(`#whs-action-type-${idx}`)?.addEventListener('change', (e) => {
        const t = e.target.value;
        flow.actions[idx] = ensureFlow({ actions: [ { type: t } ] }).actions[0];
        state.dirty = true;
        renderEditor();
      });

      editorEl.querySelector(`#whs-action-remove-${idx}`)?.addEventListener('click', () => {
        flow.actions.splice(idx, 1);
        state.dirty = true;
        renderEditor();
      });

      if ((a.type || '') === 'move_stage') {
        editorEl.querySelector(`#whs-action-stage-${idx}`)?.addEventListener('change', (e) => {
          flow.actions[idx].stage = e.target.value;
          flow.actions[idx].to = e.target.value;
          state.dirty = true;
        });
        editorEl.querySelector(`#whs-action-stage-${idx}`)?.addEventListener('input', (e) => {
          // if stageField is input
          flow.actions[idx].stage = e.target.value;
          flow.actions[idx].to = e.target.value;
          state.dirty = true;
        });
      }

      if ((a.type || '') === 'create_task') {
        editorEl.querySelector(`#whs-action-title-${idx}`)?.addEventListener('input', (e) => {
          flow.actions[idx].title = e.target.value;
          state.dirty = true;
        });

        editorEl.querySelector(`#whs-action-due-${idx}`)?.addEventListener('input', (e) => {
          const n = Number(e.target.value);
          flow.actions[idx].dueInMinutes = Number.isFinite(n) ? n : 0;
          state.dirty = true;
        });
      }
    });
  }

  // ---------- flow operations ----------
  function createNewFlow() {
    const base = ensureFlow({
      id: `flow_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: 'Novo flow',
      active: true,
      trigger: { type: 'message_contains', text: '' },
      actions: [{ type: 'move_stage', stage: state.config.pipelineStages?.[0] || '', to: state.config.pipelineStages?.[0] || '' }],
    });
    state.flows.unshift(base);
    state.selectedId = base.id;
    state.dirty = true;
    applyFilter();
    renderList();
    renderEditor();
  }

  async function loadFlowsFromBackend() {
    await loadConfig();

    if (!state.config.backendUrl || !state.config.extensionKey) {
      state.flows = [];
      state.filtered = [];
      state.selectedId = null;
      setStatus('Configure backendUrl e extensionKey em Configurações.', 'warning');
      renderList();
      renderEditor();
      return;
    }

    state.loading = true;
    setStatus('Carregando flows do backend…');
    renderList();

    try {
      const flows = await apiFetch('/flows', { method: 'GET' });
      const arr = Array.isArray(flows) ? flows : [];
      state.flows = arr.map(ensureFlow);
      state.selectedId = state.flows[0]?.id || null;
      state.dirty = false;
      applyFilter();
      setStatus(`${state.flows.length} flows carregados.`);
    } catch (e) {
      console.error('[FlowsModule] load error', e);
      setStatus('Erro ao carregar: ' + (e?.message || String(e)), 'error');
      state.flows = [];
      state.filtered = [];
      state.selectedId = null;
    } finally {
      state.loading = false;
      renderList();
      renderEditor();
    }
  }

  function validateFlows() {
    const errors = [];

    for (const f of state.flows) {
      if (!f.name || !String(f.name).trim()) errors.push(`Flow sem nome (id: ${f.id})`);
      if (!f.trigger?.text || !String(f.trigger.text).trim()) errors.push(`Flow "${f.name}" sem trigger.text`);
      if (!Array.isArray(f.actions) || !f.actions.length) errors.push(`Flow "${f.name}" sem ações`);

      (f.actions || []).forEach((a, idx) => {
        if (a.type === 'move_stage') {
          const stage = a.stage || a.to;
          if (!stage || !String(stage).trim()) errors.push(`Flow "${f.name}": ação #${idx + 1} move_stage sem stage/to`);
        }
        if (a.type === 'create_task') {
          if (!a.title || !String(a.title).trim()) errors.push(`Flow "${f.name}": ação #${idx + 1} create_task sem title`);
        }
      });
    }

    return errors;
  }

  async function saveFlowsToBackend() {
    await loadConfig();

    const errors = validateFlows();
    if (errors.length) {
      toast('Revise os flows antes de salvar:\n- ' + errors.join('\n- '), 'warning');
      return;
    }

    if (!state.config.backendUrl || !state.config.extensionKey) {
      toast('Backend não configurado. Vá em Configurações.', 'error');
      return;
    }

    try {
      setStatus('Salvando…');
      await apiFetch('/flows', {
        method: 'PUT',
        body: JSON.stringify(state.flows),
      });
      state.dirty = false;
      setStatus('Salvo com sucesso!');
      toast('Flows salvos no backend!', 'success');
    } catch (e) {
      console.error('[FlowsModule] save error', e);
      setStatus('Erro ao salvar: ' + (e?.message || String(e)), 'error');
      toast('Erro ao salvar: ' + (e?.message || String(e)), 'error');
    }
  }

  // ---------- import / export ----------
  function exportJson() {
    const json = JSON.stringify(state.flows, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flows_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importJson() {
    const fileInput = state.container?.querySelector('#whs-flows-file');
    if (!fileInput) return;
    fileInput.value = '';
    fileInput.click();
  }

  async function handleFileSelected(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.flows) ? parsed.flows : null);

      if (!arr) {
        toast('JSON inválido: esperado um array de flows.', 'error');
        return;
      }

      state.flows = arr.map(ensureFlow);
      state.selectedId = state.flows[0]?.id || null;
      state.dirty = true;
      applyFilter();
      renderList();
      renderEditor();
      toast('Flows importados (não esqueça de salvar).', 'success');
    } catch (e) {
      console.error('[FlowsModule] import error', e);
      toast('Erro ao importar JSON: ' + (e?.message || String(e)), 'error');
    }
  }

  // ---------- init ----------
  async function init(container) {
    state.container = container;

    container.querySelector('#whs-flows-search')?.addEventListener('input', () => {
      applyFilter();
      renderList();
    });

    container.querySelector('#whs-flow-new')?.addEventListener('click', createNewFlow);
    container.querySelector('#whs-flows-refresh')?.addEventListener('click', async () => {
      if (state.dirty) {
        const ok = confirm('Existem alterações não salvas. Recarregar do backend e perder alterações?');
        if (!ok) return;
      }
      await loadFlowsFromBackend();
    });

    container.querySelector('#whs-flows-save')?.addEventListener('click', saveFlowsToBackend);
    container.querySelector('#whs-flows-export')?.addEventListener('click', exportJson);
    container.querySelector('#whs-flows-import')?.addEventListener('click', importJson);

    const fileInput = container.querySelector('#whs-flows-file');
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (file) handleFileSelected(file);
      });
    }

    await loadFlowsFromBackend();
  }

  return {
    init,
    onShow() {
      try {
        applyFilter();
        renderList();
        renderEditor();
      } catch (_) {}
    },
  };
})();

window.FlowsModule = FlowsModule;
