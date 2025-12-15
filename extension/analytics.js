let backendUrl = "";
let extensionKey = "";

/**
 * Carrega URL do backend e chave da extensão a partir do storage.
 */
function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["backendUrl", "extensionKey"], (data) => {
      backendUrl = data.backendUrl || "";
      extensionKey = data.extensionKey || "";
      resolve();
    });
  });
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = (value ?? "-").toString();
}

/**
 * Desenha um gráfico de barras simples em canvas (sem libs externas).
 */
function drawBarChart(canvasId, labels, values) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  if (!values || !values.length) {
    ctx.fillStyle = "#64748b";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Sem dados suficientes para exibir o gráfico.", width / 2, height / 2);
    return;
  }

  const maxVal = Math.max(...values, 1);
  const padding = 32;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Eixos
  ctx.strokeStyle = "rgba(148, 163, 184, 0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();

  const barSpace = chartWidth / values.length;
  const barWidth = barSpace * 0.6;
  const gap = barSpace * 0.4;

  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    const x = padding + gap / 2 + i * barSpace;
    const barHeight = (val / maxVal) * chartHeight;
    const y = height - padding - barHeight;

    const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
    gradient.addColorStop(0, "#8b5cf6");
    gradient.addColorStop(1, "#3b82f6");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, 6);
    ctx.fill();

    // valor
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(String(val), x + barWidth / 2, y - 4);

    // label (limitada)
    const label = (labels[i] || "").toString();
    const maxLabel = 10;
    const shortLabel = label.length > maxLabel ? label.slice(0, maxLabel - 1) + "…" : label;
    ctx.save();
    ctx.translate(x + barWidth / 2, height - padding + 10);
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px system-ui";
    ctx.fillText(shortLabel, 0, 0);
    ctx.restore();
  }
}

/**
 * Gráfico de linha simples para séries temporais (eventos por dia).
 */
function drawLineChart(canvasId, labels, values) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  if (!values || !values.length) {
    ctx.fillStyle = "#64748b";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Sem dados suficientes para exibir o gráfico.", width / 2, height / 2);
    return;
  }

  const maxVal = Math.max(...values, 1);
  const padding = 32;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Eixos
  ctx.strokeStyle = "rgba(148, 163, 184, 0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();

  const stepX = chartWidth / Math.max(values.length - 1, 1);

  // Área preenchida
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    const x = padding + i * stepX;
    const y = height - padding - (val / maxVal) * chartHeight;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(padding + (values.length - 1) * stepX, height - padding);
  ctx.lineTo(padding, height - padding);
  ctx.closePath();

  const fillGradient = ctx.createLinearGradient(0, padding, 0, height - padding);
  fillGradient.addColorStop(0, "rgba(56, 189, 248, 0.4)");
  fillGradient.addColorStop(1, "rgba(15, 23, 42, 0.0)");
  ctx.fillStyle = fillGradient;
  ctx.fill();

  // Linha
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    const x = padding + i * stepX;
    const y = height - padding - (val / maxVal) * chartHeight;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Pontos
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    const x = padding + i * stepX;
    const y = height - padding - (val / maxVal) * chartHeight;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#8b5cf6";
    ctx.fill();

    ctx.fillStyle = "#e5e7eb";
    ctx.font = "10px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(String(val), x, y - 6);
  }

  // Labels de datas (abaixo)
  ctx.fillStyle = "#9ca3af";
  ctx.font = "10px system-ui";
  ctx.textAlign = "center";
  for (let i = 0; i < labels.length; i++) {
    const x = padding + i * stepX;
    const label = labels[i];
    ctx.fillText(label, x, height - padding + 12);
  }
}

async function loadMetrics() {
  if (!backendUrl) return;
  try {
    const safeBase = backendUrl.replace(/\/$/, "");
    const res = await fetch(safeBase + "/metrics/summary", {
      headers: {
        "x-extension-key": extensionKey || ""
      }
    });

    if (!res.ok) {
      console.error("Erro HTTP ao buscar métricas:", res.status);
      return;
    }

    const m = await res.json();
    setValue("m-deals", m.dealsCount);
    setValue("m-tasks", m.openTasksCount);
    setValue("m-campaigns", m.campaignsCount);
    setValue("m-events7", m.last7DaysEvents);

    if (!m.charts) return;
    const charts = m.charts;

    if (Array.isArray(charts.dealsByStage) && charts.dealsByStage.length) {
      const labels = charts.dealsByStage.map((d) => d.stage || "Sem estágio");
      const values = charts.dealsByStage.map((d) => d.count || d._count || 0);
      drawBarChart("chart-deals-stage", labels, values);
    }

    if (Array.isArray(charts.tasksByStatus) && charts.tasksByStatus.length) {
      const labels = charts.tasksByStatus.map((t) => t.status || "SEM");
      const values = charts.tasksByStatus.map((t) => t.count || t._count || 0);
      drawBarChart("chart-tasks-status", labels, values);
    }

    if (Array.isArray(charts.eventsLast7Days) && charts.eventsLast7Days.length) {
      const labels = charts.eventsLast7Days.map((e) => (e.date || "").slice(5)); // mostra apenas MM-DD
      const values = charts.eventsLast7Days.map((e) => e.count || 0);
      drawLineChart("chart-events-7days", labels, values);
    }
  } catch (e) {
    console.error("Erro ao carregar métricas", e);
  }
}

(async () => {
  await loadConfig();
  await loadMetrics();
})();
