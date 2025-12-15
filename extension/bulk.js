/* bulk.js - Bulk Wizard UI (robust, error-proof)
   - Lista (colar/CSV/CRM)
   - Mensagem + variáveis
   - Modo (Backend/API ou DOM)
   - Segurança (delays/limites)
   - Revisão (preview real)
   - Execução (fila + pause/stop)

   Nota: compatível com backend do projeto (applyVariables usa {{var}}).
*/

(() => {
  'use strict';

  // ---------------------------
  // Small utilities
  // ---------------------------

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(msg, type = 'info') {
    try {
      // When embedded in workspace, reuse the global toast
      if (window.parent && window.parent.Workspace && typeof window.parent.Workspace.showToast === 'function') {
        window.parent.Workspace.showToast(msg, type);
        return;
      }
    } catch (_) {}

    // Fallback: simple inline alert (rare)
    console.log(`[BulkWizard:${type}]`, msg);
    alert(msg);
  }

  function storageSyncGet(keysWithDefaults) {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(keysWithDefaults, (res) => resolve(res || {}));
      } catch (_) {
        resolve({});
      }
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function randBetween(min, max) {
    const a = Number(min) || 0;
    const b = Number(max) || 0;
    if (a >= b) return a;
    return a + Math.random() * (b - a);
  }

  function normalizePhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('00') ? digits.slice(2) : digits;
  }

  function isValidPhone(phoneDigits) {
    const p = String(phoneDigits || '');
    // Accepts E.164 digits-only (10..15) for most use cases.
    return p.length >= 10 && p.length <= 15;
  }

  function normalizeHeaderKey(h) {
    const s = String(h || '').trim();
    if (!s) return '';
    // remove accents
    const noAcc = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const low = noAcc.toLowerCase();
    return low.replace(/[^a-z0-9_\-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  }

  function detectDelimiter(line) {
    if (!line) return ';';
    const candidates = [';', ',', '\t'];
    let best = ';';
    let bestCount = -1;
    for (const d of candidates) {
      const cnt = String(line).split(d).length;
      if (cnt > bestCount) {
        bestCount = cnt;
        best = d;
      }
    }
    return best;
  }

  function splitDelimitedLine(line, delim) {
    if (!line) return [''];
    const d = delim === '\t' ? /\t/ : delim;
    return String(line)
      .split(d)
      .map((c) => String(c).trim());
  }

  // Support both {nome} and {{nome}} (backend uses {{nome}})
  function applyVariablesFlexible(template, vars) {
    const t = String(template || '');
    if (!t) return '';
    const v = vars || {};

    // First, handle {{key}} style
    let out = t.replace(/{{\s*([\w.-]+)\s*}}/g, (m, key) => {
      const path = String(key || '').trim();
      if (!path) return m;
      const parts = path.split('.');
      let cur = v;
      for (const p of parts) {
        if (cur && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
        else {
          cur = undefined;
          break;
        }
      }
      if (cur === undefined || cur === null) return m;
      return String(cur);
    });

    // Then handle {key} style (avoid double-curly by negative lookahead/lookbehind-like approach)
    // We keep it simple: replace {key} where it's not preceded by '{' and not followed by '}'.
    out = out.replace(/(^|[^{}]){\s*([\w.-]+)\s*}(?!})/g, (m, prefix, key) => {
      const path = String(key || '').trim();
      const parts = path.split('.');
      let cur = v;
      for (const p of parts) {
        if (cur && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
        else {
          cur = undefined;
          break;
        }
      }
      if (cur === undefined || cur === null) return m;
      return `${prefix}${String(cur)}`;
    });

    return out;
  }

  function toBackendTemplateSyntax(template) {
    // Convert {nome} => {{nome}} for backend compatibility.
    // Keep existing {{ }} untouched.
    return String(template || '').replace(/(^|[^{}]){\s*([\w.-]+)\s*}(?!})/g, (_m, prefix, key) => {
      return `${prefix}{{${String(key).trim()}}}`;
    });
  }

  function formatTs(ts) {
    try {
      return new Date(ts).toLocaleString('pt-BR');
    } catch (_) {
      return String(ts || '');
    }
  }

  // ---------------------------
  // Backend helpers
  // ---------------------------

  const backend = {
    url: '',
    extensionKey: '',
    ok: false,
  };

  function apiHeaders(extra = {}) {
    const h = {
      'Content-Type': 'application/json',
      ...extra,
    };
    if (backend.extensionKey) h['x-extension-key'] = backend.extensionKey;
    return h;
  }

  async function apiFetch(path, options = {}) {
    if (!backend.url) throw new Error('Backend URL não configurado');
    const url = `${backend.url}${path.startsWith('/') ? '' : '/'}${path}`;

    const res = await fetch(url, {
      ...options,
      headers: apiHeaders(options.headers || {}),
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

  async function checkBackendHealth() {
    const badge = $('#backend-status');

    if (!backend.url) {
      backend.ok = false;
      if (badge) {
        badge.className = 'badge badge--warning';
        badge.textContent = 'Backend: não configurado';
      }
      return false;
    }

    try {
      const r = await fetch(`${backend.url}/health`, { method: 'GET' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      backend.ok = true;
      if (badge) {
        badge.className = 'badge badge--success';
        badge.textContent = `Backend: OK`;
      }
      return true;
    } catch (e) {
      backend.ok = false;
      if (badge) {
        badge.className = 'badge badge--danger';
        badge.textContent = 'Backend: offline';
      }
      return false;
    }
  }

  // ---------------------------
  // WhatsApp readiness (DOM)
  // ---------------------------

  const wa = {
    ready: null,
    message: 'não verificado'
  };

  async function checkWhatsAppReady() {
    const badge = $('#wa-status');
    try {
      await window.WhatsHybridBridge?.connect?.();
      const ok = !!window.WhatsHybridBridge?.isConnected?.();
      wa.ready = ok;
      wa.message = ok ? 'pronto' : 'não conectado';

      if (badge) {
        badge.className = ok ? 'badge badge--success' : 'badge badge--warning';
        badge.textContent = ok ? 'WhatsApp Web: pronto' : 'WhatsApp Web: não pronto';
      }
      return ok;
    } catch (e) {
      wa.ready = false;
      wa.message = e?.message || 'não pronto';
      if (badge) {
        badge.className = 'badge badge--warning';
        badge.textContent = 'WhatsApp Web: não pronto';
      }
      return false;
    }
  }

  // ---------------------------
  // Wizard state
  // ---------------------------

  const state = {
    step: 1,
    sourceTab: 'src-paste',

    recipients: [], // { phone, vars }
    invalid: [],
    duplicates: 0,

    messageTemplate: '',
    varsKeys: [],

    sendMode: 'backend', // backend | dom
    delayMin: 5,
    delayMax: 12,
    safetyProfile: 'safe',

    confirmedReview: false,

    crm: {
      source: 'workspace', // workspace | whatsapp
      contacts: [], // { id, name, phone }
      selected: new Set(),
      q: ''
    },

    run: {
      running: false,
      paused: false,
      abort: false,
      cursor: 0,
      total: 0,
      lastCampaignId: null,
      resumeResolver: null,
    }
  };

  // ---------------------------
  // Stepper navigation
  // ---------------------------

  function setStep(step) {
    state.step = clamp(parseInt(step, 10) || 1, 1, 6);

    // Sections
    $$('.wizard-step').forEach((s) => {
      s.classList.toggle('active', String(s.dataset.step) === String(state.step));
    });

    // Stepper
    $$('#bulk-stepper .step').forEach((el) => {
      const n = parseInt(el.dataset.step || '0', 10);
      el.classList.toggle('active', n === state.step);
      el.classList.toggle('done', n < state.step);
    });

    // Footer buttons
    const backBtn = $('#btn-back');
    const nextBtn = $('#btn-next');
    const runBtn = $('#btn-run');

    if (backBtn) backBtn.style.display = (state.step === 1) ? 'none' : '';
    if (nextBtn) nextBtn.style.display = (state.step === 6) ? 'none' : '';
    if (runBtn) runBtn.style.display = (state.step === 6) ? '' : 'none';

    // Enter-step hooks
    if (state.step === 2) {
      refreshVarsBox();
      refreshQuickPreview();
    }
    if (state.step === 5) {
      buildReview();
    }
    if (state.step === 6) {
      syncRunUI();
      loadCampaigns().catch(() => {});
    }

    // Persist selection
    try {
      const hash = `#step=${state.step}`;
      if (history.replaceState) history.replaceState(null, '', hash);
    } catch (_) {}
  }

  function canGoNext() {
    if (state.step === 1) {
      if (!state.recipients.length) {
        toast('Valide a lista (passo 1) antes de avançar.', 'warning');
        return false;
      }
    }
    if (state.step === 2) {
      const msg = String($('#message-template')?.value || '').trim();
      if (!msg) {
        toast('Preencha a mensagem (passo 2) antes de avançar.', 'warning');
        return false;
      }
    }
    if (state.step === 5) {
      const ok = !!$('#confirm-review')?.checked;
      if (!ok) {
        toast('Confirme a revisão antes de executar.', 'warning');
        return false;
      }
    }
    return true;
  }

  function nextStep() {
    if (!canGoNext()) return;
    setStep(state.step + 1);
  }

  function prevStep() {
    setStep(state.step - 1);
  }

  // ---------------------------
  // Source tabs
  // ---------------------------

  function setSourceTab(tabId) {
    state.sourceTab = tabId;
    $$('.tabs .tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    $$('.tab-panels .tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === tabId);
    });
  }

  // ---------------------------
  // Parsing recipients (paste/CSV/CRM)
  // ---------------------------

  function parseFromText(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return { recipients: [], invalid: [], duplicates: 0 };

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    // detect delimiter and tabularness
    const looksTabular = lines.some((l) => /[;,	]/.test(l) && l.split(/[;,	]/).length >= 2);

    const invalid = [];
    const recipients = [];
    const seen = new Set();
    let duplicates = 0;

    if (!looksTabular) {
      const tokens = text.split(/[\s,;]+/).map(normalizePhone).filter(Boolean);
      for (const t of tokens) {
        if (!isValidPhone(t)) {
          invalid.push(t);
          continue;
        }
        if (seen.has(t)) {
          duplicates++;
          continue;
        }
        seen.add(t);
        recipients.push({ phone: t, vars: {} });
      }

      return { recipients, invalid, duplicates };
    }

    const delim = detectDelimiter(lines[0]);
    const firstCols = splitDelimitedLine(lines[0], delim);

    const firstColPhone = normalizePhone(firstCols[0]);
    const headerLike = firstCols.some((c) => /[A-Za-zÀ-ú]/.test(c)) && !(firstColPhone && isValidPhone(firstColPhone));

    let headers = null;
    let startIdx = 0;
    if (headerLike) {
      headers = firstCols.map(normalizeHeaderKey).map((h, i) => h || `col_${i + 1}`);
      startIdx = 1;
    }

    let phoneKey = 'phone';
    if (headers) {
      const cand = headers.find((h) => ['phone', 'telefone', 'celular', 'whatsapp', 'numero', 'number', 'to'].includes(h));
      if (cand) phoneKey = cand;
    }

    for (let i = startIdx; i < lines.length; i++) {
      const cols = splitDelimitedLine(lines[i], delim);

      let row = {};
      if (headers) {
        for (let j = 0; j < headers.length; j++) row[headers[j]] = cols[j] !== undefined ? cols[j] : '';
      } else {
        // no header: assume col0=phone, col1=nome, col2=cidade, col3..=campoN
        row = { phone: cols[0] || '', nome: cols[1] || '' };
        if (cols[2] !== undefined) row.cidade = cols[2];
        for (let j = 3; j < cols.length; j++) row[`campo_${j}`] = cols[j];
      }

      const rawPhone = row[phoneKey] || row.phone || row.telefone || row.numero || row.whatsapp || '';
      const phone = normalizePhone(rawPhone);

      if (!phone || !isValidPhone(phone)) {
        invalid.push(rawPhone ? String(rawPhone) : `linha_${i + 1}`);
        continue;
      }

      if (seen.has(phone)) {
        duplicates++;
        continue;
      }

      seen.add(phone);

      const vars = {};
      for (const [k, v] of Object.entries(row)) {
        if (!k || k === phoneKey || k === 'phone') continue;
        if (v === undefined || v === null) continue;
        const val = String(v).trim();
        if (!val) continue;
        vars[k] = val;
      }

      recipients.push({ phone, vars });
    }

    return { recipients, invalid, duplicates };
  }

  async function parseFromCSVFile(file) {
    const text = await file.text();
    return parseFromText(text);
  }

  function parseFromCRMSelection() {
    const selected = Array.from(state.crm.selected);
    const invalid = [];
    const recipients = [];
    const seen = new Set();

    for (const id of selected) {
      const c = state.crm.contacts.find((x) => String(x.id) === String(id));
      if (!c) continue;
      const phone = normalizePhone(c.phone || c.number || c.id);
      if (!phone || !isValidPhone(phone)) {
        invalid.push(c.phone || c.number || c.id);
        continue;
      }
      if (seen.has(phone)) continue;
      seen.add(phone);
      recipients.push({
        phone,
        vars: {
          nome: c.name || '',
          name: c.name || ''
        }
      });
    }

    return { recipients, invalid, duplicates: 0 };
  }

  function updateValidationUI() {
    const box = $('#validation-box');
    const warn = $('#validation-warning');
    const hint = $('#list-hint');

    const total = state.recipients.length;
    const invalid = state.invalid.length;

    if (!total) {
      if (box) {
        box.className = 'state state-empty';
        box.innerHTML = `
          <div class="state-icon">✅</div>
          <div class="state-title">Ainda não validado</div>
          <div class="state-text">Clique em <strong>Validar lista</strong> para ver totais, inválidos e preview.</div>
        `;
      }
      if (warn) warn.style.display = 'none';
      if (hint) hint.textContent = 'Valide antes de avançar.';
      return;
    }

    if (box) {
      box.className = 'state state-success';
      box.innerHTML = `
        <div class="state-icon">📋</div>
        <div class="state-title">Lista validada</div>
        <div class="state-text">
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
            <span class="badge badge--success">${total} válidos</span>
            ${state.duplicates ? `<span class="badge badge--muted">${state.duplicates} duplicados removidos</span>` : ''}
            ${invalid ? `<span class="badge badge--warning">${invalid} inválidos</span>` : ''}
          </div>
        </div>
      `;
    }

    if (warn) {
      if (invalid) {
        warn.style.display = '';
        warn.innerHTML = `<strong>Linhas inválidas ignoradas:</strong> ${state.invalid.slice(0, 6).map(escapeHtml).join(', ')}${state.invalid.length > 6 ? '…' : ''}`;
      } else {
        warn.style.display = 'none';
      }
    }

    if (hint) hint.textContent = 'Lista OK. Você pode avançar.';
  }

  function computeVarsKeys() {
    const keys = new Set();
    keys.add('phone');
    for (const r of state.recipients) {
      if (r && r.vars) {
        for (const k of Object.keys(r.vars)) keys.add(k);
      }
    }
    state.varsKeys = Array.from(keys).sort();
  }

  function refreshVarsBox() {
    computeVarsKeys();
    const box = $('#vars-box');
    if (!box) return;

    const keys = state.varsKeys || [];
    if (!keys.length) {
      box.innerHTML = `<div class="state state-empty"><div class="state-icon">{}</div><div class="state-title">Sem variáveis</div><div class="state-text">Importe uma lista com colunas (CSV) para ter variáveis.</div></div>`;
      return;
    }

    box.innerHTML = keys
      .map((k) => `<span class="chip">{${escapeHtml(k)}}</span>`)
      .join('');
  }

  function getFirstRecipient() {
    return state.recipients && state.recipients.length ? state.recipients[0] : null;
  }

  function refreshQuickPreview() {
    const preview = $('#quick-preview');
    if (!preview) return;

    const rec = getFirstRecipient();
    const tpl = String($('#message-template')?.value || '').trim();

    if (!rec || !tpl) {
      preview.innerHTML = `
        <div class="state state-empty">
          <div class="state-icon">👀</div>
          <div class="state-title">Sem preview ainda</div>
          <div class="state-text">Valide a lista (passo 1) e preencha a mensagem.</div>
        </div>
      `;
      return;
    }

    const vars = { phone: rec.phone, ...(rec.vars || {}) };
    const msg = applyVariablesFlexible(tpl, vars);

    preview.innerHTML = `
      <div class="preview-bubble">
        <div class="small-note" style="margin-bottom:6px;"><strong>Para:</strong> ${escapeHtml(rec.phone)}</div>
        <div class="bubble">${escapeHtml(msg)}</div>
      </div>
    `;
  }

  // ---------------------------
  // CRM/Contacts loader
  // ---------------------------

  async function loadCrmFromBackend(initial = true) {
    if (!backend.ok) {
      toast('Backend não está OK. Configure e teste no passo 3.', 'warning');
      return [];
    }

    // If searching, use /api/crm/contacts/search?q=...
    const q = String($('#crm-search')?.value || '').trim();
    try {
      if (q) {
        const res = await apiFetch(`/api/crm/contacts/search?q=${encodeURIComponent(q)}&limit=80`, { method: 'GET' });
        const arr = Array.isArray(res) ? res : [];
        return arr.map((c) => ({
          id: c.id || c._id || c.externalId || c.phone || c.numero || c.whatsapp || c.number || Math.random().toString(16).slice(2),
          name: c.name || c.nome || c.fullName || '',
          phone: c.phone || c.numero || c.whatsapp || c.number || ''
        }));
      }

      const resp = await apiFetch('/api/crm/contacts?limit=50&page=1', { method: 'GET' });
      const items = Array.isArray(resp) ? resp : (resp && resp.items) ? resp.items : [];
      return (Array.isArray(items) ? items : []).map((c) => ({
        id: c.id || c._id || c.externalId || c.phone || Math.random().toString(16).slice(2),
        name: c.name || c.nome || c.fullName || '',
        phone: c.phone || c.numero || c.whatsapp || c.number || ''
      }));
    } catch (e) {
      toast('Falha ao carregar contatos do CRM: ' + (e?.message || String(e)), 'error');
      return [];
    }
  }

  async function loadContactsFromWhatsApp() {
    try {
      await window.WhatsHybridBridge?.connect?.();
      const list = await window.WhatsHybridBridge?.getContacts?.();
      const arr = Array.isArray(list) ? list : [];
      // Normalize to {id,name,phone}
      return arr.slice(0, 200).map((c) => ({
        id: c.id || c.chatId || c.number || c.phone || Math.random().toString(16).slice(2),
        name: c.name || c.title || c.pushName || '',
        phone: c.number || c.phone || c.id || ''
      }));
    } catch (e) {
      toast('Falha ao ler contatos do WhatsApp. Abra o WhatsApp Web e tente novamente.', 'warning');
      return [];
    }
  }

  function renderCrmList() {
    const listEl = $('#crm-list');
    if (!listEl) return;

    const q = String($('#crm-search')?.value || '').trim().toLowerCase();

    const items = (state.crm.contacts || []).filter((c) => {
      if (!q) return true;
      const name = (c.name || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });

    if (!items.length) {
      listEl.innerHTML = `
        <div class="state state-empty" style="padding:14px;">
          <div class="state-icon">👥</div>
          <div class="state-title">Nenhum contato encontrado</div>
          <div class="state-text">Tente outra busca ou carregue outra fonte.</div>
        </div>
      `;
      syncCrmSelectedCount();
      return;
    }

    listEl.innerHTML = items
      .map((c) => {
        const id = String(c.id);
        const checked = state.crm.selected.has(id) ? 'checked' : '';
        return `
          <label class="crm-row">
            <input type="checkbox" data-crm-id="${escapeHtml(id)}" ${checked} />
            <div class="crm-main">
              <div class="crm-name">${escapeHtml(c.name || '—')}</div>
              <div class="crm-sub">${escapeHtml(normalizePhone(c.phone))}</div>
            </div>
          </label>
        `;
      })
      .join('');

    // bind
    $$('input[data-crm-id]', listEl).forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-crm-id');
        if (!id) return;
        if (cb.checked) state.crm.selected.add(String(id));
        else state.crm.selected.delete(String(id));
        syncCrmSelectedCount();
      });
    });

    syncCrmSelectedCount();
  }

  function syncCrmSelectedCount() {
    const el = $('#crm-selected-count');
    if (el) el.textContent = `${state.crm.selected.size} selecionados`;
  }

  // ---------------------------
  // Review builder
  // ---------------------------

  function buildReview() {
    const box = $('#review-box');
    const previewEl = $('#review-preview');

    const total = state.recipients.length;
    const msg = String($('#message-template')?.value || '').trim();

    if (!total || !msg) {
      if (box) {
        box.className = 'state state-empty';
        box.innerHTML = `
          <div class="state-icon">🧪</div>
          <div class="state-title">Nada para revisar ainda</div>
          <div class="state-text">Volte e complete lista + mensagem.</div>
        `;
      }
      if (previewEl) previewEl.innerHTML = '';
      return;
    }

    const mode = getSelectedSendMode();
    const dmin = Number($('#delay-min')?.value || state.delayMin);
    const dmax = Number($('#delay-max')?.value || state.delayMax);
    const profile = String($('#safety-profile')?.value || state.safetyProfile);

    const warningDom = (mode === 'dom')
      ? `<div class="inline-warning"><strong>DOM:</strong> mantenha o WhatsApp Web aberto/logado durante a execução. Use modo seguro se possível.</div>`
      : '';

    const templateForDisplay = escapeHtml(msg);

    if (box) {
      box.className = 'state state-success';
      box.innerHTML = `
        <div class="state-icon">✅</div>
        <div class="state-title">Revisão pronta</div>
        <div class="state-text">
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
            <span class="badge badge--success">${total} destinatários</span>
            ${state.invalid.length ? `<span class="badge badge--warning">${state.invalid.length} inválidos ignorados</span>` : ''}
            ${state.duplicates ? `<span class="badge badge--muted">${state.duplicates} duplicados removidos</span>` : ''}
            <span class="badge badge--info">Modo: ${escapeHtml(mode.toUpperCase())}</span>
            <span class="badge badge--muted">Delay: ${dmin}s–${dmax}s • Perfil: ${escapeHtml(profile)}</span>
          </div>
          <div class="small-note" style="margin-top:10px;"><strong>Mensagem (template):</strong></div>
          <div class="bubble" style="margin-top:6px; white-space:pre-wrap;">${templateForDisplay}</div>
        </div>
      `;
    }

    if (previewEl) {
      const rows = state.recipients.slice(0, 12).map((r) => {
        const vars = { phone: r.phone, ...(r.vars || {}) };
        const resolved = applyVariablesFlexible(msg, vars);
        return `
          <tr>
            <td>${escapeHtml(r.phone)}</td>
            <td style="white-space:pre-wrap;">${escapeHtml(resolved)}</td>
          </tr>
        `;
      }).join('');

      previewEl.innerHTML = `
        ${warningDom}
        <div class="section-title" style="margin-top:${warningDom ? '12px' : '0'};">Preview por contato (amostra)</div>
        <div class="small-note">Mostrando os primeiros 12 destinatários.</div>
        <div style="margin-top:10px; overflow:auto; border:1px solid var(--border-color); border-radius: var(--radius-lg);">
          <table class="table">
            <thead>
              <tr>
                <th>Telefone</th>
                <th>Mensagem resolvida</th>
              </tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="2" class="small-note">Sem dados</td></tr>`}</tbody>
          </table>
        </div>
      `;
    }
  }

  // ---------------------------
  // Mode + safety UI
  // ---------------------------

  function getSelectedSendMode() {
    const r = $('input[name="send-mode"]:checked');
    return (r?.value === 'dom') ? 'dom' : 'backend';
  }

  function syncModeHints() {
    const mode = getSelectedSendMode();
    const el = $('#mode-hints');
    if (!el) return;

    const backendHint = backend.ok
      ? `<span class="badge badge--success">Backend OK</span>`
      : `<span class="badge badge--warning">Backend não OK</span>`;

    const waHint = (wa.ready === true)
      ? `<span class="badge badge--success">WhatsApp pronto</span>`
      : `<span class="badge badge--muted">WhatsApp não verificado</span>`;

    if (mode === 'backend') {
      el.innerHTML = `
        <div class="inline-success">
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            ${backendHint}
            <span class="small-note">Recomendado para escala e previsibilidade. Execução em fila no servidor.</span>
          </div>
        </div>
      `;
    } else {
      el.innerHTML = `
        <div class="inline-warning">
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            ${waHint}
            <span class="small-note"><strong>DOM</strong> precisa do WhatsApp Web aberto/logado. Use perfil <strong>Modo seguro</strong>.</span>
            <button class="btn ghost" type="button" id="btn-open-wa">Abrir WhatsApp Web</button>
          </div>
        </div>
      `;
      $('#btn-open-wa')?.addEventListener('click', () => {
        try { window.open('https://web.whatsapp.com/', '_blank'); } catch (_) {}
      });
    }
  }

  function syncSafetyWarning() {
    const profile = String($('#safety-profile')?.value || 'safe');
    const warn = $('#safety-warning');
    if (!warn) return;

    if (profile === 'fast') {
      warn.style.display = '';
      warn.innerHTML = '<strong>Atenção:</strong> o modo rápido aumenta o risco de falhas/bloqueios. Use apenas em listas pequenas e aquecidas.';
    } else {
      warn.style.display = 'none';
    }
  }

  // ---------------------------
  // Campaigns table
  // ---------------------------

  function renderCampaignActions(c) {
    const status = String(c.status || '').toUpperCase();
    const id = c.id;

    const btn = (action, label, cls = 'btn small secondary') =>
      `<button class="${cls}" data-action="${action}" data-id="${escapeHtml(id)}" type="button">${label}</button>`;

    if (['RUNNING'].includes(status)) {
      return `<div class="actions-cell">${btn('pause','Pause')}${btn('cancel','Cancel','btn small danger')}</div>`;
    }
    if (['PAUSED'].includes(status)) {
      return `<div class="actions-cell">${btn('resume','Resume')}${btn('cancel','Cancel','btn small danger')}</div>`;
    }
    if (['PENDING'].includes(status)) {
      return `<div class="actions-cell">${btn('cancel','Cancel','btn small danger')}</div>`;
    }
    return '—';
  }

  async function loadCampaigns() {
    const tbody = $('#campaigns-table tbody');
    if (!tbody) return;

    if (!backend.ok) {
      tbody.innerHTML = `<tr><td colspan="5" class="small-note">Backend não configurado/online. Campanhas indisponíveis.</td></tr>`;
      return;
    }

    try {
      const campaigns = await apiFetch('/api/campaigns', { method: 'GET' });
      const arr = Array.isArray(campaigns) ? campaigns : [];
      if (!arr.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="small-note">Nenhuma campanha criada ainda.</td></tr>`;
        return;
      }

      tbody.innerHTML = arr.slice(0, 20).map((c) => {
        const cnt = c.counts || {};
        const countsStr = `${cnt.sent || 0}/${cnt.total || 0} enviados • ${cnt.failed || 0} falhas`;
        return `
          <tr>
            <td>${escapeHtml(c.id)}</td>
            <td><span class="badge badge--muted">${escapeHtml(c.status)}</span></td>
            <td>${escapeHtml(formatTs(c.createdAt || c.scheduleAt))}</td>
            <td class="small-note">${escapeHtml(countsStr)}</td>
            <td>${renderCampaignActions(c)}</td>
          </tr>
        `;
      }).join('');

      // Bind actions
      $$('button[data-action][data-id]', tbody).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const action = btn.getAttribute('data-action');
          if (!id || !action) return;

          try {
            await apiFetch(`/api/campaigns/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
            toast(`Campanha ${id}: ${action}`, 'success');
            await loadCampaigns();
          } catch (e) {
            toast('Falha na ação: ' + (e?.message || String(e)), 'error');
          }
        });
      });

    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="small-note">Erro ao carregar campanhas: ${escapeHtml(e?.message || String(e))}</td></tr>`;
    }
  }

  // ---------------------------
  // Execution (Backend or DOM)
  // ---------------------------

  function logLine(msg, tone = 'info') {
    const log = $('#run-log');
    if (!log) return;

    const badge = tone === 'error'
      ? 'badge badge--danger'
      : tone === 'warning'
        ? 'badge badge--warning'
        : tone === 'success'
          ? 'badge badge--success'
          : 'badge badge--muted';

    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `<span class="${badge}">${escapeHtml(tone)}</span><span>${escapeHtml(msg)}</span>`;

    log.prepend(line);
  }

  function syncRunUI() {
    const runBox = $('#run-box');
    const progWrap = $('#run-progress');
    const bar = $('#progress-bar');
    const text = $('#progress-text');
    const status = $('#progress-status');

    const pauseBtn = $('#btn-pause');
    const resumeBtn = $('#btn-resume');
    const stopBtn = $('#btn-stop');

    if (!state.run.running) {
      if (progWrap) progWrap.style.display = 'none';
      if (runBox) {
        runBox.className = 'state state-empty';
        runBox.innerHTML = `
          <div class="state-icon">🚀</div>
          <div class="state-title">Pronto para executar</div>
          <div class="state-text">Clique em <strong>Iniciar</strong> para começar a fila.</div>
        `;
      }
      return;
    }

    if (runBox) {
      runBox.className = 'state state-success';
      runBox.innerHTML = `
        <div class="state-icon">🟣</div>
        <div class="state-title">Execução em andamento</div>
        <div class="state-text">Acompanhe o progresso abaixo.</div>
      `;
    }

    if (progWrap) progWrap.style.display = '';

    const done = state.run.cursor;
    const total = state.run.total || 0;
    const pct = total ? Math.round((done / total) * 100) : 0;

    if (bar) bar.style.width = `${pct}%`;
    if (text) text.textContent = `${done}/${total}`;
    if (status) status.textContent = state.run.paused ? 'Pausado' : 'Rodando';

    if (pauseBtn) pauseBtn.style.display = state.run.paused ? 'none' : '';
    if (resumeBtn) resumeBtn.style.display = state.run.paused ? '' : 'none';
    if (stopBtn) stopBtn.disabled = !!state.run.abort;
  }

  async function startExecution() {
    // Basic validation
    const total = state.recipients.length;
    const msg = String($('#message-template')?.value || '').trim();
    if (!total) {
      toast('Lista vazia. Volte e valide a lista.', 'warning');
      setStep(1);
      return;
    }
    if (!msg) {
      toast('Mensagem vazia. Volte e preencha a mensagem.', 'warning');
      setStep(2);
      return;
    }
    if (!$('#confirm-review')?.checked) {
      toast('Confirme a revisão antes de executar.', 'warning');
      setStep(5);
      return;
    }

    const mode = getSelectedSendMode();

    state.run.running = true;
    state.run.paused = false;
    state.run.abort = false;
    state.run.cursor = 0;
    state.run.total = total;
    state.run.lastCampaignId = null;

    syncRunUI();

    if (mode === 'backend') {
      await executeBackend();
    } else {
      await executeDOM();
    }
  }

  async function executeBackend() {
    // Ensure backend OK
    const ok = await checkBackendHealth();
    if (!ok) {
      toast('Backend não está pronto. Teste e configure no passo 3.', 'warning');
      state.run.running = false;
      syncRunUI();
      return;
    }

    const template = String($('#message-template')?.value || '').trim();
    const message = toBackendTemplateSyntax(template);

    // Map safety profile to batch/interval
    const profile = String($('#safety-profile')?.value || 'safe');
    const dmin = clamp(parseFloat($('#delay-min')?.value || '5') || 5, 1, 600);
    const dmax = clamp(parseFloat($('#delay-max')?.value || '12') || 12, 1, 600);
    const avgDelay = (dmin + dmax) / 2;

    const intervalSeconds = clamp(avgDelay, 0.2, 300);
    const batchSize = profile === 'fast' ? 50 : profile === 'normal' ? 25 : 15;

    const messages = state.recipients.map((r) => ({
      phone: r.phone,
      ...(r.vars && Object.keys(r.vars).length ? { vars: r.vars } : {})
    }));

    logLine('Criando campanha no backend…', 'info');

    try {
      const campaign = await apiFetch('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          message,
          messages,
          batchSize,
          intervalSeconds,
        })
      });

      state.run.lastCampaignId = campaign?.id || null;
      logLine(`Campanha criada: ${campaign?.id || '—'}`, 'success');
      toast('Campanha criada no backend.', 'success');

      // Backend executes server-side; mark as done in UI
      state.run.cursor = state.run.total;
      state.run.running = false;
      syncRunUI();

      await loadCampaigns();

    } catch (e) {
      logLine('Erro ao criar campanha: ' + (e?.message || String(e)), 'error');
      toast('Erro ao criar campanha: ' + (e?.message || String(e)), 'error');
      state.run.running = false;
      syncRunUI();
    }
  }

  async function waitWhilePaused() {
    if (!state.run.paused) return;
    await new Promise((resolve) => {
      state.run.resumeResolver = resolve;
    });
  }

  async function executeDOM() {
    // Ensure WhatsApp is ready
    const ok = await checkWhatsAppReady();
    if (!ok) {
      toast('WhatsApp Web não está pronto. Abra/logue e teste no passo 3.', 'warning');
      logLine('WhatsApp Web não pronto. Abortando.', 'warning');
      state.run.running = false;
      syncRunUI();
      return;
    }

    const tpl = String($('#message-template')?.value || '').trim();

    const dmin = clamp(parseFloat($('#delay-min')?.value || '5') || 5, 1, 600);
    const dmax = clamp(parseFloat($('#delay-max')?.value || '12') || 12, 1, 600);

    const profile = String($('#safety-profile')?.value || 'safe');
    const profileMul = profile === 'fast' ? 0.75 : profile === 'normal' ? 1.0 : 1.35;

    logLine('Iniciando envio via DOM… (mantenha o WhatsApp Web aberto)', 'info');

    for (let i = 0; i < state.recipients.length; i++) {
      if (state.run.abort) break;

      await waitWhilePaused();
      if (state.run.abort) break;

      const r = state.recipients[i];
      const vars = { phone: r.phone, ...(r.vars || {}) };
      const text = applyVariablesFlexible(tpl, vars).trim();

      try {
        if (text) {
          await window.WhatsHybridBridge.sendMessage(r.phone, text);
        }
        state.run.cursor = i + 1;
        syncRunUI();
        logLine(`Enviado para ${r.phone}`, 'success');
      } catch (e) {
        state.run.cursor = i + 1;
        syncRunUI();
        logLine(`Falha ao enviar para ${r.phone}: ${e?.message || String(e)}`, 'warning');
      }

      const delay = randBetween(dmin, dmax) * profileMul;
      await sleep(delay * 1000);
    }

    if (state.run.abort) {
      logLine('Execução interrompida (Stop).', 'warning');
      toast('Execução interrompida.', 'warning');
    } else {
      logLine('Execução DOM concluída.', 'success');
      toast('Execução DOM concluída.', 'success');
    }

    state.run.running = false;
    state.run.paused = false;
    state.run.resumeResolver = null;
    syncRunUI();
  }

  function pauseRun() {
    if (!state.run.running) return;
    state.run.paused = true;
    syncRunUI();
    logLine('Pausado.', 'info');
  }

  function resumeRun() {
    if (!state.run.running) return;
    state.run.paused = false;
    syncRunUI();
    logLine('Retomando…', 'info');
    try {
      if (state.run.resumeResolver) state.run.resumeResolver();
    } catch (_) {}
    state.run.resumeResolver = null;
  }

  function stopRun() {
    if (!state.run.running) return;
    state.run.abort = true;
    state.run.paused = false;
    syncRunUI();
    logLine('Stop solicitado…', 'warning');
    try {
      if (state.run.resumeResolver) state.run.resumeResolver();
    } catch (_) {}
    state.run.resumeResolver = null;
  }

  // ---------------------------
  // Validate list action
  // ---------------------------

  async function validateList() {
    let result = { recipients: [], invalid: [], duplicates: 0 };

    if (state.sourceTab === 'src-csv') {
      const f = $('#csv-file')?.files?.[0];
      if (!f) {
        toast('Selecione um arquivo CSV.', 'warning');
        return;
      }
      result = await parseFromCSVFile(f);
    } else if (state.sourceTab === 'src-crm') {
      result = parseFromCRMSelection();
    } else {
      result = parseFromText($('#recipients-text')?.value || '');
    }

    state.recipients = result.recipients;
    state.invalid = result.invalid;
    state.duplicates = result.duplicates;

    updateValidationUI();
    refreshVarsBox();
    refreshQuickPreview();

    if (!state.recipients.length) {
      toast('Nenhum número válido encontrado.', 'warning');
    } else {
      toast(`Lista validada: ${state.recipients.length} válidos`, 'success');
    }
  }

  // ---------------------------
  // Init + wiring
  // ---------------------------

  async function initConfig() {
    const cfg = await storageSyncGet({ backendUrl: '', extensionKey: '' });
    backend.url = String(cfg.backendUrl || '').trim().replace(/\/+$/, '');
    backend.extensionKey = String(cfg.extensionKey || '').trim();

    await checkBackendHealth();
  }

  function wireTabs() {
    $$('.tabs .tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (!tab) return;
        setSourceTab(tab);
      });
    });

    // default
    setSourceTab(state.sourceTab);
  }

  function wireStepperClicks() {
    $$('#bulk-stepper .step').forEach((s) => {
      s.addEventListener('click', () => {
        const target = parseInt(s.dataset.step || '1', 10);
        // Only allow jumping forward if prerequisites are met
        if (target > state.step) {
          if (!canGoNext()) return;
        }
        setStep(target);
      });
    });
  }

  function wireFooterNav() {
    $('#btn-back')?.addEventListener('click', prevStep);
    $('#btn-next')?.addEventListener('click', nextStep);
    $('#btn-run')?.addEventListener('click', () => {
      // Ensure review confirm even if user clicks from step 6
      if (!$('#confirm-review')?.checked) {
        toast('Confirme a revisão no passo 5.', 'warning');
        setStep(5);
        return;
      }
      startExecution();
    });
  }

  function wireStep1() {
    $('#btn-validate')?.addEventListener('click', () => {
      validateList().catch((e) => {
        toast('Falha ao validar: ' + (e?.message || String(e)), 'error');
      });
    });

    $('#recipients-text')?.addEventListener('input', () => {
      // Soft reset
      state.recipients = [];
      state.invalid = [];
      state.duplicates = 0;
      updateValidationUI();
    });

    $('#csv-file')?.addEventListener('change', () => {
      state.recipients = [];
      state.invalid = [];
      state.duplicates = 0;
      updateValidationUI();
    });

    // CRM source selection
    $('#btn-load-workspace')?.addEventListener('click', async () => {
      state.crm.source = 'workspace';
      $('#btn-load-workspace')?.classList.add('active');
      $('#btn-load-wa')?.classList.remove('active');

      // For now, "workspace" is the backend CRM
      const contacts = await loadCrmFromBackend(true);
      state.crm.contacts = contacts;
      state.crm.selected = new Set();
      renderCrmList();
    });

    $('#btn-load-wa')?.addEventListener('click', async () => {
      state.crm.source = 'whatsapp';
      $('#btn-load-wa')?.classList.add('active');
      $('#btn-load-workspace')?.classList.remove('active');

      const contacts = await loadContactsFromWhatsApp();
      state.crm.contacts = contacts;
      state.crm.selected = new Set();
      renderCrmList();
    });

    // CRM search debounce
    let crmDebounce = null;
    $('#crm-search')?.addEventListener('input', () => {
      clearTimeout(crmDebounce);
      crmDebounce = setTimeout(async () => {
        if (state.crm.source === 'workspace') {
          // Re-query backend search when q changes
          const contacts = await loadCrmFromBackend(false);
          state.crm.contacts = contacts;
        }
        renderCrmList();
      }, 250);
    });

    $('#btn-crm-select-all')?.addEventListener('click', () => {
      for (const c of (state.crm.contacts || [])) state.crm.selected.add(String(c.id));
      renderCrmList();
    });

    $('#btn-crm-clear')?.addEventListener('click', () => {
      state.crm.selected = new Set();
      renderCrmList();
    });
  }

  function wireStep2() {
    $('#message-template')?.addEventListener('input', () => {
      refreshQuickPreview();
    });
    $('#btn-refresh-preview')?.addEventListener('click', refreshQuickPreview);
  }

  function wireStep3() {
    $$('input[name="send-mode"]').forEach((r) => {
      r.addEventListener('change', () => {
        syncModeHints();
      });
    });

    $('#btn-test-backend')?.addEventListener('click', async () => {
      const ok = await checkBackendHealth();
      toast(ok ? 'Backend OK.' : 'Backend offline ou não configurado.', ok ? 'success' : 'warning');
      syncModeHints();
    });

    $('#btn-test-wa')?.addEventListener('click', async () => {
      const ok = await checkWhatsAppReady();
      toast(ok ? 'WhatsApp Web pronto.' : 'WhatsApp Web não pronto.', ok ? 'success' : 'warning');
      syncModeHints();
    });

    $('#btn-open-settings')?.addEventListener('click', () => {
      try {
        if (window.parent?.Workspace?.navigateTo) {
          window.parent.Workspace.navigateTo('settings');
        } else {
          window.open('options.html', '_blank');
        }
      } catch (_) {
        try { window.open('options.html', '_blank'); } catch (_) {}
      }
    });

    // initial hints
    syncModeHints();
  }

  function wireStep4() {
    const dmin = $('#delay-min');
    const dmax = $('#delay-max');
    const prof = $('#safety-profile');

    const onChange = () => {
      syncSafetyWarning();
    };

    dmin?.addEventListener('input', onChange);
    dmax?.addEventListener('input', onChange);
    prof?.addEventListener('change', onChange);

    syncSafetyWarning();
  }

  function wireStep5() {
    $('#confirm-review')?.addEventListener('change', () => {
      // nothing
    });
  }

  function wireStep6() {
    $('#btn-pause')?.addEventListener('click', pauseRun);
    $('#btn-resume')?.addEventListener('click', resumeRun);
    $('#btn-stop')?.addEventListener('click', stopRun);
  }

  function wireInitialStepFromHash() {
    try {
      const m = String(location.hash || '').match(/step=(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 6) state.step = n;
      }
    } catch (_) {}
  }

  async function init() {
    wireInitialStepFromHash();

    wireTabs();
    wireStepperClicks();
    wireFooterNav();

    wireStep1();
    wireStep2();
    wireStep3();
    wireStep4();
    wireStep5();
    wireStep6();

    await initConfig();

    setStep(state.step);

    // First-time load campaigns
    loadCampaigns().catch(() => {});

    // UX defaults
    updateValidationUI();
    refreshVarsBox();
    refreshQuickPreview();
  }

  init().catch((e) => {
    console.error('[BulkWizard] init failed', e);
    toast('Falha ao iniciar Bulk Wizard: ' + (e?.message || String(e)), 'error');
  });

})();
