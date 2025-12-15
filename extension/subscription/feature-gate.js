// subscription/feature-gate.js
// Sistema de bloqueio de recursos (feature gate) otimizado com cache e checkMultiple eficiente

(function() {
  'use strict';

  // ============================================
  // CACHE DE VERIFICAÇÕES
  // ============================================

  const checkCache = new Map();
  const CACHE_TTL = 5000; // 5s

  // ============================================
  // CONFIGURAÇÃO DE RECURSOS
  // ============================================

  const FEATURE_MAP = {
    // Módulos
    'module:dashboard': { minPlan: 'free' },
    'module:chats': { minPlan: 'free' },
    'module:contacts': { minPlan: 'free' },
    'module:bulk': { minPlan: 'starter', feature: 'bulkMessages' },
    'module:flows': { minPlan: 'starter' },
    'module:analytics': { minPlan: 'starter', feature: 'analytics' },
    'module:team': { minPlan: 'pro' },
    'module:extractor': { minPlan: 'starter' },
    'module:smart-replies': { minPlan: 'starter', feature: 'smartReplies', requiresCredits: true },
    'module:copilot': { minPlan: 'pro', feature: 'copilot', requiresCredits: true },
    'module:api': { minPlan: 'pro', feature: 'apiAccess' },

    // Ações
    'action:send_bulk': { minPlan: 'starter', feature: 'bulkMessages' },
    'action:create_flow': { minPlan: 'starter', limit: 'maxFlows' },
    'action:create_campaign': { minPlan: 'starter', limit: 'maxCampaigns' },
    'action:export_csv': { minPlan: 'free' },
    'action:export_xlsx': { minPlan: 'starter' },
    'action:export_json': { minPlan: 'pro' },
    'action:export_pdf': { minPlan: 'enterprise' },
    'action:add_team_member': { minPlan: 'starter', limit: 'maxTeamMembers' },
    'action:use_ai': { minPlan: 'starter', requiresCredits: true },
    'action:custom_labels': { minPlan: 'starter', feature: 'customLabels' },

    // Funcionalidades específicas
    'feature:smart_replies': { minPlan: 'starter', feature: 'smartReplies', requiresCredits: true },
    'feature:copilot': { minPlan: 'pro', feature: 'copilot', requiresCredits: true },
    'feature:advanced_analytics': { minPlan: 'pro', feature: 'analytics', value: 'advanced' },
    'feature:full_analytics': { minPlan: 'enterprise', feature: 'analytics', value: 'full' },
    'feature:white_label': { minPlan: 'enterprise', feature: 'whiteLabel' },
    'feature:priority_support': { minPlan: 'pro', feature: 'prioritySupport' }
  };

  const PLAN_HIERARCHY = ['free', 'starter', 'pro', 'enterprise'];

  // ============================================
  // VERIFICAÇÕES
  // ============================================

  function createResult(allowed, reason = null, message = null, upgradeRequired = null, canBuyCredits = false) {
    return { allowed, reason, message, upgradeRequired, canBuyCredits };
  }

  function getCached(key) {
    const cached = checkCache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expires) {
      checkCache.delete(key);
      return null;
    }
    return cached.result;
  }

  function setCache(key, result) {
    checkCache.set(key, { result, expires: Date.now() + CACHE_TTL });
  }

  function invalidateCache(key = null) {
    if (key) checkCache.delete(key);
    else checkCache.clear();
  }

  function check(featureKey, useCache = true) {
    if (useCache) {
      const cached = getCached(featureKey);
      if (cached !== null) return cached;
    }

    const result = performCheck(featureKey);
    setCache(featureKey, result);
    return result;
  }

  function performCheck(featureKey) {
    const config = FEATURE_MAP[featureKey];

    // Features desconhecidas não bloqueiam
    if (!config) return { allowed: true };

    // Se não existir SubscriptionManager, não bloquear
    if (!window.SubscriptionManager) return { allowed: true };

    // 1) assinatura ativa
    if (!SubscriptionManager.isActive()) {
      return createResult(false, 'subscription_inactive', 'Sua assinatura não está ativa');
    }

    const currentPlan = SubscriptionManager.getPlanId();
    const currentIndex = PLAN_HIERARCHY.indexOf(currentPlan);

    // 2) plano mínimo
    if (config.minPlan) {
      const requiredIndex = PLAN_HIERARCHY.indexOf(config.minPlan);
      if (requiredIndex !== -1 && currentIndex < requiredIndex) {
        const planName = SubscriptionManager.PLANS?.[config.minPlan]?.name || config.minPlan;
        return createResult(false, 'plan_required', `Disponível a partir do plano ${planName}`, config.minPlan);
      }
    }

    // 3) feature flag
    if (config.feature) {
      const featureValue = SubscriptionManager.getFeature(config.feature);
      const ok = !!featureValue && (!config.value || featureValue === config.value || featureValue === 'full');
      if (!ok) {
        return createResult(false, 'feature_locked', 'Recurso não disponível no seu plano', config.minPlan);
      }
    }

    // 4) limites
    if (config.limit) {
      const limitCheck = checkLimit(config.limit);
      if (!limitCheck.allowed) {
        return createResult(false, 'limit_reached', limitCheck.message, getNextPlan(config.limit));
      }
    }

    // 5) créditos
    if (config.requiresCredits && !SubscriptionManager.canUseAI()) {
      return createResult(false, 'no_credits', 'Créditos de IA esgotados', null, true);
    }

    return { allowed: true };
  }

  function checkLimit(limitName) {
    const usage = SubscriptionManager.getUsage ? SubscriptionManager.getUsage() : {};
    const limit = SubscriptionManager.getFeature ? SubscriptionManager.getFeature(limitName) : null;

    if (limit === -1) return { allowed: true };

    const usageMap = {
      maxFlows: 'flowsActive',
      maxCampaigns: 'campaignsActive',
      maxTeamMembers: 'teamMembers',
      maxContacts: 'contactsTotal'
    };

    const currentUsage = usage?.[usageMap[limitName]] || 0;
    return {
      allowed: currentUsage < (limit ?? 0),
      message: `Limite de ${(limit ?? 0)} atingido`
    };
  }

  function getNextPlan(limitName) {
    const currentLimit = SubscriptionManager.getFeature(limitName);
    const currentIndex = PLAN_HIERARCHY.indexOf(SubscriptionManager.getPlanId());

    for (let i = currentIndex + 1; i < PLAN_HIERARCHY.length; i++) {
      const planId = PLAN_HIERARCHY[i];
      const plan = SubscriptionManager.PLANS?.[planId];
      const nextLimit = plan?.features?.[limitName];
      if (nextLimit === -1) return planId;
      if (typeof nextLimit === 'number' && typeof currentLimit === 'number' && nextLimit > currentLimit) {
        return planId;
      }
    }
    return null;
  }

  // ============================================
  // CHECK MÚLTIPLO OTIMIZADO
  // ============================================

  function checkMultiple(featureKeys, options = {}) {
    const results = {};
    const toCheck = [];

    for (const key of featureKeys) {
      const cached = options.skipCache ? null : getCached(key);
      if (cached !== null) results[key] = cached;
      else toCheck.push(key);
    }

    if (!window.SubscriptionManager) {
      // Sem subscription manager, tudo permitido
      for (const key of toCheck) results[key] = { allowed: true };
      return results;
    }

    const ctx = {
      isActive: SubscriptionManager.isActive(),
      planId: SubscriptionManager.getPlanId(),
      planIndex: PLAN_HIERARCHY.indexOf(SubscriptionManager.getPlanId()),
      canUseAI: SubscriptionManager.canUseAI(),
      usage: SubscriptionManager.getUsage ? SubscriptionManager.getUsage() : {}
    };

    for (const key of toCheck) {
      const res = performCheckWithContext(key, ctx);
      results[key] = res;
      setCache(key, res);
    }

    return results;
  }

  function performCheckWithContext(featureKey, ctx) {
    const config = FEATURE_MAP[featureKey];
    if (!config) return { allowed: true };

    // Master key: libera tudo e ignora restrições
    try {
      if (window.SubscriptionManager?.isMasterKey?.()) {
        return { allowed: true, reason: 'master_key' };
      }
    } catch (_) {}

    if (!ctx.isActive) {
      return createResult(false, 'subscription_inactive', 'Sua assinatura não está ativa');
    }

    if (config.minPlan) {
      const requiredIndex = PLAN_HIERARCHY.indexOf(config.minPlan);
      if (requiredIndex !== -1 && ctx.planIndex < requiredIndex) {
        const planName = SubscriptionManager.PLANS?.[config.minPlan]?.name || config.minPlan;
        return createResult(false, 'plan_required', `Requer plano ${planName}`, config.minPlan);
      }
    }

    if (config.feature) {
      const featureValue = SubscriptionManager.getFeature(config.feature);
      const ok = !!featureValue && (!config.value || featureValue === config.value || featureValue === 'full');
      if (!ok) {
        return createResult(false, 'feature_locked', 'Recurso não disponível no seu plano', config.minPlan);
      }
    }

    if (config.limit) {
      const limit = SubscriptionManager.getFeature(config.limit);
      if (limit !== -1) {
        const usageMap = {
          maxFlows: 'flowsActive',
          maxCampaigns: 'campaignsActive',
          maxTeamMembers: 'teamMembers',
          maxContacts: 'contactsTotal'
        };
        const currentUsage = ctx.usage?.[usageMap[config.limit]] || 0;
        if (currentUsage >= (limit ?? 0)) {
          return createResult(false, 'limit_reached', `Limite de ${(limit ?? 0)} atingido`, getNextPlan(config.limit));
        }
      }
    }

    if (config.requiresCredits && !ctx.canUseAI) {
      return createResult(false, 'no_credits', 'Créditos de IA esgotados', null, true);
    }

    return { allowed: true };
  }

  // ============================================
  // UI HELPERS
  // ============================================

  function handleBlocked(featureKey, result) {
    const msg = result?.message || 'Recurso bloqueado';

    if (window.NotificationCenter) {
      if (result?.canBuyCredits) {
        NotificationCenter.warning('Créditos necessários', msg, {
          action: {
            label: 'Comprar Créditos',
            callback: () => window.SubscriptionUI?.showBuyCreditsModal?.()
          }
        });
      } else {
        NotificationCenter.info('Recurso bloqueado', msg, {
          action: {
            label: 'Ver Planos',
            callback: () => window.SubscriptionUI?.showUpgradeModal?.(result.reason, result.upgradeRequired)
          }
        });
      }
    } else if (window.SubscriptionUI) {
      if (result?.canBuyCredits) window.SubscriptionUI.showBuyCreditsModal?.();
      else window.SubscriptionUI.showUpgradeModal?.(result.reason, result.upgradeRequired);
    } else if (window.OverlayManager?.showToast) {
      window.OverlayManager.showToast(msg, 'warning');
    }

    window.EventBus?.emit?.('feature:blocked', { featureKey, result });
  }

  function applyResultToElement(element, featureKey, result) {
    if (!element) return;

    if (!result.allowed) {
      element.classList.add('feature-blocked');
      element.setAttribute('data-blocked-reason', result.reason || 'blocked');
      if (result.message) element.setAttribute('title', result.message);

      if (!element.querySelector('.upgrade-badge')) {
        const badge = document.createElement('span');
        badge.className = 'upgrade-badge';
        badge.textContent = result.canBuyCredits ? '💳' : '⭐';
        element.appendChild(badge);
      }

      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleBlocked(featureKey, result);
      };

      element._featureGateHandler = handler;
      element.addEventListener('click', handler, { capture: true });

    } else {
      element.classList.remove('feature-blocked');
      element.removeAttribute('data-blocked-reason');

      if (element._featureGateHandler) {
        element.removeEventListener('click', element._featureGateHandler, { capture: true });
        delete element._featureGateHandler;
      }

      const badge = element.querySelector('.upgrade-badge');
      if (badge) badge.remove();
    }
  }

  function applyToElements(elements, featureKeyFn) {
    const keys = [];
    const map = [];

    elements.forEach((el, index) => {
      const key = typeof featureKeyFn === 'function'
        ? featureKeyFn(el)
        : el?.dataset?.featureGate;

      if (key) {
        keys.push(key);
        map.push({ index, el, key });
      }
    });

    const res = checkMultiple(keys);

    map.forEach(({ el, key }) => {
      applyResultToElement(el, key, res[key] || { allowed: true });
    });

    return res;
  }

  function applyToPage() {
    const elements = Array.from(document.querySelectorAll('[data-feature-gate]'));
    return applyToElements(elements);
  }

  // ============================================
  // DECORATORS
  // ============================================

  function requireFeature(featureKey, fn) {
    return function(...args) {
      const result = check(featureKey);
      if (!result.allowed) {
        handleBlocked(featureKey, result);
        return null;
      }
      return fn.apply(this, args);
    };
  }

  function requireFeatureAsync(featureKey, fn) {
    return async function(...args) {
      const result = check(featureKey);
      if (!result.allowed) {
        handleBlocked(featureKey, result);
        throw new Error(result.message || 'Recurso bloqueado');
      }
      return await fn.apply(this, args);
    };
  }

  // Invalidar cache quando assinatura muda
  window.EventBus?.on?.(window.EventBus?.EVENTS?.SUBSCRIPTION_UPDATED || 'subscription:updated', () => invalidateCache());

  // ============================================
  // EXPORT
  // ============================================

  const FeatureGate = {
    FEATURE_MAP,
    PLAN_HIERARCHY,
    check,
    checkMultiple,
    invalidateCache,
    applyToElement: (el, key) => applyResultToElement(el, key, check(key)),
    applyToElements,
    applyToPage,
    handleBlocked,
    requireFeature,
    requireFeatureAsync,

    // Compat com versão antiga
    getBlockedClasses: () => Object.keys(FEATURE_MAP).filter(k => !check(k).allowed),
    getAvailableClasses: () => Object.keys(FEATURE_MAP).filter(k => check(k).allowed)
  };

  window.FeatureGate = FeatureGate;
})();
