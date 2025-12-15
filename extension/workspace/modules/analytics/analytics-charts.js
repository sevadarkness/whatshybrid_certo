
/**
 * AnalyticsCharts
 * Gráficos avançados da aba "Analytics".
 */
(function () {
  'use strict';

  const state = {
    container: null,
    mounted: false,
  };

  function resolveContainer(containerEl) {
    if (containerEl && containerEl.querySelector) return containerEl;
    const fromDom = document.querySelector('.workspace-analytics, [data-module=\"analytics\"], .module-analytics');
    return fromDom || document.body;
  }

  function ensureLayout(container) {
    if (!container) return null;
    let root = container.querySelector('[data-analytics-charts-root]');
    if (root) return root;

    root = document.createElement('section');
    root.className = 'module-analytics-charts-grid';
    root.setAttribute('data-analytics-charts-root', 'true');

    root.innerHTML = [
      '<div class=\"whs-chart\">',
      '  <div class=\"whs-chart-card-title\">Horário de maior engajamento</div>',
      '  <div class=\"whs-chart-card-subtitle\">Distribuição de mensagens por faixa de horário</div>',
      '  <div id=\"whs-chart-analytics-hourly\"></div>',
      '</div>',
      '<div class=\"whs-chart\">',
      '  <div class=\"whs-chart-card-title\">Funil CRM</div>',
      '  <div class=\"whs-chart-card-subtitle\">Distribuição de contatos por estágio</div>',
      '  <div id=\"whs-chart-analytics-funnel\"></div>',
      '</div>',
      '<div class=\"whs-chart\">',
      '  <div class=\"whs-chart-card-title\">Campanhas em destaque</div>',
      '  <div class=\"whs-chart-card-subtitle\">Visão resumida de performance</div>',
      '  <div id=\"whs-chart-analytics-campaigns\"></div>',
      '</div>'
    ].join('');

    container.appendChild(root);
    return root;
  }

  async function renderCharts(container) {
    if (!window.ChartEngine || !window.DataAggregator) {
      console.warn('[AnalyticsCharts] ChartEngine ou DataAggregator indisponível');
      return;
    }

    const root = ensureLayout(container);
    if (!root) return;

    const [hourly, funnel, campaigns] = await Promise.all([
      window.DataAggregator.getHourlyEngagement({ period: '7d' }),
      window.DataAggregator.getCrmFunnel(),
      window.DataAggregator.getCampaignPerformance({ period: '30d' })
    ]);

    const hourlyEl = root.querySelector('#whs-chart-analytics-hourly');
    const funnelEl = root.querySelector('#whs-chart-analytics-funnel');
    const campaignsEl = root.querySelector('#whs-chart-analytics-campaigns');

    if (hourlyEl) {
      if (!hourly.hasData || !hourly.buckets.length) {
        ChartEngine.renderEmptyState(hourlyEl, 'Ainda não há dados suficientes para calcular o engajamento por horário.');
      } else {
        const labels = hourly.buckets.map(b => b.label);
        const totals = hourly.buckets.map(b => (b.sent || 0) + (b.received || 0));

        ChartEngine.renderBarChart(hourlyEl, {
          labels,
          datasets: [{ label: 'Mensagens', data: totals }]
        });
      }
    }

    if (funnelEl) {
      if (!funnel.hasData || !funnel.stages.length) {
        ChartEngine.renderEmptyState(funnelEl, 'Nenhum contato CRM encontrado para montar o funil.');
      } else {
        const items = funnel.stages.map((s, index) => ({
          label: s.label || s.id || 'Estágio',
          value: s.total || 0,
          color: ChartEngine.PALETTE[index % ChartEngine.PALETTE.length]
        }));
        ChartEngine.renderDonutChart(funnelEl, {
          totalLabel: 'Contatos',
          subtitle: `Total: ${funnel.total.toLocaleString()}`,
          items
        });
      }
    }

    if (campaignsEl) {
      if (!campaigns.hasData || !campaigns.campaigns.length) {
        ChartEngine.renderEmptyState(campaignsEl, 'Nenhuma campanha encontrada ou sem dados de performance.');
      } else {
        const top = campaigns.campaigns.slice(0, 5);
        const labels = top.map(c => c.name || c.id || 'Campanha');
        const conversions = top.map(c => c.converted || c.replied || 0);

        ChartEngine.renderBarChart(campaignsEl, {
          labels,
          orientation: 'horizontal',
          datasets: [{ label: 'Conversões / respostas', data: conversions }]
        });
      }
    }
  }

  const AnalyticsCharts = {
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

  window.AnalyticsCharts = AnalyticsCharts;

  function patchAnalyticsModule() {
    const mod = window.AnalyticsModule;
    if (!mod || mod.__chartsPatched) return;
    mod.__chartsPatched = true;

    const originalInit = typeof mod.init === 'function' ? mod.init.bind(mod) : async () => {};
    const originalOnShow = typeof mod.onShow === 'function' ? mod.onShow.bind(mod) : async () => {};

    mod.init = async function patchedInit(containerEl) {
      const result = await originalInit(containerEl);
      try {
        await AnalyticsCharts.init(containerEl);
      } catch (err) {
        console.warn('[AnalyticsCharts] erro ao inicializar gráficos:', err);
      }
      return result;
    };

    mod.onShow = async function patchedOnShow(containerEl) {
      const result = await originalOnShow(containerEl);
      try {
        await AnalyticsCharts.refresh();
      } catch (err) {
        console.warn('[AnalyticsCharts] erro ao atualizar gráficos:', err);
      }
      return result;
    };
  }

  function waitForModule() {
    try {
      patchAnalyticsModule();
      if (!window.AnalyticsModule || !window.AnalyticsModule.__chartsPatched) {
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
