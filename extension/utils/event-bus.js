// utils/event-bus.js
// Event Bus centralizado para comunicação entre módulos (MV3 friendly)

(function() {
  'use strict';

  const CONFIG = {
    maxListenersPerEvent: 50,
    enableLogging: false,
    enableHistory: true,
    maxHistorySize: 100
  };

  const listeners = new Map();      // event -> [{id, callback, priority, context, debounce}]
  const onceListeners = new Map();  // event -> [{id, callback, priority, context}]
  const eventHistory = [];          // [{event, data, timestamp, id}]
  const debounceTimers = new Map(); // key -> timeoutId
  const eventStats = new Map();     // event -> {count, lastEmitted}

  const NAMESPACES = {
    SUBSCRIPTION: 'subscription',
    CREDITS: 'credits',
    WORKSPACE: 'workspace',
    MODULE: 'module',
    OVERLAY: 'overlay',
    EXTRACTOR: 'extractor',
    METRICS: 'metrics',
    BRIDGE: 'bridge',
    UI: 'ui',
    SYSTEM: 'system'
  };

  const EVENTS = {
    // Subscription
    SUBSCRIPTION_UPDATED: 'subscription:updated',
    SUBSCRIPTION_EXPIRED: 'subscription:expired',
    PLAN_CHANGED: 'subscription:plan_changed',

    // Credits
    CREDITS_UPDATED: 'credits:updated',
    CREDITS_LOW: 'credits:low',
    CREDITS_DEPLETED: 'credits:depleted',
    CREDITS_PURCHASED: 'credits:purchased',

    // Workspace / Modules
    WORKSPACE_READY: 'workspace:ready',
    MODULE_LOADED: 'module:loaded',
    MODULE_UNLOADED: 'module:unloaded',
    MODULE_ERROR: 'module:error',
    STATE_CHANGED: 'workspace:state_changed',

    // Overlay
    OVERLAY_OPENED: 'overlay:opened',
    OVERLAY_CLOSED: 'overlay:closed',
    TOAST_SHOWN: 'overlay:toast_shown',

    // Extractor
    EXTRACTION_STARTED: 'extractor:started',
    EXTRACTION_PROGRESS: 'extractor:progress',
    EXTRACTION_COMPLETED: 'extractor:completed',
    EXTRACTION_ERROR: 'extractor:error',

    // Metrics
    METRICS_COLLECTED: 'metrics:collected',
    METRICS_SYNCED: 'metrics:synced',

    // Bridge
    BRIDGE_CONNECTED: 'bridge:connected',
    BRIDGE_DISCONNECTED: 'bridge:disconnected',
    BRIDGE_MESSAGE: 'bridge:message',

    // UI
    THEME_CHANGED: 'ui:theme_changed',
    NOTIFICATION_SHOWN: 'ui:notification_shown',
    MODAL_OPENED: 'ui:modal_opened',
    MODAL_CLOSED: 'ui:modal_closed',

    // System
    SYSTEM_READY: 'system:ready',
    SYSTEM_ERROR: 'system:error',
    WHATSAPP_READY: 'system:whatsapp_ready'
  };

  function log(...args) {
    if (CONFIG.enableLogging) {
      // eslint-disable-next-line no-console
      console.log('[EventBus]', ...args);
    }
  }

  function genId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  function addToHistory(entry) {
    eventHistory.push(entry);
    if (eventHistory.length > CONFIG.maxHistorySize) eventHistory.shift();
  }

  function updateStats(event) {
    const s = eventStats.get(event) || { count: 0, lastEmitted: null };
    s.count += 1;
    s.lastEmitted = Date.now();
    eventStats.set(event, s);
  }

  function ensureList(map, key) {
    if (!map.has(key)) map.set(key, []);
    return map.get(key);
  }

  function on(event, callback, options = {}) {
    if (typeof callback !== 'function') {
      // eslint-disable-next-line no-console
      console.error('[EventBus] Callback deve ser uma função');
      return () => {};
    }

    const list = ensureList(listeners, event);

    if (list.length >= CONFIG.maxListenersPerEvent) {
      // eslint-disable-next-line no-console
      console.warn(`[EventBus] Limite de listeners atingido para "${event}"`);
    }

    const listener = {
      id: genId('l'),
      callback,
      priority: Number.isFinite(options.priority) ? options.priority : 0,
      context: options.context || null,
      debounce: Number.isFinite(options.debounce) ? options.debounce : 0
    };

    // Inserir por prioridade (maior primeiro)
    const idx = list.findIndex(l => (l.priority || 0) < listener.priority);
    if (idx === -1) list.push(listener);
    else list.splice(idx, 0, listener);

    log(`Listener registrado para "${event}" (ID: ${listener.id})`);

    return () => off(event, listener.id);
  }

  function once(event, callback, options = {}) {
    if (typeof callback !== 'function') {
      // eslint-disable-next-line no-console
      console.error('[EventBus] Callback deve ser uma função');
      return () => {};
    }

    const list = ensureList(onceListeners, event);
    const listener = {
      id: genId('l'),
      callback,
      priority: Number.isFinite(options.priority) ? options.priority : 0,
      context: options.context || null
    };

    list.push(listener);
    return () => offOnce(event, listener.id);
  }

  function offOnce(event, listenerId) {
    const list = onceListeners.get(event);
    if (!list) return;
    const idx = list.findIndex(l => l.id === listenerId);
    if (idx > -1) list.splice(idx, 1);
  }

  function off(event, listenerIdOrFn) {
    const list = listeners.get(event);
    if (!list) return;

    if (typeof listenerIdOrFn === 'function') {
      const idx = list.findIndex(l => l.callback === listenerIdOrFn);
      if (idx > -1) list.splice(idx, 1);
      return;
    }

    if (typeof listenerIdOrFn === 'string') {
      const idx = list.findIndex(l => l.id === listenerIdOrFn);
      if (idx > -1) list.splice(idx, 1);
    }
  }

  function emitWildcard(eventData) {
    const wild = listeners.get('*') || [];
    for (const l of wild) {
      try {
        l.callback.call(l.context || null, eventData.data, eventData);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[EventBus] Erro no listener wildcard:', e);
      }
    }
  }

  function executeListener(listener, eventData) {
    return listener.callback.call(listener.context || null, eventData.data, eventData);
  }

  function executeDebounced(listener, eventData) {
    const key = `listener_${listener.id}`;
    if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));

    const t = setTimeout(() => {
      debounceTimers.delete(key);
      try {
        executeListener(listener, eventData);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[EventBus] Erro no listener de "${eventData.event}":`, e);
      }
    }, listener.debounce);

    debounceTimers.set(key, t);
  }

  function emitDebounced(event, eventData, delay) {
    const key = `emit_${event}`;
    if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));

    return new Promise(resolve => {
      const t = setTimeout(() => {
        debounceTimers.delete(key);
        resolve(emit(event, eventData.data));
      }, delay);
      debounceTimers.set(key, t);
    });
  }

  function emit(event, data = null, options = {}) {
    const eventData = {
      event,
      data,
      timestamp: Date.now(),
      id: genId('e')
    };

    if (options.debounce) {
      return emitDebounced(event, eventData, options.debounce);
    }

    if (CONFIG.enableHistory) addToHistory(eventData);
    updateStats(event);

    log(`Evento emitido: "${event}"`, data);

    const list = listeners.get(event) || [];
    const results = [];

    for (const l of list) {
      try {
        if (l.debounce) {
          executeDebounced(l, eventData);
        } else {
          results.push(executeListener(l, eventData));
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[EventBus] Erro no listener de "${event}":`, e);
      }
    }

    const onceList = onceListeners.get(event) || [];
    while (onceList.length) {
      const l = onceList.shift();
      try {
        executeListener(l, eventData);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[EventBus] Erro no listener once de "${event}":`, e);
      }
    }

    emitWildcard(eventData);

    if (options.async) return Promise.all(results);
    return results;
  }

  function createNamespace(namespace) {
    return {
      on: (event, cb, opts) => on(`${namespace}:${event}`, cb, opts),
      once: (event, cb, opts) => once(`${namespace}:${event}`, cb, opts),
      off: (event, idOrFn) => off(`${namespace}:${event}`, idOrFn),
      emit: (event, payload, opts) => emit(`${namespace}:${event}`, payload, opts)
    };
  }

  function removeAllListeners(event = null) {
    if (event) {
      listeners.delete(event);
      onceListeners.delete(event);
    } else {
      listeners.clear();
      onceListeners.clear();
    }
  }

  function hasListeners(event) {
    return (listeners.get(event)?.length || 0) > 0 || (onceListeners.get(event)?.length || 0) > 0;
  }

  function getActiveEvents() {
    const s = new Set();
    for (const k of listeners.keys()) s.add(k);
    for (const k of onceListeners.keys()) s.add(k);
    return Array.from(s);
  }

  function getHistory(event = null, limit = 50) {
    let h = eventHistory.slice();
    if (event) h = h.filter(e => e.event === event);
    return h.slice(-limit);
  }

  function getStats(event = null) {
    if (event) return eventStats.get(event) || { count: 0, lastEmitted: null };
    const out = {};
    for (const [k, v] of eventStats.entries()) out[k] = v;
    return out;
  }

  function waitFor(event, timeout = 30000) {
    return new Promise((resolve, reject) => {
      // Usar o retorno do once() para permitir cancelamento em caso de timeout
      const unsubscribe = once(event, (data) => {
        if (timer) clearTimeout(timer);
        resolve(data);
      });

      const timer = timeout > 0 ? setTimeout(() => {
        try { unsubscribe(); } catch (_) {}
        reject(new Error(`Timeout esperando evento "${event}"`));
      }, timeout) : null;
    });
  }

  function pipe(sourceEvent, targetEvent, transform = null) {
    return on(sourceEvent, (data, meta) => {
      const payload = transform ? transform(data, meta) : data;
      emit(targetEvent, payload);
    });
  }

  function debug() {
    return {
      listeners: Object.fromEntries(Array.from(listeners.entries()).map(([k, v]) => [k, v.map(x => ({ id: x.id, priority: x.priority, debounce: x.debounce }))])),
      onceListeners: Object.fromEntries(Array.from(onceListeners.entries()).map(([k, v]) => [k, v.map(x => ({ id: x.id, priority: x.priority }))])),
      history: eventHistory.slice(),
      stats: Object.fromEntries(eventStats.entries()),
      activeEvents: getActiveEvents()
    };
  }

  const api = {
    on,
    once,
    off,
    emit,
    createNamespace,
    removeAllListeners,
    hasListeners,
    getActiveEvents,
    waitFor,
    pipe,
    getHistory,
    getStats,
    debug,
    NAMESPACES,
    EVENTS,
    setConfig: (cfg) => Object.assign(CONFIG, cfg || {})
  };

  // Export global
  try {
    // In content scripts and extension pages, window exists
    window.EventBus = api;
    window.SubscriptionEvents = api.createNamespace(NAMESPACES.SUBSCRIPTION);
    window.CreditsEvents = api.createNamespace(NAMESPACES.CREDITS);
    window.WorkspaceEvents = api.createNamespace(NAMESPACES.WORKSPACE);
    window.OverlayEvents = api.createNamespace(NAMESPACES.OVERLAY);
  } catch (e) {
    // noop
  }

})();
