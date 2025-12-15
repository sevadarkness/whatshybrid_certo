/*
 * WhatsHybrid Data Aggregator
 *
 * Objetivo:
 * - Centralizar leitura e agregação de métricas para os gráficos.
 * - Ser resiliente a variações de schema e chaves do chrome.storage.
 * - Nunca quebrar o painel: em caso de dados ausentes/corrompidos, retornar estruturas vazias.
 *
 * Observação importante:
 * - Para métricas de mensagens, priorizamos um agregador leve (quantum_msg_stats)
 *   atualizado pelo content-script (metrics/message_metrics_collector.js).
 * - Mantemos fallback para chaves antigas (ex.: messageHistory), caso existam.
 */

const DataAggregator = (() => {
  'use strict';

  const inExtensionContext =
    typeof chrome !== 'undefined' &&
    !!chrome.storage &&
    (!!chrome.storage.local || !!chrome.storage.sync);

  const CACHE_TTL_MS = 15 * 1000;
  const cache = new Map();

  // Chaves (novas + legadas)
  const KEY_INSTALL_TS = 'quantum_install_timestamp';
  const KEY_INSTALL_VERSION = 'quantum_install_version';
  const KEY_INSTALL_PREV_TS = 'quantum_install_previous_timestamp';
  const KEY_INSTALL_PREV_VER = 'quantum_install_previous_version';

  // Mensagens (novo agregador recomendado)
  const KEY_MSG_STATS = 'quantum_msg_stats';
  // Fallback legado (caso exista em alguma versão anterior)
  const KEY_MSG_HISTORY_LEGACY = 'messageHistory';
  const KEY_MSG_EVENTS_LEGACY = 'quantum_msg_events';

  // CRM
  const KEY_CRM_CONTACTS_LOCAL = 'quantum_crm_contacts';
  const KEY_CRM_STAGES_LOCAL = 'quantum_crm_stages';
  const KEY_CRM_CONTACTS_SYNC_LEGACY = 'crmContacts';
  const KEY_CRM_STAGES_SYNC_LEGACY = 'crmStages';

  // Campanhas (Bulk)
  const KEY_BULK_CAMPAIGNS_LOCAL = 'bulk_campaigns';
  const KEY_CAMPAIGNS_LEGACY = 'campaigns';
  const KEY_CAMPAIGN_HISTORY_LEGACY = 'campaignHistory';

  // Time
  const KEY_TEAM_MEMBERS_LOCAL = 'team_members';
  const KEY_TEAM_MEMBERS_LEGACY = 'teamMembers';

  // Flows
  const KEY_FLOWS_LOCAL = 'quantum_flows';
  const KEY_FLOW_HISTORY_LOCAL = 'quantum_flow_history';
  const KEY_FLOWS_LEGACY = 'flows';
  const KEY_FLOW_EXEC_LEGACY = 'flowExecutions';

  // -------------------------
  // Utils gerais
  // -------------------------

  function getCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  function setCache(key, value) {
    cache.set(key, { ts: Date.now(), value });
    return value;
  }

  /**
   * Normaliza um valor que pode vir como array OU como objeto-index (ex: {id: {...}}).
   *
   * Por que isso é necessário?
   * - Algumas partes do CRM/suite persistem dados no formato "mapa" (ex.: crmContacts em sync)
   *   para facilitar lookup por chatId.
   * - Os gráficos precisam de uma lista (array) para agregar/contar.
   *
   * ⚠️ Importante: só usamos isso para coleções (contacts/campaigns/members/flows/executions etc.).
   */
  function normalizeArray(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      try {
        return Object.values(value);
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  function normalizeObject(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function safeNumber(n, fallback = 0) {
    return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  }

  function formatDayLabel(date) {
    // dd/MM
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}`;
  }

  function formatHourLabel(hour) {
    return `${String(hour).padStart(2, '0')}h`;
  }

  function toLocalDateKey(ts) {
    const d = new Date(ts);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function dateKeyToLocalMiddayTs(dateKey) {
    // dateKey: YYYY-MM-DD
    const parts = String(dateKey).split('-').map(p => parseInt(p, 10));
    if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return NaN;
    const [y, m, d] = parts;
    return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  }

  function parsePeriod(period) {
    const now = Date.now();
    const p = String(period || '7d').toLowerCase();

    if (p === 'today' || p === 'hoje') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return { start: start.getTime(), end: now, label: 'Hoje', days: 1 };
    }

    if (p === '7d' || p === '7days') {
      return { start: now - 7 * 24 * 60 * 60 * 1000, end: now, label: '7 dias', days: 7 };
    }

    if (p === '30d' || p === '30days') {
      return { start: now - 30 * 24 * 60 * 60 * 1000, end: now, label: '30 dias', days: 30 };
    }

    if (p === '90d' || p === '90days') {
      return { start: now - 90 * 24 * 60 * 60 * 1000, end: now, label: '90 dias', days: 90 };
    }

    // fallback
    return { start: now - 7 * 24 * 60 * 60 * 1000, end: now, label: '7 dias', days: 7 };
  }

  function iterateDays(startTs, endTs) {
    const days = [];
    const d = new Date(startTs);
    d.setHours(0, 0, 0, 0);

    const end = new Date(endTs);
    end.setHours(0, 0, 0, 0);

    while (d.getTime() <= end.getTime()) {
      days.push(new Date(d.getTime()));
      d.setDate(d.getDate() + 1);
    }

    return days;
  }

  // -------------------------
  // chrome.storage wrappers
  // -------------------------

  function safeChromeGet(area, keys) {
    if (!inExtensionContext || !area || typeof area.get !== 'function') {
      return Promise.resolve({});
    }

    return new Promise(resolve => {
      try {
        area.get(keys, result => {
          if (chrome?.runtime?.lastError) {
            console.warn('[DataAggregator] chrome.storage.get error:', chrome.runtime.lastError);
            resolve({});
            return;
          }
          resolve(result || {});
        });
      } catch (err) {
        console.warn('[DataAggregator] safeChromeGet exception:', err);
        resolve({});
      }
    });
  }

  function safeChromeSet(area, value) {
    if (!inExtensionContext || !area || typeof area.set !== 'function') {
      return Promise.resolve(false);
    }
    return new Promise(resolve => {
      try {
        area.set(value, () => {
          if (chrome?.runtime?.lastError) {
            console.warn('[DataAggregator] chrome.storage.set error:', chrome.runtime.lastError);
            resolve(false);
            return;
          }
          resolve(true);
        });
      } catch (err) {
        console.warn('[DataAggregator] safeChromeSet exception:', err);
        resolve(false);
      }
    });
  }
  async function getInstallTimestamp() {
    const now = Date.now();
    let currentVersion = 'unknown';

    try {
      currentVersion = chrome?.runtime?.getManifest?.().version || 'unknown';
    } catch {
      currentVersion = 'unknown';
    }

    try {
      const stored = await safeChromeGet(chrome.storage.local, [KEY_INSTALL_TS, KEY_INSTALL_VERSION]);
      const storedTs = Number(stored?.[KEY_INSTALL_TS] || 0);
      const storedVer = stored?.[KEY_INSTALL_VERSION];

      // First run: no timestamp
      if (!storedTs) {
        await safeChromeSet(chrome.storage.local, {
          [KEY_INSTALL_TS]: now,
          [KEY_INSTALL_VERSION]: currentVersion
        });
        return now;
      }

      // Migration/update: if version missing or changed, reset boundary to now
      if (!storedVer || (currentVersion !== 'unknown' && storedVer !== currentVersion)) {
        await safeChromeSet(chrome.storage.local, {
          [KEY_INSTALL_PREV_TS]: storedTs,
          [KEY_INSTALL_PREV_VER]: storedVer || null,
          [KEY_INSTALL_TS]: now,
          [KEY_INSTALL_VERSION]: currentVersion
        });
        return now;
      }

      return storedTs;
    } catch (err) {
      console.warn('[DataAggregator] Unable to read install timestamp:', err);
      return 0;
    }
  }

  // -------------------------
  // Leitura de mensagens (stats recomendado)
  // -------------------------

  async function readMessageSource() {
    // Retorna { type: 'stats', stats } | { type: 'events', events } | { type: 'none' }
    const cacheKey = 'msgSource';
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const res = await safeChromeGet(chrome.storage.local, [KEY_MSG_STATS, KEY_MSG_HISTORY_LEGACY, KEY_MSG_EVENTS_LEGACY]);

    const stats = res?.[KEY_MSG_STATS];
    if (stats && typeof stats === 'object' && (stats.daily || stats.hourly)) {
      return setCache(cacheKey, { type: 'stats', stats: normalizeObject(stats) });
    }

    const legacyHistory = normalizeArray(res?.[KEY_MSG_HISTORY_LEGACY]);
    const legacyEvents = normalizeArray(res?.[KEY_MSG_EVENTS_LEGACY]);
    const merged = [...legacyHistory, ...legacyEvents].filter(ev => ev && typeof ev.timestamp === 'number');

    if (merged.length) {
      return setCache(cacheKey, { type: 'events', events: merged });
    }

    return setCache(cacheKey, { type: 'none' });
  }

  // -------------------------
  // MÉTRICAS: Mensagens
  // -------------------------

  async function getMessageOverview({ period = '7d' } = {}) {
    const cacheKey = `message_overview_${period}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const installTs = await getInstallTimestamp();
    const { start, end } = parsePeriod(period, installTs);

    const source = await readMessageSource(installTs);
    const events = normalizeArray(source?.events).filter((e) => e && typeof e.timestamp === 'number');

    const filtered = events.filter((e) => e.timestamp >= start && e.timestamp <= end);

    // Agregação diária (sent/received)
    const byDay = new Map();
    let totalSent = 0;
    let totalReceived = 0;

    // Distribuição por tipo de chat (Grupos x Individuais x Outros)
    const channelCounts = new Map([
      ['Individuais', 0],
      ['Grupos', 0],
      ['Outros', 0]
    ]);

    // Métrica de resposta (aproximação): bloco iniciado por msg recebida -> próxima msg enviada
    const perChat = new Map();

    const classifyChannel = (chatId) => {
      const id = String(chatId || '');
      if (!id) return 'Outros';
      if (id.endsWith('@g.us')) return 'Grupos';
      if (id.endsWith('@c.us')) return 'Individuais';
      return 'Outros';
    };

    for (const ev of filtered) {
      const dayKey = toLocalDateKey(ev.timestamp);
      if (!byDay.has(dayKey)) byDay.set(dayKey, { sent: 0, received: 0 });
      const bucket = byDay.get(dayKey);

      if (ev.fromMe) {
        bucket.sent += 1;
        totalSent += 1;
      } else {
        bucket.received += 1;
        totalReceived += 1;
      }

      const ch = classifyChannel(ev.chatId);
      channelCounts.set(ch, (channelCounts.get(ch) || 0) + 1);

      const chatKey = ev.chatId ? String(ev.chatId) : '';
      if (chatKey) {
        if (!perChat.has(chatKey)) perChat.set(chatKey, []);
        perChat.get(chatKey).push({ timestamp: ev.timestamp, fromMe: !!ev.fromMe });
      }
    }

    const buckets = [];
    for (const d of iterateDays(start, end)) {
      const key = toLocalDateKey(d.getTime());
      const counts = byDay.get(key) || { sent: 0, received: 0 };
      buckets.push({
        label: formatDayLabel(d),
        sent: counts.sent,
        received: counts.received,
        total: counts.sent + counts.received
      });
    }

    // Resumo por tipo de chat
    const channels = Array.from(channelCounts.entries())
      .filter(([, total]) => total > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([channel, total]) => ({ channel, total }));

    // Calcula taxa de resposta e tempo médio de resposta
    let answeredCount = 0;
    let pendingCount = 0;
    const responseTimes = [];

    for (const evs of perChat.values()) {
      evs.sort((a, b) => a.timestamp - b.timestamp);
      let pendingTs = null;

      for (const ev of evs) {
        if (!ev.fromMe) {
          if (pendingTs === null) pendingTs = ev.timestamp;
        } else if (pendingTs !== null) {
          answeredCount += 1;
          responseTimes.push(Math.max(0, ev.timestamp - pendingTs));
          pendingTs = null;
        }
      }

      if (pendingTs !== null) pendingCount += 1;
    }

    const totalInboundBlocks = answeredCount + pendingCount;
    const rate = totalInboundBlocks ? Math.round((answeredCount / totalInboundBlocks) * 1000) / 10 : 0;
    const avgResponseMs = responseTimes.length
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

    const result = {
      period,
      buckets,
      datasets: [
        {
          label: 'Enviadas',
          data: buckets.map((b) => b.sent),
          color: (window.ChartEngine && (ChartEngine.COLORS?.success || ChartEngine.colors?.success)) || '#10b981'
        },
        {
          label: 'Recebidas',
          data: buckets.map((b) => b.received),
          color: (window.ChartEngine && (ChartEngine.COLORS?.info || ChartEngine.colors?.info)) || '#3b82f6'
        }
      ],
      summary: {
        totalSent,
        totalReceived,
        total: totalSent + totalReceived
      },
      answered: {
        total: totalInboundBlocks,
        answered: answeredCount,
        pending: pendingCount,
        rate,
        avgResponseMs
      },
      channels,
      hasData: totalSent + totalReceived > 0,
      isFilteredByInstall: !!installTs,
      installTimestamp: installTs
    };

    return setCache(cacheKey, result);
  }

  async function getHourlyEngagement({ period = '7d' } = {}) {
    const cacheKey = `hourly_${period}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const { start, end } = parsePeriod(period);
    const installAt = await getInstallTimestamp();
    const rangeStart = Math.max(start, installAt);

    const source = await readMessageSource();

    // buckets[hour] = {sent,received}
    const buckets = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: formatHourLabel(h),
      sent: 0,
      received: 0,
    }));

    if (source.type === 'stats') {
      const stats = normalizeObject(source.stats);
      const hourly = normalizeObject(stats.hourly);

      const days = iterateDays(rangeStart, end);
      for (const day of days) {
        const dateKey = toLocalDateKey(day.getTime());
        const entry = normalizeObject(hourly[dateKey]);

        // suportamos dois formatos:
        // 1) entry.sent/entry.received arrays
        // 2) entry (array de 24) representando total (legacy) -> nesse caso não separa sent/received
        const sentArr = Array.isArray(entry.sent) ? entry.sent : null;
        const receivedArr = Array.isArray(entry.received) ? entry.received : null;

        if (sentArr && receivedArr && sentArr.length >= 24 && receivedArr.length >= 24) {
          for (let h = 0; h < 24; h++) {
            buckets[h].sent += safeNumber(sentArr[h], 0);
            buckets[h].received += safeNumber(receivedArr[h], 0);
          }
        } else if (Array.isArray(entry) && entry.length >= 24) {
          for (let h = 0; h < 24; h++) {
            buckets[h].received += safeNumber(entry[h], 0);
          }
        }
      }
    } else if (source.type === 'events') {
      const events = normalizeArray(source.events).filter(ev => {
        const ts = safeNumber(ev.timestamp, 0);
        return ts >= rangeStart && ts <= end;
      });

      for (const ev of events) {
        const ts = safeNumber(ev.timestamp, 0);
        const hour = new Date(ts).getHours();
        if (hour < 0 || hour > 23) continue;
        if (ev.fromMe) buckets[hour].sent += 1;
        else buckets[hour].received += 1;
      }
    }

    const hasData = buckets.some(b => b.sent + b.received > 0);
    const result = { hasData, buckets };
    return setCache(cacheKey, result);
  }

  // -------------------------
  // MÉTRICAS: CRM Funnel
  // -------------------------

  function defaultCrmStages() {
    return [
      { id: 'new', label: 'Novo', color: '#8b5cf6' },
      { id: 'lead', label: 'Lead', color: '#3b82f6' },
      { id: 'contact', label: 'Contato', color: '#a78bfa' },
      { id: 'negotiation', label: 'Negociação', color: '#1d4ed8' },
      { id: 'proposal', label: 'Proposta', color: '#60a5fa' },
      { id: 'won', label: 'Ganho', color: '#93c5fd' },
      { id: 'lost', label: 'Perdido', color: '#475569' },
    ];
  }

  async function readCrmData() {
    const [localRes, syncRes] = await Promise.all([
      safeChromeGet(chrome.storage.local, [KEY_CRM_CONTACTS_LOCAL, KEY_CRM_STAGES_LOCAL]),
      safeChromeGet(chrome.storage.sync, [KEY_CRM_CONTACTS_SYNC_LEGACY, KEY_CRM_STAGES_SYNC_LEGACY]),
    ]);

    const contacts =
      normalizeArray(localRes?.[KEY_CRM_CONTACTS_LOCAL]).length
        ? normalizeArray(localRes?.[KEY_CRM_CONTACTS_LOCAL])
        : normalizeArray(syncRes?.[KEY_CRM_CONTACTS_SYNC_LEGACY]);

    const stages =
      normalizeArray(localRes?.[KEY_CRM_STAGES_LOCAL]).length
        ? normalizeArray(localRes?.[KEY_CRM_STAGES_LOCAL])
        : normalizeArray(syncRes?.[KEY_CRM_STAGES_SYNC_LEGACY]);

    return {
      contacts,
      stages,
    };
  }

  async function getCrmFunnel({ period = '30d' } = {}) {
    const cacheKey = `crmFunnel_${period}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const { contacts, stages } = await readCrmData();

    const stageList = stages.length
      ? stages.map(s => ({
          id: s.id || s.stage || s.key,
          label: s.name || s.label || s.title || String(s.id || 'Stage'),
          color: s.color,
        }))
      : defaultCrmStages();

    const countsByStage = new Map(stageList.map(s => [s.id, 0]));

    for (const c of contacts) {
      const stageId = c?.stage || c?.stageId || c?.pipelineStage;
      if (!stageId) continue;
      if (!countsByStage.has(stageId)) countsByStage.set(stageId, 0);
      countsByStage.set(stageId, countsByStage.get(stageId) + 1);
    }

    const stagesOut = stageList.map(s => ({
      ...s,
      total: safeNumber(countsByStage.get(s.id), 0),
    }));

    const total = stagesOut.reduce((acc, s) => acc + (s.total || 0), 0);

    const result = {
      hasData: total > 0,
      total,
      stages: stagesOut,
    };

    return setCache(cacheKey, result);
  }

  // -------------------------
  // MÉTRICAS: Campanhas
  // -------------------------

  function normalizeCampaign(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const stats = normalizeObject(raw.stats);

    const createdAt = safeNumber(raw.createdAt || raw.startedAt || raw.timestamp || stats.createdAt, 0);

    const sent = safeNumber(raw.sent ?? stats.sent ?? raw.totalSent, 0);
    const delivered = safeNumber(raw.delivered ?? stats.delivered ?? raw.totalDelivered, 0);
    const read = safeNumber(raw.read ?? stats.read ?? raw.totalRead, 0);
    const replied = safeNumber(raw.replied ?? stats.replied ?? raw.totalReplied, 0);
    const converted = safeNumber(raw.converted ?? stats.converted ?? raw.totalConverted, 0);

    // Alguns schemas usam "failed" e não têm read/replied.
    // Mantemos zeros nesses casos.

    return {
      id: raw.id || raw.campaignId || String(createdAt || Math.random()),
      name: raw.name || raw.title || raw.label || 'Campanha',
      label: raw.label || (createdAt ? new Date(createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''),
      createdAt,
      status: raw.status || raw.state || 'unknown',
      sent,
      delivered,
      read,
      replied,
      converted,
    };
  }

  async function getCampaignPerformance({ period = '30d' } = {}) {
    const cacheKey = `campaignPerf_${period}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const { start, end } = parsePeriod(period);
    const installAt = await getInstallTimestamp();
    const rangeStart = Math.max(start, installAt);

    const res = await safeChromeGet(chrome.storage.local, [KEY_BULK_CAMPAIGNS_LOCAL, KEY_CAMPAIGNS_LEGACY, KEY_CAMPAIGN_HISTORY_LEGACY]);

    const campaignsRaw =
      normalizeArray(res?.[KEY_BULK_CAMPAIGNS_LOCAL]).length
        ? normalizeArray(res?.[KEY_BULK_CAMPAIGNS_LOCAL])
        : normalizeArray(res?.[KEY_CAMPAIGNS_LEGACY]).length
          ? normalizeArray(res?.[KEY_CAMPAIGNS_LEGACY])
          : normalizeArray(res?.[KEY_CAMPAIGN_HISTORY_LEGACY]);

    const campaigns = campaignsRaw
      .map(normalizeCampaign)
      .filter(Boolean)
      .filter(c => {
        // Se não tiver createdAt, não filtramos por período (entra como 0)
        if (!c.createdAt) return true;
        return c.createdAt >= rangeStart && c.createdAt <= end;
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const hasData = campaigns.some(c => (c.sent || 0) > 0 || (c.delivered || 0) > 0 || (c.read || 0) > 0 || (c.replied || 0) > 0 || (c.converted || 0) > 0);

    return setCache(cacheKey, {
      hasData,
      campaigns,
    });
  }

  // -------------------------
  // MÉTRICAS: Time
  // -------------------------

  function normalizeMember(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      id: raw.id || raw.memberId || raw.email || raw.name,
      name: raw.name || raw.fullName || raw.email || 'Membro',
    };
  }

  async function getTeamPerformance({ period = '30d' } = {}) {
    const cacheKey = `teamPerf_${period}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    // Team members normalmente ficam no local
    const localRes = await safeChromeGet(chrome.storage.local, [KEY_TEAM_MEMBERS_LOCAL, KEY_TEAM_MEMBERS_LEGACY, KEY_CRM_CONTACTS_LOCAL]);
    const syncRes = await safeChromeGet(chrome.storage.sync, [KEY_TEAM_MEMBERS_LEGACY, KEY_CRM_CONTACTS_SYNC_LEGACY]);

    const membersRaw =
      normalizeArray(localRes?.[KEY_TEAM_MEMBERS_LOCAL]).length
        ? normalizeArray(localRes?.[KEY_TEAM_MEMBERS_LOCAL])
        : normalizeArray(localRes?.[KEY_TEAM_MEMBERS_LEGACY]).length
          ? normalizeArray(localRes?.[KEY_TEAM_MEMBERS_LEGACY])
          : normalizeArray(syncRes?.[KEY_TEAM_MEMBERS_LEGACY]);

    const members = membersRaw.map(normalizeMember).filter(Boolean);

    // Para métricas, usamos CRM contacts (assignedTo) como proxy de "conversas".
    const contacts =
      normalizeArray(localRes?.[KEY_CRM_CONTACTS_LOCAL]).length
        ? normalizeArray(localRes?.[KEY_CRM_CONTACTS_LOCAL])
        : normalizeArray(syncRes?.[KEY_CRM_CONTACTS_SYNC_LEGACY]);

    const assigned = new Map();
    for (const c of contacts) {
      const assignee = c?.assignedTo;
      if (!assignee) continue;
      if (!assigned.has(assignee)) assigned.set(assignee, { total: 0, resolved: 0 });
      const bucket = assigned.get(assignee);
      bucket.total += 1;
      const stage = c?.stage;
      if (stage === 'won' || stage === 'lost') bucket.resolved += 1;
    }

    const membersOut = members.map(m => {
      const a = assigned.get(m.id) || { total: 0, resolved: 0 };
      return {
        id: m.id,
        name: m.name,
        totalMessages: a.total,
        answered: a.resolved,
        avgResponseMinutes: 0,
      };
    });

    const hasData = membersOut.some(m => (m.totalMessages || 0) > 0 || (m.answered || 0) > 0);

    return setCache(cacheKey, {
      hasData,
      members: membersOut,
    });
  }

  // -------------------------
  // MÉTRICAS: Flows
  // -------------------------

  async function getFlowPerformance({ period = '30d' } = {}) {
    const cacheKey = `flow_perf_${period}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const installTs = await getInstallTimestamp();
    const { start, end } = parsePeriod(period, installTs);

    const localRes = await safeChromeGet(chrome.storage.local, [KEY_FLOWS_LOCAL, KEY_FLOW_HISTORY_LOCAL]);
    const syncRes = await safeChromeGet(chrome.storage.sync, [KEY_FLOWS_SYNC_LEGACY, KEY_FLOW_HISTORY_SYNC_LEGACY]);

    const flowsRaw = normalizeArray(localRes?.[KEY_FLOWS_LOCAL] || syncRes?.[KEY_FLOWS_SYNC_LEGACY]);
    const activeFlows = flowsRaw.filter((f) => f && (f.active || f.enabled)).length;

    const flowsById = new Map();
    flowsRaw.forEach((f) => {
      const id = String(f?.id || f?.flowId || f?._id || '');
      if (id) flowsById.set(id, f);
    });

    const historyObj = normalizeObject(localRes?.[KEY_FLOW_HISTORY_LOCAL] || syncRes?.[KEY_FLOW_HISTORY_SYNC_LEGACY]);
    const legacyExec = normalizeArray(historyObj?.executions || historyObj?.history || historyObj?.items);

    const byFlow = new Map();
    const daily = new Map();

    // history key esperado: "chatId_flowId" (chatId não possui "_" em geral)
    const parseHistoryKey = (rawKey) => {
      const k = String(rawKey || '');
      const idx = k.indexOf('_');
      if (idx > -1) {
        return { chatId: k.slice(0, idx), flowId: k.slice(idx + 1) };
      }
      return { chatId: '', flowId: k };
    };

    const bumpDaily = (ts) => {
      const dayKey = toLocalDateKey(ts);
      daily.set(dayKey, (daily.get(dayKey) || 0) + 1);
    };

    if (legacyExec.length) {
      // Formato mais rico: lista de execuções individuais
      for (const exec of legacyExec) {
        const rawId = exec?.flowId || exec?.id || exec?._id;
        if (!rawId) continue;

        const flowId = String(rawId);
        const ts = Number(exec.timestamp || exec.time || exec.ts || exec.executedAt || 0);
        if (!ts || ts < start || ts > end) continue;

        const flow = flowsById.get(flowId);
        const name = flow?.name || exec.flowName || `Fluxo ${flowId.slice(0, 6)}`;

        if (!byFlow.has(flowId)) {
          byFlow.set(flowId, { id: flowId, name, runs: 0, completed: 0, failed: 0, lastExecution: 0 });
        }

        const rec = byFlow.get(flowId);
        rec.runs += 1;
        // Sem detalhamento consistente, assumimos concluído quando há evento
        rec.completed += 1;
        rec.failed += exec.status === 'failed' ? 1 : 0;
        rec.lastExecution = Math.max(rec.lastExecution, ts);

        bumpDaily(ts);
      }
    } else {
      // Formato compacto: objeto indexado por chave composta
      for (const [rawKey, h] of Object.entries(historyObj || {})) {
        if (!h || typeof h !== 'object') continue;

        const { flowId } = parseHistoryKey(rawKey);
        const fid = String(flowId || rawKey);

        const lastExec = Number(h.lastExecution || h.lastRunAt || h.last || h.timestamp || 0);
        if (!lastExec || lastExec < start || lastExec > end) continue;

        const runs = Number(h.executionCount || h.count || h.runs || 0);
        if (!runs) continue;

        const flow = flowsById.get(fid);
        const name = flow?.name || `Fluxo ${fid.slice(0, 6)}`;

        if (!byFlow.has(fid)) {
          byFlow.set(fid, { id: fid, name, runs: 0, completed: 0, failed: 0, lastExecution: 0 });
        }

        const rec = byFlow.get(fid);
        rec.runs += runs;
        // Sem tracking de status, considerar execuções como concluídas
        rec.completed += runs;
        rec.failed += Number(h.failed || 0);
        rec.lastExecution = Math.max(rec.lastExecution, lastExec);

        // Como só temos o último timestamp, incrementamos 1 ocorrência no dia do último evento
        bumpDaily(lastExec);
      }
    }

    // Série temporal: últimos 7 dias
    const seriesDays = 7;
    const startSeries = new Date(end);
    startSeries.setHours(0, 0, 0, 0);
    startSeries.setDate(startSeries.getDate() - (seriesDays - 1));

    const labels = [];
    const values = [];

    for (let i = 0; i < seriesDays; i++) {
      const d = new Date(startSeries);
      d.setDate(startSeries.getDate() + i);
      const key = toLocalDateKey(d.getTime());
      labels.push(formatDayLabel(d));
      values.push(daily.get(key) || 0);
    }

    const flows = Array.from(byFlow.values())
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 10);

    const totalRuns = Array.from(byFlow.values()).reduce((sum, f) => sum + (f.runs || 0), 0);

    const result = {
      period,
      flows,
      dailyRuns: { labels, values },
      summary: {
        totalRuns,
        activeFlows,
        totalFlows: flowsRaw.length,
      },
      hasData: totalRuns > 0,
      isFilteredByInstall: !!installTs,
      installTimestamp: installTs,
    };

    return setCache(cacheKey, result);
  }

  // Distribuição de triggers configurados (não depende de execuções)
  async function getTriggersSummary({ period = '30d' } = {}) {
    const cacheKey = `triggers_${period}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const res = await safeChromeGet(chrome.storage.local, [KEY_FLOWS_LOCAL, KEY_FLOWS_LEGACY]);
    const flowsRaw =
      normalizeArray(res?.[KEY_FLOWS_LOCAL]).length
        ? normalizeArray(res?.[KEY_FLOWS_LOCAL])
        : normalizeArray(res?.[KEY_FLOWS_LEGACY]);

    const counts = new Map();

    for (const f of flowsRaw) {
      const triggers = normalizeArray(f?.triggers);
      for (const t of triggers) {
        const type = t?.type || t?.trigger || 'unknown';
        counts.set(type, (counts.get(type) || 0) + 1);
      }
    }

    const labels = Array.from(counts.keys());
    const values = labels.map(l => counts.get(l) || 0);
    const total = values.reduce((a, b) => a + b, 0);

    return setCache(cacheKey, {
      hasData: total > 0,
      labels,
      counts: values,
      total,
    });
  }

  return {
    getMessageOverview,
    getHourlyEngagement,
    getCrmFunnel,
    getCampaignPerformance,
    getTeamPerformance,
    getFlowPerformance,
    getTriggersSummary,
  };
})();

window.DataAggregator = DataAggregator;
