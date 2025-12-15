// utils/initialization-manager.js
// Gerenciador de inicialização sequencial e ordenada (reduz race conditions)

(function() {
  'use strict';

  const CONFIG = {
    timeout: 30000,
    retryDelay: 1000,
    maxRetries: 3
  };

  const PHASES = {
    CORE: 'core',
    SERVICES: 'services',
    UI: 'ui',
    MODULES: 'modules',
    INTEGRATION: 'integration'
  };

  let initialized = false;
  let currentPhase = null;
  const phaseResults = new Map();

  // ============================================
  // MÓDULOS POR FASE
  // ============================================

  const PHASE_MODULES = {
    [PHASES.CORE]: [
      {
        name: 'EventBus',
        check: () => !!window.EventBus,
        init: () => Promise.resolve(window.EventBus),
        priority: 100
      },
      {
        name: 'ModuleRegistry',
        check: () => !!window.ModuleRegistry,
        init: () => Promise.resolve(window.ModuleRegistry),
        priority: 99,
        optional: true
      },
      {
        name: 'SelectorEngine',
        check: () => !!window.SelectorEngine,
        init: () => Promise.resolve(window.SelectorEngine),
        priority: 98
      }
    ],

    [PHASES.SERVICES]: [
      {
        name: 'SubscriptionManager',
        check: () => !!window.SubscriptionManager,
        init: async () => {
          if (window.SubscriptionManager?.init) {
            await window.SubscriptionManager.init();
          }
          return window.SubscriptionManager;
        },
        dependencies: ['EventBus'],
        priority: 90,
        optional: true
      },
      {
        name: 'CreditsManager',
        check: () => !!window.CreditsManager,
        init: async () => {
          if (window.CreditsManager?.init) {
            await window.CreditsManager.init();
          }
          return window.CreditsManager;
        },
        dependencies: ['SubscriptionManager'],
        priority: 89,
        optional: true
      },
      {
        name: 'FeatureGate',
        check: () => !!window.FeatureGate,
        init: () => Promise.resolve(window.FeatureGate),
        dependencies: ['SubscriptionManager'],
        priority: 88,
        optional: true
      },
      {
        name: 'StateManager',
        check: () => !!window.StateManager,
        init: async () => {
          if (window.StateManager?.init) {
            await window.StateManager.init();
          }
          return window.StateManager;
        },
        dependencies: ['EventBus'],
        priority: 87,
        optional: true
      }
    ],

    [PHASES.UI]: [
      {
        name: 'NotificationCenter',
        check: () => !!window.NotificationCenter,
        init: async () => {
          window.NotificationCenter?.init?.();
          return window.NotificationCenter;
        },
        dependencies: ['EventBus'],
        priority: 80,
        optional: true
      },
      {
        name: 'OverlayManager',
        check: () => !!window.OverlayManager,
        init: async () => {
          window.OverlayManager?.init?.();
          return window.OverlayManager;
        },
        dependencies: ['NotificationCenter'],
        priority: 79,
        optional: true
      },
      {
        name: 'SubscriptionUI',
        check: () => !!window.SubscriptionUI,
        init: async () => {
          window.SubscriptionUI?.init?.();
          return window.SubscriptionUI;
        },
        dependencies: ['SubscriptionManager', 'NotificationCenter'],
        priority: 78,
        optional: true
      }
    ],

    // Em páginas de conteúdo, esses módulos podem estar em iframe/painel; por isso são opcionais.
    [PHASES.MODULES]: [
      {
        name: 'Workspace',
        check: () => !!window.Workspace,
        init: async () => {
          if (window.Workspace?.init) {
            await window.Workspace.init();
          }
          return window.Workspace;
        },
        dependencies: ['StateManager'],
        priority: 70,
        optional: true
      },
      {
        name: 'ModuleLoader',
        check: () => !!window.ModuleLoader,
        init: async () => {
          if (window.ModuleLoader?.init) {
            await window.ModuleLoader.init();
          }
          return window.ModuleLoader;
        },
        dependencies: ['ModuleRegistry'],
        priority: 69,
        optional: true
      }
    ],

    [PHASES.INTEGRATION]: [
      {
        name: 'WhatsHybridBridge',
        check: () => !!window.WhatsHybridBridge,
        init: async () => {
          if (window.WhatsHybridBridge?.init) {
            await window.WhatsHybridBridge.init();
          }
          return window.WhatsHybridBridge;
        },
        dependencies: ['EventBus', 'SelectorEngine'],
        priority: 60,
        optional: true
      },
      {
        name: 'QuickActionsInjector',
        check: () => !!window.QuickActionsInjector,
        init: async () => {
          window.QuickActionsInjector?.init?.();
          return window.QuickActionsInjector;
        },
        dependencies: ['SelectorEngine'],
        priority: 59,
        optional: true
      }
    ]
  };

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

  async function initialize(options = {}) {
    if (initialized && !options.force) {
      return getResults();
    }

    const startTime = Date.now();

    try {
      await waitForDOM();

      const phasesToRun = Array.isArray(options.phases) && options.phases.length
        ? options.phases
        : Object.values(PHASES);

      for (const phase of phasesToRun) {
        await initializePhase(phase, options);
      }

      if (options.waitForWhatsApp !== false) {
        await waitForWhatsApp();
      }

      initialized = true;

      const totalTime = Date.now() - startTime;
      window.EventBus?.emit?.(window.EventBus.EVENTS?.SYSTEM_READY || 'system:ready', {
        duration: totalTime,
        results: getResults()
      });

      return getResults();
    } catch (error) {
      console.error('[InitManager] Falha na inicialização:', error);
      window.EventBus?.emit?.(window.EventBus.EVENTS?.SYSTEM_ERROR || 'system:error', { error });
      if (options.throwOnError) {
        throw error;
      }
      return getResults();
    }
  }

  async function initializePhase(phase, options = {}) {
    currentPhase = phase;

    const modules = PHASE_MODULES[phase] || [];
    const results = { success: [], failed: [], skipped: [] };

    const sorted = [...modules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const mod of sorted) {
      try {
        const depsOk = await checkDependencies(mod.dependencies || []);
        if (!depsOk) {
          if (mod.optional) {
            results.skipped.push(mod.name);
            continue;
          }
          throw new Error(`Dependências não satisfeitas para ${mod.name}`);
        }

        if (!mod.check()) {
          if (mod.optional) {
            results.skipped.push(mod.name);
            continue;
          }
          throw new Error(`Módulo ${mod.name} não encontrado`);
        }

        await initializeModule(mod);
        results.success.push(mod.name);
      } catch (error) {
        if (mod.optional) {
          results.skipped.push(mod.name);
        } else {
          results.failed.push({ name: mod.name, error });
          if (options.stopOnError) {
            throw error;
          }
        }
      }
    }

    phaseResults.set(phase, results);
    return results;
  }

  async function initializeModule(mod, attempt = 1) {
    try {
      const res = await Promise.race([
        Promise.resolve().then(mod.init),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), CONFIG.timeout))
      ]);
      return res;
    } catch (error) {
      if (attempt < CONFIG.maxRetries) {
        await sleep(CONFIG.retryDelay * attempt);
        return initializeModule(mod, attempt + 1);
      }
      throw error;
    }
  }

  async function checkDependencies(deps) {
    for (const dep of deps) {
      if (!window[dep]) {
        // Dependência opcional: aceitar se não existir e o próprio módulo também tende a ser opcional.
        // Mas para manter previsibilidade, retornamos false aqui.
        return false;
      }
    }
    return true;
  }

  function waitForDOM() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        resolve();
      } else {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      }
    });
  }

  async function waitForWhatsApp() {
    const maxWait = 30000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      if (window.SelectorEngine?.isWhatsAppReady?.()) {
        window.EventBus?.emit?.(window.EventBus.EVENTS?.WHATSAPP_READY || 'system:whatsapp_ready');
        return true;
      }
      await sleep(500);
    }

    return false;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function getResults() {
    const out = {};
    phaseResults.forEach((v, k) => (out[k] = v));
    return out;
  }

  function isInitialized() {
    return initialized;
  }

  function getCurrentPhase() {
    return currentPhase;
  }

  async function reinitialize(phase = null) {
    if (phase) {
      return initializePhase(phase, { force: true });
    }
    initialized = false;
    phaseResults.clear();
    return initialize({ force: true });
  }

  window.InitializationManager = {
    initialize,
    initializePhase,
    reinitialize,
    isInitialized,
    getCurrentPhase,
    getResults,
    PHASES,
    PHASE_MODULES
  };
})();
