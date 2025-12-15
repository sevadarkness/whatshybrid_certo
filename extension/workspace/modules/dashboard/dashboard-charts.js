
/**
 * DashboardCharts
 * Gráficos principais do painel "Dashboard" usando ChartEngine + DataAggregator.
 */
(function () {
  'use strict';

  const state = {
    mounted: false,
    container: null,
  };

  function resolveContainer(containerEl) {
    if (containerEl && containerEl.querySelector) {
      return containerEl;
    }
    const fromDom = document.querySelector('.workspace-module-active, .workspace-dashboard, [data-workspace-dashboard]');
    return fromDom || document.body;
  }

  function ensureLayout(container) {
    if (!container) return null;

    let root = container.querySelector('[data-dashboard-charts-root]');
    if (root) return root;

    root = document.createElement('section');
    root.className = 'module-dashboard-charts-grid module-dashboard-charts-grid--full';
    root.setAttribute('data-dashboard-charts-root', 'true');

    root.innerHTML = [
      '<div class=\"whs-chart\">',
      '  <div class=\"whs-chart-card-title\">Volume de mensagens</div>',
      '  <div class=\"whs-chart-card-subtitle\">Últimos 7 dias • Enviadas x Recebidas</div>',
      '  <div id=\"whs-chart-dashboard-daily-volume\"></div>',
      '</div>',
      '<div class=\"whs-chart\">',
      '  <div class=\"whs-chart-card-title\">Taxa de resposta</div>',
      '  <div class=\"whs-chart-card-subtitle\">Proporção de conversas respondidas</div>',
      '  <div id=\"whs-chart-dashboard-funnel\"></div>',
      '</div>',
      '<div class=\"whs-chart\">',
      '  <div class=\"whs-chart-card-title\">SLA de atendimento</div>',
      '  <div class=\"whs-chart-card-subtitle\">Percentual aproximado de conversas respondidas</div>',
      '  <div id=\"whs-chart-dashboard-sla\"></div>',
      '</div>',
      '<div class=\"whs-chart\">',
      '  <div class=\"whs-chart-card-title\">Horário de maior engajamento</div>',
      '  <div class=\"whs-chart-card-subtitle\">Distribuição de mensagens por faixa de horário</div>',
      '  <div id=\"whs-chart-dashboard-hourly\"></div>',
      '</div>',
      '<div class=\"whs-chart\">',
      '  <div class=\"whs-chart-card-title\">Canais mais utilizados</div>',
      '  <div class=\"whs-chart-card-subtitle\">Distribuição por canal (quando disponível)</div>',
      '  <div id=\"whs-chart-dashboard-channels\"></div>',
      '</div>'
    ].join('');

    // Inserimos logo após o primeiro bloco de métricas, se existir
    const firstMetricsBlock = container.querySelector('.workspace-dashboard-metrics, .dashboard-header, .module-dashboard-header');
    if (firstMetricsBlock && firstMetricsBlock.parentNode) {
      firstMetricsBlock.parentNode.insertBefore(root, firstMetricsBlock.nextSibling);
    } else {
      container.appendChild(root);
    }

    return root;
  }

  async function renderCharts(container) {
    if (!window.ChartEngine || !window.DataAggregator) {
      console.warn('[DashboardCharts] ChartEngine ou DataAggregator indisponível');
      return;
    }

    const root = ensureLayout(container);
    if (!root) return;

    const [overview, hourly] = await Promise.all([
      window.DataAggregator.getMessageOverview({ period: '7d' }),
      window.DataAggregator.getHourlyEngagement({ period: '7d' })
    ]);

    const dailyEl = root.querySelector('#whs-chart-dashboard-daily-volume');
    const funnelEl = root.querySelector('#whs-chart-dashboard-funnel');
    const slaEl = root.querySelector('#whs-chart-dashboard-sla');
    const hourlyEl = root.querySelector('#whs-chart-dashboard-hourly');
    const channelsEl = root.querySelector('#whs-chart-dashboard-channels');

    if (dailyEl) {
      if (!overview.hasData || !overview.daily.length) {
        ChartEngine.renderEmptyState(dailyEl, 'Nenhuma mensagem registrada para o período selecionado.');
      } else {
        const labels = overview.daily.map(d => d.label);
        const sent = overview.daily.map(d => d.sent || 0);
        const received = overview.daily.map(d => d.received || 0);

        ChartEngine.renderBarChart(dailyEl, {
          labels,
          datasets: [
            { label: 'Enviadas', data: sent },
            { label: 'Recebidas', data: received }
          ]
        });
      }
    }

    if (funnelEl) {
      if (!overview.hasData || !overview.answered.total) {
        ChartEngine.renderEmptyState(funnelEl, 'Aguardando conversas respondidas para montar o funil.');
      } else {
        const totalInbound = overview.answered.total || 0;
        const answered = overview.answered.answered || 0;
        const pending = Math.max(0, totalInbound - answered);
        const rate = overview.answered.rate || 0;

        ChartEngine.renderDonutChart(funnelEl, {
          totalLabel: 'Conversas',
          subtitle: `Respondidas: ${rate.toFixed(1)}%`,
          items: [
            { label: 'Respondidas', value: answered },
            { label: 'Pendentes', value: pending }
          ]
        });
      }
    }

    if (slaEl) {
      const rate = overview.answered && typeof overview.answered.rate === 'number'
        ? overview.answered.rate
        : 0;
      ChartEngine.renderRadialGauge(slaEl, {
        value: rate,
        label: 'Conversas respondidas'
      });
    }

    if (hourlyEl) {
      if (!hourly.hasData || !hourly.buckets.length) {
        ChartEngine.renderEmptyState(hourlyEl, 'Ainda não foi possível calcular o pico de horários.');
      } else {
        const labels = hourly.buckets.map(b => b.label);
        const totals = hourly.buckets.map(b => (b.sent || 0) + (b.received || 0));

        ChartEngine.renderLineChart(hourlyEl, {
          labels,
          datasets: [
            { label: 'Mensagens por faixa de horário', data: totals }
          ]
        });
      }
    }

    if (channelsEl) {
      if (!overview.hasData || !overview.channels.length) {
        ChartEngine.renderEmptyState(channelsEl, 'Ainda não há dados de canal suficientes.');
      } else {
        const items = overview.channels.map((c, index) => ({
          label: c.channel || 'Canal',
          value: c.total || 0,
          color: ChartEngine.PALETTE[index % ChartEngine.PALETTE.length]
        }));

        ChartEngine.renderDonutChart(channelsEl, {
          totalLabel: 'Mensagens',
          subtitle: 'Distribuição por canal',
          items
        });
      }
    }
  }

  const DashboardCharts = {
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

  window.DashboardCharts = DashboardCharts;

  // Integração automática com DashboardModule
  function patchDashboardModule() {
    const mod = window.DashboardModule;
    if (!mod || mod.__chartsPatched) return;
    mod.__chartsPatched = true;

    const originalInit = typeof mod.init === 'function' ? mod.init.bind(mod) : async () => {};
    const originalOnShow = typeof mod.onShow === 'function' ? mod.onShow.bind(mod) : async () => {};

    mod.init = async function patchedInit(containerEl) {
      const result = await originalInit(containerEl);
      try {
        await DashboardCharts.init(containerEl);
      } catch (err) {
        console.warn('[DashboardCharts] erro ao inicializar gráficos:', err);
      }
      return result;
    };

    mod.onShow = async function patchedOnShow(containerEl) {
      const result = await originalOnShow(containerEl);
      try {
        await DashboardCharts.refresh();
      } catch (err) {
        console.warn('[DashboardCharts] erro ao atualizar gráficos:', err);
      }
      return result;
    };
  }

  function waitForModule() {
    try {
      patchDashboardModule();
      if (!window.DashboardModule || !window.DashboardModule.__chartsPatched) {
        setTimeout(waitForModule, 800);
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
