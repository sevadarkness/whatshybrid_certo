// workspace/modules/help/help.js
const HelpModule = (function () {
  'use strict';

  const state = {
    container: null,
    backendHealth: null,
    logs: [],
  };

  function toast(msg, type = 'info') {
    try { window.Workspace?.showToast?.(msg, type); } catch (_) {}
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

  function storageLocalGet(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (res) => resolve(res || {}));
      } catch (_) {
        resolve({});
      }
    });
  }

  async function testBackendHealth(backendUrl) {
    const url = (backendUrl || '').toString().trim().replace(/\/$/, '');
    if (!url) return null;

    try {
      const res = await fetch(`${url}/health`, { method: 'GET' });
      const ct = res.headers.get('content-type') || '';
      const payload = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => null);
      if (!res.ok) {
        return { ok: false, status: res.status, payload };
      }
      return { ok: true, status: res.status, payload };
    } catch (e) {
      return { ok: false, status: 0, payload: e?.message || String(e) };
    }
  }

  function renderStatusRows(rows) {
    const el = state.container?.querySelector('#whs-help-status');
    if (!el) return;
    el.innerHTML = rows
      .map((r) => {
        const pill = r.pill ? `<span class="whs-pill">${r.pill}</span>` : '';
        return `
          <div class="whs-status-row">
            <div>
              <div class="whs-strong">${r.label}</div>
              <div class="whs-hint">${r.value}</div>
            </div>
            ${pill}
          </div>
        `;
      })
      .join('');
  }

  function renderLogs() {
    const el = state.container?.querySelector('#whs-help-logs');
    if (!el) return;

    if (!state.logs.length) {
      el.innerHTML = '<div class="whs-log-item"><div class="whs-log-msg">Nenhum log registrado.</div></div>';
      return;
    }

    const recent = state.logs.slice(-80).reverse();

    el.innerHTML = recent
      .map((l) => {
        const ts = l.timestamp ? new Date(l.timestamp).toLocaleString() : '';
        const src = l.source || l.file || '';
        const msg = l.message || l.msg || JSON.stringify(l);
        const stack = l.stack ? `\n${l.stack}` : '';
        return `
          <div class="whs-log-item">
            <div class="whs-log-head">
              <div class="whs-strong">${src || 'Erro'}</div>
              <div class="whs-pill">${ts}</div>
            </div>
            <div class="whs-log-msg">${msg}${stack}</div>
          </div>
        `;
      })
      .join('');
  }

  async function loadLogs() {
    const res = await storageLocalGet(['extension_errors']);
    const arr = Array.isArray(res.extension_errors) ? res.extension_errors : [];
    state.logs = arr;
    renderLogs();
  }

  function downloadLogs() {
    const json = JSON.stringify(state.logs || [], null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsHybrid_logs_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function clearLogs() {
    const ok = confirm('Limpar todos os logs (extension_errors)?');
    if (!ok) return;

    try {
      chrome.storage.local.remove('extension_errors', () => {
        const err = chrome.runtime?.lastError;
        if (err) toast('Erro ao limpar: ' + err.message, 'error');
        else toast('Logs limpos!', 'success');
        loadLogs();
      });
    } catch (e) {
      toast('Erro ao limpar: ' + (e?.message || String(e)), 'error');
    }
  }

  async function refreshStatus() {
    const cfg = await storageSyncGet([
      'backendUrl',
      'extensionKey',
      'licenseKey',
      'licenseStatus',
      'licenseExpiresAt',
      'licenseAiCredits',
      'pipelineStages',
    ]);

    const backendUrl = (cfg.backendUrl || '').toString().trim();
    const extensionKey = (cfg.extensionKey || '').toString().trim();
    const licenseKey = (cfg.licenseKey || '').toString().trim();

    // WhatsApp connection
    let waStatus = 'Desconhecido';
    try {
      if (window.StateManager?.getState) {
        waStatus = window.StateManager.getState('connection.status') || waStatus;
      }
    } catch (_) {}

    try {
      if (window.WhatsHybridBridge?.isConnected) {
        const ok = await window.WhatsHybridBridge.isConnected();
        waStatus = ok ? 'connected' : (waStatus === 'connected' ? 'disconnected' : waStatus);
      }
    } catch (_) {}

    // backend health
    state.backendHealth = await testBackendHealth(backendUrl);

    const rows = [];
    rows.push({
      label: 'WhatsApp Web',
      value: waStatus === 'connected' ? 'Conectado' : 'Não conectado',
      pill: waStatus,
    });

    rows.push({
      label: 'Backend',
      value: backendUrl ? backendUrl : 'Não configurado',
      pill: state.backendHealth?.ok ? 'OK' : (backendUrl ? 'Falha' : '—'),
    });

    rows.push({
      label: 'extensionKey',
      value: extensionKey ? 'Configurada' : 'Não configurada',
      pill: extensionKey ? 'OK' : '—',
    });

    rows.push({
      label: 'licenseKey',
      value: licenseKey ? 'Configurada' : 'Não configurada',
      pill: cfg.licenseStatus || (licenseKey ? 'definida' : '—'),
    });

    rows.push({
      label: 'IA (créditos)',
      value: typeof cfg.licenseAiCredits === 'number' ? `${cfg.licenseAiCredits}` : '—',
      pill: 'AI',
    });

    if (cfg.licenseExpiresAt) {
      try {
        rows.push({
          label: 'Licença expira',
          value: new Date(cfg.licenseExpiresAt).toLocaleString(),
          pill: 'exp',
        });
      } catch (_) {}
    }

    renderStatusRows(rows);

    // show backend payload if failed
    const stEl = state.container?.querySelector('#whs-help-status');
    if (stEl && state.backendHealth && !state.backendHealth.ok && backendUrl) {
      const extra = document.createElement('div');
      extra.className = 'whs-hint';
      extra.textContent = `Detalhe do /health: ${typeof state.backendHealth.payload === 'string' ? state.backendHealth.payload : JSON.stringify(state.backendHealth.payload)}`;
      stEl.appendChild(extra);
    }
  }

  function openWhatsApp() {
    try {
      chrome.tabs.create({ url: 'https://web.whatsapp.com' });
    } catch (e) {
      console.error(e);
    }
  }

  function openKanban() {
    try {
      chrome.runtime.sendMessage({ type: 'OPEN_KANBAN_PAGE' });
    } catch (e) {
      console.error(e);
      toast('Não foi possível abrir o Kanban.', 'error');
    }
  }

  function openOptions() {
    // Prefer navegar para módulo Settings
    try {
      if (window.Workspace?.navigateTo) {
        window.Workspace.navigateTo('settings');
        return;
      }
    } catch (_) {}

    try {
      if (chrome.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function init(container) {
    state.container = container;

    container.querySelector('#whs-help-open-wa')?.addEventListener('click', openWhatsApp);
    container.querySelector('#whs-help-open-kanban')?.addEventListener('click', openKanban);
    container.querySelector('#whs-help-open-options')?.addEventListener('click', openOptions);
    container.querySelector('#whs-help-refresh')?.addEventListener('click', async () => {
      await refreshStatus();
      await loadLogs();
      toast('Atualizado.', 'success');
    });

    container.querySelector('#whs-help-download')?.addEventListener('click', downloadLogs);
    container.querySelector('#whs-help-clear')?.addEventListener('click', clearLogs);

    await refreshStatus();
    await loadLogs();
  }

  return { init };
})()

window.HelpModule = HelpModule;
