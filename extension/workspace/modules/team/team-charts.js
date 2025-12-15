
/**
 * TeamCharts
 * Visualização de performance da equipe.
 */
(function () {
  'use strict';

  const state = {
    container: null,
    mounted: false,
  };

  function resolveContainer(containerEl) {
    if (containerEl && containerEl.querySelector) return containerEl;
    const fromDom = document.querySelector('.workspace-team, [data-module=\"team\"], .module-team');
    return fromDom || document.body;
  }

  function ensureLayout(container) {
    if (!container) return null;
    let root = container.querySelector('[data-team-charts-root]');
    if (root) return root;

    root = document.createElement('section');
    root.className = 'module-team-charts-grid';
    root.setAttribute('data-team-charts-root', 'true');

    root.innerHTML = [
      '<div class=\"whs-chart\">',
      '  <div class=\"whs-chart-card-title\">Volume por agente</div>',
      '  <div class=\"whs-chart-card-subtitle\">Total aproximado de mensagens tratadas por agente</div>',
      '  <div id=\"whs-chart-team-volume\"></div>',
      '</div>',
      '<div class=\"whs-chart\">',
      '  <div class=\"whs-chart-card-title\">SLA médio da equipe</div>',
      '  <div class=\"whs-chart-card-subtitle\">Estimativa a partir de mensagens respondidas</div>',
      '  <div id=\"whs-chart-team-sla\"></div>',
      '</div>'
    ].join('');

    container.appendChild(root);
    return root;
  }

  async function renderCharts(container) {
    if (!window.ChartEngine || !window.DataAggregator) {
      console.warn('[TeamCharts] ChartEngine ou DataAggregator indisponível');
      return;
    }

    const root = ensureLayout(container);
    if (!root) return;

    const data = await window.DataAggregator.getTeamPerformance({ period: '7d' });

    const volumeEl = root.querySelector('#whs-chart-team-volume');
    const slaEl = root.querySelector('#whs-chart-team-sla');

    if (volumeEl) {
      if (!data.hasData || !data.members.length) {
        ChartEngine.renderEmptyState(volumeEl, 'Nenhum dado de equipe encontrado ainda.');
      } else {
        const labels = data.members.map(m => m.name || m.id || 'Agente');
        const totals = data.members.map(m => m.totalMessages || 0);

        ChartEngine.renderBarChart(volumeEl, {
          labels,
          orientation: 'horizontal',
          datasets: [{ label: 'Mensagens', data: totals }]
        });
      }
    }

    if (slaEl) {
      if (!data.hasData || !data.members.length) {
        ChartEngine.renderEmptyState(slaEl, 'Ainda não há dados suficientes para estimar o SLA.');
      } else {
        const totalMessages = data.members.reduce((acc, m) => acc + (m.totalMessages || 0), 0);
        const totalAnswered = data.members.reduce((acc, m) => acc + (m.answered || 0), 0);
        const rate = totalMessages ? (totalAnswered / totalMessages) * 100 : 0;

        ChartEngine.renderRadialGauge(slaEl, {
          value: rate,
          label: 'Conversas respondidas pela equipe'
        });
      }
    }
  }

  const TeamCharts = {
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

  window.TeamCharts = TeamCharts;

  function patchTeamModule() {
    const mod = window.TeamModule;
    if (!mod || mod.__chartsPatched) return;
    mod.__chartsPatched = true;

    const originalInit = typeof mod.init === 'function' ? mod.init.bind(mod) : async () => {};
    const originalOnShow = typeof mod.onShow === 'function' ? mod.onShow.bind(mod) : async () => {};

    mod.init = async function patchedInit(containerEl) {
      const result = await originalInit(containerEl);
      try {
        await TeamCharts.init(containerEl);
      } catch (err) {
        console.warn('[TeamCharts] erro ao inicializar gráficos:', err);
      }
      return result;
    };

    mod.onShow = async function patchedOnShow(containerEl) {
      const result = await originalOnShow(containerEl);
      try {
        await TeamCharts.refresh();
      } catch (err) {
        console.warn('[TeamCharts] erro ao atualizar gráficos:', err);
      }
      return result;
    };
  }

  function waitForModule() {
    try {
      patchTeamModule();
      if (!window.TeamModule || !window.TeamModule.__chartsPatched) {
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
