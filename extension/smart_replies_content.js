// smart_replies_content.js
// Content script principal do Copiloto Pro para WhatsApp Web.
//
// IMPORTANTE:
// - Content scripts do Chrome MV3 ainda têm limitações/quirks com `import` estático.
// - Para evitar erro de sintaxe (e garantir compatibilidade), carregamos os módulos ESM via
//   `import(chrome.runtime.getURL(...))` (dynamic import) e só então iniciamos o Copiloto.

(() => {
  'use strict';

  // Copilot/Auto mode intentionally disabled.
  // This product uses the optional Magic Wand (🪄) button next to the WhatsApp '+'
  // to generate replies on demand, without blocking manual sending.
  return;

  // Global error capture for smart_replies_content
  (function(){
    function sendErr(payload){
      try { chrome.runtime.sendMessage({ type: 'EXTENSION_ERROR', payload }); } catch(e) {
        try {
          chrome.storage.local.get(['extension_errors'], (res) => {
            const arr = res && res.extension_errors ? res.extension_errors : [];
            arr.push({ ...payload, ts: new Date().toISOString() });
            chrome.storage.local.set({ extension_errors: arr });
          });
        } catch(_){}
      }
    }

    window.addEventListener('unhandledrejection', (ev) => {
      try { sendErr({ type: 'unhandledrejection', message: ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason), stack: ev.reason && ev.reason.stack ? ev.reason.stack : null, url: location.href }); } catch(_){}
    });

    window.addEventListener('error', (ev) => {
      try { sendErr({ type: 'error', message: ev.message, filename: ev.filename, lineno: ev.lineno, colno: ev.colno, stack: ev.error && ev.error.stack ? ev.error.stack : null, url: location.href }); } catch(_){}
    });
  })();

  let ui = null;
  let initialized = false;
  let currentChatId = null;
  let messagesObserver = null;

  // Módulos (carregados dinamicamente)
  let copilotEngine;
  let flowController;
  let summaryScheduler;
  let personaManager;
  let SmartRepliesUI;
  let SELECTORS;
  let aiService;

  let modulesLoaded = false;
  let loadingPromise = null;
  let readySent = false;

  console.log('[SmartReplies] Content script carregado');

  function safeSendMessage(msg) {
    try {
      const p = chrome.runtime.sendMessage(msg);
      // Compatibilidade: em alguns ambientes `sendMessage` não retorna Promise.
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
  }

  function sendReadyOnce() {
    if (readySent) return;
    readySent = true;
    safeSendMessage({ type: 'SR_CONTENT_READY' });
  }

  function getExtURL(path) {
    // `chrome.runtime.getURL` é o jeito correto para gerar a URL absoluta do recurso.
    return chrome.runtime.getURL(path);
  }

  async function loadModules() {
    if (modulesLoaded) return;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      const [engineMod, flowMod, summaryMod, personaMod, uiMod, typesMod, aiMod] = await Promise.all([
        import(getExtURL('smart_replies/CopilotEngine.js')),
        import(getExtURL('smart_replies/FlowController.js')),
        import(getExtURL('smart_replies/SummaryScheduler.js')),
        import(getExtURL('smart_replies/PersonaManager.js')),
        import(getExtURL('smart_replies/SmartRepliesUI.js')),
        import(getExtURL('smart_replies/SmartRepliesTypes.js')),
        import(getExtURL('services/AIService.js'))
      ]);

      copilotEngine = engineMod.copilotEngine;
      flowController = flowMod.flowController;
      summaryScheduler = summaryMod.summaryScheduler;
      personaManager = personaMod.personaManager;
      SmartRepliesUI = uiMod.default || uiMod.SmartRepliesUI;
      SELECTORS = typesMod.SELECTORS;
      aiService = aiMod.aiService || aiMod.default;

      // Sanity checks (evita falhas silenciosas)
      if (!copilotEngine || !flowController || !summaryScheduler || !personaManager || !SmartRepliesUI || !SELECTORS || !aiService) {
        throw new Error('Falha ao carregar módulos do Copiloto (exports ausentes)');
      }

      modulesLoaded = true;
    })();

    return loadingPromise;
  }

  // ============ INICIALIZAÇÃO ============
  async function initCopilot() {
    if (initialized) return;
    initialized = true;

    try {
      await loadModules();

      console.log('[SmartReplies] Iniciando Copiloto Pro...');

      // Configurar AIService com dados do storage (se existirem)
      await loadAIConfig();

      // Inicializar managers/serviços
      await copilotEngine.init();
      summaryScheduler.init();

      // Criar UI
      ui = new SmartRepliesUI(copilotEngine, flowController, summaryScheduler);

      // Atualizar UI com modo atual
      ui.updateModeButtons(copilotEngine.getMode && copilotEngine.getMode());

      // Inicializar observadores
      observeChatChanges();
      observeMessages();

      // Listener de mensagens (após módulos carregados)
      setupRuntimeMessageListener();

      // Avisar que está pronto
      sendReadyOnce();

      console.log('[SmartReplies] Copiloto Pro inicializado');
    } catch (error) {
      console.error('[SmartReplies] Erro na inicialização:', error);
    }
  }

  async function loadAIConfig() {
    return new Promise((resolve) => {
      try {
        // Modo recomendado: IA via backend (não expõe chave OpenAI no cliente)
        chrome.storage.sync.get(['backendUrl', 'extensionKey', 'licenseKey'], (result) => {
          const backendUrl = (result.backendUrl || '').toString().trim();
          const extensionKey = (result.extensionKey || '').toString().trim();
          const licenseKey = (result.licenseKey || '').toString().trim();

          if (!backendUrl || !extensionKey || !licenseKey) {
            console.warn('[SmartReplies] Backend/licença não configurados. Configure em Opções e ative a licença no painel.');
            return resolve();
          }

          aiService.configure({
            provider: 'backend',
            backendUrl,
            extensionKey,
            licenseKey,
            model: 'gpt-4o'
          });

          console.log('[SmartReplies] AIService configurado em modo BACKEND');
          resolve();
        });
      } catch (e) {
        console.warn('[SmartReplies] Falha ao carregar config de IA:', e);
        resolve();
      }
    });
  }

  // Espera o WhatsApp Web montar a UI e então inicializa o Copiloto
  function waitForWhatsApp() {
    const interval = setInterval(() => {
      try {
        const composeBox = document.querySelector(SELECTORS?.COMPOSE_BOX || '[contenteditable="true"]');
        if (composeBox) {
          clearInterval(interval);
          initCopilot();
        }
      } catch (_) {
        // ignore
      }
    }, 1500);

    // Timeout de segurança
    setTimeout(() => clearInterval(interval), 60000);
  }

  async function bootstrap() {
    try {
      await loadModules();
      waitForWhatsApp();
    } catch (e) {
      console.error('[SmartReplies] Falha ao carregar módulos ESM do Copiloto:', e);
    }
  }

  bootstrap();

  // ============ OBSERVAÇÃO DO CHAT ============
  function getCurrentChatId() {
    const header = document.querySelector(SELECTORS.CHAT_HEADER);
    const nameEl = header?.querySelector(SELECTORS.CHAT_NAME);
    const name = nameEl?.textContent?.trim();
    if (!name) return null;

    // Como não temos o ID real do WhatsApp, usamos o nome do chat como pseudo-ID.
    return name;
  }

  function observeChatChanges() {
    // Polling simples: verifica a cada 2s se o chat mudou
    setInterval(() => {
      const chatId = getCurrentChatId();
      if (!chatId) return;

      if (chatId !== currentChatId) {
        currentChatId = chatId;
        console.log('[SmartReplies] Chat ativo mudou para:', currentChatId);

        if (ui) ui.setCurrentChatId(currentChatId);

        // Avisar scheduler (pode gerar resumo de abertura se desejado)
        // summaryScheduler.handleChatOpen(currentChatId); // opcional
      }
    }, 2000);
  }

  function observeMessages() {
    const container = document.querySelector(SELECTORS.MESSAGE_LIST);
    if (!container) {
      console.warn('[SmartReplies] Container de mensagens não encontrado. Tentando novamente...');
      setTimeout(observeMessages, 2000);
      return;
    }

    if (messagesObserver) {
      messagesObserver.disconnect();
    }

    messagesObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;

          // Mensagem direta
          if (node.matches?.(SELECTORS.MESSAGE_IN) || node.matches?.(SELECTORS.MESSAGE_OUT)) {
            handleMessageNode(node);
          }

          // Ou se a mensagem está dentro de outro container
          const inMessages = node.querySelectorAll?.(SELECTORS.MESSAGE_IN) || [];
          const outMessages = node.querySelectorAll?.(SELECTORS.MESSAGE_OUT) || [];
          inMessages.forEach((el) => handleMessageNode(el));
          outMessages.forEach((el) => handleMessageNode(el));
        });
      });
    });

    messagesObserver.observe(container, { childList: true, subtree: true });
    console.log('[SmartReplies] Observando mensagens do chat');
  }

  function handleMessageNode(node) {
    const isIncoming = node.classList.contains('message-in');
    const textEl = node.querySelector(SELECTORS.MESSAGE_TEXT);
    const text = textEl?.textContent?.trim();
    if (!text) return;

    const chatId = currentChatId || getCurrentChatId();
    if (!chatId) return;

    // Notificar engine e flow controller
    copilotEngine.onNewMessage(chatId, { text }, isIncoming);
    if (isIncoming) {
      flowController.checkTriggers(chatId, text);
    }
  }

  // ============ COMUNICAÇÃO COM BACKGROUND / POPUP ============
  function setupRuntimeMessageListener() {
    // Evitar registrar mais de 1x
    if (setupRuntimeMessageListener._done) return;
    setupRuntimeMessageListener._done = true;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        // Se ainda não carregou módulos, responde com erro para evitar travar.
        if (!modulesLoaded || !copilotEngine) {
          sendResponse({ ok: false, error: 'Copiloto ainda não inicializado' });
          return true;
        }

        switch (message?.type) {
          case 'SR_GET_STATS':
            sendResponse({ ok: true, data: copilotEngine.getStats() });
            return true;

          case 'SR_SET_MODE':
            if (message.mode) {
              copilotEngine.setMode(message.mode);
              if (ui) ui.updateModeButtons(message.mode);
              sendResponse({ ok: true });
            } else {
              sendResponse({ ok: false, error: 'Modo não informado' });
            }
            return true;

          case 'SR_SET_PERSONA':
            if (message.personaId) {
              personaManager.setActivePersona(message.personaId);
              sendResponse({ ok: true });
            } else {
              sendResponse({ ok: false, error: 'personaId não informado' });
            }
            return true;

          case 'SR_FORCE_SUGGESTIONS':
            if (currentChatId) {
              copilotEngine.generateSuggestions(currentChatId);
              sendResponse({ ok: true });
            } else {
              sendResponse({ ok: false, error: 'Nenhum chat ativo' });
            }
            return true;

          default:
            break;
        }
      } catch (e) {
        console.error('[SmartReplies] Erro ao processar mensagem runtime:', e);
        sendResponse({ ok: false, error: e?.message || String(e) });
        return true;
      }
    });
  }
})();
