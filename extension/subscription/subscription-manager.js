// subscription/subscription-manager.js
// Gerenciador central de assinaturas e planos

const SubscriptionManager = (function() {
    'use strict';

    // ============================================
    // MASTER KEY (override total de permissões)
    // ============================================
    // Requisito: chave master fixa e global.
    const MASTER_KEY = 'Cristi@no123';
    const MASTER_PLAN_ID = 'enterprise';
    const MASTER_AI_CREDITS = 2147483647; // MAX_INT 32-bit

    // ============================================
    // CONFIGURAÇÃO DE PLANOS
    // ============================================

    const PLANS = {
        free: {
            id: 'free',
            name: 'Gratuito',
            price: 0,
            features: {
                maxContacts: 100,
                maxChatsPerDay: 20,
                maxCampaigns: 1,
                maxFlows: 1,
                maxTeamMembers: 1,
                aiCredits: 0,
                smartReplies: false,
                copilot: false,
                analytics: false,
                exportFormats: ['csv'],
                bulkMessages: false,
                customLabels: false,
                apiAccess: false,
                prioritySupport: false,
                whiteLabel: false
            },
            limits: {
                messagesPerDay: 50,
                mediaPerDay: 10,
                exportsPerDay: 1
            }
        },
        starter: {
            id: 'starter',
            name: 'Starter',
            price: 29.90,
            features: {
                maxContacts: 1000,
                maxChatsPerDay: 100,
                maxCampaigns: 5,
                maxFlows: 3,
                maxTeamMembers: 2,
                aiCredits: 100,
                smartReplies: true,
                copilot: false,
                analytics: 'basic',
                exportFormats: ['csv', 'xlsx'],
                bulkMessages: true,
                customLabels: true,
                apiAccess: false,
                prioritySupport: false,
                whiteLabel: false
            },
            limits: {
                messagesPerDay: 500,
                mediaPerDay: 100,
                exportsPerDay: 10
            }
        },
        pro: {
            id: 'pro',
            name: 'Pro',
            price: 79.90,
            features: {
                maxContacts: 10000,
                maxChatsPerDay: -1, // ilimitado
                maxCampaigns: 20,
                maxFlows: 10,
                maxTeamMembers: 5,
                aiCredits: 500,
                smartReplies: true,
                copilot: true,
                analytics: 'advanced',
                exportFormats: ['csv', 'xlsx', 'json'],
                bulkMessages: true,
                customLabels: true,
                apiAccess: true,
                prioritySupport: true,
                whiteLabel: false
            },
            limits: {
                messagesPerDay: 2000,
                mediaPerDay: 500,
                exportsPerDay: -1
            }
        },
        enterprise: {
            id: 'enterprise',
            name: 'Enterprise',
            price: 199.90,
            features: {
                maxContacts: -1,
                maxChatsPerDay: -1,
                maxCampaigns: -1,
                maxFlows: -1,
                maxTeamMembers: -1,
                aiCredits: 2000,
                smartReplies: true,
                copilot: true,
                analytics: 'full',
                exportFormats: ['csv', 'xlsx', 'json', 'pdf'],
                bulkMessages: true,
                customLabels: true,
                apiAccess: true,
                prioritySupport: true,
                whiteLabel: true
            },
            limits: {
                messagesPerDay: -1,
                mediaPerDay: -1,
                exportsPerDay: -1
            }
        }
    };

    // Estado da assinatura
    // ============================================
    // HELPERS
    // ============================================

    function normalizeUsage(usage) {
        const u = (usage && typeof usage === 'object') ? { ...usage } : {};

        // Corrige chave legada (várias versões usaram `messagestoday` por engano)
        if (u.messagesToday === undefined || u.messagesToday === null) {
            const legacy = u.messagestoday;
            u.messagesToday = Number.isFinite(legacy) ? legacy : (parseInt(legacy || '0', 10) || 0);
        } else {
            u.messagesToday = Number.isFinite(u.messagesToday) ? u.messagesToday : (parseInt(u.messagesToday || '0', 10) || 0);
        }

        u.mediaToday = Number.isFinite(u.mediaToday) ? u.mediaToday : (parseInt(u.mediaToday || '0', 10) || 0);
        u.exportsToday = Number.isFinite(u.exportsToday) ? u.exportsToday : (parseInt(u.exportsToday || '0', 10) || 0);
        u.contactsTotal = Number.isFinite(u.contactsTotal) ? u.contactsTotal : (parseInt(u.contactsTotal || '0', 10) || 0);
        u.campaignsActive = Number.isFinite(u.campaignsActive) ? u.campaignsActive : (parseInt(u.campaignsActive || '0', 10) || 0);
        u.flowsActive = Number.isFinite(u.flowsActive) ? u.flowsActive : (parseInt(u.flowsActive || '0', 10) || 0);

        // Remove legado
        if ('messagestoday' in u) delete u.messagestoday;

        return u;
    }

    let subscription = {
        planId: 'free',
        status: 'active', // active, expired, cancelled, trial
        expiresAt: null,
        trialEndsAt: null,
        aiCredits: 0,
        aiCreditsUsed: 0,
        usage: {
            messagesToday: 0,
            mediaToday: 0,
            exportsToday: 0,
            contactsTotal: 0,
            campaignsActive: 0,
            flowsActive: 0
        },
        lastSync: null
    };

    // Flag de override (master key)
    let masterActive = false;

    // Listeners
    const listeners = new Map();

    // ============================================
    // INICIALIZAÇÃO
    // ============================================

    async function init() {
        console.log('[SubscriptionManager] Inicializando...');

        // Carregar dados salvos
        await loadSubscription();

        // Sincronizar com backend
        await syncWithBackend();

        // Resetar contadores diários à meia-noite
        scheduleDailyReset();

        // Reagir a alterações de licença/créditos (storage.sync)
        try {
            if (chrome?.storage?.onChanged) {
                chrome.storage.onChanged.addListener((changes, area) => {
                    if (area !== 'sync') return;
                    const watched = ['licenseStatus', 'licensePlan', 'licenseAiEnabled', 'licenseAiCredits', 'firstInstallAt', 'licenseKey', 'licenseIsMaster'];
                    const hit = watched.some(k => !!changes[k]);
                    if (hit) {
                        // Atualizar estado interno
                        syncWithBackend().catch(() => {});
                    }
                });
            }
        } catch (e) {
            // ignore
        }

        console.log('[SubscriptionManager] Plano atual:', subscription.planId);
    }

    async function loadSubscription() {
        try {
            const result = await chrome.storage.local.get('subscription');
            if (result.subscription) {
                subscription = { ...subscription, ...result.subscription };
            }

            // Normaliza usage (corrige chaves legadas e garante números)
            subscription.usage = normalizeUsage(subscription.usage);
        } catch (error) {
            console.error('[SubscriptionManager] Erro ao carregar:', error);
        }
    }

    async function saveSubscription() {
        try {
            // Garantir consistência antes de persistir
            subscription.usage = normalizeUsage(subscription.usage);
            await chrome.storage.local.set({ subscription });
            emit('subscription_updated', subscription);
        } catch (error) {
            console.error('[SubscriptionManager] Erro ao salvar:', error);
        }
    }

    // ============================================
    // SINCRONIZAÇÃO COM BACKEND
    // ============================================

    async function syncWithBackend() {
        try {
            // Nova estratégia: usar estado de licença salvo em chrome.storage.sync
            // (não depende de "authToken" nem de backend externo fictício).
            if (!chrome?.storage?.sync) return;

            const state = await chrome.storage.sync.get([
                'licenseStatus',
                'licensePlan',
                'licenseAiEnabled',
                'licenseAiCredits',
                'firstInstallAt',
                'licenseKey',
                'licenseIsMaster'
            ]);

            const rawStatus = (state.licenseStatus || '').toString();
            const rawPlan = (state.licensePlan || '').toString();
            const licenseKey = (state.licenseKey || '').toString().trim();
            const isMaster = licenseKey === MASTER_KEY || state.licenseIsMaster === true;

            // Atualiza flag interna para uso em gates
            masterActive = isMaster;

            // Master key: libera tudo, ignora restrições e mantém compatibilidade
            if (isMaster) {
                const credits = Number.isFinite(state.licenseAiCredits)
                    ? state.licenseAiCredits
                    : (parseInt(state.licenseAiCredits || '0', 10) || MASTER_AI_CREDITS);

                subscription = {
                    ...subscription,
                    planId: MASTER_PLAN_ID,
                    status: 'active',
                    expiresAt: null,
                    trialEndsAt: null,
                    aiCredits: credits > 0 ? credits : MASTER_AI_CREDITS,
                    aiCreditsUsed: 0,
                    lastSync: new Date().toISOString()
                };

                await saveSubscription();
                return;
            }

            const aiEnabled = !!state.licenseAiEnabled;
            const aiCreditsRemaining = Number.isFinite(state.licenseAiCredits) ? state.licenseAiCredits : parseInt(state.licenseAiCredits || '0', 10) || 0;

            // Mapear o plano da licença para um dos planos internos
            const planId = (function mapLicensePlan(p, status) {
                const s = (p || '').toLowerCase();
                if (status === 'trial') return 'pro';
                if (s.includes('enterprise') || s.includes('empresarial') || s.includes('empresa')) return 'enterprise';
                if (s.includes('pro') || s.includes('empreendedor')) return 'pro';
                if (s.includes('starter') || s.includes('iniciante')) return 'starter';
                return rawStatus === 'licensed' ? 'pro' : 'free';
            })(rawPlan, rawStatus);

            const nowIso = new Date().toISOString();

            // Trial (3 dias) baseado na data de instalação
            let trialEndsAt = null;
            if (rawStatus === 'trial' && state.firstInstallAt) {
                const start = new Date(state.firstInstallAt);
                if (!Number.isNaN(start.getTime())) {
                    const end = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000);
                    trialEndsAt = end.toISOString();
                }
            }

            subscription = {
                ...subscription,
                planId,
                status: rawStatus === 'trial' ? 'trial' : (rawStatus === 'licensed' ? 'active' : 'expired'),
                expiresAt: null,
                trialEndsAt,
                aiCredits: aiEnabled ? aiCreditsRemaining : 0,
                aiCreditsUsed: 0,
                lastSync: nowIso
            };

            await saveSubscription();
            console.log('[SubscriptionManager] Sincronizado com estado de licença (storage.sync)');
        } catch (error) {
            console.warn('[SubscriptionManager] Falha na sincronização:', error);
        }
    }

    // ============================================
    // GETTERS
    // ============================================

    function getSubscription() {
        return { ...subscription };
    }

    function getPlan() {
        return PLANS[subscription.planId] || PLANS.free;
    }

    function getPlanId() {
        return subscription.planId;
    }

    function getFeature(featureName) {
        const plan = getPlan();
        return plan.features[featureName];
    }

    function getLimit(limitName) {
        const plan = getPlan();
        return plan.limits[limitName];
    }

    function getAICredits() {
        return {
            total: subscription.aiCredits,
            used: subscription.aiCreditsUsed,
            remaining: subscription.aiCredits - subscription.aiCreditsUsed,
            percentage: subscription.aiCredits > 0 
                ? Math.round((subscription.aiCreditsUsed / subscription.aiCredits) * 100)
                : 0
        };
    }

    function getUsage() {
        return { ...subscription.usage };
    }

    function isActive() {
        if (masterActive) return true;
        if (subscription.status !== 'active' && subscription.status !== 'trial') {
            return false;
        }

        if (subscription.expiresAt && new Date(subscription.expiresAt) < new Date()) {
            return false;
        }

        return true;
    }

    function isTrial() {
        return subscription.status === 'trial';
    }

    function isMasterKey() {
        return !!masterActive;
    }

    function getTrialDaysRemaining() {
        if (!subscription.trialEndsAt) return 0;
        const now = new Date();
        const trialEnd = new Date(subscription.trialEndsAt);
        const diff = trialEnd - now;
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    // ============================================
    // VERIFICAÇÕES DE RECURSOS
    // ============================================

    function hasFeature(featureName) {
        if (masterActive) return true;
        if (!isActive()) return false;
        const feature = getFeature(featureName);
        return feature === true || feature === 'basic' || feature === 'advanced' || feature === 'full';
    }

    function canUseAI() {
        if (masterActive) return true;
        if (!isActive()) return false;
        const credits = getAICredits();
        return credits.remaining > 0;
    }

    function checkLimit(limitName, currentValue) {
        const limit = getLimit(limitName);
        if (limit === -1) return { allowed: true, remaining: -1 };

        const current = Number.isFinite(currentValue)
            ? currentValue
            : (parseInt(currentValue || '0', 10) || 0);

        const remaining = limit - current;
        return {
            allowed: remaining > 0,
            remaining,
            limit,
            current,
            percentage: (limit > 0) ? Math.round((current / limit) * 100) : 0
        };
    }

    function canPerformAction(action) {
        if (masterActive) {
            return { allowed: true, reason: 'master_key', message: 'Master key ativa' };
        }
        if (!isActive()) {
            return { allowed: false, reason: 'subscription_inactive', message: 'Sua assinatura não está ativa' };
        }

        const plan = getPlan();

        switch (action) {
            case 'send_message':
                var msgCheck = checkLimit('messagesPerDay', subscription.usage.messagesToday);
                if (!msgCheck.allowed) {
                    return { allowed: false, reason: 'limit_reached', message: `Limite de ${msgCheck.limit} mensagens/dia atingido` };
                }
                break;

            case 'send_media':
                var mediaCheck = checkLimit('mediaPerDay', subscription.usage.mediaToday);
                if (!mediaCheck.allowed) {
                    return { allowed: false, reason: 'limit_reached', message: `Limite de ${mediaCheck.limit} mídias/dia atingido` };
                }
                break;

            case 'export':
                var exportCheck = checkLimit('exportsPerDay', subscription.usage.exportsToday);
                if (!exportCheck.allowed) {
                    return { allowed: false, reason: 'limit_reached', message: `Limite de ${exportCheck.limit} exportações/dia atingido` };
                }
                break;

            case 'bulk_message':
                if (!plan.features.bulkMessages) {
                    return { allowed: false, reason: 'feature_locked', message: 'Envios em massa não disponíveis no seu plano' };
                }
                break;

            case 'create_flow':
                if (subscription.usage.flowsActive >= plan.features.maxFlows && plan.features.maxFlows !== -1) {
                    return { allowed: false, reason: 'limit_reached', message: `Limite de ${plan.features.maxFlows} automações atingido` };
                }
                break;

            case 'create_campaign':
                if (subscription.usage.campaignsActive >= plan.features.maxCampaigns && plan.features.maxCampaigns !== -1) {
                    return { allowed: false, reason: 'limit_reached', message: `Limite de ${plan.features.maxCampaigns} campanhas atingido` };
                }
                break;

            case 'use_copilot':
                if (!plan.features.copilot) {
                    return { allowed: false, reason: 'feature_locked', message: 'Copiloto IA não disponível no seu plano' };
                }
                if (!canUseAI()) {
                    return { allowed: false, reason: 'no_credits', message: 'Créditos de IA esgotados' };
                }
                break;

            case 'use_smart_replies':
                if (!plan.features.smartReplies) {
                    return { allowed: false, reason: 'feature_locked', message: 'Respostas inteligentes não disponíveis no seu plano' };
                }
                if (!canUseAI()) {
                    return { allowed: false, reason: 'no_credits', message: 'Créditos de IA esgotados' };
                }
                break;

            case 'view_analytics':
                if (!plan.features.analytics) {
                    return { allowed: false, reason: 'feature_locked', message: 'Analytics não disponível no seu plano' };
                }
                break;
        }

        return { allowed: true };
    }

    // ============================================
    // CONSUMO DE RECURSOS
    // ============================================

    async function consumeAICredit(amount = 1) {
        if (!canUseAI()) {
            throw new Error('Sem créditos de IA disponíveis');
        }

        subscription.aiCreditsUsed += amount;
        await saveSubscription();

        // Verificar se está acabando
        const credits = getAICredits();
        if (credits.percentage >= 80 && credits.percentage < 100) {
            emit('credits_low', credits);
        } else if (credits.remaining <= 0) {
            emit('credits_depleted', credits);
        }

        return credits;
    }

    async function incrementUsage(type, amount = 1) {
        // Normaliza para evitar NaN em versões antigas
        subscription.usage = normalizeUsage(subscription.usage);

        const usageKeyMap = {
            message: 'messagesToday',
            media: 'mediaToday',
            export: 'exportsToday'
        };

        const limitMap = {
            message: 'messagesPerDay',
            media: 'mediaPerDay',
            export: 'exportsPerDay'
        };

        const usageKey = usageKeyMap[type];
        if (!usageKey) return;

        const current = Number.isFinite(subscription.usage[usageKey])
            ? subscription.usage[usageKey]
            : (parseInt(subscription.usage[usageKey] || '0', 10) || 0);

        subscription.usage[usageKey] = current + amount;

        await saveSubscription();

        // Verificar limites
        const check = checkLimit(limitMap[type], subscription.usage[usageKey]);
        if (check.percentage >= 80) {
            emit('limit_warning', { type, ...check });
        }
    }

    // ============================================
    // RESET DIÁRIO
    // ============================================

    function scheduleDailyReset() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const msUntilMidnight = tomorrow - now;

        setTimeout(() => {
            resetDailyUsage();
            scheduleDailyReset(); // Reagendar
        }, msUntilMidnight);
    }

    async function resetDailyUsage() {
        subscription.usage.messagesToday = 0;
        subscription.usage.mediaToday = 0;
        subscription.usage.exportsToday = 0;
        await saveSubscription();
        emit('daily_reset', subscription.usage);
    }

    // ============================================
    // UPGRADE/DOWNGRADE
    // ============================================

    function getUpgradeUrl(planId) {
        return `https://seusite.com/upgrade?plan=${planId}&ref=extension`;
    }

    function getManageUrl() {
        return 'https://seusite.com/account/subscription';
    }

    async function startTrial(planId = 'pro') {
        const trialDays = 7;
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + trialDays);

        subscription = {
            ...subscription,
            planId,
            status: 'trial',
            trialEndsAt: trialEnd.toISOString(),
            aiCredits: PLANS[planId].features.aiCredits
        };

        await saveSubscription();
        emit('trial_started', { planId, endsAt: trialEnd });
    }

    // ============================================
    // EVENTOS
    // ============================================

    function on(event, callback) {
        if (!listeners.has(event)) {
            listeners.set(event, []);
        }
        listeners.get(event).push(callback);
        return () => off(event, callback);
    }

    function off(event, callback) {
        const eventListeners = listeners.get(event);
        if (eventListeners) {
            const index = eventListeners.indexOf(callback);
            if (index > -1) eventListeners.splice(index, 1);
        }
    }

    function emit(event, data) {
        // Internal listeners (legacy)
        if (listeners.has(event)) {
            listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error("[SubscriptionManager] Erro em listener:", e);
                }
            });
        }

        // Bridge -> EventBus (novo)
        try {
            const eb = window.EventBus;
            if (eb && typeof eb.emit === "function") {
                const E = eb.EVENTS || {};
                let mapped;
                switch (event) {
                    case "subscription_updated":
                        mapped = E.SUBSCRIPTION_UPDATED || "subscription:updated";
                        break;
                    case "credits_low":
                        mapped = E.CREDITS_LOW || "credits:low";
                        break;
                    case "credits_depleted":
                        mapped = E.CREDITS_DEPLETED || "credits:depleted";
                        break;
                    case "limit_warning":
                        mapped = "subscription:limit_warning";
                        break;
                    case "daily_reset":
                        mapped = "subscription:daily_reset";
                        break;
                    case "trial_started":
                        mapped = "subscription:trial_started";
                        break;
                    default:
                        mapped = `subscription:${event}`;
                }

                eb.emit(mapped, data);
            }
        } catch (e) {
            // no-op
        }
    }

    // ============================================
    // EXPORT
    // ============================================

    return {
        init,
        syncWithBackend,

        // Getters
        getSubscription,
        getPlan,
        getPlanId,
        getFeature,
        getLimit,
        getAICredits,
        getUsage,
        isActive,
        isTrial,
        isMasterKey,
        getTrialDaysRemaining,

        // Verificações
        hasFeature,
        canUseAI,
        checkLimit,
        canPerformAction,

        // Consumo
        consumeAICredit,
        incrementUsage,

        // Upgrade
        getUpgradeUrl,
        getManageUrl,
        startTrial,

        // Eventos
        on,
        off,

        // Constantes
        PLANS
    };
})();

// Export global
window.SubscriptionManager = SubscriptionManager;
