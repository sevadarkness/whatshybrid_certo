
/**
 * WhatsHybrid Chart Engine
 * Implementação leve baseada em DOM/SVG para dashboards internos.
 * Evita dependências externas (Chart.js, etc).
 */
(function () {
  'use strict';

  // Paleta oficial (AI modern): variações de roxo/azul
  const PALETTE = [
    '#8b5cf6', // purple
    '#3b82f6', // blue
    '#a78bfa', // purple (light)
    '#60a5fa', // blue (light)
    '#7c3aed', // purple (deep)
    '#1d4ed8', // blue (deep)
    '#c4b5fd', // purple (pale)
    '#93c5fd'  // blue (pale)
  ];

  function getColor(index) {
    return PALETTE[index % PALETTE.length];
  }

  function clearContainer(container) {
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
  }

  function ensureWrapper(container, extraClass) {
    clearContainer(container);
    const wrapper = document.createElement('div');
    wrapper.className = 'whs-chart ' + (extraClass || '');
    container.appendChild(wrapper);
    return wrapper;
  }

  function renderEmptyState(container, message) {
    const wrapper = ensureWrapper(container, 'whs-chart--empty');
    const msg = document.createElement('div');
    msg.className = 'whs-chart-empty';
    msg.textContent = message || 'Sem dados suficientes para exibir o gráfico ainda.';
    wrapper.appendChild(msg);
    return { type: 'empty', destroy: () => clearContainer(container) };
  }

  function normalizeDatasets(datasets) {
    if (!Array.isArray(datasets) || !datasets.length) {
      return [{
        label: 'Valor',
        data: [],
      }];
    }
    return datasets.map((ds, index) => ({
      label: ds.label || `Série ${index + 1}`,
      data: Array.isArray(ds.data) ? ds.data : [],
      color: ds.color || getColor(index),
      fill: !!ds.fill
    }));
  }

  /**
   * Barra (vertical ou horizontal)
   */
  function renderBarChart(container, config) {
    if (!container) return null;

    const labels = config.labels || [];
    const datasets = normalizeDatasets(config.datasets);
    const orientation = config.orientation === 'horizontal' ? 'horizontal' : 'vertical';

    const allValues = datasets.flatMap(d => d.data || []);
    const maxValue = Math.max(0, ...allValues);
    if (!maxValue || !labels.length) {
      return renderEmptyState(container, config.emptyMessage || 'Ainda não há dados para este período.');
    }

    const wrapper = ensureWrapper(
      container,
      'whs-chart--bar whs-chart--' + orientation
    );

    const inner = document.createElement('div');
    inner.className = 'whs-chart-inner';
    wrapper.appendChild(inner);

    const barsContainer = document.createElement('div');
    barsContainer.className = 'whs-chart-bars';
    inner.appendChild(barsContainer);

    labels.forEach((label, idx) => {
      const group = document.createElement('div');
      group.className = 'whs-chart-bar-group';

      datasets.forEach((ds, dsIndex) => {
        const value = ds.data[idx] || 0;
        const pct = maxValue ? (value / maxValue) * 100 : 0;

        const bar = document.createElement('div');
        bar.className = 'whs-chart-bar';
        bar.dataset.seriesIndex = String(dsIndex);

        if (orientation === 'vertical') {
          bar.style.height = pct + '%';
        } else {
          bar.style.width = pct + '%';
        }

        bar.style.background = ds.color || getColor(dsIndex);
        bar.title = `${ds.label}: ${value.toLocaleString()}`;

        const valueLabel = document.createElement('span');
        valueLabel.className = 'whs-chart-bar-value';
        valueLabel.textContent = value ? String(value) : '';
        bar.appendChild(valueLabel);

        group.appendChild(bar);
      });

      const labelEl = document.createElement('div');
      labelEl.className = 'whs-chart-bar-label';
      labelEl.textContent = label;
      group.appendChild(labelEl);

      barsContainer.appendChild(group);
    });

    const legend = document.createElement('div');
    legend.className = 'whs-chart-legend';
    datasets.forEach((ds, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'whs-chart-legend-item';
      item.dataset.seriesIndex = String(index);

      const dot = document.createElement('span');
      dot.className = 'whs-chart-legend-dot';
      dot.style.background = ds.color || getColor(index);
      item.appendChild(dot);

      const label = document.createElement('span');
      label.className = 'whs-chart-legend-label';
      label.textContent = ds.label || `Série ${index + 1}`;
      item.appendChild(label);

      legend.appendChild(item);
    });
    wrapper.appendChild(legend);

    return {
      type: 'bar',
      destroy: () => clearContainer(container),
    };
  }

  /**
   * Linha simples usando SVG
   */
  function renderLineChart(container, config) {
    if (!container) return null;

    const labels = config.labels || [];
    const datasets = normalizeDatasets(config.datasets);
    // No momento suportamos apenas uma série para evitar complexidade
    const series = datasets[0];

    const values = series.data || [];
    const maxValue = Math.max(0, ...values);
    if (!maxValue || !labels.length) {
      return renderEmptyState(container, config.emptyMessage || 'Ainda não há dados suficientes para o gráfico de linha.');
    }

    const wrapper = ensureWrapper(container, 'whs-chart--line');
    const width = 400;
    const height = 220;
    const paddingLeft = 36;
    const paddingRight = 10;
    const paddingTop = 10;
    const paddingBottom = 34;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('whs-chart-svg');
    wrapper.appendChild(svg);

    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const stepX = labels.length > 1 ? plotWidth / (labels.length - 1) : plotWidth;

    // Eixos
    const axisColor = '#e5e7eb';

    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', paddingLeft);
    xAxis.setAttribute('y1', height - paddingBottom);
    xAxis.setAttribute('x2', width - paddingRight);
    xAxis.setAttribute('y2', height - paddingBottom);
    xAxis.setAttribute('stroke', axisColor);
    xAxis.setAttribute('stroke-width', '1');
    svg.appendChild(xAxis);

    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', paddingLeft);
    yAxis.setAttribute('y1', paddingTop);
    yAxis.setAttribute('x2', paddingLeft);
    yAxis.setAttribute('y2', height - paddingBottom);
    yAxis.setAttribute('stroke', axisColor);
    yAxis.setAttribute('stroke-width', '1');
    svg.appendChild(yAxis);

    // Linha
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    const points = values.map((v, idx) => {
      const x = paddingLeft + stepX * idx;
      const ratio = maxValue ? v / maxValue : 0;
      const y = paddingTop + (1 - ratio) * plotHeight;
      return `${x},${y}`;
    }).join(' ');

    path.setAttribute('points', points);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', series.color || getColor(0));
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);

    // Pontos
    values.forEach((v, idx) => {
      const x = paddingLeft + stepX * idx;
      const ratio = maxValue ? v / maxValue : 0;
      const y = paddingTop + (1 - ratio) * plotHeight;

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(y));
      dot.setAttribute('r', '3');
      dot.setAttribute('fill', series.color || getColor(0));
      svg.appendChild(dot);
    });

    // Rótulos no eixo X
    labels.forEach((label, idx) => {
      const x = paddingLeft + stepX * idx;
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(height - paddingBottom + 18));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 'whs-chart-axis-label');
      text.textContent = label;
      svg.appendChild(text);
    });

    return {
      type: 'line',
      destroy: () => clearContainer(container),
    };
  }

  /**
   * Donut / Pizza usando conic-gradient
   */
  function renderDonutChart(container, config) {
    if (!container) return null;

    const items = (config.items || []).filter(i => i && typeof i.value === 'number');
    const total = items.reduce((acc, cur) => acc + (cur.value || 0), 0);

    if (!total) {
      return renderEmptyState(container, config.emptyMessage || 'Sem dados suficientes para o gráfico.');
    }

    const wrapper = ensureWrapper(container, 'whs-chart--donut');

    const donutWrapper = document.createElement('div');
    donutWrapper.className = 'whs-chart-donut-wrapper';
    wrapper.appendChild(donutWrapper);

    const donut = document.createElement('div');
    donut.className = 'whs-chart-donut';
    donutWrapper.appendChild(donut);

    let current = 0;
    const segments = [];

    items.forEach((item, index) => {
      const value = item.value || 0;
      const pct = (value / total) * 100;
      const from = current;
      const to = current + pct;
      current = to;
      const color = item.color || getColor(index);
      segments.push(`${color} ${from.toFixed(2)}% ${to.toFixed(2)}%`);
    });

    donut.style.backgroundImage = `conic-gradient(${segments.join(', ')})`;

    const center = document.createElement('div');
    center.className = 'whs-chart-donut-center';

    const totalEl = document.createElement('div');
    totalEl.className = 'whs-chart-donut-total';
    totalEl.textContent = (config.totalLabel || 'Total') + ': ' + total.toLocaleString();
    center.appendChild(totalEl);

    if (typeof config.subtitle === 'string') {
      const subtitleEl = document.createElement('div');
      subtitleEl.className = 'whs-chart-donut-subtitle';
      subtitleEl.textContent = config.subtitle;
      center.appendChild(subtitleEl);
    }

    donutWrapper.appendChild(center);

    const legend = document.createElement('div');
    legend.className = 'whs-chart-legend';

    items.forEach((item, index) => {
      const pct = total ? (item.value / total) * 100 : 0;
      const itemEl = document.createElement('div');
      itemEl.className = 'whs-chart-legend-item';

      const dot = document.createElement('span');
      dot.className = 'whs-chart-legend-dot';
      dot.style.background = item.color || getColor(index);
      itemEl.appendChild(dot);

      const label = document.createElement('span');
      label.className = 'whs-chart-legend-label';
      label.textContent = `${item.label || 'Item'} • ${pct.toFixed(1)}%`;
      itemEl.appendChild(label);

      legend.appendChild(itemEl);
    });

    wrapper.appendChild(legend);

    return {
      type: 'donut',
      destroy: () => clearContainer(container),
    };
  }

  /**
   * Gauge radial simples (SLA / taxa)
   */
  function renderRadialGauge(container, config) {
    if (!container) return null;

    const value = typeof config.value === 'number' ? config.value : 0;
    const clamped = Math.max(0, Math.min(100, value));

    const wrapper = ensureWrapper(container, 'whs-chart--gauge');

    const gauge = document.createElement('div');
    gauge.className = 'whs-chart-gauge';
    wrapper.appendChild(gauge);

    const svgNS = 'http://www.w3.org/2000/svg';
    const size = 160;
    const strokeWidth = 10;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.classList.add('whs-chart-gauge-svg');

    const circleBg = document.createElementNS(svgNS, 'circle');
    circleBg.setAttribute('cx', String(size / 2));
    circleBg.setAttribute('cy', String(size / 2));
    circleBg.setAttribute('r', String(radius));
    circleBg.setAttribute('fill', 'none');
    circleBg.setAttribute('stroke', '#e5e7eb');
    circleBg.setAttribute('stroke-width', String(strokeWidth));
    svg.appendChild(circleBg);

    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', String(size / 2));
    circle.setAttribute('cy', String(size / 2));
    circle.setAttribute('r', String(radius));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', config.color || getColor(0));
    circle.setAttribute('stroke-width', String(strokeWidth));
    circle.setAttribute('stroke-linecap', 'round');
    circle.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);

    const offset = circumference * (1 - clamped / 100);
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = String(offset);
    svg.appendChild(circle);

    gauge.appendChild(svg);

    const center = document.createElement('div');
    center.className = 'whs-chart-gauge-center';
    const valueEl = document.createElement('div');
    valueEl.className = 'whs-chart-gauge-value';
    valueEl.textContent = clamped.toFixed(1).replace('.0', '') + '%';
    center.appendChild(valueEl);

    if (config.label) {
      const labelEl = document.createElement('div');
      labelEl.className = 'whs-chart-gauge-label';
      labelEl.textContent = config.label;
      center.appendChild(labelEl);
    }

    gauge.appendChild(center);

    return {
      type: 'gauge',
      destroy: () => clearContainer(container),
    };
  }

  window.ChartEngine = {
    PALETTE,
    renderBarChart,
    renderLineChart,
    renderDonutChart,
    renderRadialGauge,
    renderEmptyState,
    clearContainer
  };
})();
