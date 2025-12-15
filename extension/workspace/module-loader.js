// workspace/module-loader.js
// Sistema de carregamento dinâmico de módulos

const ModuleLoader = (function() {
    'use strict';

    // ============================================
    // CONFIGURAÇÃO DOS MÓDULOS
    // ============================================

    const MODULE_CONFIG = {
        dashboard: {
            name: 'Dashboard',
            icon: '📊',
            path: 'workspace/modules/dashboard',
            files: {
                html: 'dashboard.html',
                js: 'dashboard.js',
                css: 'dashboard.css'
            },
            preload: true, // Carregar antecipadamente
            singleton: true
        },
        chats: {
            name: 'Conversas',
            icon: '💬',
            path: 'workspace/modules/chats',
            files: {
                html: 'chats.html',
                js: 'chats.js',
                css: 'chats.css'
            }
        },
        bulk: {
            name: 'Envios em Massa',
            icon: '📨',
            path: 'workspace/modules/bulk',
            files: {
                html: 'bulk.html',
                js: 'bulk.js',
                css: 'bulk.css'
            }
        },

        'smart-replies': {
            name: 'Respostas IA',
            icon: '🤖',
            path: 'workspace/modules/smart-replies',
            files: {
                html: 'smart-replies.html',
                js: 'smart-replies.js',
                css: 'smart-replies.css'
            }
        },
        extractor: {
            name: 'Extrator',
            icon: '📥',
            path: 'workspace/modules/extractor',
            files: {
                html: 'extractor.html',
                js: 'extractor.js',
                css: 'extractor.css'
            }
        },
        analytics: {
            name: 'Analytics',
            icon: '📈',
            path: 'workspace/modules/analytics',
            files: {
                html: 'analytics.html',
                js: 'analytics.js',
                css: 'analytics.css'
            }
        },
        contacts: {
            name: 'Contatos',
            icon: '👥',
            path: 'workspace/modules/contacts',
            files: {
                html: 'contacts.html',
                js: 'contacts.js',
                css: 'contacts.css'
            }
        },
        team: {
            name: 'Equipe',
            icon: '👨‍👩‍👧‍👦',
            path: 'workspace/modules/team',
            files: {
                html: 'team.html',
                js: 'team.js',
                css: 'team.css'
            }
        },
        labels: {
            name: 'Rótulos',
            icon: '🏷️',
            path: 'workspace/modules/labels',
            files: {
                html: 'labels.html',
                js: 'labels.js',
                css: 'labels.css'
            }
        },
        flows: {
            name: 'Flows',
            icon: '⚡',
            path: 'workspace/modules/flows',
            files: {
                html: 'flows.html',
                js: 'flows.js',
                css: 'flows.css'
            }
        },
        settings: {
            name: 'Configurações',
            icon: '⚙️',
            path: 'workspace/modules/settings',
            files: {
                html: 'settings.html',
                js: 'settings.js',
                css: 'settings.css'
            }
        },
        help: {
            name: 'Ajuda',
            icon: '❓',
            path: 'workspace/modules/help',
            files: {
                html: 'help.html',
                js: 'help.js',
                css: 'help.css'
            }
        }
    };

    // Cache de módulos carregados
    const moduleCache = new Map();
    const loadedCSS = new Set();
    const loadedJS = new Set();

    // ============================================
    // MÉTODOS DE CARREGAMENTO
    // ============================================

    /**
     * Carrega um módulo pelo nome
     */
    async function loadModule(moduleName) {
        console.log(`[ModuleLoader] Carregando módulo: ${moduleName}`);

        const config = MODULE_CONFIG[moduleName];
        if (!config) {
            throw new Error(`Módulo desconhecido: ${moduleName}`);
        }

        // Verificar cache
        if (config.singleton && moduleCache.has(moduleName)) {
            console.log(`[ModuleLoader] Usando cache: ${moduleName}`);
            return moduleCache.get(moduleName);
        }

        try {
            // Carregar arquivos em paralelo
            const [html, cssLoaded, jsLoaded] = await Promise.all([
                loadHTML(config),
                loadCSS(config),
                loadJS(config)
            ]);

            const moduleInstance = {
                name: moduleName,
                config,
                html,
                initialized: false,
                controller: null
            };

            // Obter controller se existir
            const controllerName = `${capitalize(moduleName)}Module`;
            if (window[controllerName]) {
                moduleInstance.controller = window[controllerName];
            }

            // Salvar no cache
            if (config.singleton) {
                moduleCache.set(moduleName, moduleInstance);
            }

            console.log(`[ModuleLoader] Módulo carregado: ${moduleName}`);
    
        // Registrar no ModuleRegistry / EventBus (opcional)
        try {
            if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
                window.ModuleRegistry.register(`workspace:${moduleName}`, {
                    instance: moduleInstance.controller || moduleInstance,
                    ready: false,
                    metadata: { source: 'module-loader' }
                });
            }
        } catch (_) {}

        try {
            if (window.EventBus && typeof window.EventBus.emit === 'function') {
                window.EventBus.emit(window.EventBus.EVENTS?.MODULE_LOADED || 'module:loaded', { name: `workspace:${moduleName}` });
            }
        } catch (_) {}

        return moduleInstance;

        } catch (error) {
            console.error(`[ModuleLoader] Erro ao carregar ${moduleName}:`, error);
            throw error;
        }
    }

    /**
     * Carrega o HTML do módulo
     */
    async function loadHTML(config) {
        const url = chrome.runtime.getURL(`${config.path}/${config.files.html}`);

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.text();
        } catch (error) {
            console.warn(`[ModuleLoader] HTML não encontrado, usando placeholder`);
            return createPlaceholderHTML(config);
        }
    }

    /**
     * Carrega o CSS do módulo
     */
    async function loadCSS(config) {
        const cssId = `module-css-${config.files.css}`;

        if (loadedCSS.has(cssId)) {
            return true;
        }

        const url = chrome.runtime.getURL(`${config.path}/${config.files.css}`);

        try {
            const link = document.createElement('link');
            link.id = cssId;
            link.rel = 'stylesheet';
            link.href = url;

            await new Promise((resolve, reject) => {
                link.onload = resolve;
                link.onerror = () => {
                    console.warn(`[ModuleLoader] CSS não encontrado: ${url}`);
                    resolve(); // Não falhar por falta de CSS
                };
                document.head.appendChild(link);
            });

            loadedCSS.add(cssId);
            return true;
        } catch (error) {
            console.warn(`[ModuleLoader] Erro ao carregar CSS:`, error);
            return false;
        }
    }

    /**
     * Carrega o JS do módulo
     */
    async function loadJS(config) {
        const jsId = `module-js-${config.files.js}`;

        if (loadedJS.has(jsId)) {
            return true;
        }

        const url = chrome.runtime.getURL(`${config.path}/${config.files.js}`);

        try {
            const script = document.createElement('script');
            script.id = jsId;
            script.src = url;

            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = () => {
                    console.warn(`[ModuleLoader] JS não encontrado: ${url}`);
                    resolve(); // Não falhar por falta de JS
                };
                document.body.appendChild(script);
            });

            loadedJS.add(jsId);
            return true;
        } catch (error) {
            console.warn(`[ModuleLoader] Erro ao carregar JS:`, error);
            return false;
        }
    }

    /**
     * Cria HTML placeholder para módulos sem arquivo
     */
    function createPlaceholderHTML(config) {
        return `
            <div class="module-placeholder">
                <div class="placeholder-icon">${config.icon}</div>
                <h2>${config.name}</h2>
                <p>Módulo em desenvolvimento</p>
            </div>
        `;
    }

    

    /**
     * Cria HTML de paywall quando um módulo está bloqueado por plano.
     */
    function createPaywallHTML(config, gate) {
        const moduleName = config?.name || 'Recurso';
        const message = gate?.message || 'Recurso bloqueado no seu plano atual.';

        let planLabel = gate?.upgradeRequired || gate?.minPlan || null;
        try {
            if (planLabel && window.SubscriptionManager?.PLANS?.[planLabel]?.name) {
                planLabel = window.SubscriptionManager.PLANS[planLabel].name;
            }
        } catch (_) {}

        const subtitle = planLabel ? `Disponível a partir do plano <strong>${planLabel}</strong>.` : '';

        return `
            <div class="state state-paywall">
                <div class="state-card">
                    <div class="state-icon">🔒</div>
                    <div class="state-title">${moduleName} bloqueado</div>
                    <div class="state-text">${message} ${subtitle}</div>

                    <div class="paywall-perks">
                        <div class="perk">⚡ Mais escala com campanhas e automações</div>
                        <div class="perk">🤖 IA com revisão humana (mais confiança)</div>
                        <div class="perk">📈 Métricas para decidir com dados</div>
                    </div>

                    <div class="state-actions">
                        <button class="btn primary" data-action="upgrade">Upgrade</button>
                        <button class="btn ghost" data-action="back">Voltar</button>
                    </div>

                    <div class="help-text" style="margin-top:10px;">
                        Dica: você ainda pode explorar módulos liberados via menu (Inbox/CRM).
                    </div>
                </div>
            </div>
        `;
    }
