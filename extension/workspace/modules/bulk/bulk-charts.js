
/**
 * BulkCharts
 * Painel de gráficos para campanhas em massa.
 */
(function () {
  'use strict';

  const state = {
    container: null,
    mounted: false,
  };

  function resolveContainer(containerEl) {
    if (containerEl && containerEl.querySelector) return containerEl;
    const fromDom = document.querySelector('.workspace-bulk, [data-module=\"bulk\"], .module-bulk');
    return fromDom || document.body;
  }

  function ensureLayout(container) {
    if (!container) return null;
    let root = container.querySelector('[data-bulk-charts-root]');
    if (root) return root;

    root = document.createElement('section');
    root.className = 'module-bulk-charts-grid';
    root.setAttribute('data-bulk-charts-root', 'true');

    root.innerHTML = [
      '<div class=\"whs-chart\">',
      '  <div class=\"whs-chart-card-title\">Funil de campanhas</div>',
      '  <div class=\"whs-chart-card-subtitle\">Enviadas, entregues, lidas, respondidas e convertidas</div>',
      '  <div id=\"whs-chart-bulk-funnel\"></div>',
      '</div>'
    ].join('');

    container.appendChild(root);
    return root;
  }

  async function renderCharts(container) {
    if (!window.ChartEngine || !window.DataAggregator) {
      console.warn('[BulkCharts] ChartEngine ou DataAggregator indisponível');
      return;
    }

    const root = ensureLayout(container);
    if (!root) return;

    const data = await window.DataAggregator.getCampaignPerformance({ period: '30d' });
    const funnelEl = root.querySelector('#whs-chart-bulk-funnel');

    if (!funnelEl) return;

    if (!data.hasData || !data.campaigns.length) {
      ChartEngine.renderEmptyState(funnelEl, 'Nenhuma campanha encontrada ou ainda sem dados de envio.');
      return;
    }

    const top = data.campaigns.slice(0, 6);
    const labels = top.map(c => c.name || c.id || 'Campanha');

    const sent = top.map(c => c.sent || 0);
    const delivered = top.map(c => c.delivered || 0);
    const read = top.map(c => c.read || 0);
    const replied = top.map(c => c.replied || 0);
    const converted = top.map(c => c.converted || 0);

    ChartEngine.renderBarChart(funnelEl, {
      labels,
      orientation: 'horizontal',
      datasets: [
        { label: 'Enviadas', data: sent },
        { label: 'Entregues', data: delivered },
        { label: 'Lidas', data: read },
        { label: 'Respondidas', data: replied },
        { label: 'Convertidas', data: converted }
      ]
    });
  }

  const BulkCharts = {
    async init(containerEl) {
      const container = resolveContainer(containerEl);
      state.container = container;
      if (!container) return;
      await renderCharts(container);
      state.mounted = true;
    },
    async refresh() {
      if (!state.container) return;
      await renderCharts(state.container);
    }
  };

  window.BulkCharts = BulkCharts;

  function patchBulkModule() {
    const mod = window.BulkModule;
    if (!mod || mod.__chartsPatched) return;
    mod.__chartsPatched = true;

    const originalInit = typeof mod.init === 'function' ? mod.init.bind(mod) : async () => {};
    const originalOnShow = typeof mod.onShow === 'function' ? mod.onShow.bind(mod) : async () => {};

    mod.init = async function patchedInit(containerEl) {
      const result = await originalInit(containerEl);
      try {
        await BulkCharts.init(containerEl);
      } catch (err) {
        console.warn('[BulkCharts] erro ao inicializar gráficos:', err);
      }
      return result;
    };

    mod.onShow = async function patchedOnShow(containerEl) {
      const result = await originalOnShow(containerEl);
      try {
        await BulkCharts.refresh();
      } catch (err) {
        console.warn('[BulkCharts] erro ao atualizar gráficos:', err);
      }
      return result;
    };
  }

  function waitForModule() {
    try {
      patchBulkModule();
      if (!window.BulkModule || !window.BulkModule.__chartsPatched) {
        setTimeout(waitForModule, 900);
      }
    } catch (_err) {
      setTimeout(waitForModule, 1500);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    waitForModule();
  } else {
    window.addEventListener('DOMContentLoaded', waitForModule);
  }
})();
