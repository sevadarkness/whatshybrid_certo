
/**
 * FlowsCharts
 * Gráficos de performance dos fluxos automatizados.
 */
(function () {
  'use strict';

  const state = {
    container: null,
    mounted: false,
  };

  function resolveContainer(containerEl) {
    if (containerEl && containerEl.querySelector) return containerEl;
    const fromDom = document.querySelector('.workspace-flows, [data-module=\"flows\"], .module-flows');
    return fromDom || document.body;
  }

  function ensureLayout(container) {
    if (!container) return null;
    let root = container.querySelector('[data-flows-charts-root]');
    if (root) return root;

    root = document.createElement('section');
    root.className = 'module-flows-charts-grid';
    root.setAttribute('data-flows-charts-root', 'true');

    root.innerHTML = [
      '<div class=\"whs-chart\">',
      '  <div class=\"whs-chart-card-title\">Performance dos fluxos</div>',
      '  <div class=\"whs-chart-card-subtitle\">Execuções, concluídas e falhas por fluxo</div>',
      '  <div id=\"whs-chart-flows-performance\"></div>',
      '</div>'
    ].join('');

    container.appendChild(root);
    return root;
  }

  async function renderCharts(container) {
    if (!window.ChartEngine || !window.DataAggregator) {
      console.warn('[FlowsCharts] ChartEngine ou DataAggregator indisponível');
      return;
    }

    const root = ensureLayout(container);
    if (!root) return;

    const data = await window.DataAggregator.getFlowPerformance({ period: '30d' });
    const perfEl = root.querySelector('#whs-chart-flows-performance');

    if (!perfEl) return;

    if (!data.hasData || !data.flows.length) {
      ChartEngine.renderEmptyState(perfEl, 'Nenhum fluxo automatizado encontrado ou sem execuções.');
      return;
    }

    const top = data.flows.slice(0, 6);
    const labels = top.map(f => f.name || f.id || 'Fluxo');
    const runs = top.map(f => f.runs || 0);
    const completed = top.map(f => f.completed || 0);
    const failed = top.map(f => f.failed || 0);

    ChartEngine.renderBarChart(perfEl, {
      labels,
      orientation: 'horizontal',
      datasets: [
        { label: 'Execuções', data: runs },
        { label: 'Concluídas', data: completed },
        { label: 'Falhas', data: failed }
      ]
    });
  }

  const FlowsCharts = {
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

  window.FlowsCharts = FlowsCharts;

  function patchFlowsModule() {
    const mod = window.FlowsModule;
    if (!mod || mod.__chartsPatched) return;
    mod.__chartsPatched = true;

    const originalInit = typeof mod.init === 'function' ? mod.init.bind(mod) : async () => {};
    const originalOnShow = typeof mod.onShow === 'function' ? mod.onShow.bind(mod) : async () => {};

    mod.init = async function patchedInit(containerEl) {
      const result = await originalInit(containerEl);
      try {
        await FlowsCharts.init(containerEl);
      } catch (err) {
        console.warn('[FlowsCharts] erro ao inicializar gráficos:', err);
      }
      return result;
    };

    mod.onShow = async function patchedOnShow(containerEl) {
      const result = await originalOnShow(containerEl);
      try {
        await FlowsCharts.refresh();
      } catch (err) {
        console.warn('[FlowsCharts] erro ao atualizar gráficos:', err);
      }
      return result;
    };
  }

  function waitForModule() {
    try {
      patchFlowsModule();
      if (!window.FlowsModule || !window.FlowsModule.__chartsPatched) {
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
