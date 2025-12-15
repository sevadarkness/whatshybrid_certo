// utils/module-registry.js
// Registry central para gerenciamento de módulos e dependências

(function() {
  'use strict';

  const CONFIG = {
    initTimeout: 10000,
    retryAttempts: 3,
    retryDelay: 500,
    enableLogging: true
  };

  const modules = new Map();        // name -> module
  const depsMap = new Map();        // name -> [deps]
  const initOrder = [];             // names in init order
  const initPromises = new Map();   // name -> Promise

  const STATUS = {
    REGISTERED: 'registered',
    INITIALIZING: 'initializing',
    READY: 'ready',
    ERROR: 'error',
    DESTROYED: 'destroyed'
  };

  function log(...args) {
    if (CONFIG.enableLogging) {
      // eslint-disable-next-line no-console
      console.log('[ModuleRegistry]', ...args);
    }
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function getEventBus() {
    return (typeof window !== 'undefined' && window.EventBus) ? window.EventBus : null;
  }

  function register(name, config = {}) {
    if (!name) throw new Error('ModuleRegistry.register: name é obrigatório');

    const module = {
      name,
      instance: config.instance || null,
      factory: config.factory || null,
      dependencies: Array.isArray(config.dependencies) ? config.dependencies : [],
      priority: config.priority || 0,
      status: config.status || (config.ready ? STATUS.READY : STATUS.REGISTERED),
      error: null,
      initTime: null,
      metadata: config.metadata || {}
    };

    modules.set(name, module);
    depsMap.set(name, module.dependencies);

    log(`Módulo "${name}" registrado`);

    return module;
  }

  function registerAll(moduleConfigs) {
    const results = {};
    for (const [name, cfg] of Object.entries(moduleConfigs || {})) {
      results[name] = register(name, cfg);
    }
    return results;
  }

  async function executeWithRetry(fn, attempts, delay, timeout) {
    let lastError;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await Promise.race([
          Promise.resolve().then(fn),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
        ]);
        return res;
      } catch (err) {
        lastError = err;
        if (i < attempts - 1) {
          await sleep(delay * (i + 1));
        }
      }
    }
    throw lastError;
  }

  async function initializeDependencies(name) {
    const deps = depsMap.get(name) || [];
    for (const dep of deps) {
      if (!modules.has(dep)) {
        throw new Error(`Dependência "${dep}" não encontrada para "${name}"`);
      }
      if (getStatus(dep) !== STATUS.READY) {
        await initialize(dep);
      }
    }
  }

  function getDependencyInstances(name) {
    const deps = depsMap.get(name) || [];
    const instances = {};
    for (const dep of deps) {
      const m = modules.get(dep);
      if (m && m.instance) instances[dep] = m.instance;
    }
    return instances;
  }

  async function performInitialization(name, module, options = {}) {
    const start = Date.now();
    module.status = STATUS.INITIALIZING;
    module.error = null;

    try {
      await initializeDependencies(name);

      // Construir instância via factory (se necessário)
      if (module.factory && !module.instance) {
        module.instance = await executeWithRetry(
          () => module.factory(getDependencyInstances(name)),
          CONFIG.retryAttempts,
          CONFIG.retryDelay,
          CONFIG.initTimeout
        );
      }

      // init() opcional
      if (module.instance && typeof module.instance.init === 'function') {
        await executeWithRetry(
          () => module.instance.init(options),
          CONFIG.retryAttempts,
          CONFIG.retryDelay,
          CONFIG.initTimeout
        );
      }

      module.status = STATUS.READY;
      module.initTime = Date.now() - start;
      initOrder.push(name);

      log(`Módulo "${name}" inicializado em ${module.initTime}ms`);

      const bus = getEventBus();
      if (bus) bus.emit(bus.EVENTS.MODULE_LOADED, { name, module });

      return module.instance;
    } catch (err) {
      module.status = STATUS.ERROR;
      module.error = err;

      // eslint-disable-next-line no-console
      console.error(`[ModuleRegistry] Erro ao inicializar "${name}":`, err);

      const bus = getEventBus();
      if (bus) bus.emit(bus.EVENTS.MODULE_ERROR, { name, error: err });

      throw err;
    }
  }

  async function initialize(name, options = {}) {
    const module = modules.get(name);
    if (!module) throw new Error(`Módulo "${name}" não registrado`);

    if (module.status === STATUS.READY) return module.instance;
    if (module.status === STATUS.INITIALIZING) return initPromises.get(name);

    const p = performInitialization(name, module, options);
    initPromises.set(name, p);

    try {
      const res = await p;
      initPromises.delete(name);
      return res;
    } catch (err) {
      initPromises.delete(name);
      throw err;
    }
  }

  function getSortedModules() {
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();

    function visit(n) {
      if (visited.has(n)) return;
      if (visiting.has(n)) throw new Error(`Dependência circular detectada: ${n}`);

      visiting.add(n);
      const deps = depsMap.get(n) || [];
      for (const d of deps) {
        if (modules.has(d)) visit(d);
      }
      visiting.delete(n);
      visited.add(n);
      sorted.push(n);
    }

    const byPriority = Array.from(modules.entries())
      .sort((a, b) => (b[1].priority || 0) - (a[1].priority || 0))
      .map(([n]) => n);

    for (const n of byPriority) visit(n);

    return sorted;
  }

  async function initializeAll(options = {}) {
    log('Inicializando todos os módulos...');

    const sorted = getSortedModules();
    const results = {};
    const errors = [];

    for (const name of sorted) {
      try {
        results[name] = await initialize(name, options);
      } catch (err) {
        errors.push({ name, error: err });
        if (options.stopOnError) throw err;
      }
    }

    if (errors.length) {
      // eslint-disable-next-line no-console
      console.warn('[ModuleRegistry] Alguns módulos falharam:', errors);
    }

    return { results, errors };
  }

  function get(name) {
    const m = modules.get(name);
    return m ? m.instance : null;
  }

  function getStatus(name) {
    const m = modules.get(name);
    return m ? m.status : null;
  }

  function isReady(name) {
    return getStatus(name) === STATUS.READY;
  }

  async function waitFor(name, timeout = CONFIG.initTimeout) {
    const m = modules.get(name);
    if (!m) throw new Error(`Módulo "${name}" não registrado`);
    if (m.status === STATUS.READY) return m.instance;

    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (m.status === STATUS.READY) return m.instance;
      if (m.status === STATUS.ERROR) throw m.error || new Error('Erro ao inicializar');
      await sleep(50);
    }

    throw new Error(`Timeout aguardando módulo "${name}"`);
  }

  function waitForAll(names, timeout = CONFIG.initTimeout) {
    return Promise.all((names || []).map(n => waitFor(n, timeout)));
  }

  function getAll() {
    const all = {};
    modules.forEach((m, n) => {
      all[n] = m.instance;
    });
    return all;
  }

  async function destroy(name) {
    const m = modules.get(name);
    if (!m) return;

    try {
      if (m.instance && typeof m.instance.destroy === 'function') {
        await m.instance.destroy();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[ModuleRegistry] Erro ao destruir "${name}":`, err);
    }

    m.status = STATUS.DESTROYED;
    m.instance = null;

    const idx = initOrder.indexOf(name);
    if (idx >= 0) initOrder.splice(idx, 1);

    const bus = getEventBus();
    if (bus) bus.emit(bus.EVENTS.MODULE_UNLOADED, { name });
  }

  async function destroyAll() {
    const list = [...initOrder].reverse();
    for (const name of list) {
      await destroy(name);
    }
  }

  function debug() {
    const info = {};
    modules.forEach((m, n) => {
      info[n] = {
        status: m.status,
        dependencies: depsMap.get(n) || [],
        initTime: m.initTime,
        error: m.error ? (m.error.message || String(m.error)) : null
      };
    });

    return {
      modules: info,
      initOrder: [...initOrder],
      sorted: getSortedModules()
    };
  }

  const api = {
    // Registration
    register,
    registerAll,

    // Initialization
    initialize,
    initializeAll,

    // Getters
    get,
    getStatus,
    isReady,
    waitFor,
    waitForAll,
    getAll,

    // Destroy
    destroy,
    destroyAll,

    // Debug
    debug,

    // Constants
    STATUS,

    // Config
    setConfig: (newConfig) => Object.assign(CONFIG, newConfig)
  };

  window.ModuleRegistry = api;
})();
