// subscription/credits-manager.js
// Gerenciador de créditos de IA (integrado com NotificationCenter + EventBus)
//
// ✅ Ajustado para o modelo de LICENÇA + CRÉDITOS do backend:
// - Fonte de verdade: chrome.storage.sync.licenseAiCredits
// - Atualização de créditos acontece após chamadas de IA (retorno do backend)
// - Reposição de créditos pode acontecer via /billing/redeem (voucher)
//
// Objetivos:
// - Não quebrar o painel (SubscriptionUI)
// - Não exigir API key no cliente
// - Fornecer métodos esperados: getCreditsStatus(), getUsageProjection(), CREDIT_COSTS

const CreditsManager = (function() {
  'use strict';

  // =========================================
  // CONFIGURAÇÃO
  // =========================================

  const STORAGE_KEYS = {
    SYNC_CREDITS: 'licenseAiCredits',
    LOCAL_USAGE: 'ai_usage_stats'
  };

  // Limiar de alertas
  const THRESHOLDS = {
    LOW_CREDITS: 10,
    ZERO_CREDITS: 0
  };

  // Custos por operação (modelo atual: 1 crédito por chamada no backend)
  // Mantemos a estrutura esperada pela SubscriptionUI.
  const CREDIT_COSTS = {
    smart_reply: 1,
    copilot_suggestion: 1,
    copilot_full_message: 1,
    sentiment_analysis: 1,
    summarize_chat: 1
  };

  const WARNING_COOLDOWN = 24 * 60 * 60 * 1000; // 24h

  // =========================================
  // ESTADO
  // =========================================

  let aiCredits = 0;
  let initialized = false;

  // Estatísticas simples de uso (aproximadas, baseadas em delta do remaining)
  let usageStats = {
    totalUsed: 0,
    daily: {},
    lastRemaining: null,
    lastUpdated: null
  };

  let lastLowCreditWarning = 0;
  let lastDepletedWarning = 0;

  // =========================================
  // HELPERS
  // =========================================

  function emit(evt, data) {
    try {
      if (window.EventBus?.emit) {
        window.EventBus.emit(evt, data);
      }
    } catch (_) {}
  }

  function notify(type, title, message, options = {}) {
    try {
      if (!window.NotificationCenter) return;
      if (type === 'success') return NotificationCenter.success(title, message, options);
      if (type === 'error') return NotificationCenter.error(title, message, options);
      if (type === 'warning') return NotificationCenter.warning(title, message, options);
      return NotificationCenter.info(title, message, options);
    } catch (_) {}
  }

  function todayKey() {
    // YYYY-MM-DD
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function clampInt(n, fallback = 0) {
    const v = typeof n === 'number' ? n : parseInt(String(n || ''), 10);
    return Number.isFinite(v) ? v : fallback;
  }

  async function loadUsage() {
    try {
      if (!chrome?.storage?.local) return;
      const result = await chrome.storage.local.get(STORAGE_KEYS.LOCAL_USAGE);
      if (result && result[STORAGE_KEYS.LOCAL_USAGE]) {
        usageStats = { ...usageStats, ...result[STORAGE_KEYS.LOCAL_USAGE] };
      }
    } catch (_) {}
  }

  async function saveUsage() {
    try {
      if (!chrome?.storage?.local) return;
      await chrome.storage.local.set({ [STORAGE_KEYS.LOCAL_USAGE]: usageStats });
    } catch (_) {}
  }

  async function loadCredits() {
    try {
      if (!chrome?.storage?.sync) return 0;
      const res = await chrome.storage.sync.get(STORAGE_KEYS.SYNC_CREDITS);
      return clampInt(res?.[STORAGE_KEYS.SYNC_CREDITS], 0);
    } catch (_) {
      return 0;
    }
  }

  async function saveCredits(newCredits) {
    try {
      if (!chrome?.storage?.sync) return;
      await chrome.storage.sync.set({ [STORAGE_KEYS.SYNC_CREDITS]: clampInt(newCredits, 0) });
    } catch (_) {}
  }

  function recordUsageDelta(prevRemaining, newRemaining) {
    try {
      if (prevRemaining === null || prevRemaining === undefined) {
        usageStats.lastRemaining = newRemaining;
        usageStats.lastUpdated = Date.now();
        return;
      }

      if (typeof prevRemaining === 'number' && typeof newRemaining === 'number') {
        if (newRemaining < prevRemaining) {
          const delta = prevRemaining - newRemaining;
          usageStats.totalUsed = clampInt(usageStats.totalUsed, 0) + delta;
          const k = todayKey();
          usageStats.daily[k] = clampInt(usageStats.daily[k], 0) + delta;
        }

        // Se aumentou, consideramos "topup" — não mexe no used.
        usageStats.lastRemaining = newRemaining;
        usageStats.lastUpdated = Date.now();
      }
    } catch (_) {}
  }

  function checkThresholds() {
    try {
      const now = Date.now();

      if (aiCredits <= THRESHOLDS.ZERO_CREDITS && (now - lastDepletedWarning) > WARNING_COOLDOWN) {
        lastDepletedWarning = now;
        notify('warning', 'Créditos de IA esgotados', 'Seus créditos acabaram. Resgate um voucher ou compre mais créditos para continuar usando IA.');
        emit('credits_depleted', { remaining: aiCredits });
        return;
      }

      if (aiCredits <= THRESHOLDS.LOW_CREDITS && (now - lastLowCreditWarning) > WARNING_COOLDOWN) {
        lastLowCreditWarning = now;
        notify('warning', 'Poucos créditos de IA', `Restam apenas ${aiCredits} créditos.`);
        emit('credits_low', { remaining: aiCredits });
      }
    } catch (_) {}
  }

  // =========================================
  // API PÚBLICA
  // =========================================

  async function init() {
    if (initialized) return;
    initialized = true;

    await loadUsage();
    aiCredits = await loadCredits();

    // Inicializar lastRemaining caso não exista
    if (usageStats.lastRemaining === null || usageStats.lastRemaining === undefined) {
      usageStats.lastRemaining = aiCredits;
      usageStats.lastUpdated = Date.now();
      await saveUsage();
    }

    // Listener para mudanças no storage (sincroniza UI)
    try {
      if (chrome?.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'sync' && changes[STORAGE_KEYS.SYNC_CREDITS]) {
            const prev = clampInt(changes[STORAGE_KEYS.SYNC_CREDITS].oldValue, aiCredits);
            const next = clampInt(changes[STORAGE_KEYS.SYNC_CREDITS].newValue, aiCredits);

            recordUsageDelta(prev, next);
            aiCredits = next;
            saveUsage();
            emit('credits_updated', getCreditsStatus());
            checkThresholds();
          }
        });
      }
    } catch (_) {}

    checkThresholds();
    console.log('[CreditsManager] Inicializado (licença + backend)');
  }

  function getCredits() {
    return aiCredits;
  }

  async function setCredits(newCredits) {
    const next = clampInt(newCredits, 0);
    const prev = aiCredits;
    aiCredits = next;

    recordUsageDelta(prev, next);
    await saveUsage();
    await saveCredits(next);

    emit('credits_updated', getCreditsStatus());
    checkThresholds();
  }

  async function addCredits(amount) {
    const inc = clampInt(amount, 0);
    if (inc <= 0) return;
    await setCredits(aiCredits + inc);
  }

  function canUseCredits(cost = 1) {
    return aiCredits >= clampInt(cost, 1);
  }

  // ⚠️ Observação: o consumo real acontece no backend.
  // Esta função serve apenas para UI otimista, caso algum módulo queira.
  async function consumeCredits(cost = 1, _operation = 'ai_call') {
    const c = clampInt(cost, 1);
    if (aiCredits < c) return false;
    await setCredits(aiCredits - c);
    return true;
  }

  function getCreditsStatus() {
    const remaining = clampInt(aiCredits, 0);
    const used = clampInt(usageStats.totalUsed, 0);
    const total = remaining + used;

    const percentageUsed = total > 0 ? Math.round((used / total) * 100) : 0;

    let status = 'ok';
    let statusText = 'Créditos OK';
    let color = 'var(--success)';

    if (remaining <= 0) {
      status = 'critical';
      statusText = 'Sem créditos de IA';
      color = 'var(--danger)';
    } else if (remaining <= THRESHOLDS.LOW_CREDITS) {
      status = 'warning';
      statusText = 'Poucos créditos restantes';
      color = 'var(--warning)';
    }

    return {
      remaining,
      used,
      total,
      percentage: percentageUsed,
      status,
      statusText,
      color
    };
  }

  async function getUsageProjection(daysWindow = 7) {
    try {
      const daily = usageStats.daily || {};
      const keys = Object.keys(daily).sort().slice(-daysWindow);
      const sum = keys.reduce((acc, k) => acc + clampInt(daily[k], 0), 0);
      const avg = keys.length ? (sum / keys.length) : 0;
      const avgDailyUsage = Math.round(avg * 100) / 100;

      const daysRemaining = avgDailyUsage > 0 ? Math.floor(aiCredits / avgDailyUsage) : -1;

      return { daysRemaining, avgDailyUsage };
    } catch (_) {
      return { daysRemaining: -1, avgDailyUsage: 0 };
    }
  }

  return {
    init,
    getCredits,
    setCredits,
    addCredits,
    consumeCredits,
    canUseCredits,
    getCreditsStatus,
    getUsageProjection,
    CREDIT_COSTS,
    THRESHOLDS
  };
})();

window.CreditsManager = CreditsManager;