/**
     * Renderiza módulo no container
     */
    async function renderModule(moduleName, container) {
        // Gate: bloqueio por plano (paywall elegante)
        try {
            const cfg = MODULE_CONFIG[moduleName];
            if (cfg && window.FeatureGate && typeof window.FeatureGate.check === 'function') {
                const gateKey = `module:${moduleName}`;
                const gate = window.FeatureGate.check(gateKey);
                if (gate && gate.allowed === false) {
                    container.innerHTML = createPaywallHTML(cfg, gate);

                    // Botões
                    container.querySelector('[data-action="upgrade"]')?.addEventListener('click', () => {
                        try { window.SubscriptionUI?.showUpgradeModal?.(gate.reason || 'feature_locked', gate.upgradeRequired || 'starter'); } catch (_) {}
                    });

                    container.querySelector('[data-action="back"]')?.addEventListener('click', () => {
                        try { window.Workspace?.goBack?.(); } catch (_) {}
                        try { if (window.Workspace?.getCurrentModule?.() === moduleName) { window.Workspace?.navigateTo?.('dashboard'); } } catch (_) {}
                    });

                    return { name: moduleName, config: cfg, html: container.innerHTML, initialized: true, controller: null, blocked: true, gate };
                }
            }
        } catch (e) {
            // Se algo falhar no gate, não bloquear
        }

        const moduleInstance = await loadModule(moduleName);

        // Limpar container
        container.innerHTML = '';

        // Inserir HTML
        container.innerHTML = moduleInstance.html;

        // Inicializar controller
        if (moduleInstance.controller && !moduleInstance.initialized) {
            if (typeof moduleInstance.controller.init === 'function') {
                await moduleInstance.controller.init(container);
                moduleInstance.initialized = true;
            }
        } else if (moduleInstance.controller && moduleInstance.initialized) {
            if (typeof moduleInstance.controller.onShow === 'function') {
                await moduleInstance.controller.onShow();
            }
        }

        // Atualizar Registry (opcional): marca módulo como READY após init
        try {
            if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
                window.ModuleRegistry.register(`workspace:${moduleName}`, {
                    instance: moduleInstance.controller || moduleInstance,
                    ready: true,
                    metadata: { source: 'module-loader', moduleName }
                });
            }
        } catch (e) {
            // ignore
        }

        // Notificar EventBus (opcional)
        try {
            if (window.EventBus && typeof window.EventBus.emit === 'function') {
                const evt = window.EventBus.EVENTS?.MODULE_LOADED || 'module:loaded';
                window.EventBus.emit(evt, { name: moduleName });
            }
        } catch (e) {
            // ignore
        }

        return moduleInstance;
    }

    /**
     * Descarrega um módulo (para liberação de memória)
     */
    function unloadModule(moduleName) {
        const moduleInstance = moduleCache.get(moduleName);

        if (moduleInstance?.controller) {
            if (typeof moduleInstance.controller.onHide === 'function') {
                moduleInstance.controller.onHide();
            }
            if (typeof moduleInstance.controller.destroy === 'function') {
                moduleInstance.controller.destroy();
                moduleCache.delete(moduleName);
            }
        }
    }

    /**
     * Pré-carrega módulos marcados como preload
     */
    async function preloadModules() {
        const toPreload = Object.entries(MODULE_CONFIG)
            .filter(([_, config]) => config.preload)
            .map(([name, _]) => name);

        console.log('[ModuleLoader] Pré-carregando módulos:', toPreload);

        await Promise.all(toPreload.map(name => loadModule(name).catch(e => {
            console.warn(`[ModuleLoader] Falha no preload de ${name}:`, e);
        })));
    }

    /**
     * Obtém configuração de um módulo
     */
    function getModuleConfig(moduleName) {
        return MODULE_CONFIG[moduleName] || null;
    }

    /**
     * Lista todos os módulos disponíveis
     */
    function listModules() {
        // Retorna lista com `id` (chave do módulo) e `name` (nome exibido)
        return Object.entries(MODULE_CONFIG).map(([id, config]) => ({
            id,
            key: id,
            ...config
        }));
    }

    // ============================================
    // HELPERS
    // ============================================

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1).replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    }

    // ============================================
    // EXPORT
    // ============================================

    return {
        loadModule,
        renderModule,
        unloadModule,
        preloadModules,
        getModuleConfig,
        listModules,
        MODULE_CONFIG
    };
})();

// Export para uso global
window.ModuleLoader = ModuleLoader;
