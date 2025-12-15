// utils/selector-engine.js
// Engine de seletores resiliente com múltiplos fallbacks e cache

(function() {
  'use strict';

  // ============================================
  // CONFIGURAÇÃO DE SELETORES
  // ============================================

  const SELECTORS = {
    // Header do chat
    chatHeader: [
      'header[data-testid="conversation-header"]',
      '[data-testid="conversation-info-header"]',
      '#main header',
      '#main > div > header',
      'header[role="banner"]'
    ],

    // Título do chat (nome do contato/grupo)
    chatTitle: [
      '[data-testid="conversation-info-header-chat-title"]',
      'header span[dir="auto"][title]',
      '#main header span[title]',
      'header[data-testid="conversation-header"] span[title]'
    ],

    // Input de mensagem (WhatsApp Web 2024-2025)
    // data-tab values are WhatsApp's internal tab indices for keyboard navigation
    // 10 = main message input, 6 = alternative input state, 1 = fallback state
    messageInput: [
      '[data-testid="conversation-compose-box-input"]',
      '[contenteditable="true"][data-tab="10"]',  // Primary message input
      '[contenteditable="true"][data-tab="6"]',   // Alternative state
      '[contenteditable="true"][data-tab="1"]',   // Fallback state
      'footer [contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]',
      '[data-lexical-editor="true"]'
    ],

    // Botão de enviar (múltiplos fallbacks)
    // data-tab="11" is WhatsApp's internal tab index for the send button
    sendButton: [
      '[data-testid="send"]',
      'button[aria-label*="Enviar"]',
      'button[aria-label*="Send"]',
      'span[data-icon="send"]',
      'footer button[data-tab="11"]'  // Tab index for send button
    ],

    // Lista de chats
    chatList: [
      '[data-testid="chat-list"]',
      '[aria-label="Lista de conversas"]',
      '[aria-label*="Chat list"]',
      'div#pane-side > div > div > div',
      '#pane-side'
    ],

    // Item de chat individual
    chatItem: [
      '[data-testid="cell-frame-container"]',
      '[data-testid="list-item-content"]',
      '#pane-side [role="listitem"]',
      'div[role="listitem"]'
    ],

    // Container de mensagens
    messageContainer: [
      'div[data-id]',
      'div[data-message-id]',
      'div[data-msg-id]',
      'div.message-in',
      'div.message-out',
      'div[role="row"]'
    ],

    // Texto da mensagem
    messageText: [
      'span.selectable-text',
      'div.copyable-text',
      'span[dir="ltr"]',
      'span[dir="auto"]'
    ],

    // Campo de busca
    // data-tab="3" is WhatsApp's internal tab index for the search input field
    searchInput: [
      '[data-testid="chat-list-search"]',
      '[data-testid="search-input"]',
      '[contenteditable="true"][data-tab="3"]',  // Search field tab index
      'div[role="textbox"][data-tab="3"]'
    ],

    // Painel principal
    mainPanel: [
      '#main',
      '[data-testid="conversation-panel-wrapper"]'
    ],

    // Sidebar
    sidebar: [
      '#side',
      'div#pane-side'
    ],

    // App wrapper (para verificar se WhatsApp carregou)
    appWrapper: [
      '.app-wrapper .app',
      '#app .app',
      '#app'
    ]
  };

  const selectorCache = new Map(); // key -> {selector, ts}
  const CACHE_DURATION = 60_000;

  // ============================================
  // CORE
  // ============================================

  function find(key, context = document) {
    const selectors = SELECTORS[key];
    if (!selectors) {
      console.warn(`[SelectorEngine] Chave desconhecida: ${key}`);
      return null;
    }

    const cached = getCached(key);
    if (cached) {
      try {
        const el = context.querySelector(cached);
        if (el) return el;
      } catch (_) {
        // ignore
      }
      clearCache(key);
    }

    for (const selector of selectors) {
      try {
        const el = context.querySelector(selector);
        if (el) {
          setCache(key, selector);
          return el;
        }
      } catch (_) {
        // seletor inválido
      }
    }

    return null;
  }

  function findAll(key, context = document) {
    const selectors = SELECTORS[key];
    if (!selectors) {
      console.warn(`[SelectorEngine] Chave desconhecida: ${key}`);
      return [];
    }

    const cached = getCached(key);
    if (cached) {
      try {
        const els = context.querySelectorAll(cached);
        if (els && els.length) return Array.from(els);
      } catch (_) {
        // ignore
      }
      clearCache(key);
    }

    for (const selector of selectors) {
      try {
        const els = context.querySelectorAll(selector);
        if (els && els.length) {
          setCache(key, selector);
          return Array.from(els);
        }
      } catch (_) {
        // ignore
      }
    }

    return [];
  }

  function waitFor(key, options = {}) {
    const {
      timeout = 10_000,
      interval = 100,
      context = document,
      multiple = false
    } = options;

    return new Promise((resolve, reject) => {
      const start = Date.now();

      const tick = () => {
        const res = multiple ? findAll(key, context) : find(key, context);
        const ok = Array.isArray(res) ? res.length > 0 : !!res;

        if (ok) {
          resolve(res);
          return;
        }

        if (Date.now() - start > timeout) {
          reject(new Error(`Timeout esperando por "${key}"`));
          return;
        }

        setTimeout(tick, interval);
      };

      tick();
    });
  }

  function observe(key, callback, options = {}) {
    const el = find(key);
    if (!el) {
      console.warn(`[SelectorEngine] Elemento não encontrado para observar: ${key}`);
      return null;
    }

    const observer = new MutationObserver((mutations) => {
      try {
        callback(mutations, el);
      } catch (e) {
        console.error('[SelectorEngine] Erro no observe callback:', e);
      }
    });

    observer.observe(el, {
      childList: true,
      subtree: true,
      attributes: !!options.attributes,
      characterData: !!options.characterData,
      ...options
    });

    return observer;
  }

  // ============================================
  // CUSTOM
  // ============================================

  function addSelectors(key, selectors) {
    SELECTORS[key] = Array.isArray(selectors) ? selectors : [selectors];
    clearCache(key);
  }

  function prependSelectors(key, selectors) {
    const cur = SELECTORS[key] || [];
    const add = Array.isArray(selectors) ? selectors : [selectors];
    SELECTORS[key] = [...add, ...cur];
    clearCache(key);
  }

  function appendSelectors(key, selectors) {
    const cur = SELECTORS[key] || [];
    const add = Array.isArray(selectors) ? selectors : [selectors];
    SELECTORS[key] = [...cur, ...add];
  }

  // ============================================
  // CACHE
  // ============================================

  function getCached(key) {
    const cached = selectorCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.ts > CACHE_DURATION) {
      selectorCache.delete(key);
      return null;
    }
    return cached.selector;
  }

  function setCache(key, selector) {
    selectorCache.set(key, { selector, ts: Date.now() });
  }

  function clearCache(key) {
    if (key) selectorCache.delete(key);
    else selectorCache.clear();
  }

  // ============================================
  // HELPERS
  // ============================================

  function getActiveChat() {
    const header = find('chatHeader');
    if (!header) return null;

    const titleEl = find('chatTitle', header) || find('chatTitle');
    const title = titleEl?.textContent?.trim() || null;
    const phone = titleEl?.getAttribute('title') || null;

    return {
      element: header,
      title,
      phone: phone || title,
      isGroup: !!(phone && phone.includes('@g.us'))
    };
  }

  function isWhatsAppReady() {
    return !!(find('sidebar') && find('chatList'));
  }

  async function waitForWhatsApp(timeout = 30_000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (isWhatsAppReady()) return true;
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Timeout esperando WhatsApp carregar');
  }

  function testSelectors() {
    const results = {};
    for (const [key, selectors] of Object.entries(SELECTORS)) {
      results[key] = { found: false, workingSelector: null, testedCount: selectors.length };
      for (const selector of selectors) {
        try {
          const el = document.querySelector(selector);
          if (el) {
            results[key].found = true;
            results[key].workingSelector = selector;
            break;
          }
        } catch (_) {
          // ignore
        }
      }
    }
    return results;
  }

  function getSelectors() {
    return { ...SELECTORS };
  }

  // ============================================
  // EXPORT
  // ============================================

  const api = {
    // Core
    find,
    findAll,
    waitFor,
    observe,

    // Custom
    addSelectors,
    prependSelectors,
    appendSelectors,

    // Cache
    clearCache,

    // Helpers
    getActiveChat,
    isWhatsAppReady,
    waitForWhatsApp,

    // Debug
    testSelectors,
    getSelectors,

    SELECTORS
  };

  window.SelectorEngine = api;
})();
